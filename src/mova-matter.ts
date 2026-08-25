import type {
  API,
  Logging,
  MatterAccessory,
} from 'homebridge';

import type {
  MovaCloud,
  MovaDevice,
  MovaRoom,
  MovaVacuumStatus,
} from './mova-cloud.js';
const PLUGIN_NAME = 'homebridge-mova';
const MATTER_PLATFORM_NAME = 'MovaVacuum';
const STATUS_UPDATE_INTERVAL_MS = 10_000;
const MODE_WRITE_PROTECTION_MS = 15_000;
const COMMAND_STATUS_DELAY_MS = 2_500;

export const MOVA_CLEANING_MODES = [
  {
    label: 'Saugen',
    mode: 0,
    modeTags: [
      { value: 16385 },
    ],
  },
  {
    label: 'Wischen',
    mode: 1,
    modeTags: [
      { value: 16386 },
    ],
  },
  {
    label: 'Saugen und Wischen',
    mode: 2,
    modeTags: [
      { value: 16385 },
      { value: 16386 },
    ],
  },
];

function getOperationalState(device: MovaDevice): number {
  switch (device.latestStatus) {
    case 1:
    case 7:
    case 12:
    case 23:
    case 25:
    case 37:
    case 38:
    case 96:
    case 97:
    case 101:
    case 103:
    case 104:
    case 105:
    case 107:
      return 1;

    case 3:
    case 4:
    case 21:
      return 2;

    case 5:
      return 64;

    case 6:
      return 65;

    case 13:
      return 66;

    case 22:
    case 34:
      return 67;

    case 9:
      return 68;

    case 20:
      return 69;

    default:
      return 0;
  }
}

function getLiveOperationalState(
  status: MovaVacuumStatus,
): number {
  const pausedTaskStatuses = [
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
  ];

  const runningStates = [1, 7, 12];
  const runningStatuses = [
    2,
    4,
    5,
    18,
    19,
    20,
    22,
    23,
    24,
  ];

  if (status.state === 4 || status.status === 12) {
    return 3;
  }

  if (
    status.state === 9
    || status.selfWashBaseStatus === 1
  ) {
    return 68;
  }

  if (
    status.state === 5
    || status.state === 10
    || status.chargingStatus === 5
    || status.status === 3
    || status.selfWashBaseStatus === 3
  ) {
    return 64;
  }

  if (
    status.state === 3
    || status.status === 1
    || (
      status.taskStatus !== undefined
      && pausedTaskStatuses.includes(status.taskStatus)
    )
  ) {
    return 2;
  }

  if (
    (
      status.state !== undefined
      && runningStates.includes(status.state)
    )
    || (
      status.status !== undefined
      && runningStatuses.includes(status.status)
    )
  ) {
    return 1;
  }

  const batteryIsFullAtStation =
    status.battery !== undefined
    && status.battery >= 100
    && (
      status.state === 6
      || status.state === 8
      || status.state === 13
      || status.status === 6
      || status.status === 14
    )
    && (
      status.chargingStatus === 1
      || status.chargingStatus === 3
    );

  if (batteryIsFullAtStation) {
    return 0;
  }

  if (
    status.state === 6
    || status.chargingStatus === 1
    || status.status === 6
  ) {
    return 65;
  }

  if (
    status.state === 13
    || status.chargingStatus === 3
  ) {
    return 66;
  }

  return 0;
}

export function decodeMovaCleaningMode(
  rawValue: number | undefined,
): number | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  const wireMode = rawValue & 3;

  if (wireMode === 2) {
    return 0;
  }

  if (wireMode === 1) {
    return 1;
  }

  // MOVA uses wire mode 3 for sequential/deep cleaning. Apple Home only
  // receives the three main cleaning modes, so combined and sequential
  // cleaning are both represented by the supported combined mode.
  return 2;
}

function getCleaningModeLabel(
  mode: number | undefined,
): string {
  if (mode === 0) {
    return 'Saugen';
  }

  if (mode === 1) {
    return 'Wischen';
  }

  if (mode === 2) {
    return 'Saugen und Wischen';
  }

  return 'Unbekannt';
}

function getBatteryLevel(device: MovaDevice): number {
  const battery = device.battery ?? 0;
  return Math.min(100, Math.max(0, battery));
}

function clampBatteryLevel(battery: number): number {
  return Math.min(100, Math.max(0, battery));
}

export async function registerMovaMatterVacuum(
  api: API,
  log: Logging,
  cloud: MovaCloud,
  device: MovaDevice,
): Promise<string | undefined> {
  const matter = api.matter;

  if (!matter || !api.isMatterEnabled()) {
    log.warn(
      'Matter ist nicht aktiviert. Der native Saugroboter wird übersprungen.',
    );
    return undefined;
  }

  const displayName =
    device.customName?.trim()
    || device.deviceInfo?.displayName?.trim()
    || 'MOVA E40 Ultra';

  const operationalState = getOperationalState(device);
  const battery = getBatteryLevel(device);
  const uuid = matter.uuid.generate(
    `${PLUGIN_NAME}:${String(device.did)}`,
  );

  let rooms: MovaRoom[] = [];

  try {
    rooms = await cloud.getRooms(device);
    log.info(
      `${rooms.length} MOVA-Räume für Apple Home geladen: ${
        rooms.map(room => room.name).join(', ')
      }.`,
    );
  } catch (error: unknown) {
    const message = error instanceof Error
      ? error.message
      : String(error);

    log.warn(
      `MOVA-Räume konnten nicht geladen werden: ${message}`,
    );
  }

  const roomById = new Map(
    rooms.map(room => [room.id, room]),
  );

  let selectedCleaningMode = 2;
  let selectedRoomIds: number[] = [];
  let modeWriteProtectedUntil = 0;
  let statusUpdateRunning = false;
  let lastStatusSignature = '';
  let statusErrorWasLogged = false;
  let immediateStatusTimer: NodeJS.Timeout | undefined;

  const updateMatterState = async (
    runMode: number,
    newOperationalState: number,
  ): Promise<void> => {
    await matter.updateAccessoryState(
      uuid,
      'rvcRunMode',
      { currentMode: runMode },
    );

    await matter.updateAccessoryState(
      uuid,
      'rvcOperationalState',
      { operationalState: newOperationalState },
    );
  };

  const configureCleaningMode = async (
    mode: number,
    confirmState = false,
  ): Promise<void> => {
    await cloud.setCustomizedCleaning(
      device.did,
      false,
    );

    await cloud.setCleaningMode(
      device.did,
      mode,
    );

    if (confirmState) {
      await cloud.waitForCustomizedCleaning(
        device.did,
        false,
      );
    }
  };

  const updateLiveStatus = async (): Promise<void> => {
    if (statusUpdateRunning) {
      return;
    }

    statusUpdateRunning = true;

    try {
      const liveStatus = await cloud.getVacuumStatus(device.did);
      const newOperationalState =
        getLiveOperationalState(liveStatus);
      const runMode =
        newOperationalState === 1
        || newOperationalState === 2
          ? 1
          : 0;

      await updateMatterState(
        runMode,
        newOperationalState,
      );

      if (liveStatus.battery !== undefined) {
        const liveBattery =
          clampBatteryLevel(liveStatus.battery);

        await matter.updateAccessoryState(
          uuid,
          'powerSource',
          {
            batPercentRemaining: liveBattery * 2,
            batChargeLevel:
              liveBattery <= 10
                ? 2
                : liveBattery <= 20
                  ? 1
                  : 0,
            batChargeState:
              liveBattery >= 100
                && (
                  liveStatus.chargingStatus === 1
                  || liveStatus.chargingStatus === 3
                )
                ? 2
                : liveStatus.chargingStatus === 1
                  ? 1
                  : 3,
          },
        );
      }

      const reportedCleaningMode =
        decodeMovaCleaningMode(
          liveStatus.cleaningModeRaw,
        );
      if (reportedCleaningMode !== undefined) {
        const modeMatchesSelection =
          reportedCleaningMode === selectedCleaningMode;
        const writeProtectionExpired =
          Date.now() >= modeWriteProtectedUntil;

        if (
          modeMatchesSelection
          || writeProtectionExpired
        ) {
          selectedCleaningMode = reportedCleaningMode;

          await matter.updateAccessoryState(
            uuid,
            'rvcCleanMode',
            { currentMode: reportedCleaningMode },
          );
        }
      }

      const statusSignature = JSON.stringify(liveStatus);

      if (statusSignature !== lastStatusSignature) {
        lastStatusSignature = statusSignature;

        log.info(
          `MOVA-Live-Status: Zustand=${
            liveStatus.state ?? 'unbekannt'
          }, Status=${
            liveStatus.status ?? 'unbekannt'
          }, Aufgabe=${
            liveStatus.taskStatus ?? 'unbekannt'
          }, Laden=${
            liveStatus.chargingStatus ?? 'unbekannt'
          }, Akku=${
            liveStatus.battery ?? 'unbekannt'
          } %, Modus-Rohwert=${
            liveStatus.cleaningModeRaw ?? 'unbekannt'
          }, Raumanpassung=${
            liveStatus.customizedCleaning === 1
              ? 'aktiv'
              : liveStatus.customizedCleaning === 0
                ? 'inaktiv'
                : 'unbekannt'
          }, Modus=${
            getCleaningModeLabel(reportedCleaningMode)
          }.`,
        );
      }

      statusErrorWasLogged = false;
    } catch (error: unknown) {
      if (!statusErrorWasLogged) {
        const message = error instanceof Error
          ? error.message
          : String(error);

        log.warn(
          `MOVA-Live-Status konnte nicht gelesen werden: ${message}`,
        );
        statusErrorWasLogged = true;
      }
    } finally {
      statusUpdateRunning = false;
    }
  };

  const scheduleLiveStatusUpdate = (): void => {
    if (immediateStatusTimer) {
      clearTimeout(immediateStatusTimer);
    }

    immediateStatusTimer = setTimeout(
      () => {
        immediateStatusTimer = undefined;
        void updateLiveStatus();
      },
      COMMAND_STATUS_DELAY_MS,
    );

    immediateStatusTimer.unref();
  };

  const execute = async (
    description: string,
    command: () => Promise<void>,
  ): Promise<void> => {
    try {
      log.info(`Matter-Befehl: ${description} …`);
      await command();
      log.info(`Matter-Befehl erfolgreich: ${description}.`);
      scheduleLiveStatusUpdate();
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : String(error);

      log.error(`Matter-Befehl fehlgeschlagen: ${message}`);
      throw new matter.status.Failure(message);
    }
  };

  const accessory: MatterAccessory = {
    UUID: uuid,
    displayName,
    deviceType: matter.deviceTypes.RoboticVacuumCleaner,
    serialNumber: device.id ?? String(device.did),
    manufacturer: 'MOVA',
    model: device.model,
    context: {
      did: String(device.did),
    },
    clusters: {
      rvcRunMode: {
        supportedModes: [
          {
            label: 'Leerlauf',
            mode: 0,
            modeTags: [
              { value: 16384 },
            ],
          },
          {
            label: 'Reinigung',
            mode: 1,
            modeTags: [
              { value: 16385 },
            ],
          },
        ],
        currentMode:
          operationalState === 1 || operationalState === 2
            ? 1
            : 0,
      },
      rvcCleanMode: {
        supportedModes: MOVA_CLEANING_MODES,
        currentMode: selectedCleaningMode,
      },
      rvcOperationalState: {
        phaseList: null,
        currentPhase: null,
        countdownTime: null,
        operationalStateList: [
          { operationalStateId: 0 },
          { operationalStateId: 1 },
          { operationalStateId: 2 },
          { operationalStateId: 3 },
          { operationalStateId: 64 },
          { operationalStateId: 65 },
          { operationalStateId: 66 },
          { operationalStateId: 67 },
          { operationalStateId: 68 },
          { operationalStateId: 69 },
        ],
        operationalState,
        operationalError: {
          errorStateId: 0,
        },
      },
      powerSource: {
        status: 0,
        order: 0,
        description: 'Akku',
        batPercentRemaining: battery * 2,
        batChargeLevel:
          battery <= 10
            ? 2
            : battery <= 20
              ? 1
              : 0,
        batPresent: true,
        batQuantity: 1,
        batChargeState:
          operationalState === 65
            ? 1
            : operationalState === 66 && battery >= 100
              ? 2
              : 3,
        batFunctionalWhileCharging: true,
        activeBatFaults: [],
        activeBatChargeFaults: [],
      },
      ...(rooms.length > 0
        ? {
          serviceArea: {
            supportedMaps: [
              {
                mapId: rooms[0]?.mapId ?? 1,
                name: 'Zuhause',
              },
            ],
            supportedAreas: rooms.map(room => ({
              areaId: room.id,
              mapId: room.mapId,
              areaInfo: {
                locationInfo: {
                  locationName: room.name,
                  floorNumber: null,
                  areaType: null,
                },
                landmarkInfo: null,
              },
            })),
            selectedAreas: [],
            currentArea: null,
            estimatedEndTime: null,
          },
        }
        : {}),
    },
    handlers: {
      rvcRunMode: {
        changeToMode: async ({ newMode }) => {
          if (newMode === 1) {
            const selectedRoomNames = selectedRoomIds
              .map(roomId => roomById.get(roomId)?.name)
              .filter((name): name is string => Boolean(name));
            const commandDescription = selectedRoomNames.length > 0
              ? `Raumreinigung starten: ${selectedRoomNames.join(', ')}`
              : 'Reinigung starten';

            await execute(
              commandDescription,
              async () => {
                await configureCleaningMode(
                  selectedCleaningMode,
                  true,
                );

                if (selectedRoomIds.length > 0) {
                  await cloud.startRoomCleaning(
                    device.did,
                    selectedRoomIds,
                  );
                } else {
                  await cloud.startCleaning(device.did);
                }
              },
            );

            await updateMatterState(1, 1);
            return;
          }

          if (newMode === 0) {
            await execute(
              'Zur Station zurückkehren',
              () => cloud.returnToDock(device.did),
            );
            await updateMatterState(0, 64);
            return;
          }

          throw new matter.status.ConstraintError(
            `Nicht unterstützter Laufmodus: ${newMode}`,
          );
        },
      },
      rvcOperationalState: {
        pause: async () => {
          await execute(
            'Reinigung pausieren',
            () => cloud.pauseCleaning(device.did),
          );
          await updateMatterState(1, 2);
        },
        resume: async () => {
          await execute(
            'Reinigung fortsetzen',
            () => cloud.startCleaning(device.did),
          );
          await updateMatterState(1, 1);
        },
        goHome: async () => {
          await execute(
            'Zur Station zurückkehren',
            () => cloud.returnToDock(device.did),
          );
          await updateMatterState(0, 64);
        },
      },
      rvcCleanMode: {
        changeToMode: async ({ newMode }) => {
          if (![0, 1, 2].includes(newMode)) {
            throw new matter.status.ConstraintError(
              `Nicht unterstützter Reinigungsmodus: ${newMode}`,
            );
          }

          const modeLabel =
            getCleaningModeLabel(newMode);

          await execute(
            `Reinigungsmodus auf ${modeLabel} setzen`,
            () => configureCleaningMode(newMode),
          );

          selectedCleaningMode = newMode;
          modeWriteProtectedUntil =
            Date.now() + MODE_WRITE_PROTECTION_MS;

          await matter.updateAccessoryState(
            uuid,
            'rvcCleanMode',
            { currentMode: newMode },
          );
        },
      },
      ...(rooms.length > 0
        ? {
          serviceArea: {
            selectAreas: async ({ newAreas }) => {
              const invalidRoomIds = newAreas.filter(
                roomId => !roomById.has(roomId),
              );

              if (invalidRoomIds.length > 0) {
                throw new matter.status.ConstraintError(
                  `Unbekannte MOVA-Raum-ID: ${invalidRoomIds.join(', ')}`,
                );
              }

              selectedRoomIds = [...new Set(newAreas)];

              const selectedNames = selectedRoomIds
                .map(roomId => roomById.get(roomId)?.name)
                .filter((name): name is string => Boolean(name));

              log.info(
                selectedNames.length > 0
                  ? `Raumauswahl übernommen: ${selectedNames.join(', ')}.`
                  : 'Raumauswahl aufgehoben: vollständige Reinigung.',
              );

              setImmediate(() => {
                void matter.updateAccessoryState(
                  uuid,
                  'serviceArea',
                  { selectedAreas: [...selectedRoomIds] },
                ).catch((error: unknown) => {
                  const message = error instanceof Error
                    ? error.message
                    : String(error);

                  log.warn(
                    `Raumauswahl konnte nicht im Matter-Cache gespeichert werden: ${message}`,
                  );
                });
              });
            },
          },
        }
        : {}),
    },
  };

  await matter.registerPlatformAccessories(
    PLUGIN_NAME,
    MATTER_PLATFORM_NAME,
    [accessory],
  );

  log.info(
    `Nativer Matter-Saugroboter veröffentlicht: ${displayName}.`,
  );

  await updateLiveStatus();

  const statusTimer = setInterval(
    () => {
      void updateLiveStatus();
    },
    STATUS_UPDATE_INTERVAL_MS,
  );

  statusTimer.unref();

  api.on(
    'shutdown',
    () => {
      clearInterval(statusTimer);

      if (immediateStatusTimer) {
        clearTimeout(immediateStatusTimer);
      }
    },
  );

  return uuid;
}

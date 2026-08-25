import type {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';

import type { MovaDevice } from './mova-cloud.js';
import { MovaCloud } from './mova-cloud.js';
import {
  createMovaDiagnosticReport,
  getExperimentalModelMode,
  isMovaVacuumModel,
  isTestedMovaModel,
  MODEL_SUPPORT_REQUEST_URL,
  type ExperimentalModelMode,
} from './mova-devices.js';
import { registerMovaMatterVacuum } from './mova-matter.js';

const PLUGIN_NAME = 'homebridge-mova';
const PLATFORM_NAME = 'MovaVacuum';

class MovaVacuumPlatform implements DynamicPlatformPlugin {
  private readonly cloudReady: Promise<void>;
  private cloud?: MovaCloud;
  private selectedDevice?: MovaDevice;
  private experimentalModelMode: ExperimentalModelMode = 'off';
  private selectedDeviceIsExperimental = false;

  constructor(
    private readonly log: Logging,
    private readonly config: PlatformConfig,
    private readonly api: API,
  ) {
    this.log.info('MOVA-Plugin wird gestartet');
    this.cloudReady = this.connectToCloud();

    this.api.on('didFinishLaunching', () => {
      void this.publishMatterVacuum();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.debug(
      `Veraltetes HAP-Zubehör wird entfernt: ${accessory.displayName}.`,
    );

    this.api.unregisterPlatformAccessories(
      PLUGIN_NAME,
      PLATFORM_NAME,
      [accessory],
    );
  }

  private async connectToCloud(): Promise<void> {
    const username =
      typeof this.config.username === 'string'
        ? this.config.username.trim()
        : '';

    const password =
      typeof this.config.password === 'string'
        ? this.config.password
        : '';

    this.experimentalModelMode = getExperimentalModelMode(
      this.config.experimentalModelSupport,
    );

    if (!username || !password) {
      this.log.warn(
        'MOVA-Login übersprungen: E-Mail-Adresse oder Passwort fehlt.',
      );
      return;
    }

    this.cloud = new MovaCloud(username, password);

    try {
      this.log.info('Verbindung zur MOVA-Cloud wird hergestellt …');
      await this.cloud.login();

      if (this.cloud.isAuthenticated()) {
        this.log.info(
          'Verbindung zur MOVA-Cloud wurde erfolgreich hergestellt.',
        );
      }

      const devices = await this.cloud.getDevices();

      if (devices.length === 0) {
        this.log.warn(
          'Im MOVA-Konto wurden keine Geräte gefunden.',
        );
        return;
      }

      this.log.info(
        `${devices.length} MOVA-Gerät(e) im Konto gefunden.`,
      );

      for (const device of devices) {
        const name =
          device.customName?.trim()
          || device.deviceInfo?.displayName?.trim()
          || 'Unbenanntes Gerät';

        this.log.info(
          `MOVA-Gerät gefunden: ${name} – Modell ${device.model}`,
        );
      }

      const testedVacuum = devices.find(
        device => isTestedMovaModel(device.model),
      );

      if (testedVacuum) {
        this.selectedDevice = testedVacuum;

        const selectedName =
          testedVacuum.customName?.trim()
          || testedVacuum.deviceInfo?.displayName?.trim()
          || 'MOVA Saugroboter';

        this.log.info(
          `Unterstützter MOVA-Saugroboter ausgewählt: ${selectedName}.`,
        );
        return;
      }

      const experimentalVacuum = devices.find(
        device => isMovaVacuumModel(device.model),
      );

      if (!experimentalVacuum) {
        this.log.warn(
          'Kein unterstützter MOVA-Saugroboter im Konto gefunden.',
        );
        return;
      }

      this.log.warn(
        `Nicht getestetes MOVA-Modell erkannt: ${experimentalVacuum.model}.`,
      );
      this.log.warn(
        `Unterstützung für dieses Modell anfragen: ${MODEL_SUPPORT_REQUEST_URL}`,
      );

      if (this.experimentalModelMode === 'off') {
        this.log.warn(
          'Experimentelle Modellunterstützung ist deaktiviert. '
          + 'Der Saugroboter wird nicht veröffentlicht.',
        );
        return;
      }

      this.selectedDevice = experimentalVacuum;
      this.selectedDeviceIsExperimental = true;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      this.log.error(`MOVA-Cloud-Fehler: ${message}`);
    }
  }

  private async publishMatterVacuum(): Promise<void> {
    await this.cloudReady;

    if (!this.cloud) {
      this.log.warn(
        'Matter-Saugroboter kann ohne MOVA-Verbindung nicht veröffentlicht werden.',
      );
      return;
    }

    if (!this.selectedDevice) {
      return;
    }

    try {
      if (this.selectedDeviceIsExperimental) {
        const status = await this.readExperimentalStatus();
        const rooms = await this.readExperimentalRooms();
        const report = createMovaDiagnosticReport(
          this.selectedDevice,
          status.value,
          status.readable,
          rooms.readable,
          rooms.count,
        );

        this.log.warn(
          `Bereinigter MOVA-Diagnosebericht: ${JSON.stringify(report)}`,
        );
        this.log.warn(
          'Der Bericht enthält keine Zugangsdaten, Geräte-ID oder Raumnamen.',
        );

        if (this.experimentalModelMode === 'diagnostic') {
          this.log.warn(
            'Der sichere Diagnosemodus sendet keine Steuerbefehle und '
            + 'veröffentlicht kein Matter-Gerät.',
          );
          return;
        }

        if (!status.readable) {
          this.log.error(
            'Das experimentelle Modell liefert keinen kompatiblen Status. '
            + 'Die Matter-Veröffentlichung wird aus Sicherheitsgründen abgebrochen.',
          );
          return;
        }

        this.log.warn(
          'Experimentelle Vollfreigabe ist aktiv. Steuerbefehle für dieses '
          + 'Modell wurden vom Plugin-Autor nicht mit echter Hardware geprüft.',
        );
      }

      await registerMovaMatterVacuum(
        this.api,
        this.log,
        this.cloud,
        this.selectedDevice,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      this.log.error(
        `Matter-Saugroboter konnte nicht veröffentlicht werden: ${message}`,
      );
    }
  }

  private async readExperimentalStatus(): Promise<{
    readable: boolean;
    value?: Awaited<ReturnType<MovaCloud['getVacuumStatus']>>;
  }> {
    try {
      return {
        readable: true,
        value: await this.cloud!.getVacuumStatus(
          this.selectedDevice!.did,
        ),
      };
    } catch {
      return { readable: false };
    }
  }

  private async readExperimentalRooms(): Promise<{
    readable: boolean;
    count?: number;
  }> {
    try {
      const rooms = await this.cloud!.getRooms(
        this.selectedDevice!,
      );

      return {
        readable: true,
        count: rooms.length,
      };
    } catch {
      return { readable: false };
    }
  }
}

export default (api: API): void => {
  api.registerPlatform(
    PLUGIN_NAME,
    PLATFORM_NAME,
    MovaVacuumPlatform,
  );
};

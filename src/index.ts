import type {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';

import type { MovaDevice } from './mova-cloud.js';
import { MovaCloud } from './mova-cloud.js';
import { registerMovaMatterVacuum } from './mova-matter.js';
import {
  createPresetRoomCleaningSelections,
  getPresetModeLabel,
  parseMovaCleaningPresets,
  type MovaCleaningPreset,
} from './mova-presets.js';

const PLUGIN_NAME = 'homebridge-mova';
const PLATFORM_NAME = 'MovaVacuum';

class MovaVacuumPlatform implements DynamicPlatformPlugin {
  private readonly cloudReady: Promise<void>;
  private readonly cachedPresetAccessories: PlatformAccessory[] = [];
  private cloud?: MovaCloud;
  private selectedDevice?: MovaDevice;
  private presetCommandRunning = false;

  constructor(
    private readonly log: Logging,
    private readonly config: PlatformConfig,
    private readonly api: API,
  ) {
    this.log.info('MOVA-Plugin wird gestartet');
    this.cloudReady = this.connectToCloud();

    this.api.on('didFinishLaunching', () => {
      void this.launchAccessories();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    if (typeof accessory.context.movaPresetId === 'string') {
      this.cachedPresetAccessories.push(accessory);
      return;
    }

    this.log.debug(
      `Veraltetes HAP-Zubehör wird entfernt: ${accessory.displayName}.`,
    );

    this.api.unregisterPlatformAccessories(
      PLUGIN_NAME,
      PLATFORM_NAME,
      [accessory],
    );
  }

  private async launchAccessories(): Promise<void> {
    await this.cloudReady;
    await this.synchronizePresetAccessories();
    await this.publishMatterVacuum();
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

      const e40Ultra = devices.find(
        (device) =>
          device.model === 'mova.vacuum.r9504a'
          || device.model === 'mova.vacuum.r5732a',
      );

      if (!e40Ultra) {
        this.log.warn(
          'Kein unterstützter MOVA E40 Ultra im Konto gefunden.',
        );
        return;
      }

      this.selectedDevice = e40Ultra;

      const selectedName =
        e40Ultra.customName?.trim()
        || e40Ultra.deviceInfo?.displayName?.trim()
        || 'MOVA E40 Ultra';

      this.log.info(
        `MOVA E40 Ultra ausgewählt: ${selectedName}.`,
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
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      this.log.error(`MOVA-Cloud-Fehler: ${message}`);
    }
  }

  private async publishMatterVacuum(): Promise<void> {
    if (!this.cloud || !this.selectedDevice) {
      this.log.warn(
        'Matter-Saugroboter kann ohne MOVA-Verbindung nicht veröffentlicht werden.',
      );
      return;
    }

    try {
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

  private async synchronizePresetAccessories(): Promise<void> {
    const configuredPresets = parseMovaCleaningPresets(
      this.config.presets,
    );

    if (configuredPresets.length === 0) {
      if (this.cachedPresetAccessories.length > 0) {
        this.api.unregisterPlatformAccessories(
          PLUGIN_NAME,
          PLATFORM_NAME,
          this.cachedPresetAccessories,
        );
      }

      return;
    }

    if (!this.cloud || !this.selectedDevice) {
      this.log.warn(
        'Reinigungspresets können ohne MOVA-Verbindung nicht bereitgestellt werden.',
      );
      return;
    }

    const currentRoomIds = new Set<number>();

    try {
      const currentRooms = await this.cloud.getRooms(this.selectedDevice);

      for (const room of currentRooms) {
        currentRoomIds.add(room.id);
      }
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : String(error);

      this.log.warn(
        `Preset-Räume konnten beim Start nicht geprüft werden: ${message}`,
      );
    }

    const activeAccessoryUuids = new Set<string>();

    for (const preset of configuredPresets) {
      const missingRoomNames = currentRoomIds.size > 0
        ? preset.rooms
          .filter(room => !currentRoomIds.has(room.roomId))
          .map(room => room.roomName)
        : [];

      if (missingRoomNames.length > 0) {
        this.log.warn(
          `Preset „${preset.name}“ enthält nicht mehr vorhandene Räume: ${
            missingRoomNames.join(', ')
          }.`,
        );
      }

      const uuid = this.api.hap.uuid.generate(
        `${PLUGIN_NAME}:${String(this.selectedDevice.did)}:preset:${preset.id}`,
      );
      activeAccessoryUuids.add(uuid);

      let accessory = this.cachedPresetAccessories.find(
        cachedAccessory => cachedAccessory.UUID === uuid,
      );

      if (!accessory) {
        accessory = new this.api.platformAccessory(
          preset.name,
          uuid,
          this.api.hap.Categories.SWITCH,
        );
        accessory.context.movaPresetId = preset.id;

        this.api.registerPlatformAccessories(
          PLUGIN_NAME,
          PLATFORM_NAME,
          [accessory],
        );
      }

      accessory.displayName = preset.name;
      accessory.context.movaPresetId = preset.id;

      accessory
        .getService(this.api.hap.Service.AccessoryInformation)
        ?.setCharacteristic(
          this.api.hap.Characteristic.Manufacturer,
          'MOVA',
        )
        .setCharacteristic(
          this.api.hap.Characteristic.Model,
          `${this.selectedDevice.model} Preset`,
        )
        .setCharacteristic(
          this.api.hap.Characteristic.SerialNumber,
          `${String(this.selectedDevice.did)}-${preset.id}`,
        );

      const switchService = accessory.getService(
        this.api.hap.Service.Switch,
      ) ?? accessory.addService(
        this.api.hap.Service.Switch,
        preset.name,
      );

      switchService.setCharacteristic(
        this.api.hap.Characteristic.Name,
        preset.name,
      );

      switchService
        .getCharacteristic(this.api.hap.Characteristic.On)
        .onGet(() => false)
        .onSet(async value => {
          if (!value) {
            return;
          }

          try {
            await this.runCleaningPreset(preset);
          } finally {
            switchService.updateCharacteristic(
              this.api.hap.Characteristic.On,
              false,
            );
          }
        });

      this.api.updatePlatformAccessories([accessory]);
    }

    const staleAccessories = this.cachedPresetAccessories.filter(
      accessory => !activeAccessoryUuids.has(accessory.UUID),
    );

    if (staleAccessories.length > 0) {
      this.api.unregisterPlatformAccessories(
        PLUGIN_NAME,
        PLATFORM_NAME,
        staleAccessories,
      );
    }

    this.log.info(
      `${configuredPresets.length} MOVA-Reinigungspreset(s) für Apple Home bereitgestellt.`,
    );

    const bridgeConfiguration = this.config._bridge;

    if (
      bridgeConfiguration
      && typeof bridgeConfiguration === 'object'
      && 'hap' in bridgeConfiguration
      && bridgeConfiguration.hap
      && typeof bridgeConfiguration.hap === 'object'
      && 'enabled' in bridgeConfiguration.hap
      && bridgeConfiguration.hap.enabled === false
    ) {
      this.log.warn(
        'Die Preset-Taster benötigen HAP. Aktiviere HAP für die MOVA-Child-Bridge und kopple deren HomeKit-Code zusätzlich zum Matter-Saugroboter.',
      );
    }
  }

  private async runCleaningPreset(
    preset: MovaCleaningPreset,
  ): Promise<void> {
    if (!this.cloud || !this.selectedDevice) {
      throw new Error(
        'Das Reinigungspreset kann ohne MOVA-Verbindung nicht gestartet werden.',
      );
    }

    if (this.presetCommandRunning) {
      throw new Error(
        'Ein anderes MOVA-Reinigungspreset wird bereits gestartet.',
      );
    }

    this.presetCommandRunning = true;

    const roomNames = preset.rooms
      .map(room => room.roomName)
      .join(', ');

    try {
      this.log.info(
        `Preset-Befehl: „${preset.name}“ (${roomNames}; ${
          getPresetModeLabel(preset.mode)
        }) …`,
      );

      if (preset.mode === 'automatic') {
        await this.cloud.setCustomizedCleaning(
          this.selectedDevice.did,
          true,
        );
        await this.cloud.waitForCustomizedCleaning(
          this.selectedDevice.did,
          true,
        );
      } else {
        await this.cloud.setCustomizedCleaning(
          this.selectedDevice.did,
          false,
        );
        await this.cloud.setCleaningMode(
          this.selectedDevice.did,
          preset.mode,
        );
        await this.cloud.waitForCustomizedCleaning(
          this.selectedDevice.did,
          false,
        );
      }

      await this.cloud.startRoomCleaning(
        this.selectedDevice.did,
        preset.rooms.map(room => room.roomId),
        createPresetRoomCleaningSelections(preset),
      );

      this.log.info(
        `Preset-Befehl erfolgreich: „${preset.name}“.`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : String(error);

      this.log.error(
        `Preset-Befehl fehlgeschlagen: „${preset.name}“ – ${message}`,
      );
      throw error;
    } finally {
      this.presetCommandRunning = false;
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

import type {
  API,
  AccessoryConfig,
  AccessoryPlugin,
  Logging,
  Service,
} from 'homebridge';

import type { MovaDevice } from './mova-cloud.js';
import { MovaCloud } from './mova-cloud.js';
import { registerMovaMatterVacuum } from './mova-matter.js';

const PLUGIN_NAME = 'homebridge-mova';
const ACCESSORY_NAME = 'MovaVacuum';

class MovaVacuumAccessory implements AccessoryPlugin {
  private readonly informationService: Service;
  private readonly cloudReady: Promise<void>;
  private cloud?: MovaCloud;
  private selectedDevice?: MovaDevice;

  constructor(
    private readonly log: Logging,
    private readonly config: AccessoryConfig,
    private readonly api: API,
  ) {
    this.log.info('MOVA-Plugin wird gestartet');

    this.informationService =
      new this.api.hap.Service.AccessoryInformation()
        .setCharacteristic(
          this.api.hap.Characteristic.Manufacturer,
          'MOVA',
        )
        .setCharacteristic(
          this.api.hap.Characteristic.Model,
          'E40 Ultra',
        )
        .setCharacteristic(
          this.api.hap.Characteristic.SerialNumber,
          'MOVA-CLOUD',
        );

    this.cloudReady = this.connectToCloud();

    this.api.on('didFinishLaunching', () => {
      void this.publishMatterVacuum();
    });
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

      this.informationService
        .setCharacteristic(
          this.api.hap.Characteristic.Model,
          'E40 Ultra',
        )
        .setCharacteristic(
          this.api.hap.Characteristic.SerialNumber,
          String(e40Ultra.did),
        );

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
    await this.cloudReady;

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

  getServices(): Service[] {
    return [
      this.informationService,
    ];
  }
}

export default (api: API): void => {
  api.registerAccessory(
    PLUGIN_NAME,
    ACCESSORY_NAME,
    MovaVacuumAccessory,
  );
};

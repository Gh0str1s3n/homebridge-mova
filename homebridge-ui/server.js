import {
  HomebridgePluginUiServer,
  RequestError,
} from '@homebridge/plugin-ui-utils';

import { MovaCloud } from '../dist/mova-cloud.js';

const SUPPORTED_MODELS = new Set([
  'mova.vacuum.r9504a',
  'mova.vacuum.r5732a',
]);

class MovaUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    this.onRequest(
      '/discover-rooms',
      this.discoverRooms.bind(this),
    );

    this.ready();
  }

  async discoverRooms(payload) {
    const username = typeof payload?.username === 'string'
      ? payload.username.trim()
      : '';
    const password = typeof payload?.password === 'string'
      ? payload.password
      : '';

    if (!username || !password) {
      throw new RequestError(
        'Bitte zuerst MOVA-E-Mail-Adresse und Passwort eingeben.',
        { status: 400 },
      );
    }

    try {
      const cloud = new MovaCloud(username, password);
      await cloud.login();

      const devices = await cloud.getDevices();
      const device = devices.find(candidate =>
        SUPPORTED_MODELS.has(candidate.model));

      if (!device) {
        throw new Error(
          'Im MOVA-Konto wurde kein unterstützter E40 Ultra gefunden.',
        );
      }

      const rooms = await cloud.getRooms(device);

      return {
        device: {
          did: String(device.did),
          model: device.model,
          name: device.customName?.trim()
            || device.deviceInfo?.displayName?.trim()
            || 'MOVA E40 Ultra',
        },
        rooms: rooms.map(room => ({
          id: room.id,
          name: room.name,
          mapId: room.mapId,
        })),
      };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : String(error);

      throw new RequestError(
        `MOVA-Räume konnten nicht geladen werden: ${message}`,
        { status: 400 },
      );
    }
  }
}

new MovaUiServer();

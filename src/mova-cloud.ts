import axios from 'axios';
import { createCipheriv, createHash } from 'node:crypto';

import {
  decodeMovaRooms,
  type MovaRoom,
} from './mova-map.js';
import {
  createStandardRoomCleaningSelections,
  type MovaRoomCleaningSelection,
} from './mova-cleaning.js';

export type { MovaRoom } from './mova-map.js';

const MOVA_CLOUD = {
  domain: 'eu.iot.mova-tech.com:13267',
  tenantId: '000002',
  authorization: 'Basic bW92YV9hcHA6VjdLb0NoTFc4dkhBQ3FHYg==',
  meta: 'cv=i_829',
  rlcKey: 'gigxlmqwZ]7oWZUF',
  iotComPrefix: '20000',
} as const;

const REQUEST_TIMEOUT_MS = 15_000;
const FALLBACK_SESSION_LIFETIME_MS = 60 * 60 * 1000;
const SESSION_REFRESH_MARGIN_MS = 60_000;
const CUSTOMIZED_CLEANING_CONFIRM_ATTEMPTS = 5;
const CUSTOMIZED_CLEANING_CONFIRM_DELAY_MS = 500;

interface MovaSession {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface MovaDevice {
  id?: string;
  did: string | number;
  model: string;
  customName?: string;
  online?: boolean;
  battery?: number;
  latestStatus?: number;
  deviceInfo?: {
    displayName?: string;
  };
}

export interface MovaVacuumStatus {
  state?: number;
  battery?: number;
  chargingStatus?: number;
  status?: number;
  taskStatus?: number;
  cleaningModeRaw?: number;
  customizedCleaning?: number;
  selfWashBaseStatus?: number;
}

interface MovaDeviceListResponse {
  code?: string | number;
  success?: boolean;
  data?: {
    page?: {
      records?: MovaDevice[];
    };
    data?: {
      page?: {
        records?: MovaDevice[];
      };
    };
  };
}

interface MovaPropertyResult {
  siid?: number;
  piid?: number;
  code?: number;
  value?: unknown;
}

interface MovaCommandResponse {
  code?: number;
  msg?: string;
  data?: {
    result?: MovaPropertyResult[];
  };
}

interface MovaActionInput {
  piid: number;
  value: unknown;
}

interface MovaMapDescriptor {
  object_name?: string;
}

interface MovaDownloadUrlResponse {
  code?: number;
  msg?: string;
  data?: string;
}

interface MovaStoredMapEntry {
  id?: number;
  first?: number;
  map?: string;
  thb?: string;
}

interface MovaStoredMapFile {
  curr_id?: number;
  mapstr?: MovaStoredMapEntry[];
}

export class MovaCloud {
  private session: MovaSession = {};
  private sessionRefreshAt = 0;
  private loginInFlight?: Promise<void>;
  private readonly rlcHeader: string;

  constructor(
    private readonly username: string,
    private readonly password: string,
  ) {
    this.rlcHeader = this.computeRlc();
  }

  private computeRlc(): string {
    const cipher = createCipheriv(
      'aes-128-ecb',
      MOVA_CLOUD.rlcKey,
      null,
    );

    let encrypted = cipher.update('eu|en|DE', 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return encrypted;
  }

  private getHeaders(): Record<string, string> {
    return {
      'user-agent': 'Dart/3.2 (dart:io)',
      'dreame-meta': MOVA_CLOUD.meta,
      'dreame-rlc': this.rlcHeader,
      'tenant-id': MOVA_CLOUD.tenantId,
      host: MOVA_CLOUD.domain,
      authorization: MOVA_CLOUD.authorization,
      'content-type': 'application/json',
      ...(this.session.access_token
        ? { 'dreame-auth': `bearer ${this.session.access_token}` }
        : {}),
    };
  }

  private getCommandEndpoint(): string {
    return `https://${MOVA_CLOUD.domain}/dreame-iot-com-${
      MOVA_CLOUD.iotComPrefix
    }/device/sendCommand`;
  }

  private isAuthenticationError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const statusCode = error.response?.status;
    return statusCode === 401 || statusCode === 403;
  }

  private async performLogin(): Promise<void> {
    const passwordHash = createHash('md5')
      .update(`${this.password}RAylYC%fmSKp7%Tq`)
      .digest('hex');

    const formData = new URLSearchParams({
      grant_type: 'password',
      scope: 'all',
      platform: 'IOS',
      type: 'account',
      username: this.username,
      password: passwordHash,
      country: 'DE',
      lang: 'de',
    });

    const response = await axios.post<MovaSession>(
      `https://${MOVA_CLOUD.domain}/dreame-auth/oauth/token`,
      formData,
      {
        headers: {
          ...this.getHeaders(),
          'content-type': 'application/x-www-form-urlencoded',
          'dreame-auth': 'bearer',
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    if (!response.data.access_token) {
      throw new Error(
        'Die MOVA-Cloud hat kein Zugriffstoken geliefert.',
      );
    }

    const expiresInSeconds = Number(response.data.expires_in);
    const sessionLifetime =
      Number.isFinite(expiresInSeconds)
      && expiresInSeconds > 0
        ? expiresInSeconds * 1000
        : FALLBACK_SESSION_LIFETIME_MS;

    const refreshMargin = Math.min(
      SESSION_REFRESH_MARGIN_MS,
      Math.floor(sessionLifetime / 10),
    );

    this.session = response.data;
    this.sessionRefreshAt =
      Date.now() + sessionLifetime - refreshMargin;
  }

  async login(): Promise<void> {
    if (this.loginInFlight) {
      await this.loginInFlight;
      return;
    }

    const loginAttempt = this.performLogin();
    this.loginInFlight = loginAttempt;

    try {
      await loginAttempt;
    } finally {
      if (this.loginInFlight === loginAttempt) {
        this.loginInFlight = undefined;
      }
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (
      this.session.access_token
      && Date.now() < this.sessionRefreshAt
    ) {
      return;
    }

    await this.login();
  }

  private async postAuthenticated<T>(
    url: string,
    data: unknown,
    retryAuthentication = true,
  ): Promise<T> {
    await this.ensureAuthenticated();

    try {
      const response = await axios.post<T>(
        url,
        data,
        {
          headers: this.getHeaders(),
          timeout: REQUEST_TIMEOUT_MS,
        },
      );

      return response.data;
    } catch (error: unknown) {
      if (
        retryAuthentication
        && this.isAuthenticationError(error)
      ) {
        this.session = {};
        this.sessionRefreshAt = 0;

        await this.login();

        return this.postAuthenticated<T>(
          url,
          data,
          false,
        );
      }

      throw error;
    }
  }

  async getDevices(): Promise<MovaDevice[]> {
    const response =
      await this.postAuthenticated<MovaDeviceListResponse>(
        `https://${MOVA_CLOUD.domain}/dreame-user-iot/iotuserbind/device/listV2`,
        {
          sharedStatus: 1,
          current: 1,
          size: 100,
          lang: 'de',
          timestamp: Date.now(),
        },
      );

    const records =
      response.data?.page?.records
      ?? response.data?.data?.page?.records;

    if (!Array.isArray(records)) {
      throw new Error(
        `Die MOVA-Cloud hat keine Geräteliste geliefert. Code: ${
          response.code ?? 'unbekannt'
        }`,
      );
    }

    return records;
  }

  async getVacuumStatus(
    did: string | number,
  ): Promise<MovaVacuumStatus> {
    const requestId = Math.floor(Math.random() * 9000) + 1000;
    const requestedProperties = [
      { siid: 2, piid: 1 },
      { siid: 3, piid: 1 },
      { siid: 3, piid: 2 },
      { siid: 4, piid: 1 },
      { siid: 4, piid: 7 },
      { siid: 4, piid: 23 },
      { siid: 4, piid: 25 },
      { siid: 4, piid: 26 },
    ];

    const response =
      await this.postAuthenticated<MovaCommandResponse>(
        this.getCommandEndpoint(),
        {
          did,
          id: requestId,
          data: {
            did,
            id: requestId,
            method: 'get_properties',
            params: requestedProperties.map(
              ({ siid, piid }) => ({
                did,
                siid,
                piid,
                code: 0,
                updateTime: 0,
              }),
            ),
            from: 'XXXXXX',
          },
        },
      );

    if (response.code !== 0) {
      throw new Error(
        `MOVA-Statusabruf fehlgeschlagen. Code: ${
          response.code ?? 'unbekannt'
        }${response.msg ? ` – ${response.msg}` : ''}`,
      );
    }

    const results = response.data?.result;

    if (!Array.isArray(results)) {
      throw new Error(
        'Die MOVA-Cloud hat keine Statuswerte geliefert.',
      );
    }

    const readNumber = (
      siid: number,
      piid: number,
    ): number | undefined => {
      const property = results.find(
        result => result.siid === siid && result.piid === piid,
      );

      if (
        !property
        || (
          property.code !== undefined
          && property.code !== 0
        )
      ) {
        return undefined;
      }

      const value = Number(property.value);
      return Number.isFinite(value) ? value : undefined;
    };

    const statusSnapshot: MovaVacuumStatus = {
      state: readNumber(2, 1),
      battery: readNumber(3, 1),
      chargingStatus: readNumber(3, 2),
      status: readNumber(4, 1),
      taskStatus: readNumber(4, 7),
      cleaningModeRaw: readNumber(4, 23),
      selfWashBaseStatus: readNumber(4, 25),
      customizedCleaning: readNumber(4, 26),
    };

    if (
      statusSnapshot.state === undefined
      && statusSnapshot.status === undefined
      && statusSnapshot.chargingStatus === undefined
    ) {
      throw new Error(
        'Die MOVA-Cloud hat keinen verwertbaren Betriebszustand geliefert.',
      );
    }

    return statusSnapshot;
  }

  async getRooms(device: MovaDevice): Promise<MovaRoom[]> {
    const requestId = Math.floor(Math.random() * 9000) + 1000;
    const response =
      await this.postAuthenticated<MovaCommandResponse>(
        this.getCommandEndpoint(),
        {
          did: device.did,
          id: requestId,
          data: {
            did: device.did,
            id: requestId,
            method: 'get_properties',
            params: [
              {
                did: device.did,
                siid: 6,
                piid: 8,
                code: 0,
                updateTime: 0,
              },
            ],
            from: 'XXXXXX',
          },
        },
      );

    const mapProperty = response.data?.result?.[0];

    if (
      response.code !== 0
      || (
        mapProperty?.code !== undefined
        && mapProperty.code !== 0
      )
    ) {
      throw new Error(
        `MOVA-Kartenliste konnte nicht gelesen werden. Code: ${
          mapProperty?.code
          ?? response.code
          ?? 'unbekannt'
        }`,
      );
    }

    let mapDescriptor: MovaMapDescriptor;

    try {
      mapDescriptor =
        typeof mapProperty?.value === 'string'
          ? JSON.parse(mapProperty.value) as MovaMapDescriptor
          : mapProperty?.value as MovaMapDescriptor;
    } catch {
      throw new Error(
        'Die MOVA-Kartenliste enthält ungültige Daten.',
      );
    }

    if (!mapDescriptor?.object_name) {
      throw new Error(
        'Die MOVA-Kartenliste enthält keinen Dateiverweis.',
      );
    }

    const downloadUrl =
      await this.postAuthenticated<MovaDownloadUrlResponse>(
        `https://${MOVA_CLOUD.domain}/dreame-user-iot/iotfile/getDownloadUrl`,
        {
          did: device.did,
          model: device.model,
          filename: mapDescriptor.object_name,
          region: 'eu',
        },
      );

    if (downloadUrl.code !== 0 || !downloadUrl.data) {
      throw new Error(
        `MOVA-Karten-Download konnte nicht vorbereitet werden. Code: ${
          downloadUrl.code ?? 'unbekannt'
        }${downloadUrl.msg ? ` – ${downloadUrl.msg}` : ''}`,
      );
    }

    const downloaded = await axios.get<MovaStoredMapFile | string>(
      downloadUrl.data,
      {
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    let mapFile: MovaStoredMapFile;

    try {
      mapFile = typeof downloaded.data === 'string'
        ? JSON.parse(downloaded.data) as MovaStoredMapFile
        : downloaded.data;
    } catch {
      throw new Error(
        'Die gespeicherte MOVA-Karte enthält ungültige Daten.',
      );
    }

    const mapEntries = mapFile.mapstr;

    if (!Array.isArray(mapEntries) || mapEntries.length === 0) {
      throw new Error(
        'Die gespeicherte MOVA-Karte enthält keine Karteneinträge.',
      );
    }

    const preferredMap = mapEntries.find(
      entry => entry.first === 0 || entry.id === 0,
    ) ?? mapEntries[0];
    const encodedMap = preferredMap.thb ?? preferredMap.map;

    if (!encodedMap) {
      throw new Error(
        'Die gespeicherte MOVA-Karte enthält kein Raumabbild.',
      );
    }

    const rooms = decodeMovaRooms(encodedMap);

    if (rooms.length === 0) {
      throw new Error(
        'In der MOVA-Karte wurden keine Räume erkannt.',
      );
    }

    return rooms;
  }

  private async sendAction(
    did: string | number,
    siid: number,
    aiid: number,
    input: MovaActionInput[] = [],
  ): Promise<void> {
    const requestId = Math.floor(Math.random() * 9000) + 1000;

    const response =
      await this.postAuthenticated<MovaCommandResponse>(
        this.getCommandEndpoint(),
        {
          did,
          id: requestId,
          data: {
            did,
            id: requestId,
            method: 'action',
            params: {
              did,
              siid,
              aiid,
              in: input,
            },
            from: 'XXXXXX',
          },
        },
      );

    const resultCode = response.data?.result?.[0]?.code;

    if (
      response.code !== 0
      || (resultCode !== undefined && resultCode !== 0)
    ) {
      throw new Error(
        `MOVA-Befehl fehlgeschlagen. Code: ${
          resultCode
          ?? response.code
          ?? 'unbekannt'
        }${response.msg ? ` – ${response.msg}` : ''}`,
      );
    }
  }

  private async setDeviceProperty(
    did: string | number,
    siid: number,
    piid: number,
    value: unknown,
    errorDescription: string,
  ): Promise<void> {
    const requestId = Math.floor(Math.random() * 9000) + 1000;

    const response =
      await this.postAuthenticated<MovaCommandResponse>(
        this.getCommandEndpoint(),
        {
          did,
          id: requestId,
          data: {
            did,
            id: requestId,
            method: 'set_properties',
            params: [
              {
                did,
                siid,
                piid,
                value,
              },
            ],
            from: 'XXXXXX',
          },
        },
      );

    const resultCode = response.data?.result?.[0]?.code;

    if (
      response.code !== 0
      || (resultCode !== undefined && resultCode !== 0)
    ) {
      throw new Error(
        `${errorDescription}. Code: ${
          resultCode
          ?? response.code
          ?? 'unbekannt'
        }${response.msg ? ` – ${response.msg}` : ''}`,
      );
    }
  }

  async startCleaning(did: string | number): Promise<void> {
    await this.sendAction(did, 2, 1);
  }

  async startRoomCleaning(
    did: string | number,
    roomIds: readonly number[],
    selections?: readonly MovaRoomCleaningSelection[],
  ): Promise<void> {
    const selects = selections
      ? selections.map(selection => [...selection])
      : createStandardRoomCleaningSelections(roomIds)
        .map(selection => [...selection]);

    await this.sendAction(
      did,
      4,
      1,
      [
        { piid: 1, value: 18 },
        {
          piid: 10,
          value: JSON.stringify({ selects }),
        },
      ],
    );
  }

  async pauseCleaning(did: string | number): Promise<void> {
    await this.sendAction(did, 2, 2);
  }

  async returnToDock(did: string | number): Promise<void> {
    await this.sendAction(did, 3, 1);
  }

  async setCustomizedCleaning(
    did: string | number,
    enabled: boolean,
  ): Promise<void> {
    await this.setDeviceProperty(
      did,
      4,
      26,
      enabled ? 1 : 0,
      'Angepasste Raumreinigung konnte nicht umgeschaltet werden',
    );
  }

  async waitForCustomizedCleaning(
    did: string | number,
    enabled: boolean,
  ): Promise<void> {
    const expectedValue = enabled ? 1 : 0;

    for (
      let attempt = 1;
      attempt <= CUSTOMIZED_CLEANING_CONFIRM_ATTEMPTS;
      attempt += 1
    ) {
      if (attempt > 1) {
        await new Promise<void>(resolve => {
          setTimeout(resolve, CUSTOMIZED_CLEANING_CONFIRM_DELAY_MS);
        });
      }

      const status = await this.getVacuumStatus(did);

      if (status.customizedCleaning === expectedValue) {
        return;
      }
    }

    throw new Error(
      enabled
        ? 'Der Roboter hat die automatische Raumreinigung nicht rechtzeitig übernommen.'
        : 'Der Roboter hat den einheitlichen Reinigungsmodus nicht rechtzeitig übernommen.',
    );
  }

  async setCleaningMode(
    did: string | number,
    mode: number,
  ): Promise<void> {
    if (![0, 1, 2, 3].includes(mode)) {
      throw new Error(
        `Nicht unterstützter Reinigungsmodus: ${mode}`,
      );
    }

    const getRequestId =
      Math.floor(Math.random() * 9000) + 1000;

    const getResponse =
      await this.postAuthenticated<MovaCommandResponse>(
        this.getCommandEndpoint(),
        {
          did,
          id: getRequestId,
          data: {
            did,
            id: getRequestId,
            method: 'get_properties',
            params: [
              {
                did,
                siid: 4,
                piid: 23,
                code: 0,
                updateTime: 0,
              },
            ],
            from: 'XXXXXX',
          },
        },
      );

    const currentProperty =
      getResponse.data?.result?.find(
        result => result.siid === 4 && result.piid === 23,
      )
      ?? getResponse.data?.result?.[0];

    if (
      getResponse.code !== 0
      || (
        currentProperty?.code !== undefined
        && currentProperty.code !== 0
      )
    ) {
      throw new Error(
        `Aktueller Reinigungsmodus konnte nicht gelesen werden. Code: ${
          currentProperty?.code
          ?? getResponse.code
          ?? 'unbekannt'
        }`,
      );
    }

    const rawValue = Number(currentProperty?.value);

    if (!Number.isInteger(rawValue)) {
      throw new Error(
        'Die MOVA-Cloud hat keinen gültigen Reinigungsmodus geliefert.',
      );
    }

    const wireMode =
      mode === 0
        ? 2
        : mode === 1
          ? 1
          : mode === 2
            ? 0
            : 3;

    const encodedValue =
      ((rawValue & ~3) | (wireMode & 3)) >>> 0;

    await this.setDeviceProperty(
      did,
      4,
      23,
      encodedValue,
      'Reinigungsmodus konnte nicht gesetzt werden',
    );
  }

  isAuthenticated(): boolean {
    return Boolean(
      this.session.access_token
      && Date.now() < this.sessionRefreshAt,
    );
  }
}

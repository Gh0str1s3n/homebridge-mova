import type {
  MovaDevice,
  MovaVacuumStatus,
} from './mova-cloud.js';

export const MODEL_SUPPORT_REQUEST_URL =
  'https://github.com/Gh0str1s3n/homebridge-mova/issues/new?template=new-mova-model.yml';

export const TESTED_MOVA_MODELS = [
  'mova.vacuum.r9504a',
  'mova.vacuum.r5732a',
] as const;

export type ExperimentalModelMode =
  | 'off'
  | 'diagnostic'
  | 'enabled';

export interface MovaDiagnosticReport {
  schemaVersion: 1;
  model: string;
  deviceMetadata: {
    onlineAvailable: boolean;
    batteryAvailable: boolean;
    statusAvailable: boolean;
  };
  readOnlyProbe: {
    status: 'ok' | 'failed';
    statusFields: string[];
    rooms: 'ok' | 'failed';
    roomCount: number | null;
  };
  commandsTested: false;
}

export function isMovaVacuumModel(model: unknown): model is string {
  return typeof model === 'string'
    && model.startsWith('mova.vacuum.');
}

export function isTestedMovaModel(model: unknown): boolean {
  if (typeof model !== 'string') {
    return false;
  }

  return TESTED_MOVA_MODELS.some(
    testedModel => testedModel === model,
  );
}

export function getExperimentalModelMode(
  value: unknown,
): ExperimentalModelMode {
  if (value === 'diagnostic' || value === 'enabled') {
    return value;
  }

  return 'off';
}

export function createMovaDiagnosticReport(
  device: MovaDevice,
  status: MovaVacuumStatus | undefined,
  statusReadable: boolean,
  roomsReadable: boolean,
  roomCount: number | undefined,
): MovaDiagnosticReport {
  const statusFields = status
    ? Object.entries(status)
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field)
      .sort()
    : [];

  return {
    schemaVersion: 1,
    model: device.model,
    deviceMetadata: {
      onlineAvailable: typeof device.online === 'boolean',
      batteryAvailable: typeof device.battery === 'number',
      statusAvailable: typeof device.latestStatus === 'number',
    },
    readOnlyProbe: {
      status: statusReadable ? 'ok' : 'failed',
      statusFields,
      rooms: roomsReadable ? 'ok' : 'failed',
      roomCount: roomsReadable ? roomCount ?? 0 : null,
    },
    commandsTested: false,
  };
}

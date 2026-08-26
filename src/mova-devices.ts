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

export interface MovaModelCandidate {
  readonly name: string;
  readonly models: readonly string[];
}

export const MODEL_CANDIDATE_SOURCE_URL =
  'https://github.com/F1nn-T/dreame-ha';

// These identifiers are community-sourced compatibility candidates. They
// have not been verified with this plugin and must remain behind the existing
// diagnostic/experimental safety gate until tested with real hardware.
export const KNOWN_UNTESTED_MOVA_MODELS = [
  {
    name: 'MOVA P50 Pro Ultra',
    models: [
      'mova.vacuum.r2475a',
      'mova.vacuum.r2475h',
      'mova.vacuum.r2475t',
      'mova.vacuum.r9416d',
      'mova.vacuum.r2587a',
    ],
  },
  {
    name: 'MOVA P50 Ultra',
    models: ['mova.vacuum.r2519a'],
  },
  {
    name: 'MOVA P50s Ultra',
    models: ['mova.vacuum.r9427h'],
  },
  {
    name: 'MOVA P50 Standard',
    models: [
      'mova.vacuum.r9416',
      'mova.vacuum.r94745',
      'mova.vacuum.r94165',
    ],
  },
  {
    name: 'MOVA P50 Pro',
    models: ['mova.vacuum.r9474'],
  },
  {
    name: 'MOVA P10 Ultra',
    models: ['mova.vacuum.r2462a'],
  },
  {
    name: 'MOVA P10 Pro Ultra',
    models: ['mova.vacuum.r2491a'],
  },
  {
    name: 'MOVA P10 Pro Ultra Gen 2',
    models: ['mova.vacuum.r5730c'],
  },
  {
    name: 'MOVA P20 Ultra',
    models: ['mova.vacuum.r2432b'],
  },
  {
    name: 'MOVA P60',
    models: [
      'mova.vacuum.r9427',
      'mova.vacuum.r9427x',
      'mova.vacuum.r5747',
      'mova.vacuum.r5730',
    ],
  },
  {
    name: 'MOVA P60 Pro',
    models: [
      'mova.vacuum.r9482',
      'mova.vacuum.r2535',
    ],
  },
  {
    name: 'MOVA P70 Pro Ultra',
    models: [
      'mova.vacuum.r590q',
      'mova.vacuum.r5770',
      'mova.vacuum.r5977a',
      'mova.vacuum.r5977f',
      'mova.vacuum.r5977g',
      'mova.vacuum.r5977h',
    ],
  },
  {
    name: 'MOVA V50 Ultra',
    models: [
      'mova.vacuum.r2525a',
      'mova.vacuum.r2525e',
      'mova.vacuum.r2525h',
    ],
  },
  {
    name: 'MOVA V50 Ultra Complete',
    models: [
      'mova.vacuum.r2582a',
      'mova.vacuum.r2582c',
      'mova.vacuum.r2582h',
      'mova.vacuum.r2582k',
    ],
  },
  {
    name: 'MOVA V60 MOBIUS',
    models: ['mova.vacuum.r2599'],
  },
  {
    name: 'MOVA Z50 Ultra',
    models: [
      'mova.vacuum.r2430a',
      'mova.vacuum.r2430u',
    ],
  },
  {
    name: 'MOVA Z60 Pro',
    models: [
      'mova.vacuum.r9473',
      'mova.vacuum.r2561',
    ],
  },
  {
    name: 'MOVA Z60 Ultra Roller Complete',
    models: [
      'mova.vacuum.r9540a',
      'mova.vacuum.r9540h',
      'mova.vacuum.r9540k',
      'mova.vacuum.r9540n',
      'mova.vacuum.r9540u',
    ],
  },
  {
    name: 'MOVA Z70 Pro',
    models: ['mova.vacuum.r5766'],
  },
  {
    name: 'MOVA Z70 Ultra Roller Complete',
    models: ['mova.vacuum.r5765h'],
  },
  {
    name: 'MOVA S70 Roller',
    models: [
      'mova.vacuum.r5769a',
      'mova.vacuum.r5769f',
      'mova.vacuum.r5769g',
      'mova.vacuum.r5769h',
      'mova.vacuum.r5769q',
      'mova.vacuum.r5769t',
    ],
  },
  {
    name: 'MOVA S70 Ultra Roller',
    models: [
      'mova.vacuum.r5770a',
      'mova.vacuum.r5770g',
      'mova.vacuum.r5770h',
      'mova.vacuum.r5770t',
      'mova.vacuum.r590qf',
    ],
  },
  {
    name: 'MOVA E20s Pro',
    models: ['mova.vacuum.r2569c'],
  },
  {
    name: 'MOVA E30 Pro',
    models: ['mova.vacuum.r2533h'],
  },
  {
    name: 'MOVA E30 Pro Ultra',
    models: ['mova.vacuum.r95046'],
  },
] as const satisfies readonly MovaModelCandidate[];

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

export function getKnownUntestedMovaModel(
  model: unknown,
): MovaModelCandidate | undefined {
  if (typeof model !== 'string') {
    return undefined;
  }

  return KNOWN_UNTESTED_MOVA_MODELS.find(
    candidate => candidate.models.some(
      candidateModel => candidateModel === model,
    ),
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

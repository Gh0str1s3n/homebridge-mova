import { inflateSync } from 'node:zlib';

export interface MovaRoom {
  id: number;
  name: string;
  mapId: number;
  type: number | null;
  index: number | null;
  cleaningSettings?: MovaRoomCleaningSettings;
}

export interface MovaRoomCleaningSettings {
  suctionLevel: number;
  waterVolume: number;
  cleaningTimes: number;
  order: number;
  cleaningMode?: number;
}

const ROOM_TYPE_NAMES: Readonly<Record<number, string>> = {
  1: 'Wohnzimmer',
  2: 'Schlafzimmer',
  3: 'Arbeitszimmer',
  4: 'Küche',
  5: 'Esszimmer',
  6: 'Badezimmer',
  7: 'Balkon',
  8: 'Flur',
  9: 'Hauswirtschaftsraum',
  10: 'Ankleidezimmer',
  11: 'Besprechungsraum',
  12: 'Büro',
  13: 'Fitnessbereich',
  14: 'Freizeitbereich',
  15: 'Schlafzimmer',
};

interface SegmentInformation {
  type?: unknown;
  index?: unknown;
  name?: unknown;
}

interface ExpandedMapData {
  seg_inf?: Record<string, SegmentInformation>;
  cleanset?: unknown;
}

type MovaCleanset = Readonly<Record<string, unknown>>;

function decodeCustomRoomName(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }

  try {
    return Buffer.from(value, 'base64').toString('utf8').trim();
  } catch {
    return '';
  }
}

function getRoomName(
  roomId: number,
  type: number | null,
  index: number | null,
  customName: string,
): string {
  if (type === 0 && customName) {
    return customName;
  }

  const predefinedName =
    type === null ? undefined : ROOM_TYPE_NAMES[type];

  if (!predefinedName) {
    return `Raum ${roomId}`;
  }

  return index !== null && index > 0
    ? `${predefinedName} ${index + 1}`
    : predefinedName;
}

function decodeCleanset(value: unknown): MovaCleanset {
  let decoded = value;

  if (typeof decoded === 'string') {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      return {};
    }
  }

  if (
    !decoded
    || typeof decoded !== 'object'
    || Array.isArray(decoded)
  ) {
    return {};
  }

  return decoded as MovaCleanset;
}

function decodeRoomCleaningSettings(
  value: unknown,
): MovaRoomCleaningSettings | undefined {
  if (!Array.isArray(value) || value.length < 4) {
    return undefined;
  }

  const suctionLevel = value[0];
  const encodedWaterVolume = value[1];
  const cleaningTimes = value[2];
  const order = value[3];
  const cleaningMode = value.length > 4
    ? value[4]
    : undefined;

  if (
    typeof suctionLevel !== 'number'
    || !Number.isInteger(suctionLevel)
    || suctionLevel < 0
    || typeof encodedWaterVolume !== 'number'
    || !Number.isInteger(encodedWaterVolume)
    || encodedWaterVolume < 1
    || typeof cleaningTimes !== 'number'
    || !Number.isInteger(cleaningTimes)
    || cleaningTimes < 1
    || typeof order !== 'number'
    || !Number.isInteger(order)
    || order < 0
    || (
      cleaningMode !== undefined
      && (
        typeof cleaningMode !== 'number'
        || !Number.isInteger(cleaningMode)
        || cleaningMode < 0
        || cleaningMode > 3
      )
    )
  ) {
    return undefined;
  }

  return {
    suctionLevel,
    waterVolume: encodedWaterVolume - 1,
    cleaningTimes,
    order,
    ...(cleaningMode === undefined ? {} : { cleaningMode }),
  };
}

export function decodeMovaRooms(
  encodedMap: string,
): MovaRoom[] {
  if (!encodedMap || encodedMap.includes(',')) {
    throw new Error(
      'Das Format der gespeicherten MOVA-Karte wird nicht unterstützt.',
    );
  }

  const normalized = encodedMap
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const compressed = Buffer.from(normalized, 'base64');
  const map = inflateSync(compressed);

  if (map.length < 27) {
    throw new Error('Die MOVA-Karte ist unvollständig.');
  }

  const mapId = map.readInt16LE(0);
  const frameType = map.readInt8(4);
  const width = map.readInt16LE(19);
  const height = map.readInt16LE(21);
  const pixelCount = width * height;
  const metadataOffset = 27 + pixelCount;

  if (
    frameType !== 73
    || width <= 0
    || height <= 0
    || map.length < metadataOffset
  ) {
    throw new Error(
      'Die MOVA-Karte enthält kein vollständiges Raumabbild.',
    );
  }

  let expandedData: ExpandedMapData = {};
  const metadataText = map
    .subarray(metadataOffset)
    .toString('utf8')
    .replace(/\0+$/u, '')
    .trim();

  if (metadataText) {
    try {
      expandedData = JSON.parse(metadataText) as ExpandedMapData;
    } catch {
      expandedData = {};
    }
  }

  const roomIds = new Set<number>();
  const cleanset = decodeCleanset(expandedData.cleanset);

  for (let offset = 27; offset < metadataOffset; offset += 1) {
    const roomId = map[offset] & 0x3f;

    if (roomId > 0 && roomId < 62) {
      roomIds.add(roomId);
    }
  }

  return [...roomIds]
    .sort((a, b) => a - b)
    .map((roomId): MovaRoom => {
      const segment = expandedData.seg_inf?.[String(roomId)];
      const numericType = Number(segment?.type);
      const numericIndex = Number(segment?.index);
      const type = Number.isInteger(numericType)
        ? numericType
        : null;
      const index = Number.isInteger(numericIndex)
        ? numericIndex
        : null;
      const customName = decodeCustomRoomName(segment?.name);
      const cleaningSettings = decodeRoomCleaningSettings(
        cleanset[String(roomId)],
      );

      return {
        id: roomId,
        name: getRoomName(
          roomId,
          type,
          index,
          customName,
        ),
        mapId,
        type,
        index,
        ...(cleaningSettings ? { cleaningSettings } : {}),
      };
    });
}

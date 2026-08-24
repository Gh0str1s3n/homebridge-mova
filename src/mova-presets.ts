import type { MovaRoomCleaningSelection } from './mova-cleaning.js';

export const MOVA_PRESET_MODES = [
  'automatic',
  0,
  1,
  2,
  3,
] as const;

export type MovaPresetMode = typeof MOVA_PRESET_MODES[number];

export interface MovaPresetRoom {
  roomId: number;
  roomName: string;
  cleaningTimes: number;
  suctionLevel: number;
  waterVolume: number;
}

export interface MovaCleaningPreset {
  id: string;
  name: string;
  mode: MovaPresetMode;
  rooms: MovaPresetRoom[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  const numberValue = Number(value);

  return Number.isInteger(numberValue)
    && numberValue >= minimum
    && numberValue <= maximum
    ? numberValue
    : undefined;
}

function readPresetMode(value: unknown): MovaPresetMode | undefined {
  if (value === 'automatic') {
    return value;
  }

  const numericMode = readInteger(value, 0, 3);
  return numericMode as MovaPresetMode | undefined;
}

export function parseMovaCleaningPresets(
  value: unknown,
): MovaCleaningPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedPresetIds = new Set<string>();

  return value.flatMap((presetValue, presetIndex) => {
    if (!isRecord(presetValue)) {
      return [];
    }

    const name = typeof presetValue.name === 'string'
      ? presetValue.name.trim()
      : '';
    const configuredId = typeof presetValue.id === 'string'
      ? presetValue.id.trim()
      : '';
    const id = configuredId || `preset-${presetIndex + 1}`;
    const mode = readPresetMode(presetValue.mode);

    if (!name || !mode && mode !== 0 || usedPresetIds.has(id)) {
      return [];
    }

    if (!Array.isArray(presetValue.rooms)) {
      return [];
    }

    const usedRoomIds = new Set<number>();
    const rooms = presetValue.rooms.flatMap(roomValue => {
      if (!isRecord(roomValue)) {
        return [];
      }

      const roomId = readInteger(roomValue.roomId, 1, 61);
      const cleaningTimes = readInteger(
        roomValue.cleaningTimes ?? 1,
        1,
        3,
      );
      const suctionLevel = readInteger(
        roomValue.suctionLevel ?? 0,
        0,
        3,
      );
      const waterVolume = readInteger(
        roomValue.waterVolume ?? 0,
        0,
        2,
      );

      if (
        roomId === undefined
        || cleaningTimes === undefined
        || suctionLevel === undefined
        || waterVolume === undefined
        || usedRoomIds.has(roomId)
      ) {
        return [];
      }

      usedRoomIds.add(roomId);

      const roomName = typeof roomValue.roomName === 'string'
        ? roomValue.roomName.trim()
        : '';

      return [{
        roomId,
        roomName: roomName || `Raum ${roomId}`,
        cleaningTimes,
        suctionLevel,
        waterVolume,
      }];
    });

    if (rooms.length === 0) {
      return [];
    }

    usedPresetIds.add(id);

    return [{
      id,
      name,
      mode,
      rooms,
    }];
  });
}

export function createPresetRoomCleaningSelections(
  preset: MovaCleaningPreset,
): MovaRoomCleaningSelection[] {
  return preset.rooms.map((room, index) => [
    room.roomId,
    room.cleaningTimes,
    room.suctionLevel,
    room.waterVolume,
    index + 1,
  ]);
}

export function getPresetModeLabel(mode: MovaPresetMode): string {
  if (mode === 'automatic') {
    return 'MOVA-Raumeinstellungen';
  }

  if (mode === 0) {
    return 'Saugen';
  }

  if (mode === 1) {
    return 'Wischen';
  }

  if (mode === 2) {
    return 'Saugen und Wischen';
  }

  return 'Wischen nach dem Saugen';
}

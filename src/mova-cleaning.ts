import type { MovaRoom } from './mova-map.js';

export type MovaRoomCleaningSelection = readonly [
  roomId: number,
  cleaningTimes: number,
  suctionLevel: number,
  waterVolume: number,
  order: number,
];

export interface MovaRoomCleaningPlan {
  rooms: MovaRoom[];
  selects: MovaRoomCleaningSelection[];
  description: string;
}

function getRoomCleaningModeLabel(mode: number): string {
  if (mode === 0) {
    return 'Saugen';
  }

  if (mode === 1) {
    return 'Wischen';
  }

  if (mode === 2) {
    return 'Saugen und Wischen';
  }

  if (mode === 3) {
    return 'Wischen nach dem Saugen';
  }

  return `Modus ${mode}`;
}

export function createCustomizedRoomCleaningPlan(
  rooms: readonly MovaRoom[],
  selectedRoomIds: readonly number[],
): MovaRoomCleaningPlan {
  const roomById = new Map(rooms.map(room => [room.id, room]));
  const uniqueRoomIds = [...new Set(selectedRoomIds)]
    .filter(roomId => Number.isInteger(roomId) && roomId > 0);

  if (uniqueRoomIds.length === 0) {
    throw new Error(
      'Für die automatische Raumreinigung wurde kein gültiger Raum ausgewählt.',
    );
  }

  const selectedRooms = uniqueRoomIds.map(roomId => {
    const room = roomById.get(roomId);

    if (!room) {
      throw new Error(
        `Raum ${roomId} ist in der aktuellen MOVA-Karte nicht mehr vorhanden.`,
      );
    }

    return room;
  });

  const roomsWithoutSettings = selectedRooms
    .filter(room => room.cleaningSettings?.cleaningMode === undefined)
    .map(room => room.name);

  if (roomsWithoutSettings.length > 0) {
    throw new Error(
      `Für ${roomsWithoutSettings.join(', ')} fehlen sichere individuelle `
      + 'Raumeinstellungen. Bitte den Reinigungsmodus dieser Räume in der '
      + 'MOVA-App festlegen und den Start erneut versuchen.',
    );
  }

  const selects = selectedRooms.map(
    (room, index): MovaRoomCleaningSelection => {
      const settings = room.cleaningSettings!;

      return [
        room.id,
        settings.cleaningTimes,
        settings.suctionLevel,
        settings.waterVolume,
        index + 1,
      ];
    },
  );

  const description = selectedRooms
    .map(room => {
      const mode = room.cleaningSettings!.cleaningMode!;
      return `${room.name}: ${getRoomCleaningModeLabel(mode)}`;
    })
    .join(', ');

  return {
    rooms: selectedRooms,
    selects,
    description,
  };
}

export function createStandardRoomCleaningSelections(
  roomIds: readonly number[],
): MovaRoomCleaningSelection[] {
  const uniqueRoomIds = [...new Set(roomIds)]
    .filter(roomId => Number.isInteger(roomId) && roomId > 0);

  if (uniqueRoomIds.length === 0) {
    throw new Error(
      'Für die Raumreinigung wurde kein gültiger Raum ausgewählt.',
    );
  }

  return uniqueRoomIds.map(
    (roomId, index) => [roomId, 1, 0, 0, index + 1],
  );
}

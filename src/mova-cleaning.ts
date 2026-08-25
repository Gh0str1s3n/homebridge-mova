export type MovaRoomCleaningSelection = readonly [
  roomId: number,
  cleaningTimes: number,
  suctionLevel: number,
  waterVolume: number,
  order: number,
];

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

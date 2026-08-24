import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPresetRoomCleaningSelections,
  parseMovaCleaningPresets,
} from '../dist/mova-presets.js';

test('behält die konfigurierte Raumreihenfolge im MOVA-Auftrag', () => {
  const [preset] = parseMovaCleaningPresets([
    {
      id: 'morning',
      name: 'Morgenrunde',
      mode: 'automatic',
      rooms: [
        {
          roomId: 6,
          roomName: 'Büro',
          cleaningTimes: 1,
          suctionLevel: 2,
          waterVolume: 0,
        },
        {
          roomId: 3,
          roomName: 'Küche',
          cleaningTimes: 2,
          suctionLevel: 3,
          waterVolume: 2,
        },
      ],
    },
  ]);

  assert.deepEqual(
    createPresetRoomCleaningSelections(preset),
    [
      [6, 1, 2, 0, 1],
      [3, 2, 3, 2, 2],
    ],
  );
});

test('entfernt doppelte Räume und ungültige Presets', () => {
  const presets = parseMovaCleaningPresets([
    {
      id: 'valid',
      name: 'Büro',
      mode: 0,
      rooms: [
        {
          roomId: 6,
          roomName: 'Büro',
          cleaningTimes: 1,
          suctionLevel: 1,
          waterVolume: 0,
        },
        {
          roomId: 6,
          roomName: 'Büro doppelt',
          cleaningTimes: 2,
          suctionLevel: 3,
          waterVolume: 2,
        },
      ],
    },
    {
      id: 'empty',
      name: 'Ohne Räume',
      mode: 2,
      rooms: [],
    },
  ]);

  assert.equal(presets.length, 1);
  assert.equal(presets[0].rooms.length, 1);
  assert.equal(presets[0].rooms[0].roomName, 'Büro');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCustomizedRoomCleaningPlan,
  createStandardRoomCleaningSelections,
} from '../dist/mova-cleaning.js';

const rooms = [
  {
    id: 1,
    name: 'Küche',
    mapId: 42,
    type: 4,
    index: 0,
    cleaningSettings: {
      suctionLevel: 3,
      waterVolume: 2,
      cleaningTimes: 2,
      order: 1,
      cleaningMode: 2,
    },
  },
  {
    id: 2,
    name: 'Büro',
    mapId: 42,
    type: 12,
    index: 0,
    cleaningSettings: {
      suctionLevel: 2,
      waterVolume: 0,
      cleaningTimes: 1,
      order: 2,
      cleaningMode: 0,
    },
  },
];

test('erstellt einen gemischten automatischen Raumplan', () => {
  const plan = createCustomizedRoomCleaningPlan(rooms, [1, 2, 1]);

  assert.deepEqual(plan.selects, [
    [1, 2, 3, 2, 1],
    [2, 1, 2, 0, 2],
  ]);
  assert.equal(
    plan.description,
    'Küche: Saugen und Wischen, Büro: Saugen',
  );
});

test('verhindert Automatik ohne sicheren Raum-Modus', () => {
  assert.throws(
    () => createCustomizedRoomCleaningPlan([
      {
        ...rooms[0],
        cleaningSettings: {
          ...rooms[0].cleaningSettings,
          cleaningMode: undefined,
        },
      },
    ], [1]),
    /fehlen sichere individuelle Raumeinstellungen/u,
  );
});

test('Standardmodus verwendet weiterhin einheitliche Werte', () => {
  assert.deepEqual(
    createStandardRoomCleaningSelections([3, 5, 3]),
    [
      [3, 1, 0, 0, 1],
      [5, 1, 0, 0, 2],
    ],
  );
});

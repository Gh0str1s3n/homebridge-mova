import assert from 'node:assert/strict';
import test from 'node:test';

import { MovaCloud } from '../dist/mova-cloud.js';

test('sendet den individuellen Raumplan unverändert an MOVA', async () => {
  const cloud = new MovaCloud('test@example.com', 'secret');
  let action;

  cloud.sendAction = async (...args) => {
    action = args;
  };

  await cloud.startRoomCleaning(
    'vacuum-1',
    [1, 2],
    [
      [1, 2, 3, 2, 1],
      [2, 1, 2, 0, 2],
    ],
  );

  assert.deepEqual(action, [
    'vacuum-1',
    4,
    1,
    [
      { piid: 1, value: 18 },
      {
        piid: 10,
        value: JSON.stringify({
          selects: [
            [1, 2, 3, 2, 1],
            [2, 1, 2, 0, 2],
          ],
        }),
      },
    ],
  ]);
});

test('bestätigt den von MOVA gemeldeten Automatikmodus', async () => {
  const cloud = new MovaCloud('test@example.com', 'secret');
  let statusRequests = 0;

  cloud.getVacuumStatus = async () => {
    statusRequests += 1;
    return { customizedCleaning: 1 };
  };

  await cloud.waitForCustomizedCleaning('vacuum-1', true);

  assert.equal(statusRequests, 1);
});

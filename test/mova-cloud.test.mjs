import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeMovaMapObjectName,
  decodeMovaMapPayload,
  MovaCloud,
} from '../dist/mova-cloud.js';

test('liest den Dateiverweis der aktiven Karte aus MOVA-Formaten', () => {
  assert.equal(
    decodeMovaMapObjectName('["active-map-file", 123]'),
    'active-map-file',
  );
  assert.equal(
    decodeMovaMapObjectName({ object_name: 'active-map-file' }),
    'active-map-file',
  );
});

test('normalisiert den Inhalt einer aktiven Kartendatei', () => {
  assert.equal(
    decodeMovaMapPayload(Buffer.from('encoded-map\n')),
    'encoded-map',
  );
  assert.equal(
    decodeMovaMapPayload('"encoded-map"'),
    'encoded-map',
  );
});

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

test('sendet eine geordnete Standard-Raumauswahl an MOVA', async () => {
  const cloud = new MovaCloud('test@example.com', 'secret');
  let action;

  cloud.sendAction = async (...args) => {
    action = args;
  };

  await cloud.startRoomCleaning('vacuum-1', [6, 3]);

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
            [6, 1, 0, 0, 1],
            [3, 1, 0, 0, 2],
          ],
        }),
      },
    ],
  ]);
});

test('bestätigt den von MOVA gemeldeten einheitlichen Modus', async () => {
  const cloud = new MovaCloud('test@example.com', 'secret');
  let statusRequests = 0;

  cloud.getVacuumStatus = async () => {
    statusRequests += 1;
    return { customizedCleaning: 0 };
  };

  await cloud.waitForCustomizedCleaning('vacuum-1', false);

  assert.equal(statusRequests, 1);
});

test('lehnt nicht veröffentlichte Reinigungsmodi ab', async () => {
  const cloud = new MovaCloud('test@example.com', 'secret');

  await assert.rejects(
    cloud.setCleaningMode('vacuum-1', 3),
    /Nicht unterstützter Reinigungsmodus: 3/u,
  );
});

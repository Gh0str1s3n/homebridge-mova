import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import { decodeMovaRooms } from '../dist/mova-map.js';

function createEncodedMap(metadata) {
  const width = 3;
  const height = 1;
  const buffer = Buffer.alloc(27 + width * height);

  buffer.writeInt16LE(42, 0);
  buffer.writeInt8(73, 4);
  buffer.writeInt16LE(width, 19);
  buffer.writeInt16LE(height, 21);
  buffer.set([1, 2, 3], 27);

  const expanded = Buffer.concat([
    buffer,
    Buffer.from(JSON.stringify(metadata)),
  ]);

  return deflateSync(expanded).toString('base64');
}

test('liest individuelle Reinigungswerte aus MOVA cleanset', () => {
  const encodedMap = createEncodedMap({
    seg_inf: {
      1: { type: 4, index: 0 },
      2: { type: 12, index: 0 },
      3: { type: 6, index: 0 },
    },
    cleanset: {
      1: [3, 4, 2, 1, 2],
      2: [2, 1, 1, 2, 0],
      3: [1, 3, 1, 3, 1],
    },
  });

  const rooms = decodeMovaRooms(encodedMap);

  assert.deepEqual(
    rooms.map(room => room.cleaningSettings),
    [
      {
        suctionLevel: 3,
        waterVolume: 3,
        cleaningTimes: 2,
        order: 1,
        cleaningMode: 2,
      },
      {
        suctionLevel: 2,
        waterVolume: 0,
        cleaningTimes: 1,
        order: 2,
        cleaningMode: 0,
      },
      {
        suctionLevel: 1,
        waterVolume: 2,
        cleaningTimes: 1,
        order: 3,
        cleaningMode: 1,
      },
    ],
  );
});

test('unterstützt cleanset als JSON-String', () => {
  const encodedMap = createEncodedMap({
    cleanset: JSON.stringify({
      1: [2, 2, 1, 0, 0],
    }),
  });

  const rooms = decodeMovaRooms(encodedMap);

  assert.equal(rooms[0].cleaningSettings?.cleaningMode, 0);
  assert.equal(rooms[0].cleaningSettings?.waterVolume, 1);
});

test('ignoriert beschädigte cleanset-Werte sicher', () => {
  const encodedMap = createEncodedMap({
    cleanset: {
      1: [2, 0, 0, -1, null],
    },
  });

  const rooms = decodeMovaRooms(encodedMap);

  assert.equal(rooms[0].cleaningSettings, undefined);
});

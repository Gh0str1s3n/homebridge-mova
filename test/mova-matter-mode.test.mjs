import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeMovaCleaningMode,
  MOVA_CLEANING_MODES,
} from '../dist/mova-matter.js';

test('veröffentlicht ausschließlich die drei Hauptmodi', () => {
  assert.deepEqual(
    MOVA_CLEANING_MODES.map(({ mode, label }) => ({ mode, label })),
    [
      { mode: 0, label: 'Saugen' },
      { mode: 1, label: 'Wischen' },
      { mode: 2, label: 'Saugen und Wischen' },
    ],
  );
});

test('kennzeichnet die drei Hauptmodi mit den passenden Matter-Tags', () => {
  assert.deepEqual(
    MOVA_CLEANING_MODES.map(({ modeTags }) => modeTags),
    [
      [{ value: 16385 }],
      [{ value: 16386 }],
      [{ value: 16385 }, { value: 16386 }],
    ],
  );
});

test('normalisiert alte optionale MOVA-Modi auf den Kombimodus', () => {
  assert.equal(decodeMovaCleaningMode(5122), 0);
  assert.equal(decodeMovaCleaningMode(5121), 1);
  assert.equal(decodeMovaCleaningMode(5120), 2);
  assert.equal(decodeMovaCleaningMode(5123), 2);
  assert.equal(decodeMovaCleaningMode(undefined), undefined);
});

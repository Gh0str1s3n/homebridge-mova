import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MOVA_CLEANING_MODES,
} from '../dist/mova-matter.js';

test('veröffentlicht fünf eindeutig auswählbare Reinigungsmodi', () => {
  assert.deepEqual(
    MOVA_CLEANING_MODES.map(({ mode, label }) => ({ mode, label })),
    [
      { mode: 0, label: 'Saugen' },
      { mode: 1, label: 'Wischen' },
      { mode: 2, label: 'Saugen und Wischen' },
      { mode: 3, label: 'Tiefenreinigung' },
      { mode: 4, label: 'Automatische Raumreinigung' },
    ],
  );
});

test('gruppiert Tiefenreinigung und Automatik nicht unter Kombireinigung', () => {
  const deepClean = MOVA_CLEANING_MODES.find(({ mode }) => mode === 3);
  const automatic = MOVA_CLEANING_MODES.find(({ mode }) => mode === 4);

  assert.deepEqual(deepClean?.modeTags, [{ value: 16384 }]);
  assert.deepEqual(automatic?.modeTags, [{ value: 0 }]);
});

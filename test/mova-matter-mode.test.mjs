import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAppleHomeCleaningMode,
  isCleaningSessionActive,
} from '../dist/mova-matter.js';

test('zeigt gespeicherte Automatik im Leerlauf neutral an', () => {
  assert.equal(
    getAppleHomeCleaningMode(4, false, false),
    2,
  );
});

test('zeigt gespeicherte Tiefenreinigung im Leerlauf neutral an', () => {
  assert.equal(
    getAppleHomeCleaningMode(3, false, false),
    2,
  );
});

test('zeigt eine bewusst gewählte Zusatzoption vor dem Start an', () => {
  assert.equal(
    getAppleHomeCleaningMode(4, true, false),
    4,
  );
});

test('zeigt den aktiven Zusatzmodus während einer Reinigung an', () => {
  assert.equal(
    getAppleHomeCleaningMode(3, false, true),
    3,
  );
});

test('verändert die drei Hauptmodi nicht', () => {
  assert.equal(getAppleHomeCleaningMode(0, false, false), 0);
  assert.equal(getAppleHomeCleaningMode(1, false, false), 1);
  assert.equal(getAppleHomeCleaningMode(2, false, false), 2);
});

test('erkennt Stationsvorbereitung mit aktivem Raumauftrag', () => {
  assert.equal(
    isCleaningSessionActive(
      { taskStatus: 3 },
      68,
    ),
    true,
  );
});

test('erkennt einen beendeten Auftrag an Aufgabe null', () => {
  assert.equal(
    isCleaningSessionActive(
      { taskStatus: 0 },
      65,
    ),
    false,
  );
});

test('behandelt die Rückkehr trotz alter Aufgabe als beendet', () => {
  assert.equal(
    isCleaningSessionActive(
      { taskStatus: 3 },
      64,
    ),
    false,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMovaDiagnosticReport,
  getExperimentalModelMode,
  getKnownUntestedMovaModel,
  isMovaVacuumModel,
  isTestedMovaModel,
  KNOWN_UNTESTED_MOVA_MODELS,
  TESTED_MOVA_MODELS,
} from '../dist/mova-devices.js';

test('unterscheidet getestete, unbekannte und fremde Gerätemodelle', () => {
  assert.equal(isTestedMovaModel('mova.vacuum.r9504a'), true);
  assert.equal(isTestedMovaModel('mova.vacuum.r5732a'), true);
  assert.equal(isTestedMovaModel('mova.vacuum.unknown'), false);
  assert.equal(isMovaVacuumModel('mova.vacuum.unknown'), true);
  assert.equal(isMovaVacuumModel('mova.washer.unknown'), false);
  assert.equal(isMovaVacuumModel(undefined), false);
  assert.equal(isTestedMovaModel(undefined), false);
});

test('ordnet bekannte Community-Kandidaten zu, ohne sie freizuschalten', () => {
  assert.equal(
    getKnownUntestedMovaModel('mova.vacuum.r5730c')?.name,
    'MOVA P10 Pro Ultra Gen 2',
  );
  assert.equal(
    getKnownUntestedMovaModel('mova.vacuum.r9540u')?.name,
    'MOVA Z60 Ultra Roller Complete',
  );
  assert.equal(
    getKnownUntestedMovaModel('mova.vacuum.unknown'),
    undefined,
  );
  assert.equal(isTestedMovaModel('mova.vacuum.r5730c'), false);
});

test('Kandidatenkennungen sind eindeutig und überschneiden sich nicht mit getesteten Modellen', () => {
  const candidates = KNOWN_UNTESTED_MOVA_MODELS.flatMap(
    candidate => candidate.models,
  );

  assert.equal(new Set(candidates).size, candidates.length);
  assert.ok(candidates.every(model => model.startsWith('mova.vacuum.')));
  assert.ok(
    candidates.every(model => !TESTED_MOVA_MODELS.includes(model)),
  );
});

test('aktiviert experimentelle Modelle nur mit einem gültigen Modus', () => {
  assert.equal(getExperimentalModelMode(undefined), 'off');
  assert.equal(getExperimentalModelMode('off'), 'off');
  assert.equal(getExperimentalModelMode(true), 'off');
  assert.equal(getExperimentalModelMode('diagnostic'), 'diagnostic');
  assert.equal(getExperimentalModelMode('enabled'), 'enabled');
});

test('Diagnosebericht enthält keine persönlichen Geräte- oder Raumdaten', () => {
  const report = createMovaDiagnosticReport(
    {
      id: 'private-device-id',
      did: 'private-did',
      model: 'mova.vacuum.community',
      customName: 'Dobby Privat',
      online: true,
      battery: 82,
      latestStatus: 6,
      deviceInfo: {
        displayName: 'Privater Gerätename',
      },
    },
    {
      state: 6,
      battery: 82,
      chargingStatus: 1,
      cleaningModeRaw: 5122,
    },
    true,
    true,
    7,
  );

  const serialized = JSON.stringify(report);

  assert.equal(report.model, 'mova.vacuum.community');
  assert.equal(report.readOnlyProbe.roomCount, 7);
  assert.equal(report.commandsTested, false);
  assert.doesNotMatch(serialized, /private-device-id/u);
  assert.doesNotMatch(serialized, /private-did/u);
  assert.doesNotMatch(serialized, /Dobby Privat/u);
  assert.doesNotMatch(serialized, /Privater Gerätename/u);
  assert.doesNotMatch(serialized, /82/u);
  assert.doesNotMatch(serialized, /5122/u);
});

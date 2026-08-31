import assert from 'node:assert/strict';
import test from 'node:test';
import { MovaConfigurationError, MOVA_REGIONS, resolveMovaRegion } from '../dist/mova-region.js';

test('keeps the exact EU/Germany legacy metadata when options are omitted', () => {
  assert.deepEqual(resolveMovaRegion(), {
    region: 'eu', country: 'DE', language: 'de', rlcLanguage: 'en',
    domain: 'eu.iot.mova-tech.com:13267',
  });
  assert.deepEqual(resolveMovaRegion({ region: '', country: '', language: 'auto' }), resolveMovaRegion());
  assert.equal(Object.isFrozen(resolveMovaRegion()), true);
});

test('normalizes Canadian account options independently of host locale', () => {
  assert.deepEqual(resolveMovaRegion({ region: ' US ', country: ' ca ', language: ' EN ' }), {
    region: 'us', country: 'CA', language: 'en', rlcLanguage: 'en',
    domain: 'us.iot.mova-tech.com:13267',
  });
  assert.equal(resolveMovaRegion({ region: 'us', country: 'CA' }).language, 'en');
  assert.equal(resolveMovaRegion({ country: 'FR' }).language, 'en');
  assert.equal(resolveMovaRegion({ region: 'us', country: 'CA', language: 'fr' }).rlcLanguage, 'fr');
  assert.equal(resolveMovaRegion({ language: 'de' }).rlcLanguage, 'de');
});

test('only selects fixed MOVA hosts and requires an explicit non-EU account country', () => {
  for (const region of MOVA_REGIONS) {
    assert.equal(resolveMovaRegion({ region, country: 'CA' }).domain, `${region}.iot.mova-tech.com:13267`);
    if (region !== 'eu') {
      assert.throws(() => resolveMovaRegion({ region }), MovaConfigurationError);
    }
  }
  for (const options of [
    { region: 'https://private-value.example' }, { region: 'ca' },
    { region: null }, { region: ['us'] }, { country: 'private-value@example.com' },
    { country: 'CA\r\nprivate-value' }, { country: 123 },
    { language: 'private-value' }, { language: false },
  ]) {
    assert.throws(() => resolveMovaRegion(options), error => {
      assert.ok(error instanceof MovaConfigurationError);
      assert.equal(error.message.includes('private-value'), false);
      return true;
    });
  }
});

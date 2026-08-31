import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MOVA_LANGUAGES, MOVA_REGIONS, resolveMovaRegion } from '../dist/mova-region.js';

test('experimentelle Modelle sind standardmäßig sicher deaktiviert', async () => {
  const schema = JSON.parse(
    await readFile(new URL('../config.schema.json', import.meta.url), 'utf8'),
  );
  const property = schema.schema.properties.experimentalModelSupport;

  assert.equal(property.default, 'off');
  assert.deepEqual(property.enum, ['off', 'diagnostic', 'enabled']);
  assert.equal(
    schema.schema.required.includes('experimentalModelSupport'),
    false,
  );
});

test('region fields agree with runtime validation and preserve old configurations', async () => {
  const config = JSON.parse(await readFile(new URL('../config.schema.json', import.meta.url), 'utf8'));
  const { properties, required } = config.schema;
  assert.equal(config.pluginType, 'platform');
  assert.equal(config.pluginAlias, 'MovaVacuum');
  assert.deepEqual(properties.region.enum, [...MOVA_REGIONS]);
  assert.deepEqual(properties.language.enum, [...MOVA_LANGUAGES]);
  assert.deepEqual(resolveMovaRegion({
    region: properties.region.default, country: properties.country.default,
    language: properties.language.default,
  }), resolveMovaRegion());
  assert.equal(properties.region.enum.length, properties.region.enumNames.length);
  assert.equal(properties.language.enum.length, properties.language.enumNames.length);
  assert.equal(properties.password['x-schema-form'].type, 'password');
  for (const name of ['region', 'country', 'language']) {
    assert.equal(required.includes(name), false);
  }
  const pattern = new RegExp(properties.country.pattern);
  for (const country of ['CA', 'DE', 'ca', '']) assert.ok(pattern.test(country));
  for (const country of ['Canada', 'C', 'user@example.com']) assert.equal(pattern.test(country), false);
});

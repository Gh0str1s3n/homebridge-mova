import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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

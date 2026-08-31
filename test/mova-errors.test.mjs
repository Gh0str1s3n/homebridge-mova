import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import { AxiosError } from 'axios';
import { MovaCloudError, sanitizeMovaApiError } from '../dist/mova-errors.js';
import { resolveMovaRegion } from '../dist/mova-region.js';

test('preserves known generic MOVA OAuth errors and attempt counters', () => {
  const body = {
    error: 'limit_attempts_unauthorized', error_description: 'user password not match',
    maxAttempts: '5', remains: '4', code: '-1', success: false,
    access_token: 'SECRET', user: { email: 'SECRET' }, data: { did: 'SECRET' },
  };
  const expected = {
    code: -1, error: 'limit_attempts_unauthorized', error_description: 'user password not match',
    maxAttempts: 5, remains: 4, success: false,
  };
  assert.deepEqual(sanitizeMovaApiError(body), expected);
  assert.deepEqual(sanitizeMovaApiError(JSON.stringify(body)), expected);
});

test('redacts free text, nested content and unknown codes instead of trusting field names', () => {
  assert.deepEqual(sanitizeMovaApiError({
    error: 'private_token', code: 'private-id', msg: 'user@private.example',
    error_description: 'invalid credentials for user@private.example',
    message: { password: 'secret' }, maxAttempts: 'secret', remains: '123456789',
    success: 'secret', data: { error: 'secret' }, two_factor_url: 'https://private.example/token',
  }), {
    error: '[redacted]', code: '[redacted]', msg: '[redacted]',
    error_description: '[redacted]', message: '[redacted]',
  });
  for (const body of [null, undefined, [], '<html>secret</html>', 'secret', 'x'.repeat(17000)]) {
    assert.deepEqual(sanitizeMovaApiError(body), {});
  }
  assert.deepEqual(sanitizeMovaApiError({ code: Infinity, error: 2147483648 }), {
    code: '[redacted]', error: '[redacted]',
  });
});

test('never retains Axios requests, raw bodies, signed URLs, credentials or causes', () => {
  const secret = 'DO-NOT-LOG-this-value';
  const original = new AxiosError(secret, 'ERR_BAD_REQUEST', {
    url: `https://map.example/?token=${secret}`, data: secret, headers: { authorization: secret },
  }, { password: secret }, {
    status: 401, data: {
      error: 'invalid_user', error_description: 'username or password error',
      msg: secret, access_token: secret, refresh_token: secret, did: secret, rooms: [secret],
    },
  });
  const error = new MovaCloudError('MOVA login failed.', 'login', resolveMovaRegion({
    region: 'us', country: 'CA', language: 'en',
  }), { error: original });
  assert.equal(error.diagnostic.httpStatus, 401);
  assert.equal(error.diagnostic.region, 'us');
  assert.equal(error.diagnostic.api.error, 'invalid_user');
  assert.equal(error.cause, undefined);
  assert.equal(error.config, undefined);
  assert.equal(`${error.stack} ${JSON.stringify(error)} ${inspect(error)}`.includes(secret), false);
  assert.equal(Object.isFrozen(error.diagnostic.api), true);
});

test('includes only known network error codes and valid HTTP status values', () => {
  const timeout = new MovaCloudError('Request failed.', 'map-download', resolveMovaRegion(), {
    error: new AxiosError('private URL', 'ETIMEDOUT'),
  });
  assert.equal(timeout.diagnostic.networkCode, 'ETIMEDOUT');
  const unknown = new MovaCloudError('Request failed.', 'device-list', resolveMovaRegion(), {
    error: new AxiosError('private', 'PRIVATE', undefined, undefined, { status: 'PRIVATE', data: 'PRIVATE' }),
  });
  assert.equal(unknown.diagnostic.networkCode, undefined);
  assert.equal(unknown.diagnostic.httpStatus, undefined);
  assert.equal(unknown.message.includes('PRIVATE'), false);
});

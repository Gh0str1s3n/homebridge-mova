import assert from 'node:assert/strict';
import test from 'node:test';
import { createDecipheriv, createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import axios, { AxiosError } from 'axios';
import { MovaCloud } from '../dist/mova-cloud.js';
import { MovaCloudError } from '../dist/mova-errors.js';
import register from '../dist/index.js';

// Every test replaces both network entry points. Nothing contacts MOVA or a robot.
function stubHttp(t, post, get = () => { throw new Error('Unexpected map download'); }) {
  const calls = [];
  for (const [method, handler] of [['post', post], ['get', get]]) {
    t.mock.method(axios, method, async (url, ...args) => {
      calls.push({ method, url, args });
      return handler(url, ...args);
    });
  }
  return calls;
}

function httpError(status, body = {}, code = 'ERR_BAD_REQUEST') {
  return new AxiosError('PRIVATE raw request details', code,
    { headers: { authorization: 'PRIVATE' }, data: 'PRIVATE' }, undefined,
    { status, data: body });
}

function decodeRlc(value) {
  const decipher = createDecipheriv('aes-128-ecb', 'gigxlmqwZ]7oWZUF', null);
  return decipher.update(value, 'hex', 'utf8') + decipher.final('utf8');
}

function encodedMap() {
  const buffer = Buffer.alloc(28);
  buffer.writeInt16LE(42, 0);
  buffer.writeInt8(73, 4);
  buffer.writeInt16LE(1, 19);
  buffer.writeInt16LE(1, 21);
  buffer[27] = 1;
  return deflateSync(Buffer.concat([buffer, Buffer.from(JSON.stringify({
    seg_inf: { 1: { type: 4, index: 0 } }, cleanset: { 1: [2, 2, 1, 0, 0] },
  }))])).toString('base64');
}

for (const [label, options, expected] of [
  ['legacy EU', undefined, ['eu', 'DE', 'de', 'en']],
  ['Canadian English', { region: 'us', country: 'CA', language: 'en' }, ['us', 'CA', 'en', 'en']],
  ['Canadian French', { region: 'us', country: 'CA', language: 'fr' }, ['us', 'CA', 'fr', 'fr']],
]) {
  test(`${label}: uses coherent login, device, command and both map-region requests`, async t => {
    const [region, country, language, rlcLanguage] = expected;
    const domain = `${region}.iot.mova-tech.com:13267`;
    let mapDownloads = 0;
    let mapUrls = 0;
    const calls = stubHttp(t, (url, data, config) => {
      assert.equal(new URL(url).host, domain);
      assert.equal(config.headers.host, domain);
      assert.equal(config.maxRedirects, 0);
      assert.equal(config.timeout, 15000);
      assert.equal(decodeRlc(config.headers['dreame-rlc']), `${region}|${rlcLanguage}|${country}`);
      if (url.endsWith('/oauth/token')) {
        assert.equal(data.get('username'), 'test@example.com');
        assert.equal(data.get('password'), createHash('md5').update('secretRAylYC%fmSKp7%Tq').digest('hex'));
        assert.equal(data.get('country'), country);
        assert.equal(data.get('lang'), language);
        assert.equal(config.headers['tenant-id'], '000002');
        assert.equal(config.headers['dreame-auth'], 'bearer');
        assert.equal(data.get('platform'), 'IOS');
        return { data: { access_token: 'TOKEN', expires_in: 3600 } };
      }
      assert.equal(config.headers['dreame-auth'], 'bearer TOKEN');
      if (url.endsWith('/device/listV2')) {
        assert.equal(data.lang, language);
        return { data: { code: 0, data: { page: { records: [] } } } };
      }
      if (url.endsWith('/iotfile/getDownloadUrl')) {
        mapUrls++;
        assert.equal(data.region, region);
        assert.equal(data.filename, mapUrls === 1 ? 'saved-map' : 'active-map');
        return { data: { code: 0, data: 'https://maps.example.test/?signature=PRIVATE' } };
      }
      assert.equal(url, `https://${domain}/dreame-iot-com-20000/device/sendCommand`);
      const params = data.data.params;
      if (data.data.method === 'get_properties' && params[0]?.siid === 6) {
        const piid = params[0].piid;
        return { data: { code: 0, data: { result: [{ siid: 6, piid, code: 0,
          value: { object_name: piid === 8 ? 'saved-map' : 'active-map,metadata' },
        }] } } };
      }
      return { data: { code: 0, data: { result: [
        { siid: 2, piid: 1, code: 0, value: 13 },
        { siid: 4, piid: 23, code: 0, value: 5122 },
      ] } } };
    }, (url, config) => {
      mapDownloads++;
      assert.equal(url, 'https://maps.example.test/?signature=PRIVATE');
      assert.equal(config.headers, undefined, 'signed map downloads must not receive cloud credentials');
      return { data: mapDownloads === 1
        ? { curr_id: 42, mapstr: [{ id: 42, map: encodedMap() }] }
        : encodedMap() };
    });
    const cloud = new MovaCloud('test@example.com', 'secret', options);
    await cloud.login();
    assert.equal(cloud.isAuthenticated(), true);
    assert.deepEqual(await cloud.getDevices(), []);
    assert.equal((await cloud.getVacuumStatus('DEVICE')).state, 13);
    const rooms = await cloud.getRoomsWithCleaningSettings({ did: 'DEVICE', model: 'mova.vacuum.r9504a' });
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].cleaningSettings.cleaningMode, 0);
    await cloud.startCleaning('DEVICE');
    await cloud.startRoomCleaning('DEVICE', [1]);
    await cloud.pauseCleaning('DEVICE');
    await cloud.returnToDock('DEVICE');
    await cloud.setCleaningMode('DEVICE', 2);
    assert.equal(mapUrls, 2);
    assert.equal(mapDownloads, 2);
    assert.equal(calls.filter(call => call.url.endsWith('/oauth/token')).length, 1);
  });
}

for (const status of [401, 403, 429, 500]) {
  test(`login HTTP ${status}: reports sanitized error without retrying or switching regions`, async t => {
    const calls = stubHttp(t, () => { throw httpError(status, {
      error: 'invalid_user', error_description: 'username or password error',
      msg: 'PRIVATE', access_token: 'PRIVATE', email: 'PRIVATE',
    }); });
    const cloud = new MovaCloud('PRIVATE', 'PRIVATE', { region: 'us', country: 'CA' });
    await assert.rejects(cloud.login(), error => {
      assert.ok(error instanceof MovaCloudError);
      assert.equal(error.diagnostic.httpStatus, status);
      assert.equal(error.diagnostic.api.error, 'invalid_user');
      assert.equal(error.diagnostic.operation, 'login');
      assert.equal(error.message.includes('PRIVATE'), false);
      return true;
    });
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).host, 'us.iot.mova-tech.com:13267');
    assert.equal(cloud.isAuthenticated(), false);
  });
}

test('handles missing or malformed access tokens in HTTP 200 responses safely', async t => {
  let body;
  const calls = stubHttp(t, () => ({ data: body }));
  const cloud = new MovaCloud('PRIVATE', 'PRIVATE');
  const bodies = [
    { error: 'limit_attempts_unauthorized', error_description: 'user password not match', remains: '4' },
    null, 'PRIVATE', { access_token: { secret: 'PRIVATE' } }, { access_token: '  ' },
  ];
  for (body of bodies) {
    await assert.rejects(cloud.login(), error => {
      assert.ok(error instanceof MovaCloudError);
      assert.equal(error.message.includes('PRIVATE'), false);
      assert.equal(error.diagnostic.operation, 'login');
      return true;
    });
    assert.equal(cloud.isAuthenticated(), false);
  }
  assert.equal(calls.length, bodies.length, 'no automatic extra attempts');
});

test('concurrent authentication uses one login and failed promises are cleared', async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let attempts = 0;
  stubHttp(t, async () => {
    attempts++;
    await pending;
    if (attempts === 1) throw httpError(503);
    return { data: { access_token: 'TOKEN' } };
  });
  const cloud = new MovaCloud('test@example.com', 'secret');
  const first = cloud.login();
  const second = cloud.login();
  const assertions = Promise.all([assert.rejects(first, MovaCloudError), assert.rejects(second, MovaCloudError)]);
  release();
  await assertions;
  assert.equal(attempts, 1);
  await cloud.login();
  assert.equal(attempts, 2);
  assert.equal(cloud.isAuthenticated(), true);
});

for (const persistentFailure of [false, true]) {
  test(`expired session: reauthenticates once on the same host (persistent=${persistentFailure})`, async t => {
    let logins = 0;
    let lists = 0;
    const tokens = [];
    const calls = stubHttp(t, (url, data, config) => {
      if (url.endsWith('/oauth/token')) {
        return { data: { access_token: `TOKEN${++logins}` } };
      }
      lists++;
      tokens.push(config.headers['dreame-auth']);
      if (lists === 1 || persistentFailure) throw httpError(401, { msg: 'PRIVATE' });
      return { data: { data: { data: { page: { records: [] } } } } };
    });
    const cloud = new MovaCloud('test@example.com', 'secret', { region: 'us', country: 'CA' });
    if (persistentFailure) {
      await assert.rejects(cloud.getDevices(), error => {
        assert.equal(error.diagnostic.operation, 'device-list');
        assert.equal(error.message.includes('PRIVATE'), false);
        return true;
      });
    } else {
      assert.deepEqual(await cloud.getDevices(), []);
    }
    assert.equal(logins, 2);
    assert.equal(lists, 2);
    assert.deepEqual(tokens, ['bearer TOKEN1', 'bearer TOKEN2']);
    assert.ok(calls.every(call => new URL(call.url).host === 'us.iot.mova-tech.com:13267'));
  });
}

test('a failed session refresh is not retried and never sends the original command', async t => {
  let logins = 0;
  let commands = 0;
  stubHttp(t, url => {
    if (url.endsWith('/oauth/token')) {
      if (++logins === 1) return { data: { access_token: 'TOKEN' } };
      throw httpError(401);
    }
    commands++;
    throw httpError(403);
  });
  const cloud = new MovaCloud('test@example.com', 'secret');
  await assert.rejects(cloud.pauseCleaning('DEVICE'), error => error.diagnostic.operation === 'login');
  assert.equal(logins, 2);
  assert.equal(commands, 1);
});

test('sanitizes HTTP 200 API errors, including property failures and map URL preparation', async t => {
  let body = { code: -1, msg: 'PRIVATE', data: { result: [{ code: 'PRIVATE' }] } };
  stubHttp(t, url => url.endsWith('/oauth/token')
    ? { data: { access_token: 'TOKEN' } } : { data: body });
  const cloud = new MovaCloud('test@example.com', 'secret');
  const device = { did: 'PRIVATE', model: 'mova.vacuum.r9504a' };
  for (const action of [
    () => cloud.getDevices(), () => cloud.getVacuumStatus(device.did),
    () => cloud.startCleaning(device.did), () => cloud.setCustomizedCleaning(device.did, false),
    () => cloud.setCleaningMode(device.did, 0), () => cloud.getRooms(device),
  ]) {
    await assert.rejects(action(), error => {
      assert.ok(error instanceof MovaCloudError);
      assert.equal(error.message.includes('PRIVATE'), false);
      assert.equal(error.diagnostic.api.code, -1);
      return true;
    });
  }
  body = { code: 0, data: { result: [{ code: 0, value: { object_name: 'PRIVATE' } }] } };
  await assert.rejects(cloud.getRooms(device), error => {
    assert.equal(error.diagnostic.operation, 'map-url');
    assert.equal(error.message.includes('PRIVATE'), false);
    return true;
  });
});

test('map download failures omit signed URLs and raw network messages', async t => {
  stubHttp(t, () => { throw new Error('No POST expected'); }, () => {
    throw new AxiosError('PRIVATE signed URL', 'ETIMEDOUT', { url: 'https://private.example/?token=PRIVATE' });
  });
  const cloud = new MovaCloud('test@example.com', 'secret');
  await assert.rejects(cloud.downloadMap('https://private.example/?token=PRIVATE'), error => {
    assert.equal(error.diagnostic.operation, 'map-download');
    assert.equal(error.diagnostic.networkCode, 'ETIMEDOUT');
    assert.equal(error.message.includes('PRIVATE'), false);
    assert.equal(JSON.stringify(error).includes('private.example'), false);
    return true;
  });
});

function platform(config) {
  let Platform;
  register({ registerPlatform: (_plugin, _alias, constructor) => { Platform = constructor; } });
  const logs = [];
  const log = Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, message => logs.push(message)]));
  const instance = new Platform(log, { platform: 'MovaVacuum', ...config }, {
    on() {}, publishExternalMatterAccessories() { assert.fail('Unexpected Matter accessory'); },
  });
  return { instance, logs };
}

test('missing credentials and invalid region config remain quiet and never contact MOVA', async t => {
  const calls = stubHttp(t, () => { assert.fail('No network expected'); });
  for (const config of [{}, { region: 'PRIVATE' }, {
    username: 'PRIVATE', password: 'PRIVATE', region: 'PRIVATE',
  }, { username: 'PRIVATE', password: 'PRIVATE', region: 'us' }]) {
    const { instance, logs } = platform(config);
    await instance.cloudReady;
    await instance.publishMatterVacuum();
    assert.equal(logs.join('\n').includes('PRIVATE'), false);
  }
  assert.equal(calls.length, 0);
});

test('platform passes Canadian config, logs safe errors and keeps V50 diagnostics read-only', async t => {
  const calls = stubHttp(t, (url, data) => {
    assert.equal(new URL(url).host, 'us.iot.mova-tech.com:13267');
    if (url.endsWith('/oauth/token')) {
      assert.equal(data.get('country'), 'CA');
      assert.equal(data.get('lang'), 'en');
      return { data: { access_token: 'PRIVATE' } };
    }
    if (url.endsWith('/device/listV2')) {
      return { data: { data: { page: { records: [{ did: 'PRIVATE', model: 'mova.vacuum.r2525a' }] } } } };
    }
    assert.equal(data.data.method, 'get_properties');
    throw httpError(500, { msg: 'PRIVATE', code: -1 });
  });
  const { instance, logs } = platform({
    username: 'PRIVATE', password: 'PRIVATE', region: 'us', country: 'CA',
    language: 'en', experimentalModelSupport: 'diagnostic',
  });
  await instance.publishMatterVacuum();
  assert.equal(logs.join('\n').includes('PRIVATE'), false);
  assert.ok(logs.some(line => line.includes('MOVA cloud diagnostic:')));
  assert.ok(logs.some(line => line.includes('Bereinigter MOVA-Diagnosebericht')));
  assert.equal(calls.length, 4);
});

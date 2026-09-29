import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {API_RUNTIME_HEADER, API_RUNTIME_VARIABLES, prepareApiRuntimeRequest, openApiRuntimeRequest, forwardApiRuntimeRequest} from '../functions/_api_runtime_transport.js';
import {validateApiRuntimeConfig, prepareApiRuntime} from '../scripts/prepare-api-runtime.mjs';

const key = Buffer.alloc(32, 73).toString('base64'), otherKey = Buffer.alloc(32, 74).toString('base64');
const env = {API_RUNTIME_KEY: key, DB_BACKEND: 'postgres', IP_HASH_SALT: 'private-ip-salt',
  PLAYDK_SECRET_KEY: 'private-playdk-key', DB_MIGRATION_FREEZE: '1', UNIQUE_ADVANCEMENT_MODE: 'TEST'};
const make = (method = 'POST', path = 'pvp/fight') => new Request(`https://cnine-card.pages.dev/api/${path}?x=1`, {
  method, headers: {authorization: 'Bearer qa-session', cookie: 'qa=1', origin: 'https://cnine-card.pages.dev',
    'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1', 'x-forwarded-for': '192.0.2.1, 192.0.2.2',
    [API_RUNTIME_HEADER]: 'client-forgery'}, ...(method === 'GET' ? {} : {body: JSON.stringify({requestId: 'qa-once-123456', amount: 37})})
});

test('private forwarding preserves original request, credentials, IP, body, authoritative variables and resource bindings', async () => {
  const request = make(), prepared = await prepareApiRuntimeRequest(request, env);
  const encrypted = prepared.headers.get(API_RUNTIME_HEADER);
  assert.equal(prepared.redirect, 'manual');
  for (const value of ['client-forgery', env.IP_HASH_SALT, env.PLAYDK_SECRET_KEY, 'Bearer qa-session']) assert.ok(!encrypted.includes(value));
  prepared.headers.set('cf-connecting-ip', '192.0.2.90'); // An internal hop cannot change the authenticated client identity.
  const DB = {}, HYPERDRIVE = {}, USER_LOCK = {};
  const opened = await openApiRuntimeRequest(prepared, {API_RUNTIME_KEY: key, DB, HYPERDRIVE, USER_LOCK,
    API_RUNTIME: {fetch() {throw Error('loop');}}, SETUP_KEY: 'stale-worker-value', DB_BACKEND: 'd1'});
  assert.equal(opened.request.url, request.url);
  assert.equal(opened.request.method, 'POST');
  for (const name of ['authorization', 'cookie', 'origin', 'content-type', 'cf-connecting-ip', 'x-forwarded-for'])
    assert.equal(opened.request.headers.get(name), request.headers.get(name));
  assert.deepEqual(await opened.request.json(), {requestId: 'qa-once-123456', amount: 37});
  assert.equal(opened.request.headers.get(API_RUNTIME_HEADER), null);
  assert.equal(opened.env.IP_HASH_SALT, env.IP_HASH_SALT);
  assert.equal(opened.env.PLAYDK_SECRET_KEY, env.PLAYDK_SECRET_KEY);
  assert.equal(opened.env.DB_BACKEND, 'postgres');
  assert.equal(opened.env.DB_MIGRATION_FREEZE, '1');
  assert.equal(opened.env.UNIQUE_ADVANCEMENT_MODE, 'TEST');
  assert.equal(opened.env.SETUP_KEY, undefined);
  assert.equal(opened.env.API_RUNTIME_KEY, undefined);
  assert.equal(opened.env.API_RUNTIME, undefined);
  assert.equal(opened.env.DB, DB);assert.equal(opened.env.HYPERDRIVE, HYPERDRIVE);assert.equal(opened.env.USER_LOCK, USER_LOCK);
});

test('untrusted, tampered, stale, wrong-key, path and method contexts cannot enter the game handler', async () => {
  const now = Date.now();
  await assert.rejects(openApiRuntimeRequest(make(), {API_RUNTIME_KEY: key}, now));
  const makePrepared = () => prepareApiRuntimeRequest(make('GET'), env, now);
  await assert.rejects(openApiRuntimeRequest(await makePrepared(), {API_RUNTIME_KEY: otherKey}, now));
  await assert.rejects(openApiRuntimeRequest(await makePrepared(), {API_RUNTIME_KEY: key}, now + 60001));
  await assert.rejects(openApiRuntimeRequest(await makePrepared(), {API_RUNTIME_KEY: key}, now - 5001));
  const path = await makePrepared();
  await assert.rejects(openApiRuntimeRequest(new Request('https://cnine-card.pages.dev/api/admin/setup', {headers: path.headers}), {API_RUNTIME_KEY: key}, now));
  const method = await makePrepared();
  await assert.rejects(openApiRuntimeRequest(new Request(method, {method: 'DELETE'}), {API_RUNTIME_KEY: key}, now));
  const tampered = await makePrepared(), value = tampered.headers.get(API_RUNTIME_HEADER);
  tampered.headers.set(API_RUNTIME_HEADER, value.slice(0, 20) + (value[20] === 'A' ? 'B' : 'A') + value.slice(21));
  await assert.rejects(openApiRuntimeRequest(tampered, {API_RUNTIME_KEY: key}, now));
  await assert.rejects(prepareApiRuntimeRequest(make('GET'), {...env, API_RUNTIME_KEY: 'invalid'}));
  await assert.rejects(prepareApiRuntimeRequest(make('GET'), {...env, IP_HASH_SALT: 'x'.repeat(20000)}));
});

test('binary and streaming request bodies, response status, cookies and performance headers survive one dispatch', async () => {
  const payload = new Uint8Array(512 * 1024);payload[3] = 255;payload[400000] = 98;
  let calls = 0;
  const API_RUNTIME = {async fetch(request) {
    calls++;
    const opened = await openApiRuntimeRequest(request, {API_RUNTIME_KEY: key});
    assert.deepEqual(new Uint8Array(await opened.request.arrayBuffer()), payload);
    return new Response('original-result', {status: 409, headers: {'set-cookie': 'session=qa; HttpOnly', 'x-cnine-response-ms': '19'}});
  }};
  const response = await forwardApiRuntimeRequest({env: {...env, API_RUNTIME}, request: new Request('https://cnine-card.pages.dev/api/upload', {method: 'PUT', body: payload})});
  assert.equal(calls, 1);assert.equal(response.status, 409);assert.equal(await response.text(), 'original-result');
  assert.equal(response.headers.get('set-cookie'), 'session=qa; HttpOnly');assert.equal(response.headers.get('x-cnine-response-ms'), '19');
});

test('lost response after a remote commit is never retried or run through the local handler', async () => {
  let committed = 0;
  const response = await forwardApiRuntimeRequest({request: make(), env: {...env, API_RUNTIME: {async fetch() {committed++;throw Error('lost reply with sensitive details');}}}});
  assert.equal(committed, 1);assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('sensitive'));
});

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('same game entry runs behind private service with Singapore placement, existing DB/locks and explicit rollback', () => {
  const pages = read('wrangler.toml'), text = read('workers/api-runtime/wrangler.jsonc');
  assert.equal(validateApiRuntimeConfig(pages, text).placement.region, 'aws:ap-southeast-1');
  for (const change of [{workers_dev: true}, {preview_urls: true}, {placement: {mode: 'smart'}}, {routes: ['example.com/*']}])
    assert.throws(() => validateApiRuntimeConfig(pages, JSON.stringify({...JSON.parse(text), ...change})));
  assert.throws(() => validateApiRuntimeConfig(pages, text.replace('12ed48b0fb374f82a610cc1daba92e95', '0'.repeat(32))));
  assert.match(read('workers/api-runtime/src/index.js'), /import \{onRequest\} from '\.\.\/\.\.\/\.\.\/functions\/api\/\[\[path\]\]\.js'/);
  assert.match(read('workers/api-runtime/src/index.js'), /waitUntil: context\.waitUntil\.bind\(context\)/);
  assert.match(read('functions/api/[[path]].js'), /API_RUNTIME_DISABLED!=='1'\)return forwardApiRuntimeRequest\(context\)/);
  assert.ok(API_RUNTIME_VARIABLES.includes('PLAYDK_SECRET_KEY'));
  const deploy = read('scripts/deploy-production.mjs');
  assert.ok(deploy.indexOf("'workers/api-runtime/wrangler.jsonc'") < deploy.indexOf("'pages','deploy'"));
  assert.ok(deploy.indexOf('await prepareApiRuntime(') < deploy.indexOf("'pages','deploy'"));
});

test('bootstrap initializes one shared key only before cutover and never logs application secrets', async () => {
  let pagesKey = false, workerKey = false, active = false;
  const writes = [], logs = [];
  const fetcher = async url => ({ok: true, json: async () => ({success: true, result: url.includes('/pages/projects/')
    ? {deployment_configs: {production: {env_vars: pagesKey ? {API_RUNTIME_KEY: {type: 'secret_text'}} : {}, services: active ? {API_RUNTIME: {service: 'cnine-card-api-runtime'}} : {}}}}
    : {bindings: workerKey ? [{name: 'API_RUNTIME_KEY', type: 'secret_text'}] : []}})});
  const inspect = (_exe, args, options) => {
    if (args.includes('token')) return JSON.stringify({token: 'qa-api-token'});
    writes.push(options.input.trim());
    if (args.includes('pages')) pagesKey = true;else workerKey = true;
  };
  const options = {wrangler: 'qa', env: {}, root: fileURLToPath(new URL('../', import.meta.url)), inspect, fetcher, log: text => logs.push(text)};
  assert.equal((await prepareApiRuntime(options)).created, true);
  assert.equal(writes.length, 2);assert.equal(writes[0], writes[1]);assert.equal(Buffer.from(writes[0], 'base64').length, 32);
  assert.ok(!logs.join('\n').includes(writes[0]));
  active = true;
  assert.equal((await prepareApiRuntime(options)).created, false);assert.equal(writes.length, 2);
  pagesKey = false;
  await assert.rejects(prepareApiRuntime(options), /missing its transport key/);assert.equal(writes.length, 2);
});

// The public Pages endpoint forwards once to a private, region-pinned Worker.
// Keep the body streaming and preserve the original URL/auth/session headers.
// Existing Pages secrets travel in an authenticated encrypted context, never
// in plaintext headers, logs, responses, deployment files or a second store.
export const API_RUNTIME_HEADER = 'x-cnine-runtime-context';
export const API_RUNTIME_VARIABLES = Object.freeze([
  'DB_BACKEND', 'DB_MIGRATION_FREEZE', 'D1_READ_MODE', 'UNIQUE_ADVANCEMENT_MODE',
  'IP_HASH_SALT', 'SETUP_KEY', 'PLAYDK_ACCESS_KEY', 'PLAYDK_SECRET_KEY',
  'PLAYDK_BASE_URL', 'PLAYDK_GAME_CODE', 'PLAYDK_DAILY_BOARD_SLUGS'
]);
const encoder = new TextEncoder(), decoder = new TextDecoder();
const CONTEXT_MAX_BYTES = 16384, CONTEXT_MAX_AGE_MS = 60000;

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes));
}
function decode(text) {
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}
async function transportKey(secret) {
  if (typeof secret !== 'string') throw new Error('Missing API runtime key');
  const bytes = decode(secret);
  if (bytes.length !== 32) throw new Error('Invalid API runtime key');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function associatedData(request) {
  return encoder.encode(`cnine-api-runtime-v1\n${request.method}\n${request.url}`);
}

export async function prepareApiRuntimeRequest(request, env, now = Date.now()) {
  const variables = {};
  for (const name of API_RUNTIME_VARIABLES) {
    if (typeof env[name] === 'string') variables[name] = env[name];
  }
  const context = encoder.encode(JSON.stringify({
    version: 1, createdAt: now, variables,
    connectingIp: request.headers.get('cf-connecting-ip'),
    forwardedFor: request.headers.get('x-forwarded-for')
  }));
  if (context.length > CONTEXT_MAX_BYTES) throw new Error('API runtime context is too large');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv, additionalData: associatedData(request)},
    await transportKey(env.API_RUNTIME_KEY), context
  ));
  const headers = new Headers(request.headers);
  // Always replace client-supplied context, including on local/dev requests.
  headers.set(API_RUNTIME_HEADER, `${encode(iv)}.${encode(encrypted)}`);
  return new Request(request, {headers, redirect: 'manual'});
}

export async function openApiRuntimeRequest(request, workerEnv, now = Date.now()) {
  const envelope = request.headers.get(API_RUNTIME_HEADER) || '';
  if (envelope.length > 24000) throw new Error('Invalid API runtime context');
  const [ivText, payload, extra] = envelope.split('.');
  if (!ivText || !payload || extra !== undefined) throw new Error('Missing API runtime context');
  const iv = decode(ivText);
  if (iv.length !== 12) throw new Error('Invalid API runtime context');
  const decrypted = await crypto.subtle.decrypt(
    {name: 'AES-GCM', iv, additionalData: associatedData(request)},
    await transportKey(workerEnv.API_RUNTIME_KEY), decode(payload)
  );
  if (decrypted.byteLength > CONTEXT_MAX_BYTES) throw new Error('Invalid API runtime context');
  const context = JSON.parse(decoder.decode(decrypted));
  if (context.version !== 1 || !Number.isFinite(context.createdAt)
      || now - context.createdAt > CONTEXT_MAX_AGE_MS || context.createdAt > now + 5000) {
    throw new Error('Expired API runtime context');
  }
  const {API_RUNTIME_KEY, API_RUNTIME, ...bindings} = workerEnv;
  const env = {...bindings};
  for (const name of API_RUNTIME_VARIABLES) {
    // The Pages environment is authoritative, including absent/removed values.
    delete env[name];
    if (typeof context.variables?.[name] === 'string') env[name] = context.variables[name];
  }
  const headers = new Headers(request.headers);
  headers.delete(API_RUNTIME_HEADER);
  for (const [name, value] of [
    ['cf-connecting-ip', context.connectingIp], ['x-forwarded-for', context.forwardedFor]
  ]) {
    if (typeof value === 'string') headers.set(name, value);
    else headers.delete(name);
  }
  return {request: new Request(request, {headers}), env};
}

export async function forwardApiRuntimeRequest(context) {
  try {
    const request = await prepareApiRuntimeRequest(context.request, context.env);
    // Never retry or fall back after dispatch: the remote action may have committed.
    return await context.env.API_RUNTIME.fetch(request);
  } catch {
    console.error('API_RUNTIME_UNAVAILABLE');
    return Response.json({error: '서버 연결이 지연되고 있습니다. 잠시 후 상태를 확인해 주세요.', code: 'API_RUNTIME_UNAVAILABLE'},
      {status: 503, headers: {'cache-control': 'no-store'}});
  }
}

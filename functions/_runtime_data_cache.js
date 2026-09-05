// Completed, non-user data only. Never retain DB handles, pending I/O or promises
// across Workers requests. Namespace by database, and expire even schema markers.
const objects = new WeakMap();
const named = new Map();
const MAX_NAMESPACES = 16, MAX_ENTRIES = 128;
function entries(env) {
  const scope = env.RUNTIME_DB_CACHE_SCOPE || env.DB;
  if (!scope) return null;
  const object = typeof scope === 'object' || typeof scope === 'function';
  const store = object ? objects : named;
  if (!store.has(scope)) {
    if (!object && store.size >= MAX_NAMESPACES) store.delete(store.keys().next().value);
    store.set(scope, new Map());
  }
  return store.get(scope);
}
export function readRuntimeData(env, key, now = Date.now()) {
  const cache = entries(env), row = cache?.get(key);
  if (!row) return undefined;
  if (row.expiresAt <= now) { cache.delete(key); return undefined; }
  return structuredClone(row.value);
}
export function cacheRuntimeData(env, key, value, ttlMs = 60000, now = Date.now()) {
  if (value && typeof value.then === 'function') throw new TypeError('Only completed data may be cached');
  const cache = entries(env);
  if (!cache) return value;
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) cache.delete(cache.keys().next().value);
  cache.set(key, { value: structuredClone(value), expiresAt: now + ttlMs });
  return value;
}
export function invalidateRuntimeData(env, key) { entries(env)?.delete(key); }

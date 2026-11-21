import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const game = 'https://game.test';
const crest = '/assets/ui/brand/cnine-crowned-c9.webp';
const retired = ['/assets/ui/cninelogo.png', ...[240, 480].flatMap(width =>
  ['webp', 'avif'].map(extension => `/assets/responsive/ui/cninelogo-${width}.${extension}`))];
const fromRoot = name => new URL(name.replace(/^\//, ''), root);

test('the retired artwork is absent and each former public URL resolves to the approved C9 crest', async () => {
  const redirects = (await readFile(fromRoot('_redirects'), 'utf8')).split(/\r?\n/);
  const generator = await readFile(fromRoot('scripts/generate-responsive-ui-images.py'), 'utf8');
  const webp = await readFile(fromRoot(crest));
  assert.equal(createHash('sha256').update(webp).digest('hex'), '399f3c957ca276b9afe80c1c336e48845d21323ee457c391ce6389e735ff309f');
  assert.doesNotMatch(generator, /cninelogo/i);
  for (const path of retired) {
    await assert.rejects(stat(fromRoot(path)), { code: 'ENOENT' });
    assert(redirects.includes(`${path} ${crest} 301`));
  }
});

test('the service worker bypasses stale pixels before serving even versioned requests and removes their cached copies', async () => {
  const entries = new Set([...retired.map(p => p+'?v=older'), '/assets/other.webp']);
  const listeners = new Map();
  let claimed = false;
  const cache = {
    keys: async () => [...entries].map(path => new Request(game + path)),
    delete: async (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input.url, game);
      for (const key of entries) {
        if (options?.ignoreSearch ? new URL(key, game).pathname === url.pathname : key === url.pathname + url.search) entries.delete(key);
      }
      return true;
    }
  };
  const self = { location: new URL(game), addEventListener: (name, fn) => listeners.set(name, fn), clients: { claim: async () => { claimed = true; } } };
  const source = await readFile(fromRoot('service-worker.js'), 'utf8');
  vm.runInNewContext(source, { self, URL, Request, Response, importScripts() {}, caches: { keys: async () => [], open: async () => cache } });
  for (const path of retired) {
    let response;
    listeners.get('fetch')({ request: new Request(game + path + '?v=older'), respondWith: value => { response = value; } });
    const redirected = await response;
    assert.equal(redirected.status, 301);
    assert.equal(redirected.headers.get('location'), game + crest);
  }
  let finished;
  listeners.get('activate')({ waitUntil: value => { finished = value; } });
  await finished;
  assert.equal(claimed, true);
  assert.deepEqual([...entries], ['/assets/other.webp']);
});

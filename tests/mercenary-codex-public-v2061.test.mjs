import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { publicCodexHtml } from '../scripts/build-mercenary-codex-public-v1.mjs';
import { collectionEntries } from '../preview/mercenary-codex-v1/model.js';

const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('mercenary-codex/index.html');
const client = read('mercenary-codex/app.mjs');
const app = read('js/app.js');
const index = read('index.html');
const sw = read('service-worker.js');

function navigationRuntime() {
  const destinations = [];
  const context = {
    console, URLSearchParams,
    location: { search: '', assign: href => destinations.push(href) },
    document: { currentScript: { dataset: { enabled: 'false' } }, readyState: 'loading', addEventListener() {} },
    setTimeout, clearTimeout
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('js/soopketmon-v21-exact-shell-adapter.js'), context);
  vm.runInContext(read('js/soopketmon-v21-runtime-router.js'), context);
  return { context, destinations, router: context.SoopketmonV21RuntimeRouter, menu: context.SoopketmonV21NavigationContract };
}

test('public document uses the native forge-inspired archive with game links and CMS information', () => {
  assert.equal(html.replaceAll('\r\n', '\n'), publicCodexHtml());
  assert.match(html, /data-codex-mode="public"/);
  assert.match(html, /내 용병 확인 중/);
  assert.doesNotMatch(html, /검수용 프리뷰|유저 미공개|메뉴 배치입니다|target="_blank"/);
  assert.match(html, /class="brand" href="\/\?screen=home" aria-label="숲켓몬 로비로 돌아가기"/);
  assert.match(html, /id="lobbyReturn" class="lobby-return" href="\/\?screen=home">/);
  assert.match(html, /로비로 돌아가기 ↗/);
  assert.match(html, /archive-workspace/);
  assert.match(html, /id="ownedView"[^>]*data-view="owned"/);
  assert.match(html, /id="allView"[^>]*data-view="all"/);
  assert.doesNotMatch(html, /href="\/mercenary-hangar\/"/);
  assert.doesNotMatch(html, /획득 \/ 편성 \/ 전투 기능 준비 중|preview\/mercenary-codex/);
  for (const match of html.matchAll(/(?:src|href)="(\.\.[^"?]+)(?:\?[^" ]+)?"/g)) {
    assert.ok(fs.existsSync(path.resolve(root, 'mercenary-codex', match[1])), match[1]);
  }
});

test('shared desktop, mobile and cards hub menu includes exactly one codex beside dex', () => {
  const { menu, router } = navigationRuntime();
  assert.deepEqual(Array.from(menu.groups.collection.routes), ['dex', 'mercenaryDex', 'upgrade', 'evolution', 'magic']);
  assert.equal(Array.from(menu.hubs.cards.routes).filter(id => id === 'mercenaryDex').length, 1);
  assert.equal(menu.routes.mercenaryDex.title, '용병도감');
  assert.equal(menu.routes.mercenaryDex.group, 'collection');
  assert.equal(router.routeMeta('mercenaryDex'), menu.routes.mercenaryDex);
  assert.equal(collectionEntries(menu).filter(entry => entry.id === 'mercenaryDex').length, 1);
  const oldContract = { groups: { collection: { routes: ['dex', 'upgrade', 'evolution', 'magic'] } }, routes: menu.routes };
  assert.deepEqual(collectionEntries(oldContract).map(entry => entry.id), Array.from(menu.groups.collection.routes));
  assert.match(read('js/soopketmon-v21-command-icons.js'), /mercenaryDex: '<rect/);
});

test('public codex uses a fixed same-tab document route, not a deck or battle shell', async () => {
  const { destinations, router } = navigationRuntime();
  const shells = [];
  const result = await router.navigate('mercenaryDex', { runtime: { renderShell: route => shells.push(route) } });
  assert.equal(result.ok, true);
  assert.equal(result.shell, '');
  assert.deepEqual(destinations, ['/mercenary-codex/']);
  assert.deepEqual(shells, []);
  assert.equal(router.shellRoutes.includes('mercenaryDex'), false);
  assert.equal(Object.isFrozen(router.routeContract.mercenaryDex), true);
  await assert.rejects(router.navigate('https://elsewhere.test/'), /연결되지 않은 메뉴/);
});

test('native desktop, mobile and old subtab fallbacks redirect without mounting a new game view', () => {
  assert.equal((app.match(/data-tab="mercenaryDex"/g) || []).length, 2);
  assert.match(app, /data-mobile-tab="mercenaryDex"/);
  const branch = app.match(/if\(tab==='mercenaryDex'\)\{[^}]+\}/)?.[0];
  assert.ok(branch);
  const hrefs = [];
  const context = vm.createContext({ tab: 'mercenaryDex', window: { location: { assign: href => hrefs.push(href) } } });
  vm.runInContext(`(function(){${branch}})()`, context);
  assert.deepEqual(hrefs, ['/mercenary-codex/']);
  assert.ok(app.indexOf(branch) > app.indexOf('function renderShell('));
  assert.ok(app.indexOf(branch) < app.indexOf('const views =', app.indexOf('function renderShell(')));
});

test('codex keeps public catalog browsing while account writes are limited to the existing loadout route', () => {
  const roster = JSON.parse(read('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json'));
  assert.equal(roster.status, 'PREVIEW_ONLY_NOT_RUNTIME_CONNECTED');
  assert.equal(roster.cards.length,49);
  assert.ok(roster.cards.filter(c=>!['V-044','V-045','V-047','V-048'].includes(c.code)).every(card => ['V-021','V-046','V-049'].includes(card.code)? card.rank === 'SSS' && card.rankStatus === 'USER_ASSIGNED_RANK' : card.rank === null && card.rankStatus === 'PENDING_USER_ASSIGNMENT'));
  assert.doesNotMatch(html, /src="[^"]*(?:runtime-router|battle-engine|loadout|gsap|pixi)/i);
  assert.match(client, /api\('mercenaries\/v3\/state'/);
  assert.match(client, /api\(`mercenaries\/v3\/\$\{pending\.action\}`/);
  assert.match(client, /method:'POST'/);
  assert.match(client, /pending\.body\.mercenaryCode/);
  assert.doesNotMatch(client, /mercenaries\/v3\/(?:open|draw|train)|new Audio|AudioContext/);
  assert.match(client, /storageKey='cnine\.mercenaryCodex\.public\.v1'/);
  assert.match(client, /api\('mercenary-codex'/);
  assert.match(client, /c\.skills\.map\(skillHtml\)/);
});

test('public page and live entry use synchronized cache tags and revalidation headers', () => {
  assert.match(index, /js\/app\.js\?v=2108-shared-navigation/);
  assert.match(sw, /soop-card-shell-v2108-shared-navigation/);
  assert.match(index, /exact-shell-adapter\.js\?v=2108-shared-navigation/);
  assert.match(index, /runtime-router\.js\?v=2083-clan-prison-camp/);
  assert.match(index, /command-icons\.js\?v=1\.5\.0-mercenary-codex/);
  assert.match(html, /mercenary-codex\/app\.mjs\?v=2133/);
  assert.match(html, /mercenary-codex\/style\.css\?v=2133/);
  assert.match(read('mercenary-codex/style.css'), /search-field input\{height:44px/);
  assert.match(client, /model\.mjs\?v=2098/);
  assert.match(read('_headers'), /\/mercenary-codex\/\r?\n  Cache-Control: no-cache, must-revalidate, max-age=0/);
});

function workerHarness() {
  const listeners = {};
  const data = new Map([['/offline.html?v=1744-renewal-only', new Response('offline', { headers: { 'content-type': 'text/html' } })]]);
  let networkFails = false;
  let writesFail = false;
  let networkType = 'text/html';
  let networkStatus = 200;
  const context = {
    URL, Response,
    self: { location: { origin: 'https://game.test' }, addEventListener: (name, fn) => { listeners[name] = fn; } },
    caches: { open: async () => ({
      put: async (key, value) => { if (writesFail) throw Error('quota'); data.set(key, value.clone()); },
      match: async key => data.get(key)?.clone()
    }) },
    fetch: async request => {
      if (networkFails) throw Error('offline');
      const name = new URL(request.url).pathname.startsWith('/mercenary-codex') ? 'codex' : 'game';
      return new Response(name, { status: networkStatus, headers: { 'content-type': networkType } });
    }
  };
  vm.createContext(context);
  vm.runInContext(sw, context);
  return {
    data,
    offline: () => { networkFails = true; },
    noSpace: () => { writesFail = true; },
    setResponse: (type, status = 200) => { networkType = type; networkStatus = status; },
    navigate: pathname => {
      let response;
      listeners.fetch({ request: { url: `https://game.test${pathname}`, method: 'GET', mode: 'navigate', destination: 'document' }, respondWith: promise => { response = promise; } });
      return response;
    }
  };
}

test('visiting public codex never overwrites the game index, including offline return', async () => {
  const worker = workerHarness();
  assert.equal(await (await worker.navigate('/?screen=home')).text(), 'game');
  assert.equal(await (await worker.navigate('/mercenary-codex/?q=라비에나')).text(), 'codex');
  assert.equal(await worker.data.get('/index.html').clone().text(), 'game');
  assert.equal(await worker.data.get('/mercenary-codex/').clone().text(), 'codex');
  worker.offline();
  assert.equal(await (await worker.navigate('/')).text(), 'game');
  assert.equal(await (await worker.navigate('/index.html?screen=dex')).text(), 'game');
  assert.equal(await (await worker.navigate('/mercenary-codex/?sort=name')).text(), 'codex');
  assert.equal(await (await worker.navigate('/uncached-document/')).text(), 'offline');
  assert.equal(worker.navigate('/admin/'), undefined);
  assert.equal(worker.navigate('/api/account'), undefined);
});

test('codex cache cannot become an offline game fallback and cache quota does not hide valid responses', async () => {
  const worker = workerHarness();
  await worker.navigate('/mercenary-codex/');
  worker.offline();
  assert.equal(await (await worker.navigate('/')).text(), 'offline');
  const fullCache = workerHarness();
  fullCache.noSpace();
  assert.equal(await (await fullCache.navigate('/mercenary-codex/')).text(), 'codex');
  for (const [type, status] of [['application/json', 200], ['text/html', 404]]) {
    const invalid = workerHarness();
    invalid.setResponse(type, status);
    await invalid.navigate('/mercenary-codex/');
    assert.equal(invalid.data.has('/mercenary-codex/'), false);
  }
});

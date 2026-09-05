import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { DEFAULT_STREAMER_SETTINGS, STREAMER_SETTINGS_KEY, stationUrl, profileImageUrl, validateStreamerSettings, publicStreamerSettings } from '../js/streamer-lounge-model-v2036.js';
import { handleStreamerLounge } from '../functions/_streamer_lounge.js';

const clone = () => structuredClone(DEFAULT_STREAMER_SETTINGS);
function fixture() {
  const db = new DatabaseSync(':memory:'), queries = [], logs = [];
  db.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT)');
  const env = { DB: { prepare(sql) { queries.push(sql); let values = []; return { bind(...args) { values = args; return this; }, async first() { return db.prepare(sql).get(...values) || null; }, async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; } }; } } };
  const deps = { json: (payload, status = 200) => Response.json(payload, { status }), requirePermission: async (_request, _env, permission) => { assert.equal(permission, 'SETTINGS'); return { id: 1, role: 'OWNER' }; }, writeAdminLog: async (...args) => logs.push(args) };
  const call = (path = 'streamer-profiles', method = 'GET', body, headers = {}) => handleStreamerLounge({ path, env, deps, request: new Request(`https://game.test/api/${path}`, { method, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), headers }) });
  return { db, env, deps, call, queries, logs };
}
test('defaults match all five user-supplied names, stations and observed profile photos in order', () => {
  assert.deepEqual(DEFAULT_STREAMER_SETTINGS.profiles.map(row => [row.name, row.stationUrl]), [
    ['디임','https://www.sooplive.com/station/qpqpro'],['조은','https://www.sooplive.com/station/zalalz'],['하이희야','https://www.sooplive.com/station/jkmjkm1236'],['강구열','https://www.sooplive.com/station/kuyol'],['오리꿍','https://www.sooplive.com/station/imducko3o']
  ]);
  assert.deepEqual(validateStreamerSettings(clone()), clone());
  for (const row of DEFAULT_STREAMER_SETTINGS.profiles) { assert.match(row.imageUrl, /^https:\/\/stimg\.sooplive\.com\/LOGO\//); assert.equal('live' in row, false); }
});
test('station validation rejects spoofed domains, protocols, credentials and non-station paths', () => {
  for (const value of ['javascript:alert(1)','//www.sooplive.com/station/qpqpro','http://www.sooplive.com/station/qpqpro','https://www.sooplive.com.evil.test/station/qpqpro','https://evil@www.sooplive.com/station/qpqpro','https://www.sooplive.com:8080/station/qpqpro','https://www.sooplive.com/station/qpqpro?redirect=evil','https://www.sooplive.com/station/qpqpro#evil','https://www.sooplive.com/station/qpqpro\\evil','https://www.sooplive.com/other/qpqpro']) assert.equal(stationUrl(value), '', value);
  assert.equal(stationUrl('https://sooplive.com/station/qpqpro/'), 'https://www.sooplive.com/station/qpqpro');
});
test('image validation allows public photos/assets and rejects executable/traversal addresses', () => {
  assert.equal(profileImageUrl('assets/cards/디임/001.webp'), '/assets/cards/%EB%94%94%EC%9E%84/001.webp');
  assert.equal(profileImageUrl('https://stimg.sooplive.com/LOGO/qp/qpqpro/m/qpqpro.webp'), DEFAULT_STREAMER_SETTINGS.profiles[0].imageUrl);
  for (const value of ['javascript:alert(1)','data:image/svg+xml,foo','//evil.test/x.png','/api/x.png','/assets/../api/x.png','/assets/%2e%2e/api/x.png','/assets/foo/%252e%252e/test.svg','https://user:pass@x.test/a.png','http://x.test/a.png']) assert.equal(profileImageUrl(value), '', value);
});
test('input schema rejects duplicates, missing names, malformed flags and unbounded roster', () => {
  for (const change of [s => s.profiles.push(s.profiles[0]), s => s.profiles[0].name = '', s => s.profiles[0].visible = 'true', s => s.profiles[0].stationUrl = 'https://evil.test', s => s.profiles[0].imageUrl = 'javascript:evil', s => s.profiles[0].description = '가'.repeat(161), s => s.enabled = 'yes']) { const s = clone(); change(s); assert.throws(() => validateStreamerSettings(s)); }
  assert.throws(() => validateStreamerSettings({ enabled: true, profiles: Array(41).fill(clone().profiles[0]) }));
});
test('public default read is read-only and never publishes private account fields or live guesses', async () => {
  const f = fixture(), r = await f.call(); assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), publicStreamerSettings(clone()));
  assert.ok(f.queries.every(sql => sql.startsWith('SELECT'))); assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM app_meta').get().n, 0);
  f.db.close();
});
test('CMS settings save persists reorder, photo, introduction and hidden users; public read filters hidden records', async () => {
  const f = fixture(), s = clone(); s.profiles.reverse(); s.profiles[0].visible = false; s.profiles[1].description = '방송국에서 만나요'; s.profiles[1].imageUrl = '/assets/test.png';
  const res = await f.call('admin/streamer-profiles','PATCH',{ settings: s, expectedRevision: 'initial-v2036' }); assert.equal(res.status, 200); const saved = await res.json(); assert.ok(saved.revision);
  assert.deepEqual((await (await f.call('admin/streamer-profiles')).json()).settings,s);
  const pub = await (await f.call()).json(); assert.equal(pub.profiles.length,4); assert.equal(pub.profiles[0].name,'강구열'); assert.equal(pub.profiles.some(row => row.name === '오리꿍'),false);
  assert.equal(f.logs.length,1); assert.equal(f.logs[0][2],'STREAMER_LOUNGE_UPDATE'); f.db.close();
});
test('off, empty roster and all-hidden settings stay empty, never reseed removed profiles', async () => {
  for (const settings of [{ enabled: false, profiles: clone().profiles }, { enabled: true, profiles: [] }, { enabled: true, profiles: clone().profiles.map(row => ({ ...row, visible: false })) }]) {
    const f=fixture(); assert.equal((await f.call('admin/streamer-profiles','PATCH',{settings,expectedRevision:'initial-v2036'})).status,200);
    assert.deepEqual((await (await f.call()).json()).profiles,[]); f.db.close();
  }
});
test('CMS requires SETTINGS permission before reading or writing any settings', async () => {
  const f = fixture(); f.deps.requirePermission = async () => null;
  for (const method of ['GET','PATCH']) assert.equal((await f.call('admin/streamer-profiles',method,method==='PATCH'?{settings:clone(),expectedRevision:'initial-v2036'}:undefined)).status,403);
  assert.equal(f.queries.length,0); f.db.close();
});
test('stale CMS revision cannot overwrite a newer saved roster', async () => {
  const f=fixture(); const first=await f.call('admin/streamer-profiles','PATCH',{settings:clone(),expectedRevision:'initial-v2036'}); assert.equal(first.status,200);
  const s=clone();s.profiles=[];assert.equal((await f.call('admin/streamer-profiles','PATCH',{settings:s,expectedRevision:'initial-v2036'})).status,409);
  assert.equal((await (await f.call()).json()).profiles.length,5);f.db.close();
});
test('two simultaneous first saves result in exactly one write and a conflict', async () => {
  const f=fixture(), body={settings:clone(),expectedRevision:'initial-v2036'};
  const results=await Promise.all([f.call('admin/streamer-profiles','PATCH',body),f.call('admin/streamer-profiles','PATCH',body)]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(f.logs.length,1);f.db.close();
});
test('invalid or oversized body cannot change stored settings', async () => {
  const f=fixture(); assert.equal((await f.call('admin/streamer-profiles','PATCH','{invalid')).status,400);
  assert.equal((await f.call('admin/streamer-profiles','PATCH',null)).status,400);
  assert.equal((await f.call('admin/streamer-profiles','PATCH','x'.repeat(66000))).status,413);
  assert.equal((await f.call('admin/streamer-profiles','PATCH','{}',{'content-length':'100000'})).status,413);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM app_meta').get().n,0);f.db.close();
});
test('wrong method is read-only and unrelated paths do not query the DB', async () => {
  const f=fixture();assert.equal((await f.call('streamer-profiles','POST',{})).status,405);
  assert.equal(await f.call('irrelevant'),null);assert.equal(f.queries.length,0);f.db.close();
});
test('corrupt persisted config fails closed, not silently replaced by initial roster', async () => {
  const f=fixture();f.db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(STREAMER_SETTINGS_KEY,'{broken');
  await assert.rejects(()=>f.call());assert.equal(f.db.prepare('SELECT value FROM app_meta').get().value,'{broken');f.db.close();
});
test('isolated live and CMS wiring, safe new-tab links and permanent no-LIVE contract', () => {
  const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
  const client=read('js/streamer-lounge-v2036.js'),shell=read('js/soopketmon-v21-exact-shell-adapter.js'),api=read('functions/api/[[path]].js');
  assert.equal((shell.match(/data-streamer-lounge-host/g)||[]).length,2);assert.match(shell,/global\.StreamerLounge\?\.mount/);
  assert.match(client,/dialog\.showModal\(\)/);assert.match(client,/target="_blank" rel="noopener noreferrer"/);assert.match(client,/delete host\.dataset\.profileKey/);
  assert.match(read('index.html'),/type="module" src="js\/streamer-lounge-v2036\.js\?v=2037-charcoal-lounge"/);
  assert.match(read('admin/index.html'),/streamer-lounge-admin-v2036\.js\?v=2036/);
  assert.match(api,/handleStreamerLounge\(\{path,request,env,deps:\{json,requirePermission,writeAdminLog\}\}\)/);
  assert.ok(api.indexOf('if(path.startsWith(\'admin/\'))') < api.indexOf('const streamerResponse='));
  assert.doesNotMatch(client,/new Audio|isLive|LIVE 방송|방송 중|broadcastStatus/);
});

test('v2037 keeps the approved mobile geometry, removes the TV badge and isolates the neutral lounge palette', () => {
  const css=readFileSync(new URL('../css/streamer-lounge-v2036.css',import.meta.url),'utf8');
  const client=readFileSync(new URL('../js/streamer-lounge-v2036.js',import.meta.url),'utf8');
  assert.match(css,/\.mobile-command-lobby > \[data-streamer-lounge-host\] \{ left:0; top:115px; width:calc\(53% - 11px\); max-width:213px;/);
  assert.match(css,/\.pc-lobby-scene > \[data-streamer-lounge-host\] \{ left:0;/);
  assert.match(client,/sl36-dock-spine/);
  assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css,/lounge-architecture-v2037\.webp/);
  const hero=readFileSync(new URL('../assets/ui/streamer-lounge/lounge-architecture-v2037.webp',import.meta.url));
  assert.equal(hero.subarray(0,4).toString(),'RIFF');
  assert.equal(hero.subarray(8,12).toString(),'WEBP');
  assert.ok(hero.length>10000 && hero.length<150000,'panoramic art must be present and optimized for mobile');
  assert.match(css,/--sl-text:#f4f0e8; --sl-muted:#b8b3aa; --sl-accent:#d1b98c/);
  assert.match(css,/\.sl36-entrance \{ height:104px/);
  assert.doesNotMatch(client,/sl36-hero-mark|const icon =/);
  assert.doesNotMatch(css,/#10222e|#284653|#3b6670|battle-v3|roster-card|\.pc-main-character/);
});

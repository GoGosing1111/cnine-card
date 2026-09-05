import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import {readRuntimeData,cacheRuntimeData,invalidateRuntimeData} from '../functions/_runtime_data_cache.js';
import {ensureBattleSuitCoreCatalog,ensureMysticEnergyCatalog} from '../functions/_battle_suit_materials.js';
import {ensureClanParticipationSchema} from '../functions/_clan_participation.js';
import {ensureUniqueAdvancementPassCatalog} from '../functions/_unique_advancement.js';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');

test('completed-data cache is database-scoped, bounded by TTL and cannot retain pending I/O',()=>{
  const a={DB:{}},b={DB:{}},value={items:[1]};
  cacheRuntimeData(a,'x',value,50,100);value.items.push(2);
  assert.deepEqual(readRuntimeData(a,'x',101),{items:[1]});
  assert.equal(readRuntimeData(b,'x',101),undefined);
  readRuntimeData(a,'x',102).items.push(3);
  assert.deepEqual(readRuntimeData(a,'x',149),{items:[1]});
  assert.equal(readRuntimeData(a,'x',150),undefined);
  assert.throws(()=>cacheRuntimeData(a,'bad',Promise.resolve(1)),/completed data/);
  cacheRuntimeData(a,'x',true);invalidateRuntimeData(a,'x');assert.equal(readRuntimeData(a,'x'),undefined);
});

test('per-request PostgreSQL proxies reuse completed catalog/schema checks, not query promises',async()=>{
  let queries=0,writes=0;
  const env=()=>({RUNTIME_DB_CACHE_SCOPE:'test:pg:v2045',DB:{prepare(){return {bind(){return this},async first(){queries++;return {value:'1'}},async run(){writes++;return {meta:{changes:1}}}}}}});
  for(let i=0;i<20;i++){
    await ensureBattleSuitCoreCatalog(env());await ensureClanParticipationSchema(env());
    await ensureUniqueAdvancementPassCatalog(env());await ensureMysticEnergyCatalog(env());
  }
  assert.equal(queries,3);assert.equal(writes,1);
  const other=env();other.RUNTIME_DB_CACHE_SCOPE='test:pg:another-db';await ensureClanParticipationSchema(other);assert.equal(queries,4);
});

test('failed catalog writes are retried, never cached as success',async()=>{
  let writes=0;
  const env={DB:{prepare(){return {bind(){return this},async run(){if(++writes===1)throw Error('retry');return {meta:{changes:1}}}}}}};
  await assert.rejects(ensureUniqueAdvancementPassCatalog(env),/retry/);
  await ensureUniqueAdvancementPassCatalog(env);await ensureUniqueAdvancementPassCatalog(env);assert.equal(writes,2);
});

test('initial shell has no prime renderer; UI engines are shared without changing V3',()=>{
  const app=read('js/app.js'),index=read('index.html');
  assert.doesNotMatch(index,/<script[^>]+(?:prime-draw-live|ui-fx-vendor)/);
  assert.match(app,/await ensureFeatureResources\('primeDraw'\);\s*const result=await requestPrimeDrawChunks/);
  assert.match(app,/presentation failure must never hide an already committed reward/);
  const bundles=['prime-draw-live-v1985','soopketland-v2039','ranked-challenger-fx-v2032'];
  const features=bundles.reduce((sum,name)=>sum+statSync(new URL(`../js/${name}.bundle.js`,import.meta.url)).size,0);
  assert.ok(features<65000,`feature code is ${features} bytes`);
  assert.ok(statSync(new URL('../js/ui-fx-vendor-v2045.bundle.js',import.meta.url)).size+features<750000);
  for(const name of bundles)assert.match(read(`js/${name}.bundle.js`),/CNineUiFxVendor/);
  assert.doesNotMatch(read('preview/project-v-v3/project-v-pixi-battle.bundle.js'),/CNineUiFxVendor/);
});

function workerFixture(){
  let fetches=0,type='application/javascript';const entries=new Map(),handlers={};
  const cache={async match(request){return entries.get(request.url||request)?.clone()},async put(request,response){entries.set(request.url||request,response)},async delete(request){return entries.delete(request.url||request)}};
  const context=vm.createContext({URL,Response,self:{location:{origin:'https://test.invalid'},addEventListener(type,fn){handlers[type]=fn}},caches:{open:async()=>cache},fetch:async()=>{fetches++;return new Response('resource',{headers:{'content-type':type}})}});
  vm.runInContext(read('service-worker.js'),context);
  async function request(url,destination='script'){
    let response;handlers.fetch({request:{url:'https://test.invalid'+url,method:'GET',mode:'cors',destination},respondWith(value){response=value},waitUntil(){}});if(response)await response;return Boolean(response);
  }
  return {request,get fetches(){return fetches},set type(value){type=value}};
}
test('versioned scripts are cache-first; unversioned and admin paths remain fresh',async()=>{
  const f=workerFixture();await f.request('/js/a.js?v=2045');await f.request('/js/a.js?v=2045');assert.equal(f.fetches,1);
  await f.request('/js/a.js?v=2046');assert.equal(f.fetches,2);
  await f.request('/js/legacy-v123.js');await f.request('/js/legacy-v123.js');assert.equal(f.fetches,4);
  assert.equal(await f.request('/admin/a.js?v=2045'),false);
});
test('HTML fallback is never pinned as a versioned JS resource',async()=>{
  const f=workerFixture();f.type='text/html';await f.request('/js/missing.js?v=2045');await f.request('/js/missing.js?v=2045');assert.equal(f.fetches,2);
  f.type='application/javascript';await f.request('/js/missing.js?v=2045');await f.request('/js/missing.js?v=2045');assert.equal(f.fetches,3);
});

test('prediction lease acquisition is atomic, unexpired leases are retained and stale owners cannot unlock a successor',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
  let calls=0;const env={DB:{prepare(sql){return {bind(...values){this.values=values;return this},async run(){calls++;return {meta:{changes:Number(db.prepare(sql).run(...this.values).changes)}}}}}}};
  const source=read('functions/_coin_prediction.js'),snippet=source.slice(source.indexOf('async function lock('),source.indexOf('async function autoClose('));
  const context=vm.createContext({crypto:webcrypto});vm.runInContext(snippet,context);
  const first=await context.lock(env,'event_1');assert.ok(first);assert.equal(calls,1);
  assert.equal(await context.lock(env,'event_1'),null);
  db.prepare('UPDATE app_meta SET value=?').run(`${first.token}|1`);
  const second=await context.lock(env,'event_1');assert.ok(second);
  await context.unlock(env,first);assert.ok(db.prepare('SELECT * FROM app_meta').get());
  await context.unlock(env,second);assert.equal(db.prepare('SELECT * FROM app_meta').get(),undefined);
});

test('read optimizations do not cache reward authorization or remove user mutation locking',()=>{
  const api=read('functions/api/[[path]].js');
  const rewards=api.slice(api.indexOf("if(path==='pvp/reward/claim'"),api.indexOf("if(path==='pvp/rank-reward/claim'"));
  assert.match(rewards,/pvpChallengerRank\(env,user.id,\{fresh:true\}\)/);
  assert.match(api,/STRICT_MUTATION_LOCK_ACTIONS=new Set\([^\n]*'messages\/claim-batch'/);
  assert.match(api,/profileScope:'MESSAGE_PARTIAL'/);
  assert.match(read('functions/_message_reward_batch.js'),/r.user_id=\? AND m.user_id=\?/);
  assert.match(read('functions/_raid_core_protocol.js'),/releaseTerminalMemberships\(env, '', user.id\)/);
});

test('startup, selection and silent polling avoid unnecessary blocking/replacement',()=>{
  assert.match(read('js/soopketmon-v21-exact-shell-adapter.js'),/revealStandaloneScreen\(\)/);
  assert.match(read('js/app.js'),/if\(authenticated\)void syncUniqueAdvancementFeatureState\(\)\.catch/);
  const evolution=read('js/evolution.js');assert.match(evolution,/responsiveCardImageMarkup[\s\S]*enabled:true/);
  assert.match(evolution,/syncSelectionTiles\(\);updateCheckout\(\)/);
  assert.match(read('js/coin-prediction-v2033.js'),/if\(unchanged\)updateClocks\(\);else render\(\)/);
});

test('next message chunk safely retries a previous chunk lock still releasing',async()=>{
  const app=read('js/app.js'),calls=[];
  const context=vm.createContext({setTimeout:fn=>fn(),apiRequest:async(path,options)=>{
    calls.push({path,body:options.body});
    if(calls.length===1)throw Object.assign(Error('busy'),{status:409,code:'USER_ACTION_IN_PROGRESS'});
    return {ok:true,results:[]};
  }});
  vm.runInContext(app.slice(app.indexOf('async function requestMessageRewardBatch('),app.indexOf('async function claimAllMessageRewards(')),context);
  assert.equal((await context.requestMessageRewardBatch([1,2])).ok,true);
  assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
});

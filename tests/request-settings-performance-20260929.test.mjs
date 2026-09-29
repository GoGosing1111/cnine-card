import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequestSettingsCache} from '../functions/_request_settings_cache.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const request=scope=>({RUNTIME_DB_CACHE_SCOPE:scope});
const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');

test('a busy request cannot hold another request settings read; one request still deduplicates', {timeout:2000},async()=>{
  const cache=createRequestSettingsCache(),a=request('production'),b=request('production'),slow=deferred();let reads=0;
  const first=cache.load(a,'battle',10000,()=>{reads++;return slow.promise;});
  const same=cache.load(a,'battle',10000,()=>{throw Error('Duplicate request read');});
  try{
    assert.equal(first,same);
    const fast=await cache.load(b,'battle',10000,()=>{reads++;return 'new';});
    assert.equal(fast,'new');assert.equal(reads,2);
  }finally{slow.resolve('old');}
  assert.equal(await first,'old');
  assert.equal(await cache.load(request('production'),'battle',10000,()=>assert.fail('completed data should be reused')),'new');
});

test('TTL starts at read start; database scopes and failed requests are isolated',async()=>{
  let now=0,reads=0;const cache=createRequestSettingsCache({now:()=>now});
  const read=scope=>cache.load(request(scope),'pvp',100,()=>++reads);
  assert.equal(await read('a'),1);assert.equal(await read('a'),1);assert.equal(await read('b'),2);
  now=101;assert.equal(await read('a'),3);
  const slow=deferred(),pending=cache.load(request('a'),'late',100,()=>slow.promise);
  now=202;slow.resolve('expired');await pending;
  assert.equal(await cache.load(request('a'),'late',100,()=> 'fresh'),'fresh');
  const env=request('a');await assert.rejects(cache.load(env,'failed',100,()=>Promise.reject(Error('database failed'))));
  assert.equal(await cache.load(env,'failed',100,()=> 'recovered'),'recovered');
});

test('CMS invalidation and seeding cannot be undone by an older pending read',async()=>{
  for(const action of ['delete','clear','set']){
    const cache=createRequestSettingsCache(),env=request('a'),slow=deferred();
    const old=cache.load(env,'battle',10000,()=>slow.promise);
    if(action==='set')cache.set(env,'battle','saved',1000);else cache[action]('battle');
    assert.equal(await cache.load(env,'battle',10000,()=> 'saved'),'saved');
    slow.resolve('stale');await old;
    assert.equal(await cache.load(request('a'),'battle',10000,()=>assert.fail('Saved value should remain')),'saved');
  }
});

test('an old failure does not evict another request successful settings',async()=>{
  const cache=createRequestSettingsCache(),slow=deferred();
  const failed=cache.load(request('a'),'settings',1000,()=>slow.promise);
  assert.equal(await cache.load(request('a'),'settings',1000,()=> 'ok'),'ok');
  slow.reject(Error('old connection failed'));await assert.rejects(failed);
  assert.equal(await cache.load(request('a'),'settings',1000,()=>assert.fail()),'ok');
});

test('actual API metadata and derived settings use request ownership and fresh invalidation',async()=>{
  const start=api.indexOf('const META_SNAPSHOT_KEYS='),end=api.indexOf('let cardCatalogCache=',start);
  const functions=Function('createRequestSettingsCache',api.slice(start,end)+';return {metaValue,invalidateMetaSnapshot,cachedRuntimeSetting,runtimeSettingsCache};')(createRequestSettingsCache);
  const slow=deferred();let fastReads=0;
  const a={RUNTIME_DB_CACHE_SCOPE:'live',DB:{prepare:()=>({all:()=>slow.promise})}};
  const b={RUNTIME_DB_CACHE_SCOPE:'live',DB:{prepare:()=>({all:async()=>{fastReads++;return {results:[{key:'pvp_settings_v1',value:'new'}]};}})}};
  const old=functions.metaValue(a,'pvp_settings_v1');
  try{assert.deepEqual(await functions.metaValue(b,'pvp_settings_v1'),{value:'new'});assert.equal(fastReads,1);}
  finally{slow.resolve({results:[{key:'pvp_settings_v1',value:'old'}]});}
  await old;
  assert.deepEqual(await functions.metaValue(b,'pvp_settings_v1'),{value:'new'});
  functions.invalidateMetaSnapshot();await functions.metaValue(b,'pvp_settings_v1');assert.equal(fastReads,2);
  assert.equal(await functions.cachedRuntimeSetting(b,'pvp',1000,async()=> 'on'),'on');
  functions.runtimeSettingsCache.set(b,'pvp','off',1000);
  assert.equal(await functions.cachedRuntimeSetting(b,'pvp',1000,async()=>assert.fail()),'off');
  assert.doesNotMatch(api,/cachedRuntimeSetting\('/);
  assert.doesNotMatch(api,/runtimeSettingsCache\.set\('[^']+',\{promise/);
});

test('slow-query diagnostics are bounded and never include SQL literals or bindings',async()=>{
  const start=api.indexOf("const D1_RAW=Symbol("),end=api.indexOf("const D1_BOOKMARK_HEADER=",start);
  let now=0;const {newD1Stats,instrumentD1}=Function('Date',api.slice(start,end)+';return {newD1Stats,instrumentD1};')({now:()=>now});
  const stats=newD1Stats();
  const raw={prepare(){return {bind(){return this;},async first(){now+=300;return {ok:true};}};},async batch(){now+=500;return [];}};
  const db=instrumentD1(raw,stats);
  for(let i=0;i<8;i++)await db.prepare("SELECT * FROM users WHERE nickname='private FROM secret_table' AND session_hash=?").bind('secret-token').first();
  await db.batch([db.prepare("UPDATE app_meta SET value='sensitive' WHERE key=?").bind('private-key')]);
  assert.equal(stats.queries,8);assert.equal(stats.batches,1);assert.equal(stats.slow.length,5);
  assert.equal(stats.ms,2900);assert.deepEqual(stats.slow[0],{ms:500,operations:['UPDATE app_meta']});
  assert.doesNotMatch(JSON.stringify(stats),/private|sensitive|secret/);
  assert.deepEqual(stats.slow[1].operations,['SELECT users']);
});

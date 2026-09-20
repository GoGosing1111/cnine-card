import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

function coordinator(){
  const start=app.indexOf('const API_READ_CONCURRENCY_LIMIT=');
  const end=app.indexOf('// Player-owned state must not be cached.',start);
  assert.ok(start>=0&&end>start,'API read coordinator source must exist');
  const context=vm.createContext({URL,location:{origin:'https://cnine-card.pages.dev'}});
  vm.runInContext(`${app.slice(start,end)}\n;globalThis.coordinator={apiReadRequest,acquireApiReadSlot,get active(){return API_READ_ACTIVE},get waiting(){return API_READ_WAITERS.length},limit:API_READ_CONCURRENCY_LIMIT};`,context);
  return context.coordinator;
}

test('same-origin API reads are bounded while writes and external requests bypass the queue',async()=>{
  const flow=coordinator();
  assert.equal(flow.limit,6);
  assert.equal(flow.apiReadRequest('/api/raid/status',{}),true);
  assert.equal(flow.apiReadRequest('/api/pvp/fight',{method:'POST'}),false);
  assert.equal(flow.apiReadRequest('https://example.com/api/status',{}),false);

  const releases=await Promise.all(Array.from({length:flow.limit},()=>flow.acquireApiReadSlot()));
  assert.equal(flow.active,flow.limit);
  let entered=false;
  const queued=flow.acquireApiReadSlot().then(release=>{entered=true;return release});
  await Promise.resolve();
  assert.equal(entered,false);
  assert.equal(flow.waiting,1);
  releases.pop()();
  const queuedRelease=await queued;
  assert.equal(entered,true);
  assert.equal(flow.active,flow.limit);
  queuedRelease();
  for(const release of releases)release();
  assert.equal(flow.active,0);
  assert.equal(flow.waiting,0);
});

test('read slots always release and duplicate reads use a one-second mutation-aware microcache',()=>{
  assert.match(app,/finally\{clearTimeout\(timer\);[^}]*releaseReadSlot\?\.\(\)\}/);
  assert.match(app,/const API_READ_CONCURRENCY_LIMIT=6,API_GET_MICROCACHE_TTL=1000/);
  assert.match(app,/microcacheAllowed=isGet&&config\.microcache!==false/);
  assert.match(app,/Math\.max\(API_GET_MICROCACHE_TTL,requestedTtl\)/);
  assert.match(app,/cached\.epoch===requestEpoch/);
  assert.match(app,/PLAYER_STATE_MUTATION_EPOCH\+\+/);
  assert.match(index,/apiFlow=2122/);
});

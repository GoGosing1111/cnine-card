import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPveContinuousSession} from '../js/pve-continuous-session-v1.mjs';

const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const complete=(id='client-1',zone='OUTER')=>({ok:true,status:'COMPLETED',requestId:id,difficulty:{id:zone},battleV2:{result:{winner:'A',timeline:[]}},rewards:[{rewardType:'COIN',quantity:100000}]});
function harness(options={}){
  const storage=options.storage||memory(),calls=[],tasks=new Map(),states=[];let nextTimer=0,nextId=0;
  const transport={status:async()=>({ok:true,status:'IDLE'}),run:async body=>complete(body.requestId,body.difficulty),...options.transport};
  const session=createPveContinuousSession({accountId:7,storage,maxAutoRetries:2,...options,transport:{
    status:()=>transport.status(),run:body=>{calls.push(body);return transport.run(body);}},
    makeRequestId:()=>`client-${++nextId}`,onChange:state=>{states.push(state);options.onChange?.(state);},
    schedule:(fn,ms)=>{tasks.set(++nextTimer,{fn,ms});return nextTimer;},unschedule:id=>tasks.delete(id)});
  return {session,transport,storage,calls,tasks,states,fire:async()=>{const [id,task]=tasks.entries().next().value;tasks.delete(id);task.fn();await tick();}};
}

test('same-session double click joins one request; store precedes the POST; only request ID and zone are sent',async()=>{
  const wait=deferred(),f=harness({transport:{run:body=>{assert.ok(f.storage.getItem(f.session.storageKey));return wait.promise;}}});
  const a=f.session.start('OUTER'),b=f.session.start('FURNACE');assert.equal(a,b);await tick();
  assert.deepEqual(f.calls,[{requestId:'client-1',difficulty:'OUTER'}]);
  wait.resolve(complete());await a;assert.equal(f.session.getState().phase,'READY');
  assert.ok(f.storage.getItem(f.session.storageKey));
  await f.session.start('FURNACE');assert.equal(f.calls.length,1,'unacknowledged result cannot create a second entry');
});

test('refresh during playback retrieves the same receipt until the result is acknowledged',async()=>{
  const storage=memory(),first=harness({storage});await first.session.start('CORE');first.session.dispose();
  const second=harness({storage});await second.session.resume();
  assert.deepEqual(second.calls,[{requestId:'client-1',difficulty:'CORE'}]);assert.equal(second.session.getState().phase,'READY');
  assert.equal(second.session.acknowledge(),true);assert.equal(storage.getItem(second.session.storageKey),null);
  await second.session.resume();assert.equal(second.calls.length,1);assert.equal(second.session.getState().phase,'IDLE');
});

test('a rejected network response retains its identifier and resumes without rolling a new ID',async()=>{
  let attempts=0;const f=harness({transport:{run:body=>++attempts===1?Promise.reject(new Error('NETWORK LOST')):Promise.resolve(complete(body.requestId,body.difficulty))}});
  await f.session.start('OUTER');assert.equal(f.session.getState().phase,'RECOVERABLE');assert.equal(f.tasks.size,1);
  await f.fire();assert.equal(f.session.getState().phase,'READY');assert.equal(f.tasks.size,0);
  assert.equal(new Set(f.calls.map(c=>c.requestId)).size,1);
});

test('another active zone wins over a new zone choice, including after local storage loss',async()=>{
  const f=harness({transport:{status:async()=>({ok:true,status:'RUNNING',requestId:'server-active',difficulty:'FURNACE',canResume:true})}});
  await f.session.start('OUTER');assert.deepEqual(f.calls,[{requestId:'server-active',difficulty:'FURNACE'}]);
  assert.equal(f.session.getState().difficulty,'FURNACE');
});

test('a concurrent server response redirects the client to the canonical operation, never the abandoned local ID',async()=>{
  let count=0;const f=harness({transport:{run:async body=>++count===1
    ?{ok:true,status:'RUNNING',requestId:'canonical',difficulty:'CORE',retryAfterMs:1500}
    :complete(body.requestId,body.difficulty)}});
  await f.session.start('OUTER');await f.fire();
  assert.deepEqual(f.calls,[{requestId:'client-1',difficulty:'OUTER'},{requestId:'canonical',difficulty:'CORE'}]);
  assert.equal(f.session.getState().phase,'READY');
});

test('cross-tab Web Lock serialization rechecks shared storage, even if first run completed immediately',async()=>{
  const storage=memory();let queue=Promise.resolve();
  const exclusive=(_key,work)=>{const next=queue.then(work);queue=next.catch(()=>{});return next;};
  const a=harness({storage,exclusive}),b=harness({storage,exclusive});
  await Promise.all([a.session.start('OUTER'),b.session.start('FURNACE')]);
  assert.equal(a.calls.length,1);assert.equal(b.calls.length,1);
  assert.deepEqual(b.calls[0],a.calls[0],'second tab replays receipt instead of creating another expedition');
});

test('pending IDs are account-scoped and contain no combat data or rewards',async()=>{
  const storage=memory(),a=harness({storage}),b=harness({storage,accountId:8});
  await a.session.start('OUTER');await b.session.resume();assert.equal(b.calls.length,0);
  const value=JSON.parse(storage.getItem(a.session.storageKey));
  assert.deepEqual(Object.keys(value).sort(),['version','accountId','requestId','difficulty','savedAt'].sort());
  assert.notEqual(a.session.storageKey,b.session.storageKey);
});

test('storage failures or malformed/cross-account records stop before ticket-consuming submission',async()=>{
  for(const mode of ['read-fails','write-fails','corrupt','wrong-account']){
    const storage=memory(),f=harness({storage});
    if(mode==='read-fails')storage.getItem=()=>{throw new Error('DENIED');};
    if(mode==='write-fails')storage.setItem=()=>{throw new Error('DENIED');};
    if(mode==='corrupt')storage.setItem(f.session.storageKey,'{oops');
    if(mode==='wrong-account')storage.setItem(f.session.storageKey,JSON.stringify({version:1,accountId:'8',requestId:'other',difficulty:'CORE'}));
    await f.session.start('OUTER');assert.equal(f.calls.length,0,mode);assert.equal(f.tasks.size,0,mode);
    assert.equal(f.session.getState().phase,'RECOVERABLE');
  }
});

test('background pauses retries, visible resumes, repeated failures stop automatically and remain manually recoverable',async()=>{
  const f=harness({transport:{run:async body=>({ok:true,status:'RUNNING',...body,retryAfterMs:1})}});
  await f.session.start('OUTER');assert.equal(f.tasks.size,1);assert.ok([...f.tasks.values()][0].ms>=1500);
  f.session.setVisible(false);assert.equal(f.tasks.size,0);
  f.session.setVisible(true);await tick();assert.equal(f.tasks.size,1);
  await f.fire();await f.fire();assert.equal(f.tasks.size,0);assert.equal(f.session.getState().phase,'RUNNING');
  await f.session.resume();assert.equal(f.tasks.size,1);
});

test('explicit server validation failures do not auto-submit when tickets or settings later change',async()=>{
  const f=harness({transport:{run:async()=>{throw Object.assign(new Error('입장권 없음'),{code:'SCRAPYARD_V3_ENTRY_UNAVAILABLE'});}}});
  await f.session.start('OUTER');assert.equal(f.tasks.size,0);assert.equal(f.calls.length,1);
  assert.ok(f.storage.getItem(f.session.storageKey));
});

test('dispose ignores an old response but leaves recovery key; it never cancels a server economic operation',async()=>{
  const wait=deferred(),f=harness({transport:{run:()=>wait.promise}});
  const run=f.session.start('OUTER');await tick();f.session.dispose();const count=f.states.length;
  wait.resolve(complete());assert.equal(await run,null);assert.equal(f.states.length,count);assert.equal(f.tasks.size,0);
  assert.ok(f.storage.getItem(f.session.storageKey));
  assert.equal(await f.session.start('CORE'),null);
});

test('acknowledging an old result cannot remove a newer cross-tab recovery key',async()=>{
  const f=harness();await f.session.start('OUTER');
  f.storage.setItem(f.session.storageKey,JSON.stringify({version:1,accountId:'7',requestId:'new-tab',difficulty:'FURNACE'}));
  assert.equal(f.session.acknowledge(),true);assert.equal(JSON.parse(f.storage.getItem(f.session.storageKey)).requestId,'new-tab');
  assert.equal(f.session.getState().phase,'RECOVERABLE');
});

test('malformed/mismatched server results do not clear the pending key or create a new entry',async()=>{
  for(const response of [{ok:true,status:'COMPLETED',requestId:'unrelated'},complete('different'),{ok:true,status:'RUNNING',requestId:'different'}]){
    const f=harness({transport:{run:async()=>response}});await f.session.start('OUTER');
    assert.equal(f.session.getState().phase,'RECOVERABLE');assert.equal(f.tasks.size,0);
    assert.ok(f.storage.getItem(f.session.storageKey));assert.equal(f.calls.length,1);
  }
});

test('callback exceptions do not replace completed receipts with another request',async()=>{
  const f=harness({onChange:()=>{throw new Error('DISPLAY FAILURE');}});
  await f.session.start('OUTER');assert.equal(f.session.getState().phase,'READY');assert.equal(f.calls.length,1);
  await f.session.resume();assert.equal(f.calls.length,1);
});

test('session module is staged; no production routes, reward math, timers without disposal, or new battle engine',()=>{
  const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  for(const file of ['index.html','js/app.js','functions/api/[[path]].js'])assert.doesNotMatch(read(file),/pve-continuous-session-v1|scrapyard\/v3/);
  assert.doesNotMatch(read('js/pve-continuous-session-v1.mjs'),/\/api\/|simulateBattle|Math\.random|coin\s*\+=|new Application/);
});

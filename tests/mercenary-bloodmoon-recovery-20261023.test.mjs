import test from 'node:test';
import assert from 'node:assert/strict';
import {BloodmoonReceiptRecovery,bloodmoonReceiptRetryable} from '../shared/mercenary-bloodmoon-recovery-v1.mjs';
import {BloodmoonOpeningSession} from '../shared/mercenary-bloodmoon-session-v2.mjs';
import {BLOODMOON_PACK} from '../shared/mercenary-bloodmoon-pack-v1.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const state={id:'saved-request',available:true,busy:false,calls:0,errors:[],timers:new Map(),delays:[]};let nextId=0;
 const recovery=new BloodmoonReceiptRecovery({getPendingId:()=>state.id,canRead:()=>state.available,isBusy:()=>state.busy,
  read:async options=>{state.calls++;return state.read?.(options);},onError:error=>state.errors.push(error),
  schedule:(work,delay)=>{const id=++nextId;state.timers.set(id,work);state.delays.push(delay);return id;},cancel:id=>state.timers.delete(id)
 });
 return {state,recovery,tick:async()=>{const [id,work]=state.timers.entries().next().value||[];assert(work,'A bounded retry must be scheduled');state.timers.delete(id);work();await flush();}};
}

test('an unresolved receipt gets only three delayed reads, even with repeated wake-up events',async()=>{
 const h=harness();h.recovery.request();
 for(let i=0;i<20;i++)h.recovery.request({resume:true});
 assert.equal(h.state.timers.size,1);
 await h.tick();await h.tick();await h.tick();
 assert.equal(h.state.calls,3);assert.equal(h.state.timers.size,0);assert.deepEqual(h.state.delays,[1000,3000,8000]);
 h.recovery.request();assert.equal(h.state.timers.size,0,'Settling cannot restart an exhausted burst');
});

test('offline and hidden states defer work; a later visible/online wake-up resumes once',async()=>{
 const h=harness();h.state.available=false;h.recovery.request();assert.equal(h.state.timers.size,0);
 h.state.available=true;h.recovery.request({resume:true});await h.tick();
 h.state.available=false;h.recovery.suspend();assert.equal(h.state.timers.size,0);
 h.state.available=true;h.state.read=()=>{h.state.id=null;};h.recovery.request({resume:true});await h.tick();
 assert.equal(h.state.calls,2);assert.equal(h.state.timers.size,0);
});

test('a wake-up during another action waits until that action settles instead of reading concurrently',async()=>{
 const h=harness();h.state.busy=true;h.recovery.request({resume:true});assert.equal(h.state.timers.size,0);
 h.state.busy=false;h.state.read=()=>{h.state.id=null;};h.recovery.request();await h.tick();assert.equal(h.state.calls,1);
});

test('a wake-up racing an aborted receipt read is not lost',async()=>{
 const h=harness();let rejectRead;
 h.state.read=()=>new Promise((_,reject)=>{rejectRead=reject;});h.recovery.request();await h.tick();
 const signal=h.recovery.flight.signal;h.state.available=false;h.recovery.suspend();assert(signal.aborted);
 h.state.available=true;h.recovery.request({resume:true});rejectRead(Object.assign(Error('aborted'),{name:'AbortError'}));await flush();
 assert.equal(h.state.timers.size,1);assert.equal(h.state.delays.at(-1),0);
 h.state.read=()=>{h.state.id=null;};await h.tick();assert.equal(h.state.calls,2);assert.equal(h.state.timers.size,0);
});

test('permission, account and storage failures stop; transient transport/sync failures can retry',async()=>{
 for(const error of [{status:401,retryable:true},{status:403},{status:423},{code:'ACCOUNT_RESPONSE_STALE',retryable:false},{code:'BLOODMOON_ACCOUNT_CHANGED'},{code:'BLOODMOON_STORAGE_INVALID'}]){
  const h=harness();h.state.read=()=>{throw error;};h.recovery.request();await h.tick();h.recovery.request({resume:true});assert.equal(h.state.timers.size,0);assert.equal(h.state.calls,1);
 }
 for(const error of [new TypeError('Failed to fetch'),{name:'AbortError'},{status:503},{status:429},{code:'ACCOUNT_RESPONSE_STALE',retryable:true},{code:'JOINT_RESPONSE_INVALID',retryable:true}])assert(bloodmoonReceiptRetryable(error));
});

test('completion, request replacement and room disposal do not poll indefinitely',async()=>{
 const h=harness();h.state.read=()=>{h.state.id=null;};h.recovery.request();await h.tick();assert.equal(h.state.timers.size,0);
 h.state.id='new-saved-request';h.state.read=()=>{};h.recovery.request();assert.equal(h.recovery.attempts,0);h.recovery.destroy();
 assert.equal(h.state.timers.size,0);h.recovery.request({resume:true});assert.equal(h.state.timers.size,0);
});

function sessionHarness(api){
 const data=new Map(),body={requestId:crypto.randomUUID(),count:10,expectedRevision:19};let account=1;
 const shown=[],confirmed=[],session=new BloodmoonOpeningSession({accountId:1,getAccountId:()=>account,storage:{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)},api,present:async value=>shown.push(value),onConfirmed:value=>confirmed.push(value)});
 data.set(session.pendingKey,JSON.stringify({accountId:1,body}));
 const receipt=()=>({requestId:body.requestId,accountId:1,packId:BLOODMOON_PACK.id,status:'COMPLETED',count:10,coin:'10000',coinCost:900,draws:Array.from({length:10},()=>({outcomeId:'NONE',quantity:0}))});
 return {session,data,body,shown,confirmed,receipt,changeAccount:()=>{account=2;}};
}

test('bounded automatic recovery reads the original request only, through missing/pending/completed states',async()=>{
 const h=harness();let reads=0,f;
 f=sessionHarness(async(path,options)=>{
  assert.equal(options.method,undefined);assert.equal(options.timeoutMs,8000);assert.equal(path,BLOODMOON_PACK.receiptPath+'?requestId='+f.body.requestId);reads++;
  if(reads===1)throw Object.assign(Error('not accepted yet'),{code:'JOINT_NOT_FOUND'});
  if(reads===2)return {requestId:f.body.requestId,status:'PENDING'};
  return f.receipt();
 });
 h.recovery.getPendingId=()=>f.session.read(f.session.pendingKey)?.body.requestId||null;
 h.state.read=({signal})=>f.session.reconcilePending({signal,timeoutMs:8000});h.recovery.request();await h.tick();await h.tick();await h.tick();
 assert.equal(reads,3);assert.equal(f.shown.length,1);assert.equal(f.data.has(f.session.pendingKey),false);assert.equal(h.state.timers.size,0);
});

test('an interrupted late response cannot clear pending, present results, or update the wallet',async()=>{
 for(const status of ['COMPLETED','JOINT_OPERATION_SUPERSEDED']){
  let finish;const f=sessionHarness(()=>new Promise((resolve,reject)=>{finish=()=>status==='COMPLETED'?resolve(f.receipt()):reject(Object.assign(Error('cancelled'),{code:status}));}));
  const controller=new AbortController(),reading=f.session.reconcilePending({signal:controller.signal,timeoutMs:8000});
  controller.abort();finish();await assert.rejects(reading,{name:'AbortError'});
  assert(f.data.has(f.session.pendingKey));assert.equal(f.shown.length,0);assert.equal(f.confirmed.length,0);assert.equal(f.session.busy,false);
 }
});

test('an account switch during an automatic read keeps the old result isolated',async()=>{
 let finish;const f=sessionHarness(()=>new Promise(resolve=>{finish=()=>resolve(f.receipt());}));
 const reading=f.session.reconcilePending({signal:new AbortController().signal});f.changeAccount();finish();
 await assert.rejects(reading,{code:'BLOODMOON_ACCOUNT_CHANGED'});assert(f.data.has(f.session.pendingKey));assert.equal(f.confirmed.length,0);
});

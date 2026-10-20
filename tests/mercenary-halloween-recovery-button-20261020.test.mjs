import test from 'node:test';
import assert from 'node:assert/strict';
import {HalloweenOpeningSession} from '../shared/mercenary-halloween-session-v2.mjs';
import {HALLOWEEN_PACK} from '../shared/mercenary-halloween-pack-v1.mjs';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const config={revision:15,userOpeningEnabled:true};
const completed=b=>({accountId:1,packId:HALLOWEEN_PACK.id,requestId:b.requestId,count:b.count,status:'COMPLETED',coin:'10000',coinCost:100,draws:Array.from({length:b.count},()=>({outcomeId:'NONE',quantity:0}))});

test('the recovery control is notified after the durable request is saved and before the network can stall',async()=>{
 const storage=memory();let session,resolve,notified=false,posts=0;
 session=new HalloweenOpeningSession({accountId:1,getAccountId:()=>1,storage,present:async()=>{},onPending:()=>{
  assert.equal(session.busy,true);assert.equal(session.read(session.pendingKey).body.count,10);assert.equal(posts,0);notified=true;
 },api:async(_path,options)=>{assert(notified);posts++;return new Promise(r=>resolve=()=>r(completed(options.body)));}});
 const drawing=session.start(config,10);
 assert.equal(notified,true);assert.equal(posts,1);assert.equal(session.busy,true);
 await assert.rejects(session.start(config,10),{code:'HALLOWEEN_BUSY'});
 resolve();await drawing;assert.equal(session.busy,false);assert.equal(session.read(session.pendingKey),null);assert.equal(posts,1);
});

test('a retired room cannot accept a late completed response or clear a newer pending request',async()=>{
 const storage=memory();let active=true,resolve,presented=0,confirmed=0;
 const session=new HalloweenOpeningSession({accountId:1,getAccountId:()=>active?1:0,storage,present:async()=>presented++,onConfirmed:()=>confirmed++,api:async(_path,options)=>new Promise(r=>resolve=()=>r(completed(options.body)))});
 const drawing=session.start(config,1),body=session.read(session.pendingKey).body;
 active=false;resolve();await assert.rejects(drawing,{code:'HALLOWEEN_ACCOUNT_CHANGED'});
 assert.deepEqual(session.read(session.pendingKey).body,body);assert.equal(confirmed,0);assert.equal(presented,0);assert.equal(session.busy,false);
});

test('a reopened room checks only the saved receipt and never purchases until explicit recovery',async()=>{
 const storage=memory(),body={requestId:crypto.randomUUID(),count:10,expectedRevision:15};let posts=0,reads=0;
 const session=new HalloweenOpeningSession({accountId:1,getAccountId:()=>1,storage,present:async()=>{},api:async(_path,options)=>{
  if(options){posts++;assert.deepEqual(options.body,body);return completed(body);}
  reads++;return {requestId:body.requestId,status:'PENDING'};
 }});
 storage.setItem(session.pendingKey,JSON.stringify({accountId:1,body}));
 assert.equal((await session.reconcilePending()).status,'PENDING');assert.equal(posts,0);
 assert.deepEqual(session.read(session.pendingKey).body,body);
 await session.recover();assert.equal(posts,1);assert.equal(reads,2);assert.equal(session.read(session.pendingKey),null);
});

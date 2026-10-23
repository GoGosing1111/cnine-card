import test from 'node:test';
import assert from 'node:assert/strict';
import {BloodmoonOpeningSession} from '../shared/mercenary-bloodmoon-session-v2.mjs';
import {BLOODMOON_PACK} from '../shared/mercenary-bloodmoon-pack-v1.mjs';

const config={revision:16,userOpeningEnabled:true};
const body={requestId:'00000000-0000-4000-8000-000000000001',count:10,expectedRevision:16};
const receipt=b=>({accountId:1,packId:BLOODMOON_PACK.id,requestId:b.requestId,count:b.count,revision:16,status:'COMPLETED',coin:'10000',coinCost:900,draws:Array.from({length:b.count},()=>({outcomeId:'NONE',quantity:0}))});
function storage(){
 const data=new Map();
 return {data,limit:Infinity,deny:false,denyHistory:false,
  used(){return [...data].reduce((sum,[key,value])=>sum+key.length+value.length,0);},
  getItem:key=>data.get(key)??null,
  removeItem:key=>data.delete(key),
  setItem(key,value){
   const old=data.has(key)?key.length+data.get(key).length:0;
   if(this.deny||this.denyHistory&&key.includes('.receipt:')||this.used()-old+key.length+value.length>this.limit)throw new DOMException('Storage quota exceeded','QuotaExceededError');
   data.set(key,value);
  },
 };
}
function setup(store=storage()){
 const seen={posts:0,reads:0,presented:[],confirmed:[]};
 const session=new BloodmoonOpeningSession({accountId:1,getAccountId:()=>1,storage:store,
  present:async value=>seen.presented.push(value),onConfirmed:value=>seen.confirmed.push(value),
  api:async(_path,options)=>{
   if(options){seen.posts++;assert.deepEqual(JSON.parse(store.getItem(session.pendingKey)).body,options.body);return receipt(options.body);}
   seen.reads++;return receipt(body);
  },
 });
 store.setItem(session.pendingKey,JSON.stringify({accountId:1,body}));
 return {session,store,seen};
}

test('a full browser restores a completed ten-pack and permits the next durable request',async()=>{
 const {session,store,seen}=setup();
 store.setItem('unrelated-game-data','keep me');store.limit=store.used();
 await session.reconcilePending();
 assert.equal(store.getItem(session.pendingKey),null);assert.equal(session.busy,false);
 assert.equal(seen.posts,0);assert.equal(seen.reads,1);assert.equal(seen.presented[0].draws.length,10);
 assert.equal(JSON.parse(store.getItem(session.receiptKey)).requestId,body.requestId);
 assert.equal(JSON.parse(store.getItem(session.receiptKey)).draws,undefined);
 // The optional history and the next pending request cannot both fit. Only
 // the history pointer may be reclaimed, before the next single POST.
 await session.start(config,10);
 assert.equal(seen.posts,1);assert.equal(seen.confirmed.length,2);assert.equal(store.getItem(session.pendingKey),null);
 assert.equal(store.getItem('unrelated-game-data'),'keep me');
});

test('history writes may fail without blocking confirmed results or read-only recovery',async()=>{
 const {session,store,seen}=setup();store.denyHistory=true;
 await session.reconcilePending();
 assert.equal(store.getItem(session.pendingKey),null);assert.equal(store.getItem(session.receiptKey),null);
 await session.recover();
 assert.equal(seen.posts,0);assert.equal(seen.reads,2);assert.equal(seen.presented.length,2);assert.equal(seen.confirmed.length,2);
});

test('a purchase never reaches the server when its pending request cannot be persisted',async()=>{
 const {session,store,seen}=setup();
 await session.reconcilePending();store.deny=true;
 await assert.rejects(session.start(config,10),{code:'BLOODMOON_STORAGE_UNAVAILABLE'});
 assert.equal(seen.posts,0);assert.equal(session.busy,false);assert.equal(store.getItem(session.pendingKey),null);
});

test('unconfirmed, mismatched and other-account results retain the durable pending request',async()=>{
 for(const change of [{status:'PENDING'},{accountId:2},{requestId:'another-request'},{count:1}]){
  const {session,store,seen}=setup();store.limit=store.used();
  const original=store.getItem(session.pendingKey);
  session.api=async()=>({...receipt(body),...change});
  if(change.status==='PENDING')assert.equal((await session.reconcilePending()).status,'PENDING');
  else await assert.rejects(session.reconcilePending());
  assert.equal(store.getItem(session.pendingKey),original);assert.equal(store.getItem(session.receiptKey),null);
  assert.equal(seen.confirmed.length,0);assert.equal(seen.presented.length,0);
 }
});

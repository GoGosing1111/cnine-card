import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HalloweenOpeningSession} from '../shared/mercenary-halloween-session-v2.mjs';
import {HalloweenAutoOpening} from '../shared/mercenary-halloween-auto-v1.mjs';
import {HALLOWEEN_PACK,pickHalloweenBatch} from '../shared/mercenary-halloween-pack-v1.mjs';
const error=code=>Object.assign(Error(code),{code});
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const config={revision:7,userOpeningEnabled:true,settings:{prices:{single:100,ten:900}}};
function client(api){
 const storage=memory(),body={requestId:crypto.randomUUID(),count:1,expectedRevision:7},presented=[];
 const session=new HalloweenOpeningSession({accountId:1,getAccountId:()=>1,storage,api,present:async r=>presented.push(r)});
 storage.setItem(session.pendingKey,JSON.stringify({accountId:1,body}));return {session,storage,body,presented};
}
const receipt=body=>({packId:HALLOWEEN_PACK.id,status:'COMPLETED',accountId:1,requestId:body.requestId,count:body.count,coin:'10000',coinCost:100,draws:[{outcomeId:'NONE',quantity:0}]});

test('sold-out cards leave Halloween draws open without changing configured odds or limits',async t=>{
 const f=await halloweenFixture(t,{randomInt:()=>9900000000});
 f.settings.cardRatesPpm['V-980']=500000;f.settings.cardRatesPpm['V-986']=500000;
 f.settings.normalRankRatesPpm.SSS=100000;f.settings.missRatePpm=900000;
 await f.configure();await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=10 WHERE code='V-986'");
 const state=await f.state();assert.equal(state.userOpeningEnabled,true);assert.equal(state.readiness.ready,true);
 assert.equal(state.stock.find(r=>r.code==='V-986').remaining,0);assert.deepEqual(state.settings,f.settings);
 const result=await f.service.open(f.env,f.user,f.body(10));assert.equal(result.draws.length,10);assert.equal(await f.coin(),999100);
 assert.ok(result.draws.every(r=>r.outcomeId==='NONE'));
 assert.equal((await f.pg.query("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-986'")).rows[0].issued,10);
 await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=10 WHERE code='V-980'");assert.equal((await f.state()).userOpeningEnabled,true);
});

test('an exhausted interval awards ordinary SSS without repeating either rank lottery',async t=>{
 const samples=[0,5000000000,0];const f=await halloweenFixture(t,{randomInt:()=>samples.shift()});
 f.settings.cardRatesPpm['V-980']=500000;f.settings.cardRatesPpm['V-986']=500000;await f.configure();
 await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=10 WHERE code='V-986'");
 const result=await f.service.open(f.env,f.user,f.body());assert.equal(result.draws[0].outcomeId,'CARD_SSS');assert.equal(result.draws[0].edition,'STANDARD');
 assert.equal(samples.length,0);assert.equal(await f.coin(),999900);
 for(const table of ['joint_operations_v1','mercenary_card_acquisitions_v1','coin_logs'])assert.equal((await f.pg.query('SELECT * FROM '+table)).rows.length,1);
 const state=await f.state(),drawSamples=[0,0];assert.equal(pickHalloweenBatch(state,1,()=>drawSamples.shift())[0].mercenaryCode,'V-980');
});

test('cancelled pending requests clear on both entry and explicit recovery without a POST',async()=>{
 for(const method of ['reconcilePending','recover']){
  let reads=0;const f=client(async(_path,options)=>{assert.equal(options,undefined);reads++;throw error('JOINT_OPERATION_SUPERSEDED');});
  const result=await f.session[method]();assert.equal(result.status,'CANCELLED');assert.equal(reads,1);
  assert.equal(f.session.read(f.session.pendingKey),null);assert.equal(f.session.busy,false);assert.equal(f.presented.length,0);
 }
});

test('entry restores a completed receipt without another purchase or automatic run',async()=>{
 let calls=0;const f=client(async(_path,options)=>{assert.equal(options,undefined);calls++;return receipt(f.body);});
 const auto=new HalloweenAutoOpening({session:f.session,readConfig:async()=>config});
 await f.session.reconcilePending();assert.equal(calls,1);assert.equal(f.presented.length,1);
 assert.equal(f.session.read(f.session.pendingKey),null);assert.equal(auto.state.running,false);
 await f.session.reconcilePending();assert.equal(calls,1);
});

test('unconfirmed, pending and unavailable receipts retain the same request until explicit recovery',async()=>{
 for(const state of ['JOINT_NOT_FOUND','PENDING','offline']){
  let explicit=false,posts=0;const f=client(async(_path,options)=>{
   if(options){posts++;assert.deepEqual(options.body,f.body);return receipt(f.body);}
   if(state==='PENDING')return {status:'PENDING',requestId:f.body.requestId};
   throw error(explicit?'JOINT_NOT_FOUND':state);
  });
  if(state==='offline')await assert.rejects(f.session.reconcilePending(),/offline/);else await f.session.reconcilePending();
  assert.equal(posts,0);assert.deepEqual(f.session.read(f.session.pendingKey).body,f.body);
  explicit=true;await f.session.recover();assert.equal(posts,1);assert.equal(f.session.read(f.session.pendingKey),null);
 }
});

test('clearing a server-cancelled request allows a newly confirmed automatic run',async()=>{
 let posts=0;const f=client(async(_path,options)=>{if(!options)throw error('JOINT_OPERATION_SUPERSEDED');posts++;assert.notEqual(options.body.requestId,f.body.requestId);return receipt(options.body);});
 await f.session.reconcilePending();
 const auto=new HalloweenAutoOpening({session:f.session,readConfig:async()=>config,delay:async()=>{}});
 const result=await auto.start(config,1,2);assert.equal(result.phase,'completed');assert.equal(posts,2);assert.equal(result.spent,'200');
});

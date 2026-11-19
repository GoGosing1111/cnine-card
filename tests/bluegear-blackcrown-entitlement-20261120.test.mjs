import test from 'node:test';import assert from 'node:assert/strict';
import {bluegearBulkFixture} from './helpers/bluegear-large-bulk-fixture.mjs';
import {blackcrownOnceKey} from '../functions/_mercenary_blackcrown_once.js';
import {BLACKCROWN_PACK} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {BLUE_GEAR_PACK,BLUE_GEAR_DRAW_POLICY} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {BlackcrownOpeningSession} from '../shared/mercenary-blackcrown-session-v2.mjs';
const entitlement=status=>({version:1,status,remaining:status==='ARMED'?1:0,userId:1,packId:BLACKCROWN_PACK.id,mercenaryCode:'V-971',actorId:1,operationId:'qa-blackcrown-once'});
for(const status of ['ARMED','CONSUMED'])test(`Blue Gear ignores and preserves unrelated ${status} Black Crown entitlement`,async t=>{
 const f=await bluegearBulkFixture(t),before=await f.coin(),value=JSON.stringify(entitlement(status));await f.setting(blackcrownOnceKey(1),entitlement(status));
 for(const [count,budget]of [[10,null],[44444,'100000000000000'],[444444,'1000000000000000']]){
  const body={requestId:crypto.randomUUID(),count,expectedRevision:4,...(budget?{budget}:{})},r=await f.service.open(f.env,f.user,body);assert.equal(r.status,'COMPLETED');assert.equal(r.count,count);assert.equal(r.draws.some(d=>d.guaranteed),false);assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',blackcrownOnceKey(1)).first()).value,value);
  const paid=await f.coin();assert((await f.service.open(f.env,f.user,body)).replayed);assert.equal(await f.coin(),paid);
 }assert.equal((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n,3);assert.equal(await f.coin(),before-22500000000-99999000000000-999999000000000);
});
test('a saved Blue Gear request resumes its original lottery once while keeping Black Crown history',async t=>{
 const f=await bluegearBulkFixture(t),body={requestId:crypto.randomUUID(),count:44444,expectedRevision:4,budget:'100000000000000'},before=await f.coin();
 await f.setting(blackcrownOnceKey(1),entitlement('CONSUMED'));f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,f.user,body));f.fail('');
 const saved=(await f.p('SELECT plan_json FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).plan_json,values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};let posts=0;
 const session=new BlackcrownOpeningSession({pack:BLUE_GEAR_PACK,drawPolicy:BLUE_GEAR_DRAW_POLICY,accountId:1,getAccountId:()=>1,storage,present:async()=>{},api:(p,o)=>o?.method==='POST'?(posts++,f.service.open(f.env,f.user,o.body)):f.service.receipt(f.env,f.user,new URL(p,'https://qa').searchParams.get('requestId'))});storage.setItem(session.pendingKey,JSON.stringify({accountId:1,body}));
 assert.equal((await session.reconcilePending()).status,'PENDING');assert.equal(posts,0);assert.equal((await session.recover()).status,'COMPLETED');assert.equal(posts,1);assert.equal(await f.coin(),before-99999000000000);assert.equal(storage.getItem(session.pendingKey),null);assert.equal((await f.p('SELECT plan_json FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).plan_json,saved);assert.equal((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n,1);assert.equal(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',blackcrownOnceKey(1)).first()).value).status,'CONSUMED');
});

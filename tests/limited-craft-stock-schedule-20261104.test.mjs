import test from 'node:test';
import assert from 'node:assert/strict';
import {jointFixture} from './helpers/joint-db.mjs';
import {LIMITED_SHARD_CRAFTS} from '../shared/mercenary-limited-shard-craft-v1.mjs';
import {mercenaryCraftDraft} from '../shared/mercenary-craft-v1.mjs';
import {CRAFT_STOCK_SCHEDULE_KEY,scheduleLimitedCraftStock,processLimitedCraftStockSchedules,readLimitedCraftStockSchedules} from '../functions/_mercenary_craft_stock_schedule.js';
import {processMercenaryPackStockSchedules,armMercenaryStockAlarm,handleMercenaryStockAlarm} from '../workers/clan-draft/src/mercenary-stock-schedule.js';
import {stockScheduleKstToIso} from '../shared/mercenary-stock-schedule-v1.mjs';
const codes=['V-979','V-989','V-996','V-999'];
const request=()=>({requestId:crypto.randomUUID(),executeAt:new Date(Math.floor(Date.now()/1000)*1000+3600000).toISOString(),changes:codes.map(code=>({code,quantity:10})),reason:'제작소 공개 SSS 리미티드 조각 제작 4종 각10장 추가'});
async function fixture(t,postgres=false){
 const f=await jointFixture(t,{postgres});
 for(const d of LIMITED_SHARD_CRAFTS)await f.setting(d.key,{...mercenaryCraftDraft(d),revision:5,stockLimit:codes.includes(d.code)?15:10,...(codes.includes(d.code)?{coinCost:500000000000,masterStarCost:5000000,successRate:20,materials:[{itemCode:d.requiredMaterial,quantity:2}],isPublic:true,isActive:true}:{})});
 const state=async()=>(await f.p("SELECT key,value FROM app_meta WHERE key LIKE 'mercenary_limited_shard_craft_v1:%' ORDER BY key").all()).results;
 return {...f,state};
}
test('11/5 21:00 KST is exactly noon UTC',()=>assert.equal(stockScheduleKstToIso('2026-11-05T21:00:00'),'2026-11-05T12:00:00.000Z'));
for(const postgres of [false,true])test(`four deltas at the boundary, all other policy fields and hidden recipes preserved (${postgres?'Postgres':'SQLite'})`,async t=>{
 const f=await fixture(t,postgres),input=request(),before=await f.state(),coin=await f.coin();
 await scheduleLimitedCraftStock(f.env,f.user,input);assert.deepEqual(await f.state(),before);
 assert.equal((await processLimitedCraftStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)-1})).applied,0);
 assert.equal((await processLimitedCraftStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)})).applied,1);
 for(const row of await f.state()){
  const old=JSON.parse(before.find(r=>r.key===row.key).value),next=JSON.parse(row.value),target=codes.some(c=>row.key.endsWith(c));
  assert.deepEqual(next,{...old,revision:old.revision+(target?1:0),stockLimit:old.stockLimit+(target?10:0)});
 }
 assert.equal(await f.coin(),coin);assert((await scheduleLimitedCraftStock(f.env,f.user,input)).replayed);
 assert.equal((await processLimitedCraftStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)+1000})).applied,0);
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM admin_logs WHERE action_type='MERCENARY_CRAFT_STOCK_SCHEDULE_APPLY'").first()).n),1);
});
test('owner only; hidden recipes, wrong pool, duplicate targets, invalid quantity, past date and payload collision rejected',async t=>{
 const f=await fixture(t),input=request();await assert.rejects(scheduleLimitedCraftStock(f.env,{id:7,role:'ADMIN'},input),e=>e.status===403);
 for(const changes of [[{code:'V-988',quantity:10}],[{code:'V-950',quantity:10}],[{code:'V-999',quantity:0}],[{code:'V-999',quantity:7}],[{code:'V-999',quantity:10},{code:'V-999',quantity:10}]])await assert.rejects(scheduleLimitedCraftStock(f.env,f.user,{...input,changes}));
 await assert.rejects(scheduleLimitedCraftStock(f.env,f.user,{...input,executeAt:'2026-01-01T00:00:00.000Z'}));
 await scheduleLimitedCraftStock(f.env,f.user,input);await assert.rejects(scheduleLimitedCraftStock(f.env,f.user,{...input,reason:'변경된 예약 내용'}),e=>e.status===409);
});
test('late registration and application failures roll back all four updates and receipts; retry succeeds',async t=>{
 const f=await fixture(t,true),input=request(),before=await f.state();f.fail('INSERT INTO admin_logs');
 await assert.rejects(scheduleLimitedCraftStock(f.env,f.user,input),/INJECTED_FAILURE/);f.fail('');assert.equal((await readLimitedCraftStockSchedules(f.env)).raw,null);assert.deepEqual(await f.state(),before);
 await scheduleLimitedCraftStock(f.env,f.user,input);const queue=(await readLimitedCraftStockSchedules(f.env)).raw;f.fail('INSERT INTO admin_logs');
 await assert.rejects(processLimitedCraftStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)}),/INJECTED_FAILURE/);f.fail('');
 assert.deepEqual(await f.state(),before);assert.equal((await readLimitedCraftStockSchedules(f.env)).raw,queue);
 assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',CRAFT_STOCK_SCHEDULE_KEY+':applied:'+input.requestId).first(),null);
 assert.equal((await processLimitedCraftStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)})).applied,1);
});
test('concurrent delivery and lost acknowledgement cannot double the increment',async t=>{
 const f=await fixture(t),input=request(),batch=f.DB.batch.bind(f.DB);let lose=true;
 f.DB.batch=async list=>{const result=await batch(list);if(lose){lose=false;throw Error('LOST_ACK');}return result;};
 assert((await scheduleLimitedCraftStock(f.env,f.user,input)).replayed);lose=true;
 await processLimitedCraftStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)});
 const other=request();await Promise.all([scheduleLimitedCraftStock(f.env,f.user,other),scheduleLimitedCraftStock(f.env,f.user,other)]);
 const runs=await Promise.all([processLimitedCraftStockSchedules(f.env,{clock:()=>Date.parse(other.executeAt)}),processLimitedCraftStockSchedules(f.env,{clock:()=>Date.parse(other.executeAt)})]);
 assert.equal(runs.reduce((s,r)=>s+r.applied,0),1);
 for(const row of await f.state())if(codes.some(c=>row.key.endsWith(c)))assert.equal(JSON.parse(row.value).stockLimit,35);
});
test('uses latest CMS values at execution and retries concurrent edits without overwriting them',async t=>{
 const f=await fixture(t),input=request();await scheduleLimitedCraftStock(f.env,f.user,input);
 const key=LIMITED_SHARD_CRAFTS.find(d=>d.code==='V-999').key,batch=f.DB.batch.bind(f.DB);let edit=true;
 f.DB.batch=async list=>{if(edit){edit=false;const p=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',key).first()).value);await f.setting(key,{...p,revision:6,stockLimit:20,successRate:25,isActive:false});}return batch(list);};
 await processLimitedCraftStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)});
 const policy=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',key).first()).value);assert.equal(policy.stockLimit,30);assert.equal(policy.successRate,25);assert.equal(policy.isActive,false);assert.equal(policy.revision,7);
});
test('pending reservations and execution both enforce maximum cap',async t=>{
 const f=await fixture(t),input=request(),d=LIMITED_SHARD_CRAFTS.find(d=>d.code==='V-999'),p=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',d.key).first()).value);
 await f.setting(d.key,{...p,stockLimit:999990});await scheduleLimitedCraftStock(f.env,f.user,input);await assert.rejects(scheduleLimitedCraftStock(f.env,f.user,request()),e=>e.status===409);
 await f.setting(d.key,{...p,stockLimit:1000000});const before=await f.state();await assert.rejects(processLimitedCraftStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)}),e=>e.status===409);assert.deepEqual(await f.state(),before);
});
test('existing alarm selects 21:00 between pack deadlines; failure retains retry; no-pending path adds one query',async t=>{
 const f=await fixture(t),input=request(),at=Date.parse(input.executeAt);await scheduleLimitedCraftStock(f.env,f.user,input);
 const pack={version:1,revision:1,schedules:[{id:'existing-pack-later',status:'SCHEDULED',executeAt:new Date(at+3600000).toISOString(),changes:[{code:'V-950',quantity:20}]}]};
 await f.setting('mercenary_blackcrown_stock_schedule_v1',pack);
 const first=await processMercenaryPackStockSchedules(f.env,{clock:()=>at-1});assert.equal(first.nextAt,input.executeAt);
 let alarm;const storage={put:async()=>{},setAlarm:async n=>{alarm=n;},deleteAlarm:async()=>{alarm=null;}};
 await armMercenaryStockAlarm(storage,first.nextAt,{now:at-1000});assert.equal(alarm,at);
 await assert.rejects(handleMercenaryStockAlarm(storage,{}, {now:()=>at,run:async()=>{throw Error('DB outage');}}));assert.equal(alarm,at+60000);
 const done=await processMercenaryPackStockSchedules(f.env,{clock:()=>at});assert.equal(done.applied,1);assert.equal(done.nextAt,pack.schedules[0].executeAt);
 assert.deepEqual(JSON.parse((await f.p("SELECT value FROM app_meta WHERE key='mercenary_blackcrown_stock_schedule_v1'").first()).value),pack);
 let queries=0;const prepare=f.DB.prepare.bind(f.DB);f.DB.prepare=(...args)=>{queries++;return prepare(...args);};await processLimitedCraftStockSchedules(f.env);assert.equal(queries,1);
});

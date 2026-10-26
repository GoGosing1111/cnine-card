import test from 'node:test';
import assert from 'node:assert/strict';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {changeMercenaryStockSchedule,processMercenaryStockSchedules,readMercenaryStockSchedules} from '../functions/_mercenary_stock_schedule.js';
import {handleBloodmoonPack,saveBloodmoonPack} from '../functions/_mercenary_bloodmoon_pack.js';
import {BLOODMOON_PACK_KEY,BLOODMOON_PACK} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {STOCK_SCHEDULE_KEY,stockScheduleKstToIso} from '../shared/mercenary-stock-schedule-v1.mjs';
import {armMercenaryStockAlarm,handleMercenaryStockAlarm,runMercenaryStockSchedule} from '../workers/clan-draft/src/mercenary-stock-schedule.js';
const firstChanges=[960,961,962,963,964,965,978].map(n=>({code:'V-'+n,quantity:n===978?1:10}));
const body=(changes=firstChanges)=>({action:'SCHEDULE_STOCK',requestId:crypto.randomUUID(),executeAt:new Date(Math.floor(Date.now()/1000)*1000+3600000).toISOString(),changes,reason:'사용자 지정 한정 수량 예약'});
const raw=async f=>(await f.p('SELECT value FROM app_meta WHERE key=?',BLOODMOON_PACK_KEY).first()).value;
test('KST 26일 20:00 converts exactly; invalid calendar dates rejected',()=>{
 assert.equal(stockScheduleKstToIso('2026-10-26T20:00:00'),'2026-10-26T11:00:00.000Z');
 assert.throws(()=>stockScheduleKstToIso('2026-02-30T20:00'));assert.throws(()=>stockScheduleKstToIso('2026-10-26T24:00'));
});
test('registration preserves stock; boundary applies seven deltas exactly once and keeps issuance, prices and rates',async t=>{
 const f=await bloodmoonFixture(t),input=body(),before=await raw(f),wallet=await f.coin();
 await f.p("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code IN ('V-960','V-978')").run();
 const receipt=await changeMercenaryStockSchedule(f.env,f.user,input);assert.equal(receipt.schedule.status,'SCHEDULED');assert.equal(await raw(f),before);
 assert.equal((await processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)-1})).applied,0);
 assert.equal((await processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)})).applied,1);
 const state=await f.state();assert.equal(state.stock.find(s=>s.code==='V-960').limit,50);assert.equal(state.stock.find(s=>s.code==='V-960').issued,40);assert.equal(state.stock.find(s=>s.code==='V-978').limit,10);assert.equal(state.stock.find(s=>s.code==='V-978').issued,9);assert.equal(state.stock.find(s=>s.code==='V-974').limit,3);
 assert.deepEqual(state.settings.prices,f.settings.prices);assert.deepEqual(state.settings.cardRatesPpm,f.settings.cardRatesPpm);assert.equal(await f.coin(),wallet);
 const count=f.stats.batches;assert.equal((await changeMercenaryStockSchedule(f.env,f.user,input)).replayed,true);assert.equal((await processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)+1})).applied,0);assert.equal(f.stats.batches,count);
 assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM admin_logs WHERE action_type='MERCENARY_STOCK_SCHEDULE_APPLY'").first()).n),1);
});
test('owner-only routes; invalid and past requests; request ID conflicts; no direct stock edits',async t=>{
 const f=await bloodmoonFixture(t),input=body();
 await assert.rejects(()=>changeMercenaryStockSchedule(f.env,{id:1,role:'ADMIN'},input),e=>e.status===403);
 for(const changes of [[{code:'V-058',quantity:1}],[{code:'V-960',quantity:0}],[{code:'V-960',quantity:1.5}],[{code:'V-960',quantity:1},{code:'V-960',quantity:1}]])await assert.rejects(()=>changeMercenaryStockSchedule(f.env,f.user,body(changes)));
 await assert.rejects(()=>changeMercenaryStockSchedule(f.env,f.user,{...input,executeAt:'2026-01-01T00:00:00.000Z'}));
 await changeMercenaryStockSchedule(f.env,f.user,input);await assert.rejects(()=>changeMercenaryStockSchedule(f.env,f.user,{...input,reason:'다른 예약 내용'}),e=>e.status===409);
 const settings=structuredClone(f.settings);settings.stockLimits['V-960']++;
 await assert.rejects(()=>saveBloodmoonPack(f.env,f.user,{expectedRevision:1,requestId:crypto.randomUUID(),settings,reason:'한도 직접 수정 검사'}),/한정 수량 예약/);
 const result=await handleBloodmoonPack({path:BLOODMOON_PACK.adminPath,request:new Request('https://example.test'+BLOODMOON_PACK.adminPath,{method:'POST',body:JSON.stringify(input)}),env:f.env,deps:{requirePermission:async()=>({id:1,role:'ADMIN'}),json:(body,status)=>({body,status})}});assert.equal(result.status,403);
});
test('cancel survives retries and never applies; completed schedules cannot be cancelled',async t=>{
 const f=await bloodmoonFixture(t),input=body();await changeMercenaryStockSchedule(f.env,f.user,input);
 const cancel={action:'CANCEL_STOCK',requestId:crypto.randomUUID(),scheduleId:input.requestId,reason:'OWNER 예약 취소'};
 await changeMercenaryStockSchedule(f.env,f.user,cancel);assert((await changeMercenaryStockSchedule(f.env,f.user,cancel)).replayed);
 assert.equal((await processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)})).applied,0);
 await assert.rejects(()=>changeMercenaryStockSchedule(f.env,f.user,{...cancel,requestId:crypto.randomUUID()}),e=>e.status===409);
});
test('failure in middle rolls back stock, policy and receipt; retry then succeeds',async t=>{
 const f=await bloodmoonFixture(t),input=body();await changeMercenaryStockSchedule(f.env,f.user,input);const before=await raw(f),queue=(await readMercenaryStockSchedules(f.env)).raw;
 f.fail('INSERT INTO admin_logs');await assert.rejects(()=>processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)}),/INJECTED_FAILURE/);f.fail('');
 assert.equal(await raw(f),before);assert.equal((await readMercenaryStockSchedules(f.env)).raw,queue);assert.equal((await f.state()).stock.find(s=>s.code==='V-960').limit,40);
 assert.equal((await processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)})).applied,1);
});
test('lost acknowledgement and concurrent redelivery cannot duplicate increments',async t=>{
 const f=await bloodmoonFixture(t),input=body(),batch=f.DB.batch.bind(f.DB);let lose=true;f.DB.batch=async list=>{const result=await batch(list);if(lose&&list.some(s=>s.source.startsWith('UPDATE app_meta'))){lose=false;throw Error('LOST_COMMIT_ACK');}return result;};assert((await changeMercenaryStockSchedule(f.env,f.user,input)).replayed);
 lose=true;await processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(input.executeAt)});
 await Promise.all([processMercenaryStockSchedules(f.env),processMercenaryStockSchedules(f.env)]);
 assert.equal((await f.state()).stock.find(s=>s.code==='V-960').limit,50);
 const second=body([{code:'V-960',quantity:3}]);await changeMercenaryStockSchedule(f.env,f.user,second);const results=await Promise.all([processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(second.executeAt)}),processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(second.executeAt)})]);assert.equal(results.reduce((sum,r)=>sum+r.applied,0),1);assert.equal((await f.state()).stock.find(s=>s.code==='V-960').limit,53);
});
test('successive reservations add to current limits; serial continuation and stale save are guarded',async t=>{
 const f=await bloodmoonFixture(t),a=body([{code:'V-960',quantity:10}]),b=body([{code:'V-960',quantity:2}]);await changeMercenaryStockSchedule(f.env,f.user,a);await changeMercenaryStockSchedule(f.env,f.user,b);
 await f.p("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code='V-960'").run();await processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(a.executeAt)});
 const state=await f.state();assert.equal(state.stock.find(s=>s.code==='V-960').limit,52);
 const receipt=await f.service.open(f.env,f.user,{...f.body(),expectedRevision:state.revision});assert.equal(receipt.draws[0].serial,41);
 await assert.rejects(()=>saveBloodmoonPack(f.env,f.user,{expectedRevision:1,settings:f.settings,requestId:crypto.randomUUID(),reason:'오래된 설정 저장'}),e=>e.status===409);
});
test('public feature hides owner history, exposes server clock and pending time',async t=>{
 const f=await bloodmoonFixture(t);await changeMercenaryStockSchedule(f.env,f.user,body());const response=await handleBloodmoonPack({path:BLOODMOON_PACK.featurePath,request:new Request('https://example.test'),env:f.env,deps:{json:body=>body}});
 assert.equal(response.stockScheduleHistory,undefined);assert(response.serverNow);assert.equal(response.stockSchedules.length,1);assert.equal(response.stockSchedules[0].reason,undefined);
});
test('durable alarm uses exact deadline and closes DB; failed processing retains retry',async()=>{
 let alarm=null,marker=false,closed=false;const storage={put:async()=>{marker=true;},getAlarm:async()=>alarm,setAlarm:async n=>{alarm=n;},deleteAlarm:async()=>{alarm=null;}};
 const at='2026-10-26T11:00:00.000Z';await armMercenaryStockAlarm(storage,at,{now:Date.parse(at)-60000});assert.equal(alarm,Date.parse(at));assert(marker);
 await assert.rejects(()=>handleMercenaryStockAlarm(storage,{}, {now:()=>1000,run:async()=>{throw Error('DB outage');}}));assert.equal(alarm,61000);
 await handleMercenaryStockAlarm(storage,{}, {run:async()=>({applied:1,nextAt:null})});assert.equal(alarm,null);
 await runMercenaryStockSchedule({}, {openDatabase:async()=>({db:{},close:async()=>{closed=true;}}),process:async()=>({applied:0,nextAt:at})});assert(closed);
});

test('delivery keeps scheduler source in Git/Worker and includes the actual CMS assets',async()=>{
 const {isProductionFile}=await import('../scripts/prepare-production-assets.mjs');
 for(const name of ['mercenary-stock-schedule','ranked-reopen','city-rotation','organization-schedule'])assert.equal(isProductionFile('workers/clan-draft/src/'+name+'.js'),false);
 for(const file of ['admin/mercenary-stock-schedule-v1.mjs','admin/mercenary-stock-schedule-v1.css','shared/mercenary-stock-schedule-v1.mjs'])assert.equal(isProductionFile(file),true);
});

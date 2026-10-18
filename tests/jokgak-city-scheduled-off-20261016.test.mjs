import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {saveCityOffSchedule,readCityOffSchedule,processCityScheduledOff} from '../functions/_jokgak_city_scheduled_off.js';
import {handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {cityRoundRewardPolicyKey,cityRoundRewardReceiptKey} from '../functions/_jokgak_city_round_rewards.js';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {parseSeoulDateTimeInput,seoulDateTimeInput,CITY_OFF_SCHEDULE_KEY} from '../shared/jokgak-city-schedule-off-v1.mjs';
import {runCityRotationSchedule} from '../workers/clan-draft/src/city-rotation.js';
const OWNER={id:1,role:'OWNER'},NOON=Date.parse('2026-10-16T03:00:00Z');
const packet=(offAt=NOON,revision=0)=>({offAt,revision,requestId:crypto.randomUUID()});
const count=async(f,table)=>Number((await f.p('SELECT COUNT(*) n FROM '+table).first()).n);
test('KST date input has noon/midnight semantics independent of browser timezone and rejects normalized dates',()=>{
 assert.equal(parseSeoulDateTimeInput('2026-10-16T12:00'),NOON);assert.equal(seoulDateTimeInput(NOON),'2026-10-16T12:00');
 assert.equal(parseSeoulDateTimeInput('2026-10-16T00:00'),NOON-12*3600000);
 for(const date of ['','2026-02-30T12:00','2026-10-16T24:00','2026-10-16T12:00Z'])assert.throws(()=>parseSeoulDateTimeInput(date));
});
for(const pg of [false,true]){
 const name=pg?'Postgres':'SQLite';
 test(name+': OWNER route, future date, separate revision, lost response replay, replace and cancel',async t=>{
  const f=await cityFixture(t,pg);f.setTime(NOON-3600000);const body=packet(),before=(await readCitySettings(f.env)).raw;
  const route=async(user,method,body)=>handleJokgakCity({path:'admin/jokgak-city/schedule-off',env:f.env,deps:{...f.deps,authenticate:async()=>user,json:(data,status=200)=>Response.json(data,{status})},request:new Request('https://test/api/admin/jokgak-city/schedule-off',{method,...(body?{body:JSON.stringify(body),headers:{'content-type':'application/json',origin:'https://test'}}:{})})});
  assert.equal((await route(null,'GET')).status,401);assert.equal((await route({id:1,role:'ADMIN'},'PATCH',body)).status,403);
  assert.equal((await route(OWNER,'PATCH',packet(f.now))).status,400);assert.equal((await route(OWNER,'GET')).status,200);
  f.lost();const saved=await saveCityOffSchedule(f.env,OWNER,body,f.now);assert.equal(saved.replayed,true);assert.equal(saved.pending.offAt,NOON);
  assert.equal((await readCitySettings(f.env)).raw,before);assert.equal(await count(f,'admin_logs'),1);
  assert.equal((await saveCityOffSchedule(f.env,OWNER,body,NOON+1000)).replayed,true);
  await assert.rejects(saveCityOffSchedule(f.env,OWNER,{...body,offAt:NOON+1},f.now),{status:409});
  await assert.rejects(saveCityOffSchedule(f.env,OWNER,packet(NOON+1),f.now),{status:409});
  f.fail('INSERT INTO admin_logs');await assert.rejects(saveCityOffSchedule(f.env,OWNER,packet(null,1),f.now),/INJECTED/);f.fail('');assert.equal((await readCityOffSchedule(f.env)).state.pending.offAt,NOON);
  const changed=await saveCityOffSchedule(f.env,OWNER,packet(NOON+60000,1),f.now);assert.equal(changed.revision,2);
  const cancelled=await route(OWNER,'PATCH',packet(null,2));assert.equal(cancelled.status,200);assert.equal((await cancelled.json()).pending,null);
  assert.equal((await processCityScheduledOff(f.env,NOON+120000)).status,'NONE');assert.equal((await readCitySettings(f.env)).raw,before);
 });
 test(name+': due close settles reward messages once, retries failed audit, and preserves later manual reopen',async t=>{
  const f=await cityFixture(t,pg);f.setTime(NOON-3600000);
  const policy=(await readCitySettings(f.env)).policy;policy.roundRewards.top5.enabled=true;policy.roundRewards.top5.ranks[0].coin=500000000000;
  await saveCitySettings(f.env,OWNER,policy,f.now);await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(policy.roundRewards),cityRoundRewardPolicyKey(cityShift(f.now).id)).run();await f.join(1);
  await saveCityOffSchedule(f.env,OWNER,packet(),f.now);assert.equal((await processCityScheduledOff(f.env,NOON-1)).status,'NOT_DUE');assert.equal(await count(f,'user_messages'),0);
  f.fail('INSERT INTO admin_logs');await assert.rejects(processCityScheduledOff(f.env,NOON),/INJECTED/);f.fail('');
  assert.equal((await readCitySettings(f.env)).policy.mode,'ON');assert.equal(await count(f,'user_messages'),1);assert.ok((await readCityOffSchedule(f.env)).state.pending);
  f.lost();const done=await processCityScheduledOff(f.env,NOON+1000);assert.equal(done.outcome,'TURNED_OFF');assert.equal(done.replayed,true);assert.equal(await count(f,'user_messages'),1);
  const after=(await readCitySettings(f.env)).policy;assert.equal(after.mode,'OFF');assert.deepEqual(after.roundRewards,policy.roundRewards);assert.deepEqual(after.roles,policy.roles);assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),123456);
  const round=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityRoundRewardReceiptKey(cityShift(f.now).id)).first()).value);assert.equal(round.delivery,'MESSAGE');
  const state=(await readCityOffSchedule(f.env)).state;assert.equal(state.pending,null);assert.equal(state.lastRun.id,done.id);assert.equal(state.revision,2);
  after.mode='ON';await saveCitySettings(f.env,OWNER,after,NOON+2000);assert.equal((await processCityScheduledOff(f.env,NOON+3000)).status,'NONE');assert.equal((await readCitySettings(f.env)).policy.mode,'ON');
 });
 test(name+': cancellation during settlement wins, already OFF does not pay, and a due request closes access',async t=>{
  const f=await cityFixture(t,pg);f.setTime(NOON-3600000);await saveCityOffSchedule(f.env,OWNER,packet(),f.now);
  const result=await processCityScheduledOff(f.env,NOON,{settle:async()=>saveCityOffSchedule(f.env,OWNER,packet(null,1),f.now)});assert.equal(result.status,'SCHEDULE_CHANGED');assert.equal((await readCitySettings(f.env)).policy.mode,'ON');
  await saveCityOffSchedule(f.env,OWNER,packet(NOON,2),f.now);f.setTime(NOON);await assert.rejects(f.action(2,'join'),{code:'CITY_CLOSED'});assert.equal((await readCitySettings(f.env)).policy.mode,'OFF');assert.equal((await readCityOffSchedule(f.env)).state.lastRun.status,'COMPLETED');
  await saveCityOffSchedule(f.env,OWNER,packet(NOON+60000,4),NOON);const off=await processCityScheduledOff(f.env,NOON+60000,{settle:async()=>assert.fail('OFF cannot award rewards')});assert.equal(off.outcome,'ALREADY_OFF');assert.equal(await count(f,'user_messages'),0);
 });
 test(name+': crossing a mid-round deadline rolls back action and receipt, with no early round payout',async t=>{
  const f=await cityFixture(t,pg);f.setTime(NOON-3600000);await saveCityOffSchedule(f.env,OWNER,packet(f.now+1000),f.now);
  const original=f.deps.pvpDeckSnapshot;f.deps.pvpDeckSnapshot=async(...a)=>{f.advance(1001);return original(...a);};
  await assert.rejects(f.action(2,'join'),{code:'CITY_CONFLICT'});assert.equal(await count(f,'jokgak_city_players_v1'),0);assert.equal(await count(f,'jokgak_city_actions_v1'),0);
  assert.equal((await processCityScheduledOff(f.env,f.now)).outcome,'TURNED_OFF');assert.equal(await count(f,'user_messages'),0);
 });
}
test('minute scheduler runs pending OFF before ordinary round settlement and always closes its connection',async()=>{
 const order=[];const openDatabase=async()=>({db:{},close:async()=>order.push('close')});
 await runCityRotationSchedule({},{openDatabase,now:NOON,scheduledOff:async(_e,now)=>{assert.equal(now,NOON);order.push('off');},settle:async()=>order.push('round'),supply:async()=>order.push('supply'),discharge:async()=>order.push('hospital')});
 assert.deepEqual(order,['off','round','supply','hospital','close']);order.length=0;
 await assert.rejects(runCityRotationSchedule({},{openDatabase,scheduledOff:async()=>{throw Error('settlement pending');},settle:async()=>assert.fail()}),/settlement pending/);assert.deepEqual(order,['close']);
});

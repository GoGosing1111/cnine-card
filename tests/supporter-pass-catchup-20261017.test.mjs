import test from 'node:test';
import assert from 'node:assert/strict';
import {passFixture} from './helpers/supporter-pass-fixture.mjs';
import {claimKey,dailyKey} from '../shared/supporter-season-pass-v1.mjs';

const at=(f,date)=>{f.clock.now=Date.parse(date+'T13:00:00+09:00');};
const body=async f=>({...((await f.pass()).claimAll),requestId:crypto.randomUUID()});
const batch=(f,request)=>f.call('server-support/pass/claim-all',{user:2,body:request});
const quantity=async(f,code)=>(Number((await f.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',code))?.quantity||0));

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: 후원 패스 누적 일괄 수령`,async t=>{
  const make=async()=>{const f=await passFixture({postgres});t.after(()=>f.close());return f;};
  await t.test('늦은 개방은 적용일부터 8일 소급, 영수증 재시도와 미래 날짜 차단',async()=>{
    const f=await make();await f.grant();at(f,'2026-10-17');await f.save();
    const state=await f.pass();assert.equal(state.currentDay,8);assert.equal(state.claimableCount,8);
    assert.equal(state.days[0].status,'AVAILABLE');assert.equal(state.days[8].status,'UPCOMING');
    const request=await body(f);assert.equal((await batch(f,{...request,throughDay:request.throughDay+1})).status,409);
    const result=await batch(f,request);assert.equal(result.status,200,JSON.stringify(result.body));
    assert.equal(result.body.dayCount,8);assert.equal(result.body.remainingCount,0);assert.equal(await quantity(f,'VEHICLE_PART_FRAME'),24);
    assert.equal((await batch(f,request)).body.replayed,true);assert.equal(await quantity(f,'VEHICLE_PART_FRAME'),24);
    assert.equal((await batch(f,{...request,throughDay:request.throughDay-1})).status,409);
    assert.equal((await f.pass()).claimableCount,0);assert.equal((await f.pass()).claimedCount,8);
    assert.equal((await f.all("SELECT key FROM app_meta WHERE key LIKE 'supporter_pass_daily_v1:2:%'")).length,8);
    at(f,'2026-10-18');assert.equal((await f.pass()).claimableCount,1);assert.equal((await batch(f,await body(f))).body.dayCount,1);
  });
  await t.test('기존 수령분과 당시 보상 보존, 지난 날짜 개별 수령과 일괄 수령 병행',async()=>{
    const f=await make();await f.save(f.document([{code:'COIN:',quantity:10}]));await f.grant();
    const old=(await f.claim()).body;await f.save(f.document([{code:'COIN:',quantity:20}]));at(f,'2026-10-12');await f.claim();
    const state=await f.pass();assert.equal((await f.claim({cycle:state.cycle,day:2,expectedRevision:state.revision})).status,200);
    at(f,'2026-10-17');assert.equal((await f.pass()).claimableCount,5);
    const result=await batch(f,await body(f));assert.equal(result.status,200);assert.equal(result.body.dayCount,5);
    assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),1234+150);
    assert.deepEqual((await f.claim({cycle:old.cycle,day:old.day,expectedRevision:0})).body.rewards,old.rewards);
    assert.equal((await f.pass()).days[0].rewards[0].quantity,10);
  });
  await t.test('일괄 수령도 보상표 변경·OFF·후원 중지를 거래 시점에 확인',async()=>{
    const f=await make();await f.save();await f.grant();at(f,'2026-10-12');
    const stale=await body(f);await f.save(f.document([{code:'COIN:',quantity:100}]));
    assert.equal((await batch(f,stale)).status,409);
    await f.save({...f.document(),enabled:false});assert.equal((await batch(f,await body(f))).status,409);
    await f.save();const request=await body(f),original=f.DB.batch.bind(f.DB);let stopped=false;
    f.DB.batch=async statements=>{if(!stopped){stopped=true;assert.equal((await f.grant(2,'REVOKE')).status,200);}return original(statements);};
    try{assert.notEqual((await batch(f,request)).status,200);}finally{f.DB.batch=original;}
    assert.equal(await quantity(f,'VEHICLE_PART_FRAME'),0);
    assert.equal((await f.all("SELECT key FROM app_meta WHERE key LIKE 'supporter_pass_%:2:%'")).length,0);
  });
  await t.test('합산 보상·날짜 원장·일괄 영수증은 실패 시 함께 롤백',async()=>{
    const f=await make();await f.save(f.document([{code:'COIN:',quantity:3000},{code:'INVENTORY_ITEM:MASTER_STAR',quantity:43},{code:'EQUIPMENT:1',quantity:2},{code:'VEHICLE:1',quantity:1}]));await f.grant();at(f,'2026-10-12');
    const request=await body(f);f.fail('INSERT INTO inventory_logs');assert.equal((await batch(f,request)).status,503);f.fail('');
    assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),1234);assert.equal(await quantity(f,'MASTER_STAR'),0);
    assert.equal((await f.all("SELECT key FROM app_meta WHERE key LIKE 'supporter_pass_%:2:%'")).length,0);
    const result=await batch(f,request);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.dayCount,3);
    assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),10234);assert.equal(await quantity(f,'MASTER_STAR'),129);
    assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=2')).n),6);
    assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_garage_vehicles WHERE user_id=2')).n),1);
    for(const day of result.body.days){assert.ok(await f.one('SELECT value FROM app_meta WHERE key=?',claimKey(2,day.cycle,day.day)));assert.ok(await f.one('SELECT value FROM app_meta WHERE key=?',dailyKey(2,day.date)));}
  });
  await t.test('다른 창의 겹치는 일괄 요청은 한 번만 지급',async()=>{
    const f=await make();await f.save();await f.grant();at(f,'2026-10-12');
    const request=await body(f),other={...request,requestId:crypto.randomUUID()},original=f.DB.batch.bind(f.DB);let raced=false;
    f.DB.batch=async statements=>{if(!raced){raced=true;assert.equal((await batch(f,other)).status,200);}return original(statements);};
    try{assert.equal((await batch(f,request)).status,409);}finally{f.DB.batch=original;}
    assert.equal(await quantity(f,'VEHICLE_PART_FRAME'),9);assert.equal((await f.pass()).claimableCount,0);
    assert.equal(Number((await f.one('SELECT COUNT(*) n FROM joint_atomic_guards_v1')).n),0);
  });
  await t.test('연장 후에도 이전 30일 미수령 유지, 미래 유료 날짜 미지급',async()=>{
    const f=await make();await f.save();await f.grant();await f.grant();at(f,'2026-11-12');
    const state=await f.pass();assert.equal(state.currentDay,4);assert.equal(state.claimableCount,34);
    const first=await batch(f,await body(f));assert.equal(first.status,200);assert.equal(first.body.dayCount,30);assert.equal(first.body.remainingCount,4);
    const second=await batch(f,await body(f));assert.equal(second.body.dayCount,4);assert.equal(second.body.remainingCount,0);
    assert.equal(await quantity(f,'VEHICLE_PART_FRAME'),102);assert.equal((await f.pass()).claimedCount,4);
    at(f,'2026-12-10');assert.equal((await batch(f,await body(f))).status,403);
  });
  await t.test('정확한 30일 한도·재등록 날짜 중복 방지·장비가 많은 일괄 분할',async()=>{
    const f=await make();await f.save();await f.grant();f.clock.now=Date.parse('2026-11-09T00:00:00+09:00');
    assert.equal((await f.pass()).currentDay,31);assert.equal((await f.pass()).claimableCount,30);
    assert.equal((await batch(f,await body(f))).body.dayCount,30);assert.equal(await quantity(f,'VEHICLE_PART_FRAME'),90);
    const g=await make();await g.save();await g.grant();await batch(g,await body(g));await g.grant(2,'REVOKE');g.clock.now+=1000;await g.grant();
    assert.equal((await g.pass()).claimableCount,0);assert.equal((await g.pass()).days[0].status,'DAILY_LIMIT');
    const h=await make();await h.save(h.document([{code:'EQUIPMENT:1',quantity:20}]));await h.grant();at(h,'2026-10-13');
    const one=await batch(h,await body(h));assert.equal(one.body.dayCount,2);assert.equal(one.body.remainingCount,2);
    const two=await batch(h,await body(h));assert.equal(two.body.dayCount,2);assert.equal(two.body.remainingCount,0);
    assert.equal(Number((await h.one('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=2')).n),80);
  });
});

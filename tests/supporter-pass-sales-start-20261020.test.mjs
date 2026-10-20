import test from 'node:test';
import assert from 'node:assert/strict';
import {passFixture} from './helpers/supporter-pass-fixture.mjs';
import {PASS_KEY,claimKey,dailyKey,salesDailyKey} from '../shared/supporter-season-pass-v1.mjs';

const sale=Date.parse('2026-10-10T13:00:00+09:00');
const at=(f,date)=>{f.clock.now=Date.parse(date+'T13:00:00+09:00');};
async function anchor(f){
  const row=await f.one('SELECT value FROM app_meta WHERE key=?',PASS_KEY),state=JSON.parse(row.value);
  await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...state,revision:state.revision+1,salesStartsAt:sale}),PASS_KEY);
}
const body=async f=>({...((await f.pass()).claimAll),requestId:crypto.randomUUID()});
const batch=(f,request)=>f.call('server-support/pass/claim-all',{user:2,body:request});
const coins=async f=>Number((await f.one('SELECT coin FROM users WHERE id=2')).coin);

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: 판매 시작일 기준 후발 구매자 패스`,async t=>{
  const make=async()=>{const f=await passFixture({postgres});t.after(()=>f.close());return f;};
  await t.test('늦게 구매해도 판매일~오늘 보상 전부 열리고 미래/중복은 차단',async()=>{
    const f=await make();await f.save(f.document([{code:'COIN:',quantity:100}]));await anchor(f);
    at(f,'2026-10-17');assert.equal((await f.pass()).claimableCount,0);await f.grant();
    const state=await f.pass();assert.equal(state.currentDay,8);assert.equal(state.claimableCount,8);
    assert.equal(state.startDate,'2026-10-10');assert.equal(state.salesStartDate,'2026-10-10');
    assert.equal(state.days[0].status,'AVAILABLE');assert.equal(state.days[8].status,'UPCOMING');
    const request=await body(f);assert.equal(request.startsAt,sale);
    assert.equal((await batch(f,{...request,throughDay:request.throughDay+1})).status,409);
    const result=await batch(f,request);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.dayCount,8);
    assert.equal(await coins(f),2034);assert.equal((await batch(f,request)).body.replayed,true);assert.equal(await coins(f),2034);
    for(const r of result.body.days)assert.ok(await f.one('SELECT value FROM app_meta WHERE key=?',salesDailyKey(2,sale,r.date)));
    assert.equal((await f.pass()).claimableCount,0);
  });
  await t.test('기존 구매일 달력 영수증은 일차로 보존하고 실제 수령 날짜로 다른 보상을 막지 않는다',async()=>{
    const f=await make(),doc=f.document([{code:'COIN:',quantity:100}]);
    doc.days.forEach(d=>{d.rewards[0].quantity=d.day*100;});await f.save(doc);
    at(f,'2026-10-15');await f.grant();const old=(await f.claim()).body;
    const oldKey=claimKey(2,old.cycle,1),oldRaw=(await f.one('SELECT value FROM app_meta WHERE key=?',oldKey)).value;
    assert.ok(await f.one('SELECT value FROM app_meta WHERE key=?',dailyKey(2,'2026-10-15')));
    await anchor(f);at(f,'2026-10-17');
    const state=await f.pass();assert.equal(state.claimableCount,7);assert.equal(state.days[0].status,'CLAIMED');
    assert.equal(state.days[5].status,'AVAILABLE');assert.equal(state.days[0].rewards[0].quantity,100);
    assert.equal((await f.claim({cycle:state.cycle,day:1,expectedRevision:state.revision})).body.replayed,true);
    assert.equal((await f.claim({cycle:old.cycle,day:1,expectedRevision:0})).body.replayed,true);
    const result=await batch(f,await body(f));assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.dayCount,7);
    assert.equal(await coins(f),1234+3600);
    assert.equal((await f.one('SELECT value FROM app_meta WHERE key=?',oldKey)).value,oldRaw);
    assert.equal((await f.pass()).claimedCount,8);
  });
  await t.test('CMS 저장은 판매일을 보존하고 기존 창의 미확정 개인달력 요청은 지급하지 않는다',async()=>{
    const f=await make();await f.save();at(f,'2026-10-15');await f.grant();const stale=await body(f),personal=await f.pass();
    await anchor(f);await f.save(f.document([{code:'COIN:',quantity:50}]));
    assert.equal((await f.pass()).salesStartsAt,sale);
    assert.equal((await batch(f,stale)).status,409);
    assert.equal((await f.claim({cycle:personal.cycle,day:1,expectedRevision:(await f.pass()).revision})).status,409);
    assert.equal(await coins(f),1234);
  });
  await t.test('구매 후 유료 기간은 줄이지 않고 30일 표를 이어가며 마지막 부분 날짜는 추가 지급하지 않는다',async()=>{
    const f=await make();await f.save(f.document([{code:'COIN:',quantity:1}]));await anchor(f);at(f,'2026-10-17');await f.grant();
    at(f,'2026-11-15');const state=await f.pass();assert.equal(state.currentDay,7);assert.equal(state.claimableCount,37);
    const first=await batch(f,await body(f));assert.equal(first.body.dayCount,30);assert.equal(first.body.remainingCount,7);
    const second=await batch(f,await body(f));assert.equal(second.body.dayCount,7);assert.equal(await coins(f),1271);
    f.clock.now=Date.parse('2026-11-16T12:59:59+09:00');assert.equal((await f.pass()).claimableCount,0);
    f.clock.now+=1000;assert.equal((await batch(f,{...state.claimAll,requestId:crypto.randomUUID()})).status,403);
  });
  await t.test('중지·재등록에도 공통 달력 기수령분은 제외',async()=>{
    const f=await make();await f.save(f.document([{code:'COIN:',quantity:10}]));await anchor(f);at(f,'2026-10-15');await f.grant();
    await batch(f,await body(f));assert.equal(await coins(f),1294);
    await f.grant(2,'REVOKE');assert.equal((await f.pass()).claimableCount,0);
    assert.equal((await batch(f,await body(f))).status,403);
    at(f,'2026-10-17');await f.grant();assert.equal((await f.pass()).claimableCount,2);
    assert.equal((await batch(f,await body(f))).body.dayCount,2);assert.equal(await coins(f),1314);
  });
  await t.test('동시 일괄·단건 지급 경쟁, 보상 실패 롤백, 설정 변경을 원자적으로 처리',async()=>{
    const f=await make();await f.save(f.document([{code:'COIN:',quantity:100},{code:'INVENTORY_ITEM:MASTER_STAR',quantity:1}]));await anchor(f);at(f,'2026-10-17');await f.grant();
    const request=await body(f);f.fail('INSERT INTO inventory_logs');assert.equal((await batch(f,request)).status,503);f.fail('');
    assert.equal(await coins(f),1234);assert.equal((await f.pass()).claimableCount,8);
    const original=f.DB.batch.bind(f.DB);let raced=false;
    f.DB.batch=async statements=>{if(!raced){raced=true;const state=await f.pass();assert.equal((await f.claim({cycle:state.cycle,day:1,expectedRevision:state.revision})).status,200);}return original(statements);};
    try{assert.equal((await batch(f,request)).status,409);}finally{f.DB.batch=original;}
    assert.equal(await coins(f),1334);assert.equal((await batch(f,await body(f))).body.dayCount,7);assert.equal(await coins(f),2034);
    at(f,'2026-10-18');const changed=await body(f);await f.save({...f.document(),enabled:false});
    assert.equal((await batch(f,changed)).status,409);assert.equal(await coins(f),2034);
  });
});

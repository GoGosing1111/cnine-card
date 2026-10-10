import test from 'node:test';
import assert from 'node:assert/strict';
import {passFixture} from './helpers/supporter-pass-fixture.mjs';
import {PASS_KEY,claimKey,dailyKey,passCycle} from '../shared/supporter-season-pass-v1.mjs';
import {supportBenefits} from '../shared/server-support-v1.mjs';
const DAY=86400000;

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: 시즌패스 실제 API · 보상 거래`,async t=>{
  const f=await passFixture({postgres});t.after(()=>f.close());
  await t.test('30일 초기 달력과 전용 CMS 권한, 원본 카탈로그·제한·수량 검증',async()=>{
    const initial=await f.pass();assert.equal(initial.days.length,30);assert.equal(initial.enabled,false);assert.ok(initial.days.every(d=>d.status==='CLOSED'));
    for(const user of [2,3,4,5,6])assert.equal((await f.call('admin/server-support/pass',{user})).status,403);
    const cat=(await f.call('admin/server-support/pass')).body.catalog;
    assert.ok(cat.some(x=>x.code==='INVENTORY_ITEM:MASTER_STAR'));assert.ok(cat.some(x=>x.type==='EQUIPMENT'));assert.ok(cat.some(x=>x.type==='VEHICLE'));assert.ok(cat.some(x=>x.type==='CARD'));
    assert.equal(cat.find(x=>x.ref==='EQUIPMENT_PROTECTION_TICKET').available,false);assert.equal(cat.find(x=>x.ref==='PREMIUM_CUBE').available,false);assert.ok(!cat.some(x=>x.ref==='OFF_ITEM'));
    for(const rewards of [[{code:'COIN:',quantity:0}],[{code:'COIN:',quantity:-1}],[{code:'COIN:',quantity:1.5}],[{code:'NO_ITEM',quantity:1}],[{code:'VEHICLE:1',quantity:2}],[{code:'INVENTORY_ITEM:EQUIPMENT_PROTECTION_TICKET',quantity:1}],[{code:'COIN:',quantity:1},{code:'COIN:',quantity:2}]])assert.equal((await f.save(f.document(rewards))).status,400);
    const incomplete=f.document();incomplete.days[29].rewards=[];assert.equal((await f.save(incomplete)).status,400);
    const huge=f.document();huge.days[0].rewards[0].name='위조 이름';assert.equal((await f.save(huge)).status,400);
    const response=await f.save();assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.config.days[0].rewards[0].name,'강화 차체 프레임');
    assert.equal((await f.claim({cycle:'0-0',day:1,expectedRevision:1})).status,403);
    assert.equal((await f.call('server-support/pass/claim',{user:2,body:{cycle:'0-0',day:1,expectedRevision:1,userId:1}})).status,400);
    assert.equal((await f.call('server-support/pass/claim',{user:2,origin:'https://evil.test',body:{cycle:'0-0',day:1,expectedRevision:1}})).status,403);
  });
  await t.test('운영 설정 감사 실패는 전체 롤백, 재시도·구버전 충돌',async()=>{
    const state=(await f.call('admin/server-support/pass')).body.config,body={document:f.document(),expectedRevision:state.revision,requestId:crypto.randomUUID()};
    f.fail('INSERT INTO admin_logs');assert.equal((await f.call('admin/server-support/pass',{body})).status,503);f.fail('');
    assert.equal((await f.call('admin/server-support/pass')).body.config.revision,state.revision);
    assert.equal((await f.call('admin/server-support/pass',{body})).status,200);assert.equal((await f.call('admin/server-support/pass',{body})).body.replayed,true);
    assert.equal((await f.call('admin/server-support/pass',{body:{...body,requestId:crypto.randomUUID()}})).status,409);
  });
  await t.test('코인·조각·결정·아이템·장비·이동수단·카드의 실제 수량과 영수증',async()=>{
    const rewards=[{code:'COIN:',quantity:10000000000},{code:'CARD_SHARDS:',quantity:41},{code:'MAGIC_CRYSTAL:',quantity:42},{code:'INVENTORY_ITEM:MASTER_STAR',quantity:43},{code:'INVENTORY_ITEM:VEHICLE_PART_FRAME',quantity:44},{code:'EQUIPMENT:1',quantity:2},{code:'VEHICLE:1',quantity:1},{code:'CARD:CN-TEST',quantity:3}];
    assert.equal((await f.save(f.document(rewards))).status,200);assert.equal((await f.grant()).status,200);
    const before=await f.pass();assert.equal(before.currentDay,1);assert.equal(before.days[0].status,'AVAILABLE');assert.equal(before.days[1].status,'UPCOMING');
    const body={cycle:before.cycle,day:1,expectedRevision:before.revision};
    assert.equal((await f.claim({...body,day:2})).status,409);assert.equal((await f.claim({...body,expectedRevision:0})).status,409);
    // A second request commits after the first has planned its grant but before its batch.
    const original=f.DB.batch.bind(f.DB);let raced=false;
    f.DB.batch=async statements=>{if(!raced){raced=true;assert.equal((await f.claim(body)).status,200);}return original(statements);};
    let result;try{result=await f.claim(body);}finally{f.DB.batch=original;}
    assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.replayed,true);assert.equal(result.body.rewards.length,8);
    const account=await f.one('SELECT * FROM users WHERE id=2');assert.equal(Number(account.coin),10000001234);assert.equal(Number(account.card_shards),41);assert.equal(Number(account.magic_crystals),42);
    assert.equal(Number((await f.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='MASTER_STAR'")).quantity),43);
    assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=2')).n),2);assert.equal(Number((await f.one('SELECT quantity FROM user_cards WHERE user_id=2')).quantity),3);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_garage_vehicles WHERE user_id=2')).n),1);
    assert.equal((await f.claim(body)).body.replayed,true);assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),10000001234);assert.equal((await f.pass()).days[0].status,'CLAIMED');
    const subscription=(await f.call('server-support/info',{user:2})).body.subscription;
    assert.equal((await f.call('server-support/pet',{user:2,body:{petCode:f.pets[0].code,expectedRevision:subscription.revision,requestId:crypto.randomUUID()}})).status,200);
    assert.equal((await f.pass()).days[0].status,'CLAIMED');assert.equal((await f.pass()).cycle,before.cycle);
    f.receiptBody=body;
  });
  await t.test('KST 자정 변경·지난 보상 차단·설정 변경 후에도 이전 수령 내역 보존',async()=>{
    f.clock.now=Date.parse('2026-10-11T00:00:00+09:00');assert.equal((await f.pass()).currentDay,2);
    f.clock.now=Date.parse('2026-10-12T00:00:00+09:00');const state=await f.pass();assert.equal(state.days[1].status,'MISSED');assert.equal(state.days[2].status,'AVAILABLE');
    assert.equal((await f.claim({cycle:state.cycle,day:2,expectedRevision:state.revision})).status,409);
    assert.equal((await f.save()).status,200);assert.equal((await f.pass()).days[0].rewards.length,8);assert.equal((await f.pass()).days[2].rewards.length,1);
    const off=f.document();off.enabled=false;assert.equal((await f.save(off)).status,200);assert.equal((await f.claim()).status,409);assert.equal((await f.save()).status,200);
  });
  await t.test('지급 중 실패와 아이템 비활성 경쟁은 보상·당일 수령 기록 전체 롤백',async()=>{
    const state=await f.pass(),body={cycle:state.cycle,day:3,expectedRevision:state.revision};
    const before=Number((await f.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='VEHICLE_PART_FRAME'")).quantity);
    f.fail('INSERT INTO inventory_logs');assert.equal((await f.claim(body)).status,503);f.fail('');
    assert.equal(await f.one('SELECT value FROM app_meta WHERE key=?',claimKey(2,body.cycle,3)),null);assert.equal(await f.one('SELECT value FROM app_meta WHERE key=?',dailyKey(2,'2026-10-12')),null);
    assert.equal(Number((await f.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='VEHICLE_PART_FRAME'")).quantity),before);
    const original=f.DB.batch.bind(f.DB);let injected=false;f.DB.batch=async statements=>{if(!injected){injected=true;await f.run("UPDATE inventory_items SET is_active=0 WHERE code='VEHICLE_PART_FRAME'");}return original(statements);};
    assert.equal((await f.claim(body)).status,503);f.DB.batch=original;await f.run("UPDATE inventory_items SET is_active=1 WHERE code='VEHICLE_PART_FRAME'");
    assert.equal(await f.one('SELECT value FROM app_meta WHERE key=?',claimKey(2,body.cycle,3)),null);
    assert.equal((await f.claim(body)).status,200);assert.equal((await f.claim(body)).body.replayed,true);assert.equal(Number((await f.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='VEHICLE_PART_FRAME'")).quantity),before+3);
    assert.equal(Number((await f.one('SELECT COUNT(*) n FROM joint_atomic_guards_v1')).n),0);
  });
  await t.test('연장·펫 변경은 수령 초기화 없음, 31일 오지급 없음, 다음 유료 기간·중지·재등록',async()=>{
    f.clock.now=Date.parse('2026-11-08T23:59:59+09:00');assert.equal((await f.pass()).currentDay,30);assert.equal((await f.claim()).status,200);
    f.clock.now+=1000;assert.equal((await f.pass()).currentDay,31);assert.equal((await f.claim()).status,400);
    assert.equal((await f.grant()).status,200);const extended=await f.pass();assert.equal(extended.currentDay,1);assert.notEqual(extended.cycle,f.receiptBody.cycle);assert.equal((await f.claim()).status,200);
    assert.equal((await f.grant(2,'REVOKE')).status,200);const inactive=await f.pass();assert.ok(inactive.days.slice(1).every(d=>d.status==='INACTIVE'));
    assert.equal((await f.claim(f.receiptBody)).body.replayed,true);
    f.clock.now+=1000;assert.equal((await f.grant()).status,200);assert.equal((await f.claim()).status,409);assert.equal((await f.pass()).days[0].status,'DAILY_LIMIT');
    f.clock.now+=31*DAY;assert.equal((await f.claim({cycle:(await f.pass()).cycle,day:2,expectedRevision:(await f.pass()).revision})).status,403);
  });
});

test('30일 달력은 적용 KST 날짜부터 계산하고 한 번 연장으로만 두 번째 달력이 열린다',()=>{
  const startsAt=Date.parse('2026-10-10T23:59:59+09:00'),record={startsAt,endsAt:startsAt+30*DAY,revokedAt:null};
  const at=ms=>passCycle(supportBenefits(record,ms),ms);
  assert.equal(at(startsAt).currentDay,1);assert.equal(at(startsAt+1000).currentDay,2);assert.equal(at(Date.parse('2026-11-09T00:00:00+09:00')).valid,false);
  record.endsAt+=30*DAY;assert.equal(at(Date.parse('2026-11-09T00:00:00+09:00')).currentDay,1);
});

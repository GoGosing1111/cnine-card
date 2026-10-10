import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {supportFixture} from './helpers/server-support-fixture.mjs';
import {SUPPORT_DURATION_MS,supportAccountEligible,supportKey,supportBenefits,emptySupport} from '../shared/server-support-v1.mjs';
import {readSupportRecord} from '../functions/_supporter_benefits.js';
import {selectSupportPet} from '../functions/_server_support.js';
import {loadPetBattleSnapshot} from '../functions/_pet_account.js';
import {legionHuntEntries} from '../functions/_legion_hunt.js';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';

test('3일은 가입 시각부터 정확히 72시간이며 인증·활성 계정이 모두 필요하다',()=>{
  const at=Date.parse('2026-10-10T04:00:00Z'),row={status:'ACTIVE',created_at:'2026-10-07 04:00:00',verified_at:'2026-10-09 01:00:00'};
  assert.equal(supportAccountEligible(row,at-1),false);assert.equal(supportAccountEligible(row,at),true);
  assert.equal(supportAccountEligible({...row,created_at:'2026-10-07T13:00:00+09:00'},at),true);
  for(const patch of [{verified_at:null},{created_at:null},{created_at:'bad'},{created_at:'2027-10-07 04:00:00'},{status:'SUSPENDED'}])assert.equal(supportAccountEligible({...row,...patch},at),false);
});

for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+': 후원 접근·30일 거래·펫 이전·만료',async t=>{
  const f=await supportFixture({postgres});t.after(()=>f.close());
  const sub=async id=>(await readSupportRecord(f.env,id)).state;
  const body=(action='GRANT',userId=1,expectedRevision=0)=>({action,userId,expectedRevision,note:'로컬 검수 후원 확인',requestId:crypto.randomUUID()});
  const post=b=>f.call('admin/server-support',{body:b});
  await t.test('가입 3일·인증 완료 유저는 페이지 공개, CMS만 ID 1 OWNER 전용',async()=>{
    for(const user of [1,2,3]){assert.equal((await f.call('server-support/status',{user})).body.visible,true);assert.equal((await f.call('server-support/info',{user})).status,200);}
    for(const user of [4,5,6]){assert.equal((await f.call('server-support/status',{user})).body.visible,false);assert.equal((await f.call('server-support/info',{user})).status,404);}
    for(const user of [2,3,4,5,6]){assert.equal((await f.call('admin/server-support',{user})).status,403);assert.equal((await f.call('admin/server-support',{user,body:body()})).status,403);}
    assert.equal((await f.call('admin/server-support')).body.pageAccess,'VERIFIED_3_DAYS');
    assert.equal((await f.call('server-support/status',{user:0})).status,401);
    await f.run('DELETE FROM user_second_verifications WHERE user_id=1');assert.equal((await f.call('server-support/status')).body.visible,true);
    assert.equal((await f.call('server-support/info')).body.previewOnly,true);
    assert.equal((await post(body('GRANT',1))).status,403);
    await f.run("UPDATE users SET role='USER' WHERE id=1");assert.equal((await f.call('server-support/status')).body.visible,false);
    await f.run("UPDATE users SET role='OWNER',status='SUSPENDED' WHERE id=1");assert.equal((await f.call('server-support/status')).body.visible,false);
    await f.run("UPDATE users SET status='ACTIVE' WHERE id=1");
    await f.run('INSERT INTO user_second_verifications VALUES(1,?)','2026-01-02 00:00:00');
    const original=(await f.one('SELECT created_at FROM users WHERE id=1')).created_at;
    await f.run('UPDATE users SET created_at=? WHERE id=1',new Date(f.clock.now-3*86400000+1).toISOString());assert.equal((await f.call('server-support/info')).body.previewOnly,true);
    await f.run('UPDATE users SET created_at=? WHERE id=1',original);
    const r=await f.call('server-support/info');assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.body.plan.priceWon,29800);assert.match(r.body.notice,/서버 운영비.*개발/);
    for(const userId of [4,5,6])assert.equal((await post(body('GRANT',userId))).status,403);
    assert.equal((await f.call('admin/server-support/preview',{body:{recipientType:'NICKNAME',recipient:'후원 검수 계정'}})).body.target.id,2);
    for(const recipient of ['abc','0','1.5'])assert.equal((await f.call('admin/server-support/preview',{body:{recipientType:'ID',recipient}})).status,400);
  });
  await t.test('부여·연장 영수증 재시도는 한 번만 적용되고 클라이언트 가격·기간 주입을 거부한다',async()=>{
    const grant=body(),first=await post(grant);assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.subscription.endsAt,f.clock.now+SUPPORT_DURATION_MS);assert.equal(first.body.amountWon,29800);
    assert.equal((await post(grant)).body.replayed,true);assert.equal((await sub(1)).revision,1);
    assert.equal((await post({...grant,note:'다른 내역'})).status,409);
    assert.equal((await post({...body('GRANT',1,1),priceWon:1})).status,400);
    const ends=(await sub(1)).endsAt;f.clock.now+=60000;assert.equal((await post(body('GRANT',1,1))).body.subscription.endsAt,ends+SUPPORT_DURATION_MS);
    assert.equal(Number((await f.one('SELECT COUNT(*) n FROM admin_logs')).n),2);assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=1')).coin),1234);
  });
  await t.test('펫 1마리 자유 변경은 기간을 늘리거나 영구 잠재력을 변경하지 않는다',async()=>{
    const permanent={revision:1,pets:{[f.pets[1].code]:{potential:'MAGNET',attempts:7}}};await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)','pet_potentials_v1:1',JSON.stringify(permanent));
    const end=(await sub(1)).endsAt,petBody={petCode:f.pets[0].code,expectedRevision:2,requestId:crypto.randomUUID()};
    await f.run('DELETE FROM user_second_verifications WHERE user_id=1');
    assert.equal((await f.call('server-support/pet',{body:petBody})).body.code,'SUPPORT_ELIGIBILITY');
    assert.equal((await sub(1)).revision,2);
    await f.run('INSERT INTO user_second_verifications VALUES(1,?)','2026-01-02 00:00:00');
    const first=await f.call('server-support/pet',{body:petBody});assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.subscription.magnetPetCode,f.pets[0].code);
    assert.equal((await f.call('server-support/pet',{body:petBody})).body.replayed,true);
    assert.equal((await loadPetBattleSnapshot(f.env,{id:1},'PVE')).magnet,true);
    const changed=await f.call('server-support/pet',{body:{petCode:f.pets[1].code,expectedRevision:3,requestId:crypto.randomUUID()}});assert.equal(changed.status,200,JSON.stringify(changed.body));assert.equal((await sub(1)).endsAt,end);
    assert.equal((await loadPetBattleSnapshot(f.env,{id:1},'PVE')).magnet,false);
    assert.deepEqual(JSON.parse((await f.one('SELECT value FROM app_meta WHERE key=?','pet_potentials_v1:1')).value),permanent);
    assert.equal((await f.call('server-support/pet',{body:{petCode:f.pets[2].code,expectedRevision:4,requestId:crypto.randomUUID()}})).status,403);
    assert.equal((await f.call('server-support/pet',{user:2,body:{petCode:f.pets[0].code,expectedRevision:0,requestId:crypto.randomUUID()}})).status,403);
  });
  await t.test('감사 저장 실패는 기간·영수증 전체 롤백, 같은 요청 재시도로 한 번만 적용',async()=>{
    const before=await sub(2),grant=body('GRANT',2);f.fail('INSERT INTO admin_logs');assert.equal((await post(grant)).status,503);f.fail('');assert.deepEqual(await sub(2),before);
    assert.equal(await f.one('SELECT value FROM app_meta WHERE key=?','server_support_receipt_v1:'+grant.requestId),null);
    assert.equal((await post(grant)).status,200);assert.equal((await post(grant)).body.replayed,true);
    const a=body('GRANT',2,1),b=body('GRANT',2,1);assert.equal((await post(a)).status,200);assert.equal((await post(b)).status,409);
    const ownerBefore=await sub(1),selection={petCode:f.pets[0].code,expectedRevision:2,requestId:crypto.randomUUID()};
    const selected=await f.call('server-support/pet',{user:2,body:selection});assert.equal(selected.status,200,JSON.stringify(selected.body));assert.equal(selected.body.target.id,2);
    assert.equal((await f.call('server-support/pet',{user:2,body:selection})).body.replayed,true);assert.equal((await sub(2)).magnetPetCode,f.pets[0].code);assert.deepEqual(await sub(1),ownerBefore);
    assert.equal((await f.call('server-support/pet',{user:2,body:{...selection,userId:1}})).status,400);
    assert.equal(Number((await f.one('SELECT COUNT(*) n FROM joint_atomic_guards_v1')).n),0);
  });
  await t.test('중지·정확한 만료 시 혜택 종료, 기존 영구 자석 보존, 재가입은 현재부터 30일',async()=>{
    const revoke=body('REVOKE',1,(await sub(1)).revision);assert.equal((await post(revoke)).body.subscription.active,false);assert.equal((await post(revoke)).body.replayed,true);
    await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({revision:2,petCode:f.pets[1].code,audit:[]}),'pet_loadout_v1:1');assert.equal((await loadPetBattleSnapshot(f.env,{id:1})).magnet,true);
    const restarted=await post(body('GRANT',1,(await sub(1)).revision));assert.equal(restarted.body.subscription.endsAt,f.clock.now+SUPPORT_DURATION_MS);assert.equal(restarted.body.subscription.magnetPetCode,null);
    f.clock.now=restarted.body.subscription.endsAt;assert.equal((await f.call('server-support/info')).body.subscription.active,false);
    assert.equal((await f.call('server-support/pet',{body:{petCode:f.pets[0].code,expectedRevision:(await sub(1)).revision,requestId:crypto.randomUUID()}})).status,403);
    const state=await f.call('admin/server-support');assert.equal(state.status,200,JSON.stringify(state.body));assert.equal(state.body.subscribers.length,2);assert.ok(state.body.history.length>=5);
  });
});

test('군단토벌 기본 2회 + 후원 3회, 만료 후 사용 이력 보존, KST 자정 초기화',()=>{
  const at=Date.parse('2026-10-10T23:59:59+09:00'),support=supportBenefits({...emptySupport(),startsAt:at-1000,endsAt:at+1000},at),user={id:2,role:'USER'},run={daily:{day:'2026-10-10',used:4}};
  assert.equal(legionHuntEntries(run,at,user,support).remaining,1);
  assert.equal(legionHuntEntries(run,at,user).remaining,0);assert.equal(legionHuntEntries(run,at,user).used,4);
  assert.equal(legionHuntEntries(run,at+1000,user,support).limit,2);assert.equal(legionHuntEntries(run,at+1000,user,support).used,0);
  assert.equal(legionHuntEntries(run,at,{id:1,role:'OWNER'},support).unlimited,true);
  assert.throws(()=>legionHuntEntries({daily:{day:'2026-10-10',used:6}},at,user));
});

for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+': 실제 토벌 시작은 5회까지 허용, 재시도·만료·중단 환불',async t=>{
  const f=await legionFixture({postgres});t.after(()=>f.close());
  const config=(await f.call('admin/legion-hunt')).body.policy;config.mode='ON';assert.equal((await f.call('admin/legion-hunt',{policy:config},{method:'PATCH'})).status,200);
  f.deps.createSession=options=>Object.assign(restoreHuntSession({id:crypto.randomUUID(),policy:{id:'normal',...options.dropPolicy},timeLimit:1000,eventTimes:[100],timeline:[{seq:1,combatAtMs:100,type:'RESULT',winner:'B'}],outcome:{winner:'B'}},{now:options.now}),{payload:{}});
  const support={...emptySupport(),revision:1,startsAt:0,endsAt:100000};
  await f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').bind(supportKey(2),JSON.stringify(support)).run();f.setUser(f.player);
  for(let i=0;i<5;i++){
    const start=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(start.status,200,JSON.stringify(start.body));const id=start.body.id;
    assert.equal((await f.call('legion-hunt/begin',{id})).body.entries.used,i+1);assert.equal((await f.call('legion-hunt/begin',{id})).body.entries.used,i+1);
    f.clock.now+=101;assert.equal((await f.call('legion-hunt/finish',{id,seq:1})).status,200);
  }
  assert.equal((await f.call('legion-hunt/start',{difficulty:'normal'})).body.code,'HUNT_DAILY_LIMIT');
  const before=(await f.call('legion-hunt/bootstrap')).body.entries;assert.equal(before.limit,5);assert.equal(before.used,5);
  await f.DB.prepare('UPDATE app_meta SET value=? WHERE key=?').bind(JSON.stringify({...support,endsAt:f.clock.now}),supportKey(2)).run();
  const expired=(await f.call('legion-hunt/bootstrap')).body.entries;assert.equal(expired.limit,2);assert.equal(expired.used,5);assert.equal(expired.remaining,0);
  await f.DB.prepare('UPDATE app_meta SET value=? WHERE key=?').bind(JSON.stringify({...support,endsAt:200000000}),supportKey(2)).run();assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.remaining,0);
  f.clock.now=86400000;const start=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(start.status,200);assert.equal((await f.call('legion-hunt/begin',{id:start.body.id})).body.entries.used,1);
  const cancel=await f.call('legion-hunt/cancel',{id:start.body.id});assert.equal(cancel.status,200);assert.equal(cancel.body.entries.used,0);assert.equal((await f.call('legion-hunt/recover',{})).body.entries.used,0);
});

test('실제 로더·CMS·API가 후원 모듈에 연결되어 있다',()=>{
  assert.match(readFileSync('ui/adventure-lobby/component.js','utf8'),/import\('\/js\/server-support-v1\.mjs/);
  assert.match(readFileSync('admin/index.html','utf8'),/server-support-admin-v1\.mjs/);
  assert.match(readFileSync('functions/api/[[path]].js','utf8'),/handleServerSupport\(\{path,request,env,deps:\{authenticate,requirePermission,json,withUserMutationLock:withJointUserMutationLock/);
});

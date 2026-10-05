import test from 'node:test';
import assert from 'node:assert/strict';
import { deathGameFixture, seedDeathGameCaptives } from './helpers/prison-death-game-fixture.mjs';
import { ensurePrisonHungerFoundation, prisonHungerRoomState, sendPrisonMeal, acknowledgePrisonStarvation, handlePrisonHunger, PRISON_HUNGER_RULES } from '../functions/_prison_hunger.js';

const interval = 1800000, price = 10000000000;
const stamp = value => new Date(value).toISOString().replace('T', ' ').replace('Z', '');
async function fixture(postgres, t) {
  const f = await deathGameFixture(postgres); t.after(() => f.close());
  const schema = ["CREATE TABLE prison_release_cases_v2031(inmate_user_id BIGINT PRIMARY KEY,case_id TEXT UNIQUE,status TEXT)",
    'CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT)'];
  if (postgres) await f.env.DB.execSchema(schema);
  else await f.env.DB.batch(schema.map(s => f.p(s)));
  await f.p('UPDATE users SET coin=?', price * 10).run();
  await f.p("INSERT INTO user_prison_status(user_id,active,jailed_at,jailed_until) VALUES(101,1,?,?)", stamp(f.now - 7200000), stamp(f.now + 7200000)).run();
  await f.p("INSERT INTO prison_release_cases_v2031 VALUES(101,'sentence-old-101','ACTIVE')").run();
  await ensurePrisonHungerFoundation(f.env, f.now);
  f.user = { id:101 }, f.visitor = { id:102 }, f.inmates = [{ userId:101, nickname:'수감자 하나' }];
  f.room = (now=f.now) => prisonHungerRoomState(f.env,f.user,f.inmates,{incarcerated:true},now);
  f.body = async (now=f.now) => { const h=(await f.room(now)).hunger; return {inmateUserId:101,caseId:h.caseId,deadlineAt:h.deadlineAt,mealVersion:h.mealVersion,requestId:crypto.randomUUID()}; };
  return f;
}

test('사식 HTTP는 인증·방문객·메서드를 검사하고 사망 확인은 본인 사건에만 적용한다',async t=>{
  const f=await fixture(false,t);let current=null,status={incarcerated:false};
  const deps={authenticate:async()=>current,prisonStatusForUser:async()=>status,readBody:r=>r.json(),json:(d,s=200)=>Response.json(d,{status:s}),prisonRoomState:()=>f.room()};
  const call=(route,body={},method='POST')=>handlePrisonHunger({path:route,request:new Request('https://local.test/api/'+route,{method,...(method==='POST'?{body:JSON.stringify(body)}:{})}),env:f.env,deps});
  assert.equal((await call('prison/meal')).status,401);
  current=f.visitor;assert.equal((await call('prison/meal',{},'GET')).status,405);
  status={incarcerated:true,facility:'CLAN_CAMP'};assert.equal((await call('prison/meal')).status,403);
  assert.equal((await call('prison/hunger/ack')).status,409);
  const dead=(await f.room(f.now+interval)).hunger;
  await acknowledgePrisonStarvation(f.env,{id:103},{caseId:dead.caseId,diedAt:dead.diedAt},f.now+interval);
  assert.equal((await f.room(f.now+interval)).hunger.deathPending,true);
  await acknowledgePrisonStarvation(f.env,f.user,{caseId:dead.caseId,diedAt:dead.diedAt+1},f.now+interval);
  assert.equal((await f.room(f.now+interval)).hunger.deathPending,true);
});

for (const postgres of [false,true]) {
  const db = postgres ? 'PostgreSQL' : 'SQLite';
  test(`${db}: 30분 경계·도입 유예·오프라인·사망 확인은 형기/코인을 바꾸지 않는다`, async t => {
    const f=await fixture(postgres,t), original=await f.p('SELECT * FROM user_prison_status WHERE user_id=101').first();
    assert.equal(PRISON_HUNGER_RULES.intervalMs,interval);assert.equal(PRISON_HUNGER_RULES.mealCoin,price);
    assert.equal((await f.room()).hunger.deadlineAt,f.now+interval);
    assert.equal((await f.room(f.now+interval-1)).hunger.deathPending,false);
    const dead=(await f.room(f.now+interval)).hunger;
    assert.equal(dead.starved,true);assert.equal(dead.deathPending,true);assert.equal(dead.diedAt,f.now+interval);
    await acknowledgePrisonStarvation(f.env,f.user,{caseId:dead.caseId,diedAt:dead.diedAt},f.now+interval+1);
    await acknowledgePrisonStarvation(f.env,f.user,{caseId:dead.caseId,diedAt:dead.diedAt},f.now+interval+2);
    const after=(await f.room(f.now+interval*2)).hunger;
    assert.equal(after.starved,true);assert.equal(after.deathPending,false);assert.equal(after.deadlineAt,dead.deadlineAt);
    assert.deepEqual(await f.p('SELECT * FROM user_prison_status WHERE user_id=101').first(),original);
    assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=101').first()).coin),price*10);
    assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM event_prison_camps WHERE source_type='DEATH_GAME'").first()).n),0);
  });

  test(`${db}: 방문객 사식은 정확히 100억 차감·30분 갱신, 중복 요청·동시 전달 차단`, async t => {
    const f=await fixture(postgres,t), body=await f.body();
    const now=f.now+120000;
    await sendPrisonMeal(f.env,f.visitor,body,now);
    const again=await sendPrisonMeal(f.env,f.visitor,body,now+1000);
    assert.equal(again.replayed,true);
    let h=(await f.room(now+1000)).hunger;
    assert.equal(h.deadlineAt,now+interval);assert.equal(h.lastFedAt,now);assert.equal(h.mealVersion,1);
    assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=102').first()).coin),price*9);
    await assert.rejects(sendPrisonMeal(f.env,{id:103},{...body,requestId:crypto.randomUUID()},now+2000),/상태가 변경/);
    assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n),1);
    const next=await f.body(now+2000);
    const outcomes=await Promise.allSettled([sendPrisonMeal(f.env,f.visitor,next,now+3000),sendPrisonMeal(f.env,{id:103},{...next,requestId:crypto.randomUUID()},now+3000)]);
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM prison_meals_v20261005').first()).n),2);
    assert.equal(Number((await f.p('SELECT SUM(coin) AS n FROM users WHERE id IN (102,103)').first()).n),price*18);
  });

  test(`${db}: 본인·다른 수감자·포로의 전달/포로 대상/잔액 부족/다른 요청 위조는 차감 없음`, async t => {
    const f=await fixture(postgres,t),body=await f.body();
    await assert.rejects(sendPrisonMeal(f.env,f.user,body,f.now),/방문객/);
    await f.p('UPDATE users SET coin=0 WHERE id=102').run();
    await assert.rejects(sendPrisonMeal(f.env,f.visitor,body,f.now),/코인이 부족/);
    await f.p('UPDATE users SET coin=? WHERE id=102',price*10).run();
    await f.p("INSERT INTO user_prison_status(user_id,active,jailed_at,jailed_until) VALUES(102,1,?,?)",stamp(f.now),stamp(f.now+interval)).run();
    await assert.rejects(sendPrisonMeal(f.env,f.visitor,body,f.now),/상태가 변경/);
    await f.p('UPDATE user_prison_status SET active=0 WHERE user_id=102').run();
    await seedDeathGameCaptives(f,[102]);
    await assert.rejects(sendPrisonMeal(f.env,f.visitor,body,f.now),/상태가 변경/);
    const camp=await prisonHungerRoomState(f.env,f.visitor,[],{incarcerated:true,facility:'CLAN_CAMP'},f.now);
    assert.equal(camp.hunger,null);assert.equal(camp.canSendMeal,false);
    await assert.rejects(sendPrisonMeal(f.env,{id:103},{...body,inmateUserId:102},f.now),/상태가 변경/);
    await sendPrisonMeal(f.env,{id:103},body,f.now+10);
    await assert.rejects(sendPrisonMeal(f.env,{id:999},body,f.now+20),/다른 사식/);
    assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n),1);
    assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=102').first()).coin),price*10);
  });

  test(`${db}: 실패 원자 복구·응답 유실 재시도·사망 직후 사식·석방/재수감 경계`, async t => {
    const f=await fixture(postgres,t),body=await f.body();
    f.fail('INSERT INTO coin_logs');
    await assert.rejects(sendPrisonMeal(f.env,f.visitor,body,f.now+500),/INJECTED_FAILURE/);f.fail('');
    assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=102').first()).coin),price*10);
    assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM prison_meals_v20261005').first()).n),0);
    // Inject only into the transaction COMMIT, after initialization/reconciliation.
    const oldBatch=f.env.DB.batch.bind(f.env.DB);
    f.env.DB.batch=statements=>{if(statements.some(s=>String(s.source||s.sql||s.query||'').includes('INSERT INTO coin_logs')))f.loseCommit();return oldBatch(statements);};
    // SQLite exposes source; PostgreSQL statement object exposes sql. Fall back to an explicit query hook test below.
    let lost=false;try{await sendPrisonMeal(f.env,f.visitor,body,f.now+interval+1);}catch(error){assert.match(error.message,/LOST_COMMIT_RESPONSE/);lost=true;}
    f.env.DB.batch=oldBatch;
    const result=await sendPrisonMeal(f.env,f.visitor,body,f.now+interval+2);
    assert.equal(result.replayed,true);assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=102').first()).coin),price*9);
    const fed=(await f.room(f.now+interval+2)).hunger;
    assert.equal(fed.starved,false);assert.equal(fed.deathPending,true);assert.equal(fed.diedAt,f.now+interval);
    t.diagnostic(`lost-commit injected=${lost}`);assert.equal(lost,true);
    await f.p('UPDATE user_prison_status SET active=0 WHERE user_id=101').run();
    assert.equal((await f.room(f.now+interval+3)).hunger,null);
    await assert.rejects(sendPrisonMeal(f.env,f.visitor,{...body,requestId:crypto.randomUUID()},f.now+interval+3),/상태가 변경/);
    await f.p("UPDATE user_prison_status SET active=1,jailed_at=? WHERE user_id=101",stamp(f.now+interval+4)).run();
    await f.p("UPDATE prison_release_cases_v2031 SET case_id='sentence-new-101' WHERE inmate_user_id=101").run();
    const fresh=(await f.room(f.now+interval+5)).hunger;
    assert.equal(fresh.caseId,'sentence-new-101');assert.equal(fresh.deathPending,false);assert.equal(fresh.deadlineAt,f.now+interval*2+4);
    await assert.rejects(sendPrisonMeal(f.env,f.visitor,{...body,requestId:crypto.randomUUID()},f.now+interval+5),/상태가 변경/);
  });
}

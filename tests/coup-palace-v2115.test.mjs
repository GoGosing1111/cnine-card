import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { __postgresCompatTest } from '../functions/_postgres_d1_compat.js';
import { ensureCoupSchema, chiefDuty, chiefAuthorityGuard } from '../functions/_coup_schema.js';
import { openCoupRound, startCoupRound, settleCoupRound, voteCoupTrial, closeCoupTrial, coupStatus, handleCoup, attackCoup } from '../functions/_coup.js';
import { clanCampStatusForUser, clanCampRoomState, releaseClanCaptives, sendClanCampChat } from '../functions/_clan_prison_camp.js';
import { advanceFront, deadlineWinner, rebelPenalty, coupSettings } from '../shared/coup-palace-v2115.mjs';
import { readFileSync } from 'node:fs';
import { createPvpBattleV2 } from '../functions/_battle_v2_preview.js';

async function fixture(t, pg) {
  let DB, sql, failAt = '';
  if (pg) {
    sql = new PGlite(); t.after(() => sql.close());
    await sql.exec(`CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;
      CREATE FUNCTION sqlite_json_extract(doc TEXT,path TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$ SELECT (doc::jsonb)->>substring(path from 3) $$;
      CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT sqlite_now());
      CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT DEFAULT 'USER',status TEXT DEFAULT 'ACTIVE',coin BIGINT DEFAULT 0);`);
    DB = new __postgresCompatTest.PostgresD1Database({ async query(input) {
      const source = typeof input === 'string' ? input : input.text;
      if (failAt && source.includes(failAt)) throw new Error('INJECTED_FAILURE');
      const r = await sql.query(source, typeof input === 'string' ? [] : input.values || []);
      return { ...r, rowCount: r.affectedRows ?? r.rows.length };
    } });
  } else {
    sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
    sql.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT DEFAULT 'USER',status TEXT DEFAULT 'ACTIVE',coin INTEGER DEFAULT 0);`);
    DB = { prepare(source) { return { source, values: [], bind(...v) { this.values = v; return this; },
      async first() { return sql.prepare(source).get(...this.values) || null; }, async all() { return { results: sql.prepare(source).all(...this.values) }; },
      async run() { if (failAt && source.includes(failAt)) throw new Error('INJECTED_FAILURE'); const r = sql.prepare(source).run(...this.values); return { meta: { changes: Number(r.changes) } }; }
    }; }, async batch(stmts) { sql.exec('BEGIN'); try { const out = []; for (const stmt of stmts) out.push(await stmt.run()); sql.exec('COMMIT'); return out; } catch (e) { sql.exec('ROLLBACK'); throw e; } } };
  }
  if (!pg) { const original = DB.batch.bind(DB); let queue = Promise.resolve(); DB.batch = stmts => { const next = queue.then(() => original(stmts)); queue = next.catch(() => {}); return next; }; }
  const env = { DB }, p = (s, ...v) => DB.prepare(s).bind(...v), now = Math.floor(Date.now() / 1000) * 1000;
  for (const [id, coin] of [[1, 1000], [2, 9876543210], [3, 0], [4, -3000000000], [5, 7]]) await p('INSERT INTO users(id,nickname,coin) VALUES(?,?,?)', id, '계정' + id, coin).run();
  const appointment = { id: 'term-1', userId: 1, nickname: '족장', startsAt: new Date(now - 10000).toISOString(), endsAt: new Date(now + 86400000).toISOString() };
  await p('INSERT INTO app_meta(key,value) VALUES(?,?)', 'chief_appointment_v1', JSON.stringify(appointment)).run();
  await ensureCoupSchema(env);
  async function prepare(winner = null) {
    const r = await openCoupRound(env, now);
    for (const id of [1, 2, 3, 4, 5]) await p('INSERT INTO coup_participants_v2115(round_id,user_id,side,deck_snapshot,loadout_bonus_json,deck_power,joined_at) VALUES(?,?,?,?,?,?,?)', r.id, id, id === 1 || id === 5 ? 'CHIEF' : 'REBEL', '["a","b","c","d","e"]', '{}', 10000, now).run();
    await startCoupRound(env, r.id, now);
    if (winner) await p("UPDATE coup_rounds_v2115 SET status='SETTLING',winner=? WHERE id=?", winner, r.id).run();
    return r.id;
  }
  return { env, p, now, prepare, fail(s) { failAt = s; }, appointment };
}

test('front movement, timeout, strict CMS limits and bigint loss policy', () => {
  assert.equal(rebelPenalty(0), 3000000000n); assert.equal(rebelPenalty(-100), 3000000000n);
  assert.equal(rebelPenalty('9007199254740991'), 1801439850948198n);
  assert.throws(() => coupSettings({ battleMinutes: 0 })); assert.throws(() => coupSettings({ trialMinutes: 1.5 }));
  const r = { front_index: 2, chief_hp: 100, rebel_hp: 100, max_hp: 100 };
  assert.equal(advanceFront(r, 'CHIEF', 100).front, 3);
  assert.equal(advanceFront({ ...r, front_index: 4 }, 'CHIEF', 100).winner, 'REBEL');
  assert.equal(advanceFront({ ...r, front_index: 0 }, 'REBEL', 100).winner, 'CHIEF');
  assert.equal(deadlineWinner(r), 'DRAW'); assert.equal(deadlineWinner({ ...r, chief_hp: 99 }), 'REBEL');
});
for (const pg of [false, true]) {
  const label = pg ? 'PostgreSQL' : 'SQLite';
  test(`${label}: rebel loss atomically debits 20%, allows -3 billion, adds 3 billion to existing debt, exactly once`, async t => {
    const f = await fixture(t, pg), id = await f.prepare('CHIEF');
    f.fail('UPDATE users SET coin=(SELECT'); await assert.rejects(settleCoupRound(f.env, id, f.now), /INJECTED_FAILURE/); f.fail('');
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_penalties_v2115').first()).n), 0);
    assert.equal((await f.p('SELECT status FROM coup_rounds_v2115 WHERE id=?', id).first()).status, 'SETTLING');
    await settleCoupRound(f.env, id, f.now); await settleCoupRound(f.env, id, f.now + 1000);
    const balance = async u => Number((await f.p('SELECT coin FROM users WHERE id=?', u).first()).coin);
    assert.equal(await balance(2), 7901234568); assert.equal(await balance(3), -3000000000); assert.equal(await balance(4), -6000000000); assert.equal(await balance(1), 1000);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_penalties_v2115').first()).n), 3);
    assert.equal((await clanCampStatusForUser(f.env, 2, f.now)).incarcerated, false);
  });
  test(`${label}: palace fall jails loyalists, opens one trial, guards duties and preserves releases on retry`, async t => {
    const f = await fixture(t, pg), id = await f.prepare('REBEL');
    f.fail('INSERT INTO coup_electorate'); await assert.rejects(settleCoupRound(f.env, id, f.now), /INJECTED_FAILURE/); f.fail('');
    assert.equal((await clanCampStatusForUser(f.env, 1, f.now)).incarcerated, false);
    await settleCoupRound(f.env, id, f.now);
    const status = await clanCampStatusForUser(f.env, 1, f.now);
    assert.equal(status.facility, 'CLAN_CAMP'); assert.equal(status.sourceType, 'COUP'); assert.equal(status.remainingSeconds, 28800);
    assert.equal((await clanCampStatusForUser(f.env, 2, f.now)).incarcerated, false);
    assert.equal((await chiefDuty(f.env, 'term-1')).status, 'OPEN');
    const authority = chiefAuthorityGuard(f.env, 'term-1', 1, f.now);
    await assert.rejects(f.env.DB.batch([...authority.before, f.p('UPDATE users SET coin=999 WHERE id=1'), authority.after]));
    assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin), 1000);
    await sendClanCampChat(f.env, { id: 1 }, { body: '재판에 참여합니다.' }, f.now);
    const room = await clanCampRoomState(f.env, { id: 2 }, {}, f.now); assert.equal(room.inmates.length, 2); assert.equal(room.messages[0].senderWasCaptive, true);
    await assert.rejects(releaseClanCaptives(f.env, { id: 1, role: 'USER' }, { eventId: status.eventId }, f.now), e => e.status === 403);
    await releaseClanCaptives(f.env, { id: 4, role: 'OWNER' }, { eventId: status.eventId, userId: 1 }, f.now);
    await settleCoupRound(f.env, id, f.now + 1000);
    assert.equal((await clanCampStatusForUser(f.env, 1, f.now + 1000)).incarcerated, false);
    assert.equal((await chiefDuty(f.env, 'term-1')).status, 'OPEN');
    assert.equal((await clanCampStatusForUser(f.env, 5, f.now + 28800000)).incarcerated, false);
  });
  test(`${label}: account ballots immutable, snapshot electorate, deadline verdict cannot remove a new chief`, async t => {
    const f = await fixture(t, pg), id = await f.prepare('REBEL'); await settleCoupRound(f.env, id, f.now);
    await voteCoupTrial(f.env, { id: 1 }, { trialId: id, choice: 'REINSTATE' }, f.now + 100);
    await voteCoupTrial(f.env, { id: 2 }, { trialId: id, choice: 'REMOVE' }, f.now + 100);
    await voteCoupTrial(f.env, { id: 2 }, { trialId: id, choice: 'REMOVE' }, f.now + 101);
    await assert.rejects(voteCoupTrial(f.env, { id: 2 }, { trialId: id, choice: 'REINSTATE' }, f.now + 101), e => e.status === 409);
    await f.p("INSERT INTO users(id,nickname) VALUES(99,'신규')").run();
    await assert.rejects(voteCoupTrial(f.env, { id: 99 }, { trialId: id, choice: 'REMOVE' }, f.now + 100), e => e.status === 409);
    await voteCoupTrial(f.env, { id: 3 }, { trialId: id, choice: 'REMOVE' }, f.now + 100);
    const newer = { ...f.appointment, id: 'term-2', userId: 4 };
    await f.p("UPDATE app_meta SET value=? WHERE key='chief_appointment_v1'", JSON.stringify(newer)).run();
    await closeCoupTrial(f.env, id, f.now + 86400000); await closeCoupTrial(f.env, id, f.now + 86400001);
    assert.equal((await chiefDuty(f.env, 'term-1')).status, 'REMOVED'); assert.equal(await chiefDuty(f.env, 'term-2'), null);
    assert.equal(JSON.parse((await f.p("SELECT value FROM app_meta WHERE key='chief_appointment_v1'").first()).value).id, 'term-2');
    const state = await coupStatus(f.env, { id: 1 }, f.now + 86400000); assert.equal(state.trial.status, 'REMOVED'); assert.equal(state.trial.remove, 2); assert.equal(state.trial.reinstate, 1);
  });
  test(`${label}: CMS separate duration frozen per round; no participants cannot start; ties reinstate`, async t => {
    const f = await fixture(t, pg); const empty = await openCoupRound(f.env, f.now);
    await assert.rejects(startCoupRound(f.env, empty.id, f.now), e => e.status === 409);
    await f.p("UPDATE coup_rounds_v2115 SET status='CANCELLED' WHERE id=?", empty.id).run();
    await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)', 'coup_settings_v2115', JSON.stringify({ battleMinutes: 20, trialMinutes: 60 })).run();
    const id = await f.prepare('REBEL'); await settleCoupRound(f.env, id, f.now);
    const r = await f.p('SELECT * FROM coup_rounds_v2115 WHERE id=?', id).first(); assert.equal(Number(r.ends_at) - Number(r.starts_at), 1200000);
    await closeCoupTrial(f.env, id, f.now + 3600000);
    assert.equal((await chiefDuty(f.env, 'term-1')).status, 'REINSTATED');
    const authority = chiefAuthorityGuard(f.env, 'term-1', 1, f.now + 3600000); await f.env.DB.batch([...authority.before, authority.after]);
  });
  test(`${label}: simultaneous real V3 attacks settle one cooldown and replay one immutable receipt`, async t => {
    const f = await fixture(t, pg), id = await f.prepare();
    const cards = ['a','b','c','d','e'].map((id,i) => ({id,name:'카드'+id,title:'카드'+id,rarity:'UR',power_type:['ATTACK','DEFENSE','HP','SPEED','ATTACK'][i],base_power:12000,power:12000,breakthrough_level:0}));
    const deps={pvpDeckSnapshotByIds:async()=>cards,pvpDeckSnapshot:async()=>cards,battleSettings:async()=>({engine:{}}),cardBattlePower:c=>c.base_power,createPvpBattleV2};
    const body={roundId:id,requestId:'attack-receipt-001'};
    const outcomes=await Promise.allSettled([attackCoup(f.env,deps,{id:2,nickname:'반란군'},body,f.now),attackCoup(f.env,deps,{id:2,nickname:'반란군'},{...body,requestId:'attack-receipt-002'},f.now)]);
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    const result=outcomes.find(x=>x.status==='fulfilled').value;
    assert.ok(result.battleV2.result.timeline.length>0);assert.equal(result.sceneAssetKey,'COUP_PALACE');
    const receipt=await attackCoup(f.env,deps,{id:2},{roundId:id,requestId:result.requestId},f.now+1);
    assert.deepEqual(receipt,JSON.parse(JSON.stringify(result)));
    assert.equal(Number((await f.p('SELECT attacks FROM coup_participants_v2115 WHERE round_id=? AND user_id=2',id).first()).attacks),1);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_attacks_v2115').first()).n),1);
    const r=await f.p('SELECT chief_hp,rebel_hp FROM coup_rounds_v2115 WHERE id=?',id).first();
    assert.equal(Number(r.chief_hp)+Number(r.rebel_hp),1000000-result.damage);
    await assert.rejects(attackCoup(f.env,deps,{id:3},{roundId:id,requestId:result.requestId},f.now),e=>e.status===403);
  });
  test(`${label}: simultaneous voters each count once; duplicate votes cannot inflate tally`,async t=>{
    const f=await fixture(t,pg),id=await f.prepare('REBEL');await settleCoupRound(f.env,id,f.now);
    await Promise.all([1,2,3].map(userId=>voteCoupTrial(f.env,{id:userId},{trialId:id,choice:'REMOVE'},f.now+100)));
    const pair=await Promise.allSettled([4,4].map(userId=>voteCoupTrial(f.env,{id:userId},{trialId:id,choice:'REINSTATE'},f.now+100)));
    assert.ok(pair.some(x=>x.status==='fulfilled'));
    const trial=await f.p('SELECT * FROM coup_trials_v2115 WHERE id=?',id).first();assert.equal(Number(trial.remove_count),3);assert.equal(Number(trial.reinstate_count),1);
  });
  test(`${label}: administrative and vote routing rejects unauthenticated or unauthorized mutations`, async t => {
    const f = await fixture(t, pg), json = (data, status = 200) => ({ data, status }), deps = { authenticate: async () => null, json };
    assert.equal((await handleCoup({ path: 'coup/vote', request: { method: 'POST' }, env: f.env, deps })).status, 401);
    deps.authenticate = async () => ({ id: 1 }); deps.requirePermission = async () => null;
    assert.equal((await handleCoup({ path: 'admin/coup/open', request: { method: 'POST' }, env: f.env, deps })).status, 403);
    const id = await f.prepare();
    await assert.rejects(attackCoup(f.env, {}, { id: 99 }, { roundId: id, requestId: 'valid-key-0001' }, f.now), e => e.status === 403);
  });
}
test('coupon CMS routes bypass the coup router before authentication, permission checks and DB access', async () => {
  const unexpected = () => { throw new Error('Coupon request was intercepted by the coup router'); };
  const deps = new Proxy({}, { get: unexpected }), env = new Proxy({}, { get: unexpected });
  for (const [path, methods] of [
    ['admin/coupons', ['GET', 'POST', 'PATCH', 'DELETE']],
    ['admin/coupons-v2', ['GET', 'POST', 'PATCH', 'DELETE']],
    ['admin/coupon-create-permanent-v3', ['POST']],
    ['admin/verified-coupon-send', ['POST']],
    ['coupon/redeem', ['POST']]
  ]) {
    for (const method of methods) assert.equal(await handleCoup({ path, request: { method }, env, deps }), null, `${method} ${path}`);
  }
});

test('the exact coup admin route and its child routes retain authentication', async () => {
  for (const path of ['admin/coup', 'admin/coup/settings', 'admin/coup/open', 'admin/coup/start', 'admin/coup/cancel', 'coup/status', 'coup/vote']) {
    const response = await handleCoup({ path, request: { method: 'GET' }, env: {}, deps: {
      authenticate: async () => null, json: (data, status) => ({ data, status })
    } });
    assert.equal(response.status, 401, path);
  }
});

test('live wiring preserves V3 engine, scoped prison exemptions and chief authority guards', () => {
  const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const api = read('functions/api/[[path]].js');
  assert.match(api, /handleCoup\(\{path,request,env,deps:/);
  assert.match(api, /path==='coup\/status'\|\|path==='coup\/vote'/);
  assert.match(api, /const authority=chiefAuthorityGuard/);
  assert.match(read('functions/_chief.js'), /authority\.before/);
  assert.match(read('functions/_coup.js'), /simulateTerritoryDuel\(env, deps/);
});

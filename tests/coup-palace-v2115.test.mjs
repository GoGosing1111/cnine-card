import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { __postgresCompatTest } from '../functions/_postgres_d1_compat.js';
import { ensureCoupSchema, chiefDuty, chiefAuthorityGuard } from '../functions/_coup_schema.js';
import { openCoupRound, startCoupRound, joinCoupRound, settleCoupRound, voteCoupTrial, closeCoupTrial, coupStatus, handleCoup, attackCoup } from '../functions/_coup.js';
import { clanCampStatusForUser, clanCampRoomState, releaseClanCaptives, sendClanCampChat } from '../functions/_clan_prison_camp.js';
import { advanceFront, deadlineWinner, rebelPenalty, coupSettings, coupRebelDefeatPolicy, coupMatchedOpponent } from '../shared/coup-palace-v2115.mjs';
import { readFileSync } from 'node:fs';
import { createPvpBattleV2 } from '../functions/_battle_v2_preview.js';
import { useCoupChiefSkill, COUP_SKILL_SETTINGS } from '../functions/_coup.js';
import { coupEnergy, coupSkillCooldown, chooseNuclearTargets, coupRebelCommanderId } from '../shared/coup-chief-skills-v2118.mjs';

test('chief skill energy: 10 cap, 2-minute recovery, 50 rally overflow, nuclear has no deferred recovery', () => {
  assert.equal(coupEnergy(null, 0).energy, 10);
  assert.equal(coupEnergy({energy:8,energy_at:0},119999).energy,8);
  assert.equal(coupEnergy({energy:8,energy_at:0},120000).energy,9);
  assert.equal(coupEnergy({energy:8,energy_at:0},999999).energy,10);
  assert.equal(coupEnergy({energy:50,energy_at:0},999999).energy,50);
  const hit={energy:0,energy_at:600000,blocked_until:600000};
  assert.equal(coupEnergy(hit,599999).energy,0);assert.equal(coupEnergy(hit,600000).energy,0);
  assert.equal(coupEnergy(hit,719999).energy,0);assert.equal(coupEnergy(hit,720000).energy,1);
  assert.equal(coupSkillCooldown('RALLY'),3600000);assert.equal(coupSkillCooldown('ARTILLERY'),1800000);
  assert.equal(coupSkillCooldown('RALLY','REBEL'),5400000);assert.equal(coupSkillCooldown('ARTILLERY','REBEL'),2700000);
  assert.equal(coupRebelCommanderId('new',{rebelCommand:{roundId:'old',userId:2}}),null);
  assert.equal(coupRebelCommanderId('old',{rebelCommand:{roundId:'old',userId:-1}}),null);
  const targets=chooseNuclearTargets(Array.from({length:80},(_,i)=>i),()=>.4);
  assert.equal(targets.length,50);assert.equal(new Set(targets).size,50);
});

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
  await sql.exec('CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT)');
  await sql.exec('CREATE TABLE user_mercenary_cards_v1(user_id BIGINT,mercenary_code TEXT); CREATE TABLE user_mercenary_growth_v1(user_id BIGINT,mercenary_code TEXT,level INTEGER)');
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
test('coup matchmaking stays near power, avoids the previous opponent and rotates the recent pool', () => {
  const candidates = [100, 104, 108, 200].map((power, i) => ({ user_id: i + 1, deck_power: power }));
  assert.equal(coupMatchedOpponent(candidates, 100, [1, 1, 2], () => 0).user_id, 3);
  assert.equal(coupMatchedOpponent(candidates, 100, [1, 2, 3], () => .99).user_id, 3);
  assert.equal(coupMatchedOpponent(candidates, 100, [3, 2, 1], () => 0).user_id, 1);
  assert.equal(coupMatchedOpponent(candidates, 100, [], () => 0).match_pool_size, 3);
  assert.equal(coupMatchedOpponent([candidates[0]], 100, [1], () => 0).user_id, 1);
  assert.equal(coupMatchedOpponent([], 100), null);
  assert.equal(coupMatchedOpponent([{user_id:7,deck_power:1000},{user_id:8,deck_power:5000}],100).user_id,7);
  assert.equal(coupRebelDefeatPolicy('new', {rebelTrial:{roundId:'old',prisonHours:3}}).type,'COIN');
  assert.equal(coupRebelDefeatPolicy('old', {rebelTrial:{roundId:'old',prisonHours:3}}).type,'PRISON');
  assert.equal(coupSettings({rebelTrial:{roundId:'old',prisonHours:3}}).rebelTrial,undefined);
});
for (const pg of [false, true]) {
  const label = pg ? 'PostgreSQL' : 'SQLite';
  test(`${label}: OFF blocks all new coup actions, keeps receipts/status, rejects stale in-flight writes and preserves OFF on CMS partial saves`,async t=>{
    const f=await fixture(t,pg),id=await f.prepare();
    const receipt={roundId:id,skillCode:'RALLY',requestId:'before-off-skill'};
    await useCoupChiefSkill(f.env,{id:1},receipt,f.now);
    await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)','coup_settings_v2115',JSON.stringify({enabled:false,siegeHp:15000000})).run();
    for(const action of [()=>openCoupRound(f.env,f.now),()=>startCoupRound(f.env,id,f.now),()=>joinCoupRound(f.env,{}, {id:9},{roundId:id,side:'REBEL',acceptPenalty:true},f.now),()=>attackCoup(f.env,{}, {id:2},{roundId:id,requestId:'off-attack-blocked'},f.now),()=>useCoupChiefSkill(f.env,{id:1},{roundId:id,skillCode:'ARTILLERY',requestId:'off-artillery-blocked'},f.now)])await assert.rejects(action(),e=>e.status===403&&/OFF/.test(e.message));
    assert.equal((await useCoupChiefSkill(f.env,{id:1},receipt,f.now)).replayed,true);
    const s=await coupStatus(f.env,{id:1},f.now);assert.equal(s.settings.enabled,false);assert.equal(s.canUseCommandSkills,false);assert.equal(s.canUseChiefSkills,false);
    let body={battleMinutes:80},role='ADMIN';const deps={authenticate:async()=>({id:1}),requirePermission:async()=>({id:1,role}),readBody:async()=>body,json:(data,status=200)=>({data,status}),writeAdminLog:async()=>{}};
    const save=()=>handleCoup({env:f.env,path:'admin/coup/settings',request:{method:'POST'},deps});
    let saved=await save();assert.equal(saved.status,200);assert.equal(saved.data.settings.enabled,false);assert.equal(saved.data.settings.siegeHp,15000000);
    body={enabled:true};assert.equal((await save()).status,403);body={enabled:null};assert.equal((await save()).status,400);
    role='OWNER';body={enabled:true};assert.equal((await save()).data.settings.enabled,true);
    const batch=f.env.DB.batch.bind(f.env.DB);let once=true;f.env.DB.batch=async stmts=>{if(once){once=false;await f.p("UPDATE app_meta SET value=? WHERE key='coup_settings_v2115'",JSON.stringify({enabled:false})).run();}return batch(stmts)};
    await assert.rejects(useCoupChiefSkill(f.env,{id:1},{roundId:id,skillCode:'ARTILLERY',requestId:'off-race-artillery'},f.now),e=>e.status===409);f.env.DB.batch=batch;
    assert.equal(Number((await f.p('SELECT rebel_hp FROM coup_rounds_v2115 WHERE id=?',id).first()).rebel_hp),500000);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_skills_v2118').first()).n),1);
  });
  test(`${label}: a concurrent CMS partial save cannot overwrite a newer ON/OFF decision`,async t=>{
    const f=await fixture(t,pg),key='coup_settings_v2115',batch=f.env.DB.batch.bind(f.env.DB);
    const deps={authenticate:async()=>({id:1}),requirePermission:async()=>({id:1,role:'ADMIN'}),readBody:async()=>({battleMinutes:80}),json:(data,status=200)=>({data,status}),writeAdminLog:async()=>{}};
    for(const enabled of [false,true]){
      await f.p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify({enabled:!enabled,battleMinutes:60})).run();
      const newer={enabled,battleMinutes:120,siegeHp:15000000};let once=true;
      f.env.DB.batch=async stmts=>{if(once){once=false;await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(newer),key).run();}return batch(stmts)};
      const result=await handleCoup({env:f.env,path:'admin/coup/settings',request:{method:'POST'},deps});
      assert.equal(result.status,409);assert.deepEqual(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',key).first()).value),newer);
      f.env.DB.batch=batch;
    }
  });
  test(`${label}: the 90-minute trial sentence is round-bound, expires exactly and settlement retry cannot extend it`,async t=>{
    const f=await fixture(t,pg),id=await f.prepare('CHIEF');const r=await f.p('SELECT settings_json FROM coup_rounds_v2115 WHERE id=?',id).first();
    await f.p('UPDATE coup_rounds_v2115 SET settings_json=? WHERE id=?',JSON.stringify({...JSON.parse(r.settings_json),rebelTrial:{roundId:id,prisonHours:1.5}}),id).run();
    await settleCoupRound(f.env,id,f.now);await settleCoupRound(f.env,id,f.now+1000);
    const before=await clanCampStatusForUser(f.env,2,f.now);assert.equal(before.remainingSeconds,5400);assert.match(before.reason,/1시간 30분/);
    assert.equal((await clanCampRoomState(f.env,{id:2},before,f.now)).sentenceHours,1.5);
    assert.equal((await clanCampStatusForUser(f.env,2,f.now+5399999)).incarcerated,true);assert.equal((await clanCampStatusForUser(f.env,2,f.now+5400000)).incarcerated,false);
    assert.equal((await coupStatus(f.env,{id:2},f.now)).round.rebelDefeat.hours,1.5);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_penalties_v2115').first()).n),0);
  });
  async function assign(f,id,userId=2) {
    const r=await f.p('SELECT settings_json FROM coup_rounds_v2115 WHERE id=?',id).first();
    await f.p('UPDATE coup_rounds_v2115 SET settings_json=?,revision=revision+1 WHERE id=?',JSON.stringify({...JSON.parse(r.settings_json),rebelCommand:{roundId:id,userId}}),id).run();
  }
  test(`${label}: temporary rebel commander targets the opposite HP and own energy with independent 45/90-minute cooldowns`,async t=>{
    const f=await fixture(t,pg),id=await f.prepare();await assign(f,id);
    const cast=(uid,code,key,now=f.now)=>useCoupChiefSkill(f.env,{id:uid},{roundId:id,skillCode:code,requestId:key,targetSide:'REBEL',commanderId:1},now);
    const r=await cast(2,'ARTILLERY','rebel-arty-first');
    assert.equal(r.commandSide,'REBEL');assert.equal(r.targetSide,'CHIEF');assert.equal(r.commanderName,'계정2');assert.equal(r.damage,150000);assert.equal(r.nextUseAt,f.now+2700000);
    let round=await f.p('SELECT * FROM coup_rounds_v2115 WHERE id=?',id).first();assert.equal(Number(round.chief_hp),350000);assert.equal(Number(round.rebel_hp),500000);
    assert.equal((await cast(1,'ARTILLERY','chief-arty-same-time')).nextUseAt,f.now+1800000);
    await assert.rejects(cast(2,'ARTILLERY','rebel-arty-early',f.now+2699999),e=>e.status===429);
    assert.equal((await cast(2,'ARTILLERY','rebel-arty-ready',f.now+2700000)).nextUseAt,f.now+5400000);
    const rally=await cast(2,'RALLY','rebel-rally-first');assert.equal(rally.nextUseAt,f.now+5400000);assert.deepEqual(rally.affectedUserIds,[2,3,4]);assert.equal(rally.targetSide,'REBEL');
    assert.equal((await coupStatus(f.env,{id:3},f.now)).mine.energyState.energy,50);
    assert.equal((await coupStatus(f.env,{id:1},f.now)).mine.energyState.energy,10);
    await cast(1,'RALLY','chief-rally-same-time');
    await assert.rejects(cast(2,'RALLY','rebel-rally-early',f.now+5399999),e=>e.status===429);
    assert.equal((await cast(2,'RALLY','rebel-rally-ready',f.now+5400000)).nextUseAt,f.now+10800000);
    const commander=await coupStatus(f.env,{id:2},f.now);assert.equal(commander.canUseChiefSkills,false);assert.equal(commander.canUseCommandSkills,true);assert.equal(commander.commander.temporary,true);assert.deepEqual(commander.commandSkills.map(s=>s.code),['ARTILLERY','RALLY']);
    assert.equal(commander.commandSkills[0].nextUseAt,f.now+5400000);assert.equal(commander.chiefSkills.find(s=>s.code==='ARTILLERY').nextUseAt,f.now+1800000);
    assert.equal((await coupStatus(f.env,{id:3},f.now)).canUseCommandSkills,false);
    assert.equal((await coupStatus(f.env,{id:1},f.now)).canUseChiefSkills,true);
    await f.p("UPDATE coup_rounds_v2115 SET chief_hp=1 WHERE id=?",id).run();
    assert.equal((await cast(2,'ARTILLERY','rebel-front-advance',f.now+5400000)).frontMoved,true);
    round=await f.p('SELECT * FROM coup_rounds_v2115 WHERE id=?',id).first();assert.equal(Number(round.front_index),3);assert.equal(Number(round.chief_hp),500000);
  });
  test(`${label}: rebel authority rejects nuclear, inactive/nonmember/stale assignments and preserves cooldown after commander replacement`,async t=>{
    const f=await fixture(t,pg),id=await f.prepare();await assign(f,id);
    const cast=(uid,code,key)=>useCoupChiefSkill(f.env,{id:uid},{roundId:id,skillCode:code,requestId:key},f.now);
    await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',COUP_SKILL_SETTINGS,JSON.stringify({nuclearEnabled:true})).run();
    await assert.rejects(cast(2,'NUCLEAR','rebel-nuclear-denied'),e=>e.status===403);
    await assert.rejects(cast(3,'RALLY','rebel-other-denied'),e=>e.status===403);
    await f.p("UPDATE users SET status='BLOCKED' WHERE id=2").run();await assert.rejects(cast(2,'RALLY','inactive-commander'),e=>e.status===403);
    await f.p("UPDATE users SET status='ACTIVE' WHERE id=2").run();
    await assign(f,id,5);await assert.rejects(cast(5,'RALLY','loyalist-commander'),e=>e.status===403);
    await assign(f,id);const first=await cast(2,'RALLY','replace-before-rally');await assign(f,id,3);
    await assert.rejects(cast(2,'ARTILLERY','revoked-commander'),e=>e.status===403);
    await assert.rejects(cast(3,'RALLY','replacement-cooldown'),e=>e.status===429);
    assert.equal((await cast(2,'RALLY','replace-before-rally')).replayed,true);
    await assert.rejects(cast(3,'RALLY','replace-before-rally'),e=>e.status===403);
    const settings={...JSON.parse((await f.p('SELECT settings_json FROM coup_rounds_v2115 WHERE id=?',id).first()).settings_json),rebelCommand:{roundId:'another-round',userId:3}};
    await f.p('UPDATE coup_rounds_v2115 SET settings_json=? WHERE id=?',JSON.stringify(settings),id).run();
    await assert.rejects(cast(3,'ARTILLERY','wrong-round-command'),e=>e.status===403);
    assert.equal((await coupStatus(f.env,{id:3},f.now)).rebelCommander,null);
    await f.p("UPDATE coup_rounds_v2115 SET status='FINISHED',winner='DRAW' WHERE id=?",id).run();
    const next=await openCoupRound(f.env,f.now+1000);assert.equal(JSON.parse(next.settings_json).rebelCommand,undefined);assert.equal(first.energyGranted,50);
  });
  test(`${label}: rebel skill receipt failures and in-flight revocation roll back all effects; concurrent retry casts once`,async t=>{
    const f=await fixture(t,pg),id=await f.prepare();await assign(f,id);
    const cast=key=>useCoupChiefSkill(f.env,{id:2},{roundId:id,skillCode:'ARTILLERY',requestId:key},f.now);
    f.fail('INSERT INTO coup_skills_v2118');await assert.rejects(cast('rebel-write-failure'),/INJECTED_FAILURE/);f.fail('');
    assert.equal(Number((await f.p('SELECT chief_hp FROM coup_rounds_v2115 WHERE id=?',id).first()).chief_hp),500000);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_skill_cooldowns_v2118').first()).n),0);
    const batch=f.env.DB.batch.bind(f.env.DB);let revoke=true;
    f.env.DB.batch=async stmts=>{if(revoke){revoke=false;const r=await f.p('SELECT settings_json FROM coup_rounds_v2115 WHERE id=?',id).first();const s=JSON.parse(r.settings_json);delete s.rebelCommand;await f.p('UPDATE coup_rounds_v2115 SET settings_json=? WHERE id=?',JSON.stringify(s),id).run();}return batch(stmts)};
    await assert.rejects(cast('rebel-revoked-inflight'),e=>e.status===409);f.env.DB.batch=batch;
    assert.equal(Number((await f.p('SELECT chief_hp FROM coup_rounds_v2115 WHERE id=?',id).first()).chief_hp),500000);
    await assign(f,id);
    const outcomes=await Promise.allSettled([cast('rebel-concurrent-a'),cast('rebel-concurrent-b')]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
    const key=outcomes.find(r=>r.status==='fulfilled').value.requestId;assert.equal((await cast(key)).replayed,true);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_skills_v2118').first()).n),1);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_atomic_guard_v2115').first()).n),0);
  });
  test(`${label}: trial round jails every rebel for exactly 3 hours with no coin debit, rollback and replay safe`, async t => {
    const f=await fixture(t,pg),id=await f.prepare('CHIEF');
    const round=await f.p('SELECT * FROM coup_rounds_v2115 WHERE id=?',id).first();
    await f.p('UPDATE coup_rounds_v2115 SET settings_json=? WHERE id=?',JSON.stringify({...JSON.parse(round.settings_json),rebelTrial:{roundId:id,prisonHours:3}}),id).run();
    f.fail('INSERT INTO event_prison_captives'); await assert.rejects(settleCoupRound(f.env,id,f.now),/INJECTED_FAILURE/); f.fail('');
    assert.equal((await f.p('SELECT status FROM coup_rounds_v2115 WHERE id=?',id).first()).status,'SETTLING');
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM event_prison_camps').first()).n),0);
    await settleCoupRound(f.env,id,f.now);
    for(const [uid,balance] of [[2,9876543210],[3,0],[4,-3000000000]]){
      assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=?',uid).first()).coin),balance);
      assert.equal((await clanCampStatusForUser(f.env,uid,f.now)).remainingSeconds,10800);
      assert.equal((await clanCampStatusForUser(f.env,uid,f.now+10800000)).incarcerated,false);
    }
    assert.equal((await clanCampStatusForUser(f.env,1,f.now)).incarcerated,false);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_penalties_v2115').first()).n),0);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_trials_v2115').first()).n),0);
    assert.equal((await coupStatus(f.env,{id:2},f.now)).round.rebelDefeat.hours,3);
    const room=await clanCampRoomState(f.env,{id:2},{},f.now); assert.ok(room.inmates.every(row=>row.memberRole==='REBEL'));
    await releaseClanCaptives(f.env,{id:1,role:'OWNER'},{eventId:'coup:'+id,userId:2},f.now);
    await settleCoupRound(f.env,id,f.now+1000);
    assert.equal((await clanCampStatusForUser(f.env,2,f.now+1000)).incarcerated,false);
    const next=await openCoupRound(f.env,f.now+2000); assert.equal(JSON.parse(next.settings_json).rebelTrial,undefined);
  });
  test(`${label}: energy policy is visible before joining and zero energy recovers at the 2-minute boundary`, async t => {
    const f=await fixture(t,pg),id=await f.prepare();
    const spectator=await coupStatus(f.env,{id:99},f.now);
    assert.equal(spectator.mine,null); assert.deepEqual(spectator.energyPolicy,{maxEnergy:10,recoveryMs:120000,attackCost:1});
    await f.p('INSERT INTO coup_energy_v2118(round_id,user_id,energy,energy_at,blocked_until) VALUES(?,?,0,?,0)',id,2,f.now).run();
    await assert.rejects(attackCoup(f.env,{}, {id:2},{roundId:id,requestId:'empty-energy-001'},f.now+119999),e=>e.status===429);
    assert.equal((await coupStatus(f.env,{id:2},f.now+119999)).mine.energyState.energy,0);
    assert.equal((await coupStatus(f.env,{id:2},f.now+120000)).mine.energyState.energy,1);
    assert.equal((await coupStatus(f.env,{id:2},f.now+99999999)).mine.energyState.energy,10);
  });
  test(`${label}: latest PVP decks replace registrations, reward is atomic, win/loss/draw receipts never pay twice`, async t => {
    const f=await fixture(t,pg),id=await f.prepare(); let stamp=f.now,winner='A',version=1;
    t.mock.method(Date,'now',()=>stamp);
    const deck=uid=>Array.from({length:5},(_,i)=>({id:`current-${uid}-${version}-${i}`,title:'현재 카드',rarity:'UR',power_type:'ATTACK',base_power:12000,breakthrough_level:version}));
    const deps={pvpDeckSnapshot:async(_env,uid)=>deck(uid),pvpDeckSnapshotByIds:async()=>{throw Error('Old registration must not be read')},battleSettings:async()=>({engine:{}}),cardBattlePower:c=>c.base_power,
      userEquipmentBonuses:async()=>({pvp:version*1000}),createPvpBattleV2:args=>{const b=createPvpBattleV2(args);b.result.winner=winner;return b;}};
    const before=Number((await f.p('SELECT coin FROM users WHERE id=2').first()).coin);
    f.fail('INSERT INTO coup_attacks_v2115'); await assert.rejects(attackCoup(f.env,deps,{id:2},{roundId:id,requestId:'failed-payment-001'},stamp),/INJECTED_FAILURE/); f.fail('');
    assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=2').first()).coin),before);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_energy_v2118').first()).n),0);
    let total=0,lastOpponent;
    for(const [outcome,reward] of [['A',20000000],['B',10000000],['DRAW',20000000]]){
      winner=outcome; const body={roundId:id,requestId:'latest-reward-'+outcome};
      const r=await attackCoup(f.env,deps,{id:2,nickname:'현재 덱'},body,stamp);
      assert.equal(r.coinReward,reward); total+=reward;
      assert.equal(r.attackerCards[0].id,`current-2-${version}-0`);
      assert.equal(r.defenderCards[0].id,`current-${r.opponent.id}-${version}-0`);
      if(lastOpponent)assert.notEqual(r.opponent.id,lastOpponent);lastOpponent=r.opponent.id;
      const saved=await f.p('SELECT * FROM coup_participants_v2115 WHERE round_id=? AND user_id=2',id).first();
      assert.equal(JSON.parse(saved.deck_snapshot)[0],`current-2-${version}-0`);
      assert.equal(JSON.parse(saved.loadout_bonus_json).pvp,version*1000);
      assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=2').first()).coin),before+total);
      const replay=await attackCoup(f.env,deps,{id:2},body,stamp);assert.equal(replay.coinReward,reward);
      assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=2').first()).coin),before+total);
      stamp+=31000;version++;
    }
  });
  test(`${label}: chief-only skills, nuclear OFF, independent cooldowns, retry and complete rollback`, async t => {
    const f=await fixture(t,pg),id=await f.prepare();
    const cast=(code,key,now=f.now,user=1)=>useCoupChiefSkill(f.env,{id:user},{roundId:id,skillCode:code,requestId:key},now);
    await assert.rejects(cast('ARTILLERY','forbidden-001',f.now,2),e=>e.status===403);
    await assert.rejects(cast('NUCLEAR','nuclear-off-001'),e=>e.status===403);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_skill_cooldowns_v2118').first()).n),0);
    f.fail('INSERT INTO coup_skills_v2118');await assert.rejects(cast('RALLY','rollback-001'),/INJECTED_FAILURE/);f.fail('');
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_energy_v2118').first()).n),0);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_skill_cooldowns_v2118').first()).n),0);
    const rally=await cast('RALLY','rally-test-001');assert.equal(rally.energyGranted,50);assert.equal(rally.nextUseAt,f.now+3600000);assert.equal(rally.affectedCount,2);
    assert.equal((await cast('RALLY','rally-test-001')).replayed,true);
    await assert.rejects(cast('RALLY','rally-too-soon',f.now+1800000),e=>e.status===429);
    const arty=await cast('ARTILLERY','artillery-001');assert.equal(arty.damage,150000);assert.equal(arty.nextUseAt,f.now+1800000);
    assert.equal(Number((await f.p('SELECT rebel_hp FROM coup_rounds_v2115 WHERE id=?',id).first()).rebel_hp),350000);
    const status=await coupStatus(f.env,{id:1},f.now);assert.equal(status.chiefSkills.find(s=>s.code==='NUCLEAR').enabled,false);
    assert.equal(status.mine.energyState.energy,50);assert.equal(status.skillEvents.length,2);
    assert.equal((await coupStatus(f.env,{id:2},f.now)).mine.energyState.energy,10);
    await f.p("UPDATE app_meta SET value=? WHERE key='chief_appointment_v1'",JSON.stringify({...f.appointment,id:'new-term',userId:2})).run();
    await assert.rejects(cast('RALLY','stale-chief-001',f.now+3600000),e=>e.status===403);
  });
  test(`${label}: nuclear applies to exactly 50 rebels, blocks attacks, then recovers only after 10+2 minutes`,async t=>{
    const f=await fixture(t,pg),id=await f.prepare();
    for(let userId=10;userId<65;userId++){
      await f.p('INSERT INTO users(id,nickname) VALUES(?,?)',userId,'병사'+userId).run();
      await f.p("INSERT INTO coup_participants_v2115(round_id,user_id,side,deck_snapshot,loadout_bonus_json,deck_power,joined_at) VALUES(?,?,'REBEL','[]','{}',100,?)",id,userId,f.now).run();
    }
    await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',COUP_SKILL_SETTINGS,JSON.stringify({nuclearEnabled:true})).run();
    const result=await useCoupChiefSkill(f.env,{id:1},{roundId:id,skillCode:'NUCLEAR',requestId:'nuclear-on-test'},f.now);
    assert.equal(result.affectedCount,50);assert.equal(new Set(result.affectedUserIds).size,50);assert.ok(!result.affectedUserIds.includes(1)&&!result.affectedUserIds.includes(5));
    const hit=result.affectedUserIds[0];
    await assert.rejects(attackCoup(f.env,{}, {id:hit},{roundId:id,requestId:'nuclear-hit-attack'},f.now+1),e=>e.status===429);
    assert.equal((await coupStatus(f.env,{id:hit},f.now+600000)).mine.energyState.energy,0);
    assert.equal((await coupStatus(f.env,{id:hit},f.now+720000)).mine.energyState.energy,1);
    await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({nuclearEnabled:false}),COUP_SKILL_SETTINGS).run();
    await assert.rejects(useCoupChiefSkill(f.env,{id:1},{roundId:id,skillCode:'NUCLEAR',requestId:'nuclear-disabled-again'},f.now+1800000),e=>e.status===403);
  });
  test(`${label}: concurrent skill casts cannot double strike; artillery uses existing front advance`,async t=>{
    const f=await fixture(t,pg),id=await f.prepare();
    const outcomes=await Promise.allSettled(['concurrent-a','concurrent-b'].map(requestId=>useCoupChiefSkill(f.env,{id:1},{roundId:id,skillCode:'ARTILLERY',requestId},f.now)));
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coup_skills_v2118').first()).n),1);
    await f.p('UPDATE coup_rounds_v2115 SET rebel_hp=100000 WHERE id=?',id).run();
    const next=await useCoupChiefSkill(f.env,{id:1},{roundId:id,skillCode:'ARTILLERY',requestId:'advance-front-test'},f.now+1800000);
    assert.equal(next.damage,100000);assert.equal(next.frontMoved,true);
    const r=await f.p('SELECT * FROM coup_rounds_v2115 WHERE id=?',id).first();assert.equal(Number(r.front_index),1);assert.equal(Number(r.rebel_hp),500000);
  });
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
    assert.equal(Number((await f.p('SELECT energy FROM coup_energy_v2118 WHERE round_id=? AND user_id=2',id).first()).energy),9);
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
    let body = { nuclearEnabled: true }, audit;
    deps.requirePermission = async () => ({ id: 1, role: 'ADMIN' });
    deps.readBody = async () => body;
    deps.writeAdminLog = async (...args) => { audit = args; };
    const toggle = () => handleCoup({ path: 'admin/coup/skills', request: { method: 'POST' }, env: f.env, deps });
    assert.equal((await toggle()).status, 403);
    deps.requirePermission = async () => ({ id: 1, role: 'OWNER' });
    body = { nuclearEnabled: 'true' }; assert.equal((await toggle()).status, 400);
    body = { nuclearEnabled: true }; assert.equal((await toggle()).data.skillSettings.nuclearEnabled, true);
    assert.equal(audit[2], 'COUP_SKILLS');
    body = { nuclearEnabled: false }; assert.equal((await toggle()).data.skillSettings.nuclearEnabled, false);
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
  assert.match(read('functions/_coup.js'), /simulateTerritoryDuel\(env, combatDeps/);
});

for (const pg of [false, true]) test('recruitment roster stays private until combat starts: ' + (pg ? 'postgres' : 'sqlite'), async t => {
  const f = await fixture(t, pg), id = await f.prepare();
  await f.p("UPDATE coup_rounds_v2115 SET status='RECRUITING',starts_at=NULL,ends_at=NULL WHERE id=?", id).run();
  for (const viewer of [1, 2, 99]) {
    const s = await coupStatus(f.env, { id: viewer }, f.now);
    assert.deepEqual(s.members, []);
    assert.equal(s.mine?.side || null, viewer === 1 ? 'CHIEF' : viewer === 2 ? 'REBEL' : null);
  }
  assert.equal((await coupStatus(f.env, { id: 1 }, f.now, true)).members.length, 5);
  await startCoupRound(f.env, id, f.now);
  const active = await coupStatus(f.env, { id: 2 }, f.now);
  assert.equal(active.round.status, 'ACTIVE');
  assert.equal(active.members.filter(m => m.side === 'CHIEF').length, 2);
  assert.equal(active.members.filter(m => m.side === 'REBEL').length, 3);
  assert.equal(active.mine.side, 'REBEL');
});

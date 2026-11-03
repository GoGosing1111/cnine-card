import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { __postgresCompatTest } from '../../functions/_postgres_d1_compat.js';
import { ensureCoupSchema, chiefDuty, chiefAuthorityGuard } from '../../functions/_coup_schema.js';
import { openCoupRound, startCoupRound, joinCoupRound, settleCoupRound, voteCoupTrial, closeCoupTrial, coupStatus, handleCoup, attackCoup } from '../../functions/_coup.js';
import { clanCampStatusForUser, clanCampRoomState, releaseClanCaptives, sendClanCampChat } from '../../functions/_clan_prison_camp.js';
import { advanceFront, deadlineWinner, coupSettings, coupRebelDefeatPolicy, coupMatchedOpponent } from '../../shared/coup-palace-v2115.mjs';
import { readFileSync } from 'node:fs';
import { createPvpBattleV2 } from '../../functions/_battle_v2_preview.js';
import { useCoupChiefSkill, COUP_SKILL_SETTINGS, applyCoupRoundSupport } from '../../functions/_coup.js';
import { coupEnergy, coupSkillCooldown, chooseNuclearTargets, coupRebelCommanderId, coupRecoveryMs, COUP_REBEL_SUPPORT_PRESET } from '../../shared/coup-chief-skills-v2118.mjs';
import { territorySiegeDamage } from '../../functions/_territory_war.js';

export async function fixture(t, pg) {
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
    await p('UPDATE coup_rounds_v2115 SET settings_json=? WHERE id=?', JSON.stringify({...JSON.parse(r.settings_json), rebelCommand:{roundId:r.id,userId:2}}), r.id).run();
    if (winner) await p("UPDATE coup_rounds_v2115 SET status='SETTLING',winner=? WHERE id=?", winner, r.id).run();
    return r.id;
  }
  async function legacyTrial(id) {
    const r=await p('SELECT * FROM coup_rounds_v2115 WHERE id=?',id).first();
    await DB.batch([
      p("UPDATE coup_rounds_v2115 SET status='FINISHED' WHERE id=?",id),
      p('INSERT INTO coup_trials_v2115(id,round_id,appointment_id,defendant_id,defendant_name,starts_at,ends_at) VALUES(?,?,?,?,?,?,?)',id,id,r.appointment_id,r.chief_user_id,r.chief_name,now,now+JSON.parse(r.settings_json).trialMinutes*60000),
      p("INSERT INTO coup_electorate_v2115(trial_id,user_id) SELECT ?,id FROM users WHERE status='ACTIVE'",id),
      p("INSERT INTO chief_duty_cases_v2115(appointment_id,trial_id,status) VALUES(?,?,'OPEN')",r.appointment_id,id)
    ]);
  }
  return { env, p, now, prepare, legacyTrial, fail(s) { failAt = s; }, appointment };
}


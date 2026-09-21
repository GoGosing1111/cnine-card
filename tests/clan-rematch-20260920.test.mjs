import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {CLAN_REMATCH_20260920_KEY,ensureClanRematch20260920} from '../functions/_clan_rematch_20260920.js';

test('운영 상태 경로는 빠른 foundation 이후에도 일회성 적용 함수를 직접 실행한다',()=>{
  const source=requireText('../functions/_clan.js');
  assert.match(source,/path==='clan\/rematch-20260920\/status'[\s\S]{0,180}ensureClanRematch20260920\(env\)/);
});

function requireText(relative){return readFileSync(new URL(relative,import.meta.url),'utf8')}

async function fixture(t,postgres){
  const schema=`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE clan_seasons(id INTEGER PRIMARY KEY,phase TEXT,ends_at TEXT,updated_at TEXT);
    CREATE TABLE clan_wars(id INTEGER PRIMARY KEY,season_id INTEGER,round_no INTEGER,clan_a_id INTEGER,clan_b_id INTEGER,status TEXT,score_a INTEGER,score_b INTEGER,battle_count INTEGER,starts_at TEXT,ends_at TEXT,winner_clan_id INTEGER,updated_at TEXT);
    CREATE TABLE clan_season_teams(season_id INTEGER,clan_id INTEGER,score INTEGER,wins INTEGER,losses INTEGER,updated_at TEXT,PRIMARY KEY(season_id,clan_id));
    CREATE TABLE clan_members(season_id INTEGER,clan_id INTEGER,user_id INTEGER,battle_wins INTEGER,battle_losses INTEGER,contribution_score INTEGER,updated_at TEXT,PRIMARY KEY(season_id,user_id));
    CREATE TABLE clan_war_battles(id INTEGER PRIMARY KEY,war_id INTEGER,attacker_user_id INTEGER,defender_user_id INTEGER,attacker_clan_id INTEGER,defender_clan_id INTEGER,status TEXT,winner_clan_id INTEGER,error_message TEXT,updated_at TEXT);
    CREATE TABLE clan_participation_receipts(battle_id INTEGER PRIMARY KEY,status TEXT,points INTEGER,base_coin INTEGER,win_bonus_coin INTEGER,milestone_coin INTEGER);
    CREATE TABLE clan_participation_progress(war_id INTEGER,user_id INTEGER,completed_attacks INTEGER);
    CREATE TABLE clan_war_reservation_locks(war_id INTEGER,user_id INTEGER);
  `;
  if(postgres){
    const pg=new PGlite();t.after(()=>pg.close());await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");await pg.exec(schema);
    const client={async query(input){const sql=typeof input==='string'?input:input.text;const result=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return{...result,rowCount:result.affectedRows??result.rows.length}}};
    const DB=new __postgresCompatTest.PostgresD1Database(client);return{env:{DB},p:(sql,...values)=>DB.prepare(sql).bind(...values)};
  }
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(schema);
  const prepare=(sql,values=[])=>({sql,values,bind(...next){return prepare(sql,next)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return{results:sqlite.prepare(sql).all(...values)}},async run(){const r=sqlite.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}});
  const DB={prepare,async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sqlite.exec('COMMIT');return out}catch(error){sqlite.exec('ROLLBACK');throw error}}};
  return{env:{DB},p:(sql,...values)=>prepare(sql,values)};
}

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: 20일 라운드 전적을 무효화하고 21일 재경기 및 이후 일정 순연을 원자 적용한다`,async t=>{
  const f=await fixture(t,postgres);await f.p("INSERT INTO app_meta VALUES('clan_settings_v1',?,CURRENT_TIMESTAMP)",JSON.stringify({seasonWinScore:3,seasonLossScore:0})).run();
  await f.p("INSERT INTO clan_seasons VALUES(7,'ACTIVE','2026-09-26T13:00:00.000Z',CURRENT_TIMESTAMP)").run();
  for(const [clan,score,wins,losses] of [[1,3,1,1],[2,3,1,1],[3,3,1,0],[4,0,0,1]])await f.p('INSERT INTO clan_season_teams VALUES(7,?,?,?,?,CURRENT_TIMESTAMP)',clan,score,wins,losses).run();
  for(const [user,wins,losses,contribution] of [[1,0,1,1],[2,1,1,1],[3,0,0,0],[4,0,0,0]])await f.p('INSERT INTO clan_members VALUES(7,?,?,?,?,?,CURRENT_TIMESTAMP)',user,user,wins,losses,contribution).run();
  await f.p("INSERT INTO clan_wars VALUES(9,7,0,1,2,'COMPLETED',0,3,1,'2026-09-19T12:00:00.000Z','2026-09-19T13:00:00.000Z',2,CURRENT_TIMESTAMP)").run();
  await f.p("INSERT INTO clan_wars VALUES(10,7,1,1,2,'COMPLETED',3,1,1,'2026-09-20T12:00:00.000Z','2026-09-20T13:00:00.000Z',1,CURRENT_TIMESTAMP)").run();
  await f.p("INSERT INTO clan_wars VALUES(11,7,1,3,4,'COMPLETED',1,3,0,'2026-09-20T12:00:00.000Z','2026-09-20T13:00:00.000Z',3,CURRENT_TIMESTAMP)").run();
  await f.p("INSERT INTO clan_wars VALUES(12,7,2,1,3,'SCHEDULED',0,0,0,'2026-09-21T12:00:00.000Z','2026-09-21T13:00:00.000Z',NULL,CURRENT_TIMESTAMP)").run();
  await f.p("INSERT INTO clan_wars VALUES(13,7,2,2,4,'SCHEDULED',0,0,0,'2026-09-21T12:00:00.000Z','2026-09-21T13:00:00.000Z',NULL,CURRENT_TIMESTAMP)").run();
  await f.p("INSERT INTO clan_war_battles VALUES(100,10,1,2,1,2,'COMPLETED',1,NULL,CURRENT_TIMESTAMP)").run();
  await f.p("INSERT INTO clan_war_battles VALUES(99,9,1,2,1,2,'COMPLETED',2,NULL,CURRENT_TIMESTAMP)").run();
  await f.p("INSERT INTO clan_participation_receipts VALUES(100,'COMPLETED',3,10,2,0)").run();
  await f.p('INSERT INTO clan_participation_progress VALUES(10,1,1)').run();await f.p('INSERT INTO clan_war_reservation_locks VALUES(10,1)').run();
  await f.p("INSERT INTO app_meta VALUES('clan_war_pig_coin_v1:10',?,CURRENT_TIMESTAMP)",JSON.stringify({totalAmount:90})).run();
  const result=await ensureClanRematch20260920(f.env);assert.equal(result.status,'COMPLETED',JSON.stringify(result));assert.equal(result.roundNo,1);assert.equal(result.voidedBattles,1);assert.equal(result.retainedParticipationCoin,12);assert.equal(result.retainedPigCoin,90);assert.equal(result.shiftedRounds,1);
  const replay=await f.p('SELECT * FROM clan_wars WHERE id=10').first();assert.equal(replay.status,'SCHEDULED');assert.equal(replay.starts_at,'2026-09-21T12:00:00.000Z');assert.equal(replay.score_a,0);assert.equal(replay.winner_clan_id,null);assert.deepEqual([replay.clan_a_id,replay.clan_b_id],[1,2]);
  const pairedReplay=await f.p('SELECT * FROM clan_wars WHERE id=11').first();assert.deepEqual([pairedReplay.clan_a_id,pairedReplay.clan_b_id],[3,4]);assert.equal(pairedReplay.starts_at,'2026-09-21T12:00:00.000Z');
  assert.equal((await f.p('SELECT starts_at FROM clan_wars WHERE id=12').first()).starts_at,'2026-09-22T12:00:00.000Z');
  assert.equal((await f.p('SELECT status FROM clan_war_battles WHERE id=100').first()).status,'VOIDED');assert.equal((await f.p('SELECT COUNT(*) n FROM clan_participation_progress').first()).n,0);assert.equal((await f.p('SELECT COUNT(*) n FROM clan_war_reservation_locks').first()).n,0);
  const team=await f.p('SELECT score,wins,losses FROM clan_season_teams WHERE clan_id=1').first();assert.deepEqual([team.score,team.wins,team.losses],[0,0,1]);
  const member=await f.p('SELECT battle_wins,battle_losses,contribution_score FROM clan_members WHERE user_id=1').first();assert.deepEqual([member.battle_wins,member.battle_losses,member.contribution_score],[0,1,1]);
  const replayed=await ensureClanRematch20260920(f.env);assert.equal(replayed.status,'COMPLETED');assert.equal((await f.p('SELECT COUNT(*) n FROM app_meta WHERE key=?',CLAN_REMATCH_20260920_KEY).first()).n,1);
});

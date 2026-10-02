import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {rankedHistoryRows,syncRankedDefensePreset,createPvpTimings} from '../functions/_pvp_performance.js';

const columns='id,attacker_id,defender_id,attacker_name,defender_name,attacker_power,defender_power,winner_id,attacker_score_before,attacker_score_after,defender_score_before,defender_score_after,score_change,created_at';
const schema=`CREATE TABLE pvp_match_history(id INTEGER PRIMARY KEY,attacker_id INTEGER,defender_id INTEGER,attacker_name TEXT,defender_name TEXT,attacker_power INTEGER,defender_power INTEGER,winner_id INTEGER,attacker_score_before INTEGER,attacker_score_after INTEGER,defender_score_before INTEGER,defender_score_after INTEGER,score_change INTEGER,created_at TEXT);
CREATE INDEX idx_pvp_match_history_attacker_recent ON pvp_match_history(attacker_id,id DESC);
CREATE INDEX idx_pvp_match_history_defender_recent ON pvp_match_history(defender_id,id DESC);
CREATE TABLE pvp_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT NOT NULL,updated_at TEXT);
CREATE TABLE pvp_deck_presets(user_id INTEGER,preset_no INTEGER,card_ids TEXT NOT NULL,PRIMARY KEY(user_id,preset_no));`;
const sqliteEnv=db=>({DB:{
  prepare(sql){
    let values=[];
    return {
      bind(...v){values=v;return this;},
      async all(){return {results:db.prepare(sql).all(...values)};},
      async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}};}
    };
  },
  async batch(statements){
    db.exec('BEGIN');
    try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}
    catch(e){db.exec('ROLLBACK');throw e;}
  }
}});

test('history preserves exact descending IDs, fields, limit and self-match deduplication',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(schema);
  const insert=db.prepare('INSERT INTO pvp_match_history VALUES('+Array(14).fill('?').join(',')+')');
  for(let id=1;id<=1800;id++){
    const attacker=id%4===0?1:2+(id%19),defender=id%5===0?1:2+(id%13);
    // Deliberately nonchronological timestamps ensure no accidental switch to date sorting.
    insert.run(id,attacker,defender,'a'+attacker,'d'+defender,id*10,id*11,attacker,1000,1024,1000,984,24,id%2?'2026-09-01':'2026-01-01');
  }
  const env=sqliteEnv(db);
  for(const user of [1,2,20,999])for(const limit of [10,100,500]){
    const expected=db.prepare(`SELECT ${columns} FROM pvp_match_history WHERE attacker_id=? OR defender_id=? ORDER BY id DESC LIMIT ?`).all(user,user,limit);
    assert.deepEqual((await rankedHistoryRows(env,user,limit)).results,expected);
  }
});

test('PostgreSQL sparse and busy accounts use both recent indexes with bounded rows',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());await pg.exec(schema);
  await pg.exec(`INSERT INTO pvp_match_history(id,attacker_id,defender_id,created_at)
    SELECT n,10+n%70,100+n%80,'2026-09-28' FROM generate_series(1,24000) n;
    INSERT INTO pvp_match_history(id,attacker_id,defender_id,created_at) VALUES(24001,1,2,'2026-09-28'),(24002,2,1,'2026-09-01'),(24003,1,1,'2026-08-01'); ANALYZE pvp_match_history;`);
  const client={async query(q){const r=await pg.query(typeof q==='string'?q:q.text,typeof q==='string'?[]:q.values);return {...r,rowCount:r.affectedRows??r.rows.length}}};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  for(const user of [1,10,100,999]){
    const actual=(await rankedHistoryRows(env,user,100)).results;
    assert.deepEqual(actual,(await pg.query(`SELECT ${columns} FROM pvp_match_history WHERE attacker_id=$1 OR defender_id=$1 ORDER BY id DESC LIMIT 100`,[user])).rows);
    let captured;
    await rankedHistoryRows({DB:{prepare(sql){return {bind(...args){captured={sql,args};return this},all:async()=>({results:[]})}}}},user,100);
    const sql=__postgresCompatTest.bindQuestionMarks(captured.sql).text;
    const plan=(await pg.query('EXPLAIN (ANALYZE,FORMAT JSON) '+sql,captured.args)).rows[0]['QUERY PLAN'][0].Plan;
    const nodes=[];const walk=n=>{nodes.push(n);for(const child of n.Plans||[])walk(child)};walk(plan);
    for(const index of ['idx_pvp_match_history_attacker_recent','idx_pvp_match_history_defender_recent'])assert.ok(nodes.some(n=>n['Index Name']===index),index);
    assert.ok(nodes.every(n=>(n['Rows Removed by Filter']||0)<=1));
    // A small fixture may prefer a bitmap scan of that user's ~350 rows. It
    // must never walk the global 24,003-row primary index to find an account.
    assert.ok(nodes.every(n=>(n['Actual Rows']||0)<=500));
  }
});

test('config preserves legacy preset creation but does not rewrite unchanged defense state',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(schema);
  db.exec(`INSERT INTO pvp_decks VALUES(1,'[1,2,3,4,5]','old'),(2,'[9,8,7,6,5]','old');
    INSERT INTO pvp_deck_presets VALUES(2,1,'[1,2,3,4,5]'),(2,2,'[9,8,7,6,5]');`);
  const env=sqliteEnv(db);
  assert.deepEqual((await syncRankedDefensePreset(env,1)).map(x=>x.meta.changes),[1,0]);
  assert.equal(db.prepare('SELECT updated_at FROM pvp_decks WHERE user_id=1').get().updated_at,'old');
  assert.deepEqual((await syncRankedDefensePreset(env,2)).map(x=>x.meta.changes),[0,1]);
  assert.equal(db.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=2').get().card_ids,'[1,2,3,4,5]');
  assert.equal(db.prepare('SELECT card_ids FROM pvp_deck_presets WHERE user_id=2 AND preset_no=2').get().card_ids,'[9,8,7,6,5]');
  for(let i=0;i<3;i++)assert.deepEqual((await syncRankedDefensePreset(env,2)).map(x=>x.meta.changes),[0,0]);
  assert.deepEqual((await syncRankedDefensePreset(env,999)).map(x=>x.meta.changes),[0,0]);
});

test('PostgreSQL defense sync is idempotent under duplicate requests and retries after rollback',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());await pg.exec(schema+"; CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT CURRENT_TIMESTAMP::text$$; INSERT INTO pvp_decks VALUES(1,'[1,2,3,4,5]','old');");
  let fail=false;
  const client={async query(q){const sql=typeof q==='string'?q:q.text;if(fail&&sql.startsWith('UPDATE pvp_decks')){fail=false;throw Error('injected failure')}const r=await pg.query(sql,typeof q==='string'?[]:q.values);return {...r,rowCount:r.affectedRows??r.rows.length}}};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  fail=true;await assert.rejects(syncRankedDefensePreset(env,1),/injected/);
  assert.equal((await pg.query('SELECT * FROM pvp_deck_presets')).rows.length,0);
  await Promise.all([syncRankedDefensePreset(env,1),syncRankedDefensePreset(env,1)]);
  assert.equal((await pg.query('SELECT * FROM pvp_deck_presets')).rows.length,1);
  assert.equal((await pg.query('SELECT updated_at FROM pvp_decks')).rows[0].updated_at,'old');
});

test('request phase timings are isolated, nonnegative and restricted to ranked routes',()=>{
  let now=10;const a=createPvpTimings('pvp/fight',()=>now),b=createPvpTimings('pvp/config',()=>now);
  now=30;a.mark('preflight');now=50;a.mark('ticket');b.mark('settings');
  assert.deepEqual(a.snapshot(),{preflight:20,ticket:20});assert.deepEqual(b.snapshot(),{settings:40});
  a.snapshot().ticket=999;assert.match(a.serverTiming(),/pvp_ticket;dur=20/);
  assert.equal(createPvpTimings('unrelated'),null);
});

test('ranked optimized history and timings are wired; rewards remain before response',()=>{
  const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  const history=source.slice(source.indexOf("if(path==='pvp/history')"),source.indexOf("if(path==='pvp/ranking')"));
  assert.match(history,/rankedHistoryRows\(env,user.id,settings.historyLimit\)/);
  const fight=source.slice(source.indexOf("if(path==='pvp/fight'&&request.method==='POST')"),source.indexOf("if(path==='pvp/history')"));
  assert.doesNotMatch(fight,/waitUntil/);
  assert.doesNotMatch(fight,/await grantBattleCube/,'retired cube rewards must not run');
  let last=-1;for(const operation of ['claimRankedMatchTicket','consumePvpEnergy','await commitRankedFight','await grantHighGradeRerollDrop','await resolveMagicCrystalReward','await safeEquipmentDrop','await rollBlackMiracleDrop','await safeUnifiedDrop','return json({result:']){const position=fight.indexOf(operation);assert.ok(position>last,operation);last=position;}
});

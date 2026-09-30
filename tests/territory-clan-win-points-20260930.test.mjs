import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {__territoryClanTest} from '../functions/_territory_war.js';
import {finishTerritoryClanRound,TERRITORY_CLAN_WIN_POINTS} from '../functions/_territory_clan_warfare.js';

const schema=`
CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
CREATE TABLE territory_war_v3_rounds(id INTEGER PRIMARY KEY,status TEXT,version INTEGER,winner_side TEXT,settled_at TEXT,warfare_version INTEGER,clan_season_id INTEGER,skill_action_token TEXT,current_front_id INTEGER,current_front_index INTEGER,a_total_damage INTEGER,b_total_damage INTEGER,updated_at TEXT);
CREATE TABLE territory_war_clans(round_id INTEGER,clan_id INTEGER,side TEXT,position INTEGER,PRIMARY KEY(round_id,clan_id));
CREATE TABLE clan_season_teams(season_id INTEGER,clan_id INTEGER,score INTEGER,wins INTEGER,losses INTEGER,updated_at TEXT,PRIMARY KEY(season_id,clan_id));
CREATE TABLE territory_war_mutation_guards(token TEXT PRIMARY KEY,ok INTEGER CHECK(ok=1));
CREATE TABLE territory_war_v3_users(round_id INTEGER,user_id INTEGER,side TEXT,damage INTEGER,counter_contribution INTEGER,ace_defeats INTEGER,last_defense_successes INTEGER,comeback_participations INTEGER,attacks INTEGER);
CREATE TABLE territory_war_v3_actions(round_id INTEGER,user_id INTEGER,status TEXT);
CREATE TABLE territory_war_v3_rewards(round_id INTEGER,user_id INTEGER,side TEXT,result TEXT,coin INTEGER,shards INTEGER,damage INTEGER,attacks INTEGER,required_attacks INTEGER,base_result_coin INTEGER,attack_reward_percent INTEGER,attack_adjusted_coin INTEGER,counter_bonus_coin INTEGER,ace_bonus_coin INTEGER,last_defense_bonus_coin INTEGER,comeback_bonus_coin INTEGER,siege_snapshot_bonus_coin INTEGER,premium_cube_quantity INTEGER,claimed_at TEXT,PRIMARY KEY(round_id,user_id));
`;

async function fixture(t,postgres){
  let DB;
  if(postgres){
    const pg=new PGlite();t.after(()=>pg.close());await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");await pg.exec(schema);
    const client={async query(input){const result=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length}}};
    DB=new __postgresCompatTest.PostgresD1Database(client);
  }else{
    const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(schema);
    const prepare=(sql,values=[])=>({sql,values,bind(...next){return prepare(sql,next)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){const result=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}}}});
    DB={prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}};
  }
  const p=(sql,...values)=>DB.prepare(sql).bind(...values);
  await p("INSERT INTO territory_war_v3_rounds(id,status,version,warfare_version,clan_season_id,current_front_index,a_total_damage,b_total_damage) VALUES(77,'ACTIVE',5,4,2,4,100,0)").run();
  for(let clanId=1;clanId<=8;clanId++){
    const side=clanId<=4?'A':'B';
    await p('INSERT INTO territory_war_clans VALUES(?,?,?,?)',77,clanId,side,(clanId-1)%4).run();
    await p('INSERT INTO clan_season_teams(season_id,clan_id,score,wins,losses) VALUES(2,?,?,3,1)',clanId,clanId*10).run();
  }
  return {env:{DB},p,round:()=>p('SELECT * FROM territory_war_v3_rounds WHERE id=77').first(),teams:async()=> (await p('SELECT clan_id,score,wins,losses FROM clan_season_teams ORDER BY clan_id').all()).results,receipt:()=>p("SELECT value FROM app_meta WHERE key='territory_clan_win_points_v1:77'").first()};
}

for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  test(`${dialect}: automatic territory victory gives each winning clan exactly two season points once`,async t=>{
    const f=await fixture(t,postgres),before=await f.teams();
    const settled=await __territoryClanTest.settleRound(f.env,await f.round(),{settlementMinAttacks:1});
    assert.equal(settled.status,'FINISHED');assert.equal(settled.winner_side,'A');
    const after=await f.teams();
    for(let i=0;i<8;i++){
      assert.equal(Number(after[i].score)-Number(before[i].score),i<4?TERRITORY_CLAN_WIN_POINTS:0);
      assert.equal(Number(after[i].wins),3);assert.equal(Number(after[i].losses),1);
    }
    const receipt=JSON.parse((await f.receipt()).value);
    assert.deepEqual(receipt.clanIds,[1,2,3,4]);assert.equal(receipt.winnerSide,'A');assert.equal(receipt.pointsPerClan,2);
    assert.equal((await __territoryClanTest.settleRound(f.env,await f.round(),{},'B')).winner_side,'A');
    assert.deepEqual(await f.teams(),after);
  });
  test(`${dialect}: administrator judgment for B awards B clans; draw awards nobody`,async t=>{
    const f=await fixture(t,postgres),before=await f.teams();
    await f.p("UPDATE territory_war_v3_rounds SET status='PREPARING'").run();
    const settled=await __territoryClanTest.settleRound(f.env,await f.round(),{},'B',{adminJudgment:true});
    assert.equal(settled.winner_side,'B');
    const after=await f.teams();for(let i=0;i<8;i++)assert.equal(Number(after[i].score)-Number(before[i].score),i>=4?2:0);
    assert.deepEqual(JSON.parse((await f.receipt()).value).clanIds,[5,6,7,8]);
    const draw=await fixture(t,postgres),drawBefore=await draw.teams();
    assert.equal((await __territoryClanTest.settleRound(draw.env,await draw.round(),{},'DRAW',{adminJudgment:true})).winner_side,'DRAW');
    assert.deepEqual(await draw.teams(),drawBefore);assert.equal(await draw.receipt(),null);
  });
  test(`${dialect}: CMS judgment finishes during combat updates and replaces unclaimed reward previews only once`,async t=>{
    const f=await fixture(t,postgres),before=await f.teams(),stale=await f.round(),batch=f.env.DB.batch.bind(f.env.DB);
    await f.p("INSERT INTO territory_war_v3_users VALUES(77,101,'A',5000,0,0,0,0,60),(77,102,'B',6000,0,0,0,0,60)").run();
    await f.p("INSERT INTO territory_war_v3_rewards(round_id,user_id,side,result,coin) VALUES(77,101,'A','WIN',999),(77,102,'B','LOSE',999)").run();
    let combatUpdates=0;
    f.env.DB.batch=async statements=>{
      if(statements.some(statement=>String(statement.source||statement.sql).includes('skill_action_token=?'))){
        await f.p('UPDATE territory_war_v3_rounds SET version=version+3,a_total_damage=a_total_damage+1000 WHERE id=77').run();
        combatUpdates++;
      }
      return batch(statements);
    };
    const cfg={settlementMinAttacks:1,winnerCoin:200,loserCoin:100};
    const settled=await __territoryClanTest.settleRound(f.env,stale,cfg,'B',{adminJudgment:true});
    assert.equal(combatUpdates,1);assert.equal(settled.status,'FINISHED');assert.equal(settled.winner_side,'B');
    assert.equal(Number(settled.version),Number(stale.version)+4);
    const after=await f.teams();for(let i=0;i<8;i++)assert.equal(Number(after[i].score)-Number(before[i].score),i>=4?2:0);
    const rewards=(await f.p('SELECT user_id,result,coin,claimed_at FROM territory_war_v3_rewards ORDER BY user_id').all()).results;
    assert.deepEqual(rewards.map(row=>[Number(row.user_id),row.result,Number(row.coin),row.claimed_at]),[[101,'LOSE',100,null],[102,'WIN',200,null]]);
    assert.equal((await __territoryClanTest.settleRound(f.env,stale,cfg,'A',{adminJudgment:true})).winner_side,'B');
    assert.deepEqual(await f.teams(),after);assert.equal(combatUpdates,1);
    assert.equal((await f.p('SELECT COUNT(*) count FROM territory_war_mutation_guards').first()).count,0);
    assert.deepEqual(JSON.parse((await f.receipt()).value).clanIds,[5,6,7,8]);
  });
  test(`${dialect}: CMS judgment preserves changed-season, inactive-round and existing-receipt guards`,async t=>{
    const f=await fixture(t,postgres),before=await f.teams(),stale=await f.round();
    await f.p('UPDATE territory_war_v3_rounds SET clan_season_id=3,version=version+1').run();
    await assert.rejects(finishTerritoryClanRound(f.env,stale,'B',{adminJudgment:true}));
    assert.equal((await f.round()).settled_at,null);assert.deepEqual(await f.teams(),before);
    await f.p("UPDATE territory_war_v3_rounds SET clan_season_id=2,status='DISABLED'").run();
    await assert.rejects(finishTerritoryClanRound(f.env,stale,'B',{adminJudgment:true}));
    assert.equal((await f.round()).status,'DISABLED');assert.deepEqual(await f.teams(),before);
    await f.p("UPDATE territory_war_v3_rounds SET status='ACTIVE'").run();
    await f.p("INSERT INTO app_meta(key,value) VALUES('territory_clan_win_points_v1:77','already recorded')").run();
    await assert.rejects(finishTerritoryClanRound(f.env,stale,'B',{adminJudgment:true}));
    assert.equal((await f.round()).settled_at,null);assert.deepEqual(await f.teams(),before);
    assert.equal((await f.receipt()).value,'already recorded');
  });
  test(`${dialect}: failed score settlement rolls back round and points, then retries safely`,async t=>{
    const f=await fixture(t,postgres),before=await f.teams(),batch=f.env.DB.batch.bind(f.env.DB);
    f.env.DB.batch=statements=>batch([...statements,f.p("INSERT INTO territory_war_mutation_guards(token,ok) VALUES('forced-failure',0)")]);
    await assert.rejects(__territoryClanTest.settleRound(f.env,await f.round(),{},'A',{adminJudgment:true}));
    assert.equal((await f.round()).status,'ACTIVE');assert.equal((await f.round()).settled_at,null);
    assert.deepEqual(await f.teams(),before);assert.equal(await f.receipt(),null);
    f.env.DB.batch=batch;
    assert.equal((await __territoryClanTest.settleRound(f.env,await f.round(),{},'A',{adminJudgment:true})).winner_side,'A');
    assert.equal((await f.teams())[0].score,12);
  });
  test(`${dialect}: incomplete or stale clan mapping cannot close the round`,async t=>{
    const f=await fixture(t,postgres),before=await f.teams();
    await f.p('DELETE FROM clan_season_teams WHERE season_id=2 AND clan_id=1').run();
    await assert.rejects(__territoryClanTest.settleRound(f.env,await f.round(),{},'A'));
    assert.equal((await f.round()).status,'ACTIVE');assert.equal(await f.receipt(),null);
    assert.deepEqual((await f.teams()).map(row=>row.score),before.slice(1).map(row=>row.score));
    const stale=await f.round();await f.p('UPDATE territory_war_v3_rounds SET version=version+1').run();
    await assert.rejects(finishTerritoryClanRound(f.env,stale,'B'));
    assert.equal((await f.round()).status,'ACTIVE');assert.equal(await f.receipt(),null);
  });
}

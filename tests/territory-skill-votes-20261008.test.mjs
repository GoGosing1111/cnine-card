import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {ensureTerritoryClanSchema,applyTerritorySkill,territorySkillCatalog,territorySkillState} from '../functions/_territory_clan_warfare.js';
import {ensureBattlefieldSchema,freezeBattlefieldPolicy,initializeBattlefieldFront,settleBattlefieldCannon} from '../functions/_territory_battlefield_v5.js';
import {__territoryClanTest as T,territorySiegeDamage} from '../functions/_territory_war.js';
import {recordTerritorySkillVote,territorySkillVoteKey,territoryVoteRows} from '../functions/_territory_skill_votes.js';
import {voteSchema,seedTerritorySkillVotes} from './helpers/territory-skill-vote-fixture.mjs';
const NOW=Date.now(),iso=n=>new Date(n).toISOString(),cfg={...T.DEFAULTS,mode:'ON',minDamage:100,maxDamage:100};
const schema=voteSchema+`
CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT);
CREATE TABLE territory_war_v3_rounds(id INTEGER PRIMARY KEY,status TEXT,version INTEGER DEFAULT 1,current_front_id INTEGER,ends_at TEXT,truce_ends_at TEXT,a_operation TEXT,b_operation TEXT,a_operation_ends_at TEXT,b_operation_ends_at TEXT,a_total_damage INTEGER DEFAULT 0,b_total_damage INTEGER DEFAULT 0,updated_at TEXT);
CREATE TABLE territory_war_v3_fronts(id INTEGER PRIMARY KEY,round_id INTEGER,status TEXT,version INTEGER DEFAULT 1,a_hp INTEGER,b_hp INTEGER,a_max_hp INTEGER,b_max_hp INTEGER,started_at TEXT,updated_at TEXT);
CREATE TABLE territory_war_v3_users(round_id INTEGER,user_id INTEGER,side TEXT,status TEXT,deck_power INTEGER DEFAULT 10000,formation_power INTEGER DEFAULT 10000,attacks INTEGER DEFAULT 0,damage INTEGER DEFAULT 0,front_finishes INTEGER DEFAULT 0,defense_wins INTEGER DEFAULT 0,counter_contribution INTEGER DEFAULT 0,energy INTEGER DEFAULT 1,last_recharged_at TEXT,updated_at TEXT,PRIMARY KEY(round_id,user_id));
CREATE TABLE territory_war_v3_commander_overrides(round_id INTEGER,side TEXT,user_id INTEGER,PRIMARY KEY(round_id,side));
CREATE TABLE territory_war_v3_notices(round_id INTEGER,type TEXT,side TEXT,title TEXT,message TEXT,payload_json TEXT);
`;
async function fixture(t,postgres){
  let DB;
  if(postgres){
    const pg=new PGlite();t.after(()=>pg.close());await pg.exec(schema.replaceAll('INTEGER','BIGINT'));
    await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$; CREATE FUNCTION sqlite_datetime(text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT CASE WHEN $1='now' THEN sqlite_now() ELSE to_char(timezone('UTC',$1::timestamptz),'YYYY-MM-DD HH24:MI:SS') END$$");
    DB=new __postgresCompatTest.PostgresD1Database({async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length}}});
  }else{
    const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(schema);
    const prepare=(sql,values=[])=>({sql,values,bind(...v){return prepare(sql,v)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}}}});
    let tail=Promise.resolve();DB={prepare,batch(statements){const run=()=>{sqlite.exec('BEGIN');try{const out=statements.map(s=>{const r=sqlite.prepare(s.sql).run(...s.values);return {meta:{changes:Number(r.changes)}}});sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}};const result=tail.then(run);tail=result.catch(()=>{});return result}};
  }
  const env={DB},p=(sql,...v)=>DB.prepare(sql).bind(...v),round=()=>p('SELECT * FROM territory_war_v3_rounds WHERE id=1').first(),front=()=>p('SELECT * FROM territory_war_v3_fronts WHERE id=1').first(),mine=user=>p('SELECT * FROM territory_war_v3_users WHERE round_id=1 AND user_id=?',user).first();
  await ensureTerritoryClanSchema(env);await ensureBattlefieldSchema(env);
  await p("INSERT INTO territory_war_v3_rounds(id,status,warfare_version,current_front_id,ends_at) VALUES(1,'RECRUITING',4,1,?)",iso(NOW+86400000)).run();await freezeBattlefieldPolicy(env,await round(),cfg);
  await p("UPDATE territory_war_v3_rounds SET status='ACTIVE'").run();
  await p("INSERT INTO territory_war_v3_fronts(id,round_id,status,a_hp,b_hp,a_max_hp,b_max_hp,started_at) VALUES(1,1,'ACTIVE',500000,500000,1000000,1000000,?)",iso(NOW)).run();
  await initializeBattlefieldFront(env,await round(),await front());
  for(let user=1;user<=30;user++){await p('INSERT INTO users VALUES(?,?)',user,'USER '+user).run();await p("INSERT INTO territory_war_v3_users(round_id,user_id,side,status) VALUES(1,?,?,'ACTIVE')",user,user<=26?'A':'B').run()}
  await p("INSERT INTO territory_war_v3_commander_overrides VALUES(1,'A',1),(1,'B',27)").run();
  const f={env,p,round,front,mine};let seq=0;
  f.vote=async(user,operation='INFILTRATION',extra={})=>recordTerritorySkillVote(env,{round:await round(),front:await front(),mine:await mine(user),operation,voteKey:territorySkillVoteKey(1,1,user<=26?'A':'B',operation),requestId:'VOTE_TEST:'+String(++seq).padStart(10,'0'),now:NOW,...extra});
  f.cast=key=>T.activateVotedTerritorySkill(env,key,cfg);
  return f;
}
for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  test(dialect+': 24 distinct participants cannot fire; the 25th ordinary participant triggers exactly once',async t=>{
    const f=await fixture(t,postgres),key=territorySkillVoteKey(1,1,'A','INFILTRATION');
    for(let user=1;user<=24;user++)await f.vote(user);
    await f.vote(1);await f.vote(1);await f.vote(27);
    assert.equal((await territoryVoteRows(f.env,1)).find(v=>v.operation===key).votes,24);
    assert.equal(await f.cast(key),null);assert.equal((await f.front()).b_hp,500000);
    const commander=await f.mine(1);
    await assert.rejects(applyTerritorySkill(f.env,{round:await f.round(),front:await f.front(),mine:commander,operation:'INFILTRATION',cfg,voteKey:key,requestId:'BYPASS:COMMANDER',damageFor:territorySiegeDamage,definition:territorySkillCatalog(T.OPERATIONS,cfg).INFILTRATION}));
    const vote=await f.vote(25),result=await f.cast(key);assert.equal(result.damage,120000);assert.equal(result.activated,true);
    assert.equal((await f.front()).b_hp,380000);assert.equal((await f.round()).a_total_damage,120000);
    assert.equal((await f.cast(key)).replayed,true);assert.equal((await f.vote(25,'INFILTRATION',{requestId:vote.requestId})).replayed,true);
    assert.equal((await f.front()).b_hp,380000);assert.equal((await f.p('SELECT COUNT(*) n FROM territory_war_skill_cooldowns').first()).n,1);
    assert.equal((await territoryVoteRows(f.env,1)).filter(v=>v.side==='A').length,0);
    assert.equal(Number((await f.p('SELECT SUM(attacks) n FROM territory_war_v3_users').first()).n),0);
    const state=await territorySkillState(f.env,await f.round(),T.OPERATIONS,'A',{A:{user_id:1}},25,NOW+1000);
    assert.equal(state.canVote,true);assert.equal(state.canActivate,false);assert.equal(state.requiredVotes,25);assert.equal(state.A.skills.INFILTRATION.ready,false);
  });
  test(dialect+': a participant has one choice; opposing, inactive, stale-front and stale-cooldown votes cannot qualify',async t=>{
    const f=await fixture(t,postgres),oldKey=territorySkillVoteKey(1,1,'A','INFILTRATION');
    for(let user=1;user<=24;user++)await f.vote(user);
    await f.vote(24,'ASSAULT');assert.equal((await territoryVoteRows(f.env,1)).find(v=>v.operation===oldKey).votes,23);
    await assert.rejects(f.vote(27,'INFILTRATION',{voteKey:oldKey}));
    await f.p("UPDATE territory_war_v3_users SET status='WAITING' WHERE user_id=25").run();await assert.rejects(f.vote(25));
    await f.p('UPDATE territory_war_v3_rounds SET truce_ends_at=?',iso(NOW+60000)).run();await assert.rejects(f.vote(26));
    await f.p('UPDATE territory_war_v3_rounds SET truce_ends_at=NULL,current_front_id=2').run();await assert.rejects(f.vote(26));assert.equal(await f.cast(oldKey),null);
    await f.p('UPDATE territory_war_v3_rounds SET current_front_id=1').run();await f.p("INSERT INTO territory_war_skill_cooldowns VALUES(1,'A','INFILTRATION',?)",NOW+45*60000).run();await assert.rejects(f.vote(26));
    await f.p("UPDATE territory_war_skill_cooldowns SET ready_at_ms=?",NOW-1).run();await assert.rejects(f.vote(26));
    const newKey=territorySkillVoteKey(1,1,'A','INFILTRATION',NOW-1);await f.vote(26,'INFILTRATION',{voteKey:newKey});assert.equal(await f.cast(newKey),null);
    assert.equal((await f.front()).b_hp,500000);
  });
  test(dialect+': competing 25th/26th votes and automatic activations share one cooldown, damage and receipt',async t=>{
    const f=await fixture(t,postgres);for(let user=1;user<=24;user++)await f.vote(user,'ASSAULT');
    const key=territorySkillVoteKey(1,1,'A','ASSAULT');
    await Promise.all([f.vote(25,'ASSAULT'),f.vote(26,'ASSAULT')]);
    const results=await Promise.all([f.cast(key),f.cast(key)]);assert.ok(results.every(r=>r?.activated));
    assert.equal((await f.front()).b_hp,499200);assert.equal((await f.round()).a_total_damage,800);
    assert.equal((await f.p("SELECT COUNT(*) n FROM territory_war_skill_receipts WHERE request_id LIKE 'TW_AUTO:%'").first()).n,1);
  });
  test(dialect+': failed activation preserves all votes and rolls back damage, energy and cooldown; lifecycle retries automatically',async t=>{
    const f=await fixture(t,postgres),key=await seedTerritorySkillVotes(f,'REGROUP'),batch=f.env.DB.batch.bind(f.env.DB);
    f.env.DB.batch=statements=>batch([...statements,f.p("INSERT INTO territory_war_mutation_guards(token,ok) VALUES('forced-failure',0)")]);
    assert.equal(await f.cast(key),null);assert.equal((await f.front()).b_hp,500000);assert.equal((await f.mine(1)).energy,1);
    assert.equal((await f.p('SELECT COUNT(*) n FROM territory_war_skill_cooldowns').first()).n,0);assert.equal(Number((await territoryVoteRows(f.env,1))[0].votes),25);
    f.env.DB.batch=batch;assert.equal(await T.settlePendingTerritoryVotes(f.env,await f.round(),cfg),true);
    assert.equal((await f.front()).b_hp,499400);assert.equal((await f.mine(1)).energy,4);assert.equal(await T.settlePendingTerritoryVotes(f.env,await f.round(),cfg),false);
  });
  test(dialect+': cannon waits for charge and facilities, then consumes power once and still fires after 30 seconds',async t=>{
    const f=await fixture(t,postgres),key=await seedTerritorySkillVotes(f,'SIEGE_CANNON');assert.equal(await f.cast(key),null);
    await f.p('UPDATE territory_battlefield_fronts SET charge_a=100,emp_a_until_ms=?',NOW+60000).run();assert.equal(await f.cast(key),null);
    await f.p('UPDATE territory_battlefield_fronts SET emp_a_until_ms=0').run();
    const result=await f.cast(key);assert.equal(result.chargeSpent,100);assert.equal((await f.front()).b_hp,500000);
    assert.equal((await f.p('SELECT charge_a FROM territory_battlefield_fronts').first()).charge_a,0);
    assert.equal(await settleBattlefieldCannon(f.env,{round:await f.round(),front:await f.front(),now:result.dueAt-1}),false);
    assert.equal(await settleBattlefieldCannon(f.env,{round:await f.round(),front:await f.front(),now:result.dueAt}),true);assert.equal((await f.front()).b_hp,400000);
  });
}

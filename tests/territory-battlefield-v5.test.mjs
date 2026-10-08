import {voteSchema,seedTerritorySkillVotes} from './helpers/territory-skill-vote-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {ensureTerritoryClanSchema,territorySkillReceipt} from '../functions/_territory_clan_warfare.js';
import {__territoryClanTest as T} from '../functions/_territory_war.js';
import {ensureBattlefieldSchema,battlefieldPolicy,freezeBattlefieldPolicy,initializeBattlefieldFront,battlefieldAttackContext,battlefieldAttackGuards,battlefieldContributionStatements,battlefieldAttackCleanup,battlefieldSiegeSql,applyBattlefieldSkill,settleBattlefieldCannon,claimBattlefieldSupply,battlefieldState} from '../functions/_territory_battlefield_v5.js';
import {BATTLEFIELD_DEFAULTS as C,normalizeBattlefieldConfig,supplyWindow,battlefieldIronWallMultiplier,battlefieldSiegeMultiplier} from '../shared/territory-battlefield-v5.mjs';
const NOW=Date.now(),iso=n=>new Date(n).toISOString();
const cfg={...T.DEFAULTS,mode:'ON',individualBattleWinCoin:5000000,energyMax:15,energyMinutes:2,minDamage:100,maxDamage:100,damageVariancePercent:0,battlefield:C};
const schema=voteSchema+`
CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT DEFAULT 'USER',coin INTEGER DEFAULT 0);
CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,PRIMARY KEY(user_id,card_id));
CREATE TABLE coin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
CREATE TABLE territory_war_v3_rounds(id INTEGER PRIMARY KEY,status TEXT,recruitment_ends_at TEXT,starts_at TEXT,ends_at TEXT,formed_at TEXT,settled_at TEXT,truce_ends_at TEXT,current_front_id INTEGER,current_front_index INTEGER DEFAULT 4,version INTEGER DEFAULT 1,a_total_damage INTEGER DEFAULT 0,b_total_damage INTEGER DEFAULT 0,a_front_wins INTEGER DEFAULT 0,b_front_wins INTEGER DEFAULT 0,a_counter_gauge INTEGER DEFAULT 0,b_counter_gauge INTEGER DEFAULT 0,a_capture_streak INTEGER DEFAULT 0,b_capture_streak INTEGER DEFAULT 0,a_operation TEXT DEFAULT '',b_operation TEXT DEFAULT '',a_operation_ends_at TEXT,b_operation_ends_at TEXT,battle_name TEXT DEFAULT 'TEST',winner_side TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE territory_war_v3_fronts(id INTEGER PRIMARY KEY,round_id INTEGER,sequence INTEGER DEFAULT 1,node_index INTEGER DEFAULT 4,node_code TEXT DEFAULT 'CENTER',node_name TEXT DEFAULT '중앙',node_type TEXT DEFAULT 'CENTER',status TEXT,version INTEGER DEFAULT 1,a_hp INTEGER DEFAULT 500000,b_hp INTEGER DEFAULT 500000,a_max_hp INTEGER DEFAULT 1000000,b_max_hp INTEGER DEFAULT 1000000,started_at TEXT,revisit_count INTEGER DEFAULT 0,last_defense_side TEXT,last_defense_deadline TEXT,fatigued_side TEXT,fatigue_percent INTEGER DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE territory_war_v3_users(round_id INTEGER,user_id INTEGER,side TEXT,status TEXT,energy INTEGER DEFAULT 5,last_recharged_at TEXT,deck_snapshot TEXT DEFAULT '["a","b","c","d","e"]',deck_power INTEGER DEFAULT 10000,formation_power INTEGER DEFAULT 10000,formation_breakdown_json TEXT,loadout_bonus_json TEXT DEFAULT '{}',attacks INTEGER DEFAULT 0,damage INTEGER DEFAULT 0,front_finishes INTEGER DEFAULT 0,defenses INTEGER DEFAULT 0,defense_wins INTEGER DEFAULT 0,defense_losses INTEGER DEFAULT 0,counter_contribution INTEGER DEFAULT 0,ace_defeats INTEGER DEFAULT 0,comeback_participations INTEGER DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(round_id,user_id));
CREATE TABLE territory_war_v3_actions(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT UNIQUE,user_id INTEGER,round_id INTEGER,front_id INTEGER,opponent_user_id INTEGER,contributor_user_id INTEGER,side TEXT,winner_side TEXT,target_side TEXT,battle_seed INTEGER,counter_gained INTEGER DEFAULT 0,ace_target INTEGER DEFAULT 0,damage INTEGER DEFAULT 0,energy_spent INTEGER DEFAULT 0,status TEXT,result_json TEXT,battle_meta_json TEXT,error_message TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE territory_war_v3_commander_overrides(round_id INTEGER,side TEXT,user_id INTEGER,PRIMARY KEY(round_id,side));
CREATE TABLE territory_war_v3_notices(id INTEGER PRIMARY KEY AUTOINCREMENT,round_id INTEGER,type TEXT,side TEXT,title TEXT,message TEXT,payload_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE territory_war_v3_operation_uses(round_id INTEGER,side TEXT,operation TEXT,PRIMARY KEY(round_id,side,operation));
CREATE TABLE territory_war_v3_command_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,round_id INTEGER,user_id INTEGER,side TEXT,message TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`;
async function fixture(t,postgres){
  let DB;
  if(postgres){
    const pg=new PGlite();t.after(()=>pg.close());
    await pg.exec(schema.replaceAll('INTEGER PRIMARY KEY AUTOINCREMENT','BIGSERIAL PRIMARY KEY').replaceAll('INTEGER','BIGINT'));
    await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$; CREATE FUNCTION sqlite_datetime(text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT CASE WHEN $1='now' THEN sqlite_now() ELSE to_char(timezone('UTC',$1::timestamptz),'YYYY-MM-DD HH24:MI:SS') END$$");
    await pg.exec("CREATE FUNCTION sqlite_json_valid(text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$BEGIN PERFORM $1::jsonb; RETURN true; EXCEPTION WHEN OTHERS THEN RETURN false; END$$");
    await pg.exec("CREATE FUNCTION sqlite_json_array_length(text) RETURNS integer LANGUAGE SQL IMMUTABLE AS $$SELECT jsonb_array_length($1::jsonb)$$");
    await pg.exec(readFileSync(new URL('../scripts/postgres-runtime-compat.sql',import.meta.url),'utf8').match(/CREATE OR REPLACE FUNCTION sqlite_json_each[\s\S]*?\$\$;/)[0]);
    const client={async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length}}};DB=new __postgresCompatTest.PostgresD1Database(client);
  }else{
    const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(schema);
    const prepare=(sql,values=[])=>({sql,values,bind(...next){return prepare(sql,next)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}});
    DB={prepare,async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
  }
  const env={DB},p=(s,...v)=>DB.prepare(s).bind(...v);
  await ensureTerritoryClanSchema(env);await ensureBattlefieldSchema(env);await ensureBattlefieldSchema(env);
  await p("INSERT INTO app_meta(key,value) VALUES('territory_war_settings_v3',?)",JSON.stringify(cfg)).run();
  await p("INSERT INTO territory_war_v3_rounds(id,status,warfare_version,recruitment_ends_at,ends_at) VALUES(1,'RECRUITING',4,?,?)",iso(NOW+60000),iso(NOW+86400000)).run();
  const round=()=>p('SELECT * FROM territory_war_v3_rounds WHERE id=1').first(),front=()=>p('SELECT * FROM territory_war_v3_fronts WHERE id=1').first(),row=()=>p('SELECT * FROM territory_battlefield_fronts WHERE front_id=1').first(),mine=async(side='A',user=side==='A'?1:2)=>p('SELECT * FROM territory_war_v3_users WHERE round_id=1 AND user_id=?',user).first();
  await freezeBattlefieldPolicy(env,await round(),cfg);
  await p("UPDATE territory_war_v3_rounds SET status='ACTIVE',current_front_id=1 WHERE id=1").run();
  await p("INSERT INTO territory_war_v3_fronts(id,round_id,status,started_at) VALUES(1,1,'ACTIVE',?)",iso(NOW)).run();
  await initializeBattlefieldFront(env,await round(),await front());
  for(let user=1;user<=3;user++){
    const side=user===2?'B':'A';await p('INSERT INTO users(id,nickname) VALUES(?,?)',user,'USER '+user).run();
    await p("INSERT INTO territory_war_v3_users(round_id,user_id,side,status,last_recharged_at) VALUES(1,?,?,'ACTIVE',?)",user,side,iso(NOW)).run();
    for(const card of ['a','b','c','d','e'])await p('INSERT INTO user_cards VALUES(?,?,1)',user,card).run();
  }
  await p("INSERT INTO territory_war_v3_commander_overrides VALUES(1,'A',1)").run();await p("INSERT INTO territory_war_v3_commander_overrides VALUES(1,'B',2)").run();
  let seq=0;
  async function contribute(objective='RELAY',side='A',won=true,{user=side==='A'?1:2,now=NOW+1000,requestId='BF_TEST:'+String(++seq).padStart(8,'0'),cycle=1,extra=[]}={}){
    const r=await round(),f=await front(),m=await mine(side,user),context=await battlefieldAttackContext(env,{round:r,front:f,objective,cycle,now});
    await p("INSERT INTO territory_war_v3_actions(request_id,user_id,status) VALUES(?,?,'APPLIED') ON CONFLICT(request_id) DO NOTHING",requestId,user).run();
    await DB.batch([...battlefieldAttackGuards(env,{round:r,front:f,requestId,context,now}),...battlefieldContributionStatements(env,{round:r,front:f,mine:m,requestId,context,won,now}),...extra,...battlefieldAttackCleanup(env,requestId,context)]);
    return {requestId,context};
  }
  const skill=async(operation,side='A',now=NOW+1000,requestId='BF_SKILL:'+String(++seq).padStart(8,'0'))=>applyBattlefieldSkill(env,{voteKey:await seedTerritorySkillVotes({p},operation,side),round:await round(),front:await front(),mine:await mine(side),operation,requestId,now});
  return {env,p,round,front,row,mine,contribute,skill};
}
test('CMS config is bounded, partial edits preserve fields, and train windows are server timed',()=>{
  const c=normalizeBattlefieldConfig({relaySiegeBonusPercent:99,enabled:false,alien:3},{...C,supplyEnergy:4,alien:5});
  assert.equal(c.relaySiegeBonusPercent,30);assert.equal(c.supplyEnergy,4);assert.equal(c.enabled,false);assert.equal(c.alien,undefined);
  assert.equal(normalizeBattlefieldConfig({supplyIntervalMinutes:5,supplyWindowMinutes:30}).supplyWindowMinutes,4);
  assert.equal(supplyWindow(NOW,C,NOW+300000).active,false);assert.equal(supplyWindow(NOW,C,NOW+900000).cycle,2);
  assert.equal(battlefieldIronWallMultiplier(25,NOW+1000,C,NOW),.875);assert.equal(battlefieldIronWallMultiplier(25,0,C,NOW),.75);
});
for(const postgres of [false,true]){
 const dialect=postgres?'PostgreSQL':'SQLite';
 test(dialect+': policy stays frozen; active and legacy rounds are not converted',async t=>{
  const f=await fixture(t,postgres);
  await freezeBattlefieldPolicy(f.env,{...await f.round(),status:'RECRUITING'},{battlefield:{enabled:false,supplyEnergy:5}});
  assert.deepEqual(await battlefieldPolicy(f.env,await f.round()),C);
  await f.p("INSERT INTO territory_war_v3_rounds(id,status,warfare_version) VALUES(2,'ACTIVE',4),(3,'RECRUITING',0),(4,'RECRUITING',4)").run();
  for(const id of [2,3,4])await freezeBattlefieldPolicy(f.env,await f.p('SELECT * FROM territory_war_v3_rounds WHERE id=?',id).first(),{battlefield:{enabled:false}});
  assert.equal((await f.p('SELECT COUNT(*) n FROM territory_battlefield_policies').first()).n,2);
  assert.equal(await initializeBattlefieldFront(f.env,await f.p('SELECT * FROM territory_war_v3_rounds WHERE id=4').first(),{id:9}),null);
  await assert.rejects(battlefieldAttackContext(f.env,{round:{id:3,warfare_version:0},front:await f.front(),objective:'RELAY'}));
 });
 test(dialect+': relay capture grants power once, survives tugging, and unlocks EMP only for its owner',async t=>{
  const f=await fixture(t,postgres);
  for(let i=0;i<4;i++)await f.contribute();assert.equal((await f.row()).relay_owner,'');
  const fifth=await f.contribute();let bf=await f.row();assert.equal(bf.relay_owner,'A');assert.equal(bf.charge_a,25);
  await f.contribute('RELAY','A',true,{requestId:fifth.requestId});assert.equal((await f.row()).charge_a,25);
  await f.contribute('SIEGE');assert.equal((await f.row()).charge_a,30);
  await assert.rejects(f.skill('EMP_PULSE','B'),/중계탑/);
  await f.skill('EMP_PULSE');assert.equal((await f.row()).emp_b_until_ms,NOW+121000);
  const old=await f.p('SELECT * FROM territory_war_v3_rounds WHERE id=1').first();assert.equal(old.a_operation,'');
  for(let i=0;i<10;i++)await f.contribute('RELAY','B');bf=await f.row();assert.equal(bf.relay_owner,'B');assert.equal(bf.charge_b,30);
  await assert.rejects(f.skill('EMP_PULSE','A'),/중계탑/);
  assert.equal((await f.p("SELECT COUNT(*) n FROM territory_battlefield_events WHERE type='RELAY_CAPTURED'").first()).n,2);
 });
 test(dialect+': occupation damage reads current SQL ownership and disables bonuses during facility outage',async t=>{
  const f=await fixture(t,postgres),context=await battlefieldAttackContext(f.env,{round:await f.round(),front:await f.front(),now:NOW});
  assert.equal(battlefieldSiegeMultiplier(context,'A',NOW),1);
  await f.p("UPDATE territory_battlefield_fronts SET relay_owner='A',supply_a_until_ms=? WHERE front_id=1",NOW+180000).run();
  const bonus=await f.p('SELECT ROUND(1000*'+battlefieldSiegeSql(context,'A',1,NOW)+') damage').first();assert.equal(Number(bonus.damage),1323);
  await f.p('UPDATE territory_battlefield_fronts SET emp_a_until_ms=? WHERE front_id=1',NOW+1000).run();assert.equal(Number((await f.p('SELECT ROUND(1000*'+battlefieldSiegeSql(context,'A',1,NOW)+') damage').first()).damage),1000);
 });
 test(dialect+': four train wins award side power/buff exactly once and participant energy is capped/idempotent',async t=>{
  const f=await fixture(t,postgres);
  for(let i=0;i<3;i++)await f.contribute('SUPPLY');await f.contribute('SUPPLY','A',true,{user:3});
  const bf=await f.row();assert.equal(bf.charge_a,29);assert.equal(bf.supply_a_until_ms,NOW+181000);
  await assert.rejects(f.contribute('SUPPLY'),/완료/);
  const input=async(user=1)=>({round:await f.round(),front:await f.front(),mine:await f.mine('A',user),cycle:1,requestId:'BF_CLAIM:'+user,cfg,now:NOW+2000,rechargeEnergy:row=>({energy:row.energy,lastRechargedAt:row.last_recharged_at})});
  await f.p('UPDATE territory_war_v3_users SET energy=14 WHERE user_id=1').run();
  const claimed=await claimBattlefieldSupply(f.env,await input());assert.equal(claimed.energyGained,1);assert.equal((await f.mine()).energy,15);
  assert.equal((await claimBattlefieldSupply(f.env,await input())).replayed,true);assert.equal((await f.mine()).energy,15);
  await f.p('UPDATE territory_war_v3_users SET energy=15 WHERE user_id=3').run();await assert.rejects(claimBattlefieldSupply(f.env,await input(3)),/최대/);
  assert.equal((await f.p('SELECT COUNT(*) n FROM territory_battlefield_supply_claims WHERE user_id=3').first()).n,0);
  await f.p('UPDATE territory_war_v3_users SET energy=4 WHERE user_id=3').run();assert.equal((await claimBattlefieldSupply(f.env,await input(3))).energyGained,3);
  await assert.rejects(claimBattlefieldSupply(f.env,{...await input(2),mine:await f.mine('B')}));assert.equal((await f.mine('B')).energy,5);
  assert.equal((await battlefieldState(f.env,{round:await f.round(),front:await f.front(),mine:await f.mine(),now:NOW+2000})).supplyClaim,null);
 });
 test(dialect+': expired/captured/changed-front objectives roll back all prior account mutations',async t=>{
  const f=await fixture(t,postgres),r=await f.round(),front=await f.front(),context=await battlefieldAttackContext(f.env,{round:r,front,objective:'SUPPLY',cycle:1,now:NOW+1000});
  await f.p("UPDATE territory_war_v3_rounds SET current_front_id=99 WHERE id=1").run();
  const before=await f.row();await assert.rejects(f.env.DB.batch([f.p('UPDATE users SET coin=coin+5000000 WHERE id=1'),...battlefieldAttackGuards(f.env,{round:r,front,requestId:'ROLLBACK:front',context,now:NOW+1000}),f.p('UPDATE territory_battlefield_fronts SET charge_a=100 WHERE front_id=1')]));
  assert.equal((await f.p('SELECT coin FROM users WHERE id=1').first()).coin,0);assert.deepEqual(await f.row(),before);
  await assert.rejects(battlefieldAttackContext(f.env,{round:r,front,objective:'SUPPLY',cycle:1,now:NOW+300000}),/종료/);
  await f.p('UPDATE territory_war_v3_rounds SET current_front_id=1 WHERE id=1').run();
  const packetId='ROLLBACK:mid';await assert.rejects(f.contribute('RELAY','A',true,{requestId:packetId,extra:[f.p("INSERT INTO territory_war_mutation_guards(token,ok) VALUES('FAULT',0)")]}));
  assert.deepEqual(await f.row(),before);assert.equal((await f.p('SELECT COUNT(*) n FROM territory_battlefield_contributions WHERE request_id=?',packetId).first()).n,0);
 });
 test(dialect+': failed supply receipt rolls back energy and preserves the entitlement for retry',async t=>{
  const f=await fixture(t,postgres);for(let i=0;i<4;i++)await f.contribute('SUPPLY');
  const original=f.env.DB.batch.bind(f.env.DB);f.env.DB.batch=statements=>original([...statements,f.p("INSERT INTO territory_war_mutation_guards(token,ok) VALUES('CLAIM_FAULT',0)")]);
  const input={round:await f.round(),front:await f.front(),mine:await f.mine(),cycle:1,requestId:'BF_CLAIM:FAULT',cfg,now:NOW+2000,rechargeEnergy:row=>({energy:row.energy,lastRechargedAt:row.last_recharged_at})};
  await assert.rejects(claimBattlefieldSupply(f.env,input));assert.equal((await f.mine()).energy,5);assert.equal((await f.p('SELECT COUNT(*) n FROM territory_battlefield_supply_claims').first()).n,0);
  f.env.DB.batch=original;assert.equal((await claimBattlefieldSupply(f.env,input)).energyGained,3);assert.equal((await f.mine()).energy,8);
 });
 test(dialect+': unclaimed train supply remains available after the frontline advances in the same round',async t=>{
  const f=await fixture(t,postgres);for(let i=0;i<4;i++)await f.contribute('SUPPLY');
  await f.p("UPDATE territory_war_v3_fronts SET status='RESOLVED' WHERE id=1").run();await f.p("INSERT INTO territory_war_v3_fronts(id,round_id,status,started_at) VALUES(2,1,'ACTIVE',?)",iso(NOW+2000)).run();await f.p('UPDATE territory_war_v3_rounds SET current_front_id=2 WHERE id=1').run();
  const front=await f.p('SELECT * FROM territory_war_v3_fronts WHERE id=2').first();await initializeBattlefieldFront(f.env,await f.round(),front);
  const state=await battlefieldState(f.env,{round:await f.round(),front,mine:await f.mine(),now:NOW+3000});assert.equal(state.supplyClaim.frontId,1);
  const result=await claimBattlefieldSupply(f.env,{round:await f.round(),front,claimFrontId:1,mine:await f.mine(),cycle:1,requestId:'OLD_FRONT:SUPPLY',cfg,now:NOW+3000,rechargeEnergy:row=>({energy:row.energy,lastRechargedAt:row.last_recharged_at})});assert.equal(result.energyGained,3);assert.equal((await f.mine()).energy,8);
 });
 test(dialect+': command effects, cooldown and receipts are atomic; noncommanders/stale front cannot spend charge',async t=>{
  const f=await fixture(t,postgres);await f.p("UPDATE territory_battlefield_fronts SET relay_owner='A',charge_a=100 WHERE front_id=1").run();
  const original=await f.front();await f.p('UPDATE territory_war_v3_fronts SET version=version+1 WHERE id=1').run();
  await assert.rejects(applyBattlefieldSkill(f.env,{voteKey:await seedTerritorySkillVotes(f,'SIEGE_CANNON'),round:await f.round(),front:original,mine:await f.mine(),operation:'SIEGE_CANNON',requestId:'STALE:CANNON',now:NOW}));assert.equal((await f.row()).charge_a,100);
  await assert.rejects(applyBattlefieldSkill(f.env,{voteKey:await seedTerritorySkillVotes(f,'SIEGE_CANNON'),round:await f.round(),front:await f.front(),mine:await f.mine('A',3),operation:'SIEGE_CANNON',requestId:'NONCOMMANDER:CANNON',now:NOW}));assert.equal((await f.row()).charge_a,100);
  const fired=await f.skill('SIEGE_CANNON','A',NOW,'CANNON:001');assert.equal((await f.row()).charge_a,0);assert.equal(fired.readyAt,iso(NOW+45*60000));assert.equal((await territorySkillReceipt(f.env,1,'CANNON:001','SIEGE_CANNON')).operation,'SIEGE_CANNON');
  await f.p('UPDATE territory_battlefield_fronts SET charge_a=100,cannon_a_due_ms=0 WHERE front_id=1').run();await assert.rejects(f.skill('SIEGE_CANNON','A',NOW+1000));assert.equal((await f.row()).charge_a,100);
  await f.skill('WALL_BREAKER','A',NOW+1000);assert.equal((await f.row()).breach_a_until_ms,NOW+181000);
  await assert.rejects(f.skill('ENGINEER','A'),/복구/);await f.p('UPDATE territory_battlefield_fronts SET emp_a_until_ms=? WHERE front_id=1',NOW+120000).run();await f.skill('ENGINEER','A',NOW+2000);assert.equal((await f.row()).emp_a_until_ms,0);
 });
 test(dialect+': cannon preview, counter, truce, floor-one and retries never damage a new front',async t=>{
  const f=await fixture(t,postgres);await f.p('UPDATE territory_battlefield_fronts SET charge_a=100 WHERE front_id=1').run();await f.skill('SIEGE_CANNON','A',NOW,'CANNON:FIRE');
  assert.equal(await settleBattlefieldCannon(f.env,{round:await f.round(),front:await f.front(),now:NOW+29999}),false);
  await f.p("UPDATE territory_war_v3_rounds SET b_operation='COUNTER_BATTERY',b_operation_ends_at=? WHERE id=1",iso(NOW+60000)).run();
  await f.p('UPDATE territory_war_v3_rounds SET truce_ends_at=? WHERE id=1',iso(NOW+40000)).run();assert.equal(await settleBattlefieldCannon(f.env,{round:await f.round(),front:await f.front(),now:NOW+30000}),false);
  await f.p('UPDATE territory_war_v3_rounds SET truce_ends_at=NULL WHERE id=1').run();assert.equal(await settleBattlefieldCannon(f.env,{round:await f.round(),front:await f.front(),now:NOW+40001}),true);assert.equal((await f.front()).b_hp,450000);assert.equal((await f.row()).emp_b_until_ms,NOW+100001);
  assert.equal(await settleBattlefieldCannon(f.env,{round:await f.round(),front:await f.front(),now:NOW+40002}),false);assert.equal((await f.front()).b_hp,450000);
  await f.p("UPDATE territory_battlefield_fronts SET cannon_a_due_ms=?,cannon_a_request='CANNON:FLOOR' WHERE front_id=1",NOW+50000).run();await f.p('UPDATE territory_war_v3_fronts SET b_hp=10 WHERE id=1').run();await settleBattlefieldCannon(f.env,{round:await f.round(),front:await f.front(),now:NOW+50000});assert.equal((await f.front()).b_hp,1);
  await f.p("UPDATE territory_battlefield_fronts SET cannon_a_due_ms=?,cannon_a_request='CANNON:OLD' WHERE front_id=1",NOW+60000).run();await f.p('UPDATE territory_war_v3_rounds SET current_front_id=2 WHERE id=1').run();assert.equal(await settleBattlefieldCannon(f.env,{round:await f.round(),front:await f.front(),now:NOW+60000}),false);assert.equal((await f.front()).b_hp,1);
 });
 test(dialect+': real attack route gives support contribution with no HP damage and deduplicates coins/energy',async t=>{
  const f=await fixture(t,postgres),cards=['a','b','c','d','e'].map(id=>({id,power:2000,breakthrough_level:0}));
  const deps={json:(data,status=200)=>({data,status}),battleSettings:async()=>({}),pvpDeckSnapshotByIds:async()=>cards,pvpDeckSnapshot:async()=>cards,cardBattlePower:card=>card.power,createPvpBattleV2:()=>({teams:{A:{summary:{power:10000}},B:{summary:{power:10000}}},result:{winner:'A'},timeline:[]})};
  const body={requestId:'REAL:SUPPORT:001',frontId:1,objective:'RELAY'},r=await T.handleAttack(f.env,deps,{id:1,nickname:'USER 1'},cfg,body);
  assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.result.damage,0);assert.equal(r.data.result.facilityPoints,4);assert.equal((await f.mine()).energy,4);assert.equal((await f.mine()).attacks,1);assert.equal((await f.front()).b_hp,500000);assert.equal((await f.p('SELECT coin FROM users WHERE id=1').first()).coin,5000000);
  const replay=await T.handleAttack(f.env,deps,{id:1,nickname:'USER 1'},cfg,body);assert.equal(replay.data.replayed,true);assert.equal((await f.mine()).energy,4);assert.equal((await f.p('SELECT coin FROM users WHERE id=1').first()).coin,5000000);
  await f.p("UPDATE territory_battlefield_fronts SET relay_owner='A' WHERE front_id=1").run();const siege=await T.handleAttack(f.env,deps,{id:1,nickname:'USER 1'},cfg,{requestId:'REAL:SIEGE:001',frontId:1,objective:'SIEGE'});assert.equal(siege.status,200,JSON.stringify(siege.data));assert.equal(siege.data.result.damage,115);assert.equal((await f.front()).b_hp,499885);
 });
}

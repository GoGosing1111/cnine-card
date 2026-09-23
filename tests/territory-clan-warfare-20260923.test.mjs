import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {ensureTerritoryClanSchema,openClanWarfare,randomClanSides,territoryClanView,territorySkillState,territorySkillEffect,territorySkillReceipt,applyTerritorySkill,TERRITORY_SKILL_COOLDOWN_MS} from '../functions/_territory_clan_warfare.js';
import {__territoryClanTest,territorySiegeDamage} from '../functions/_territory_war.js';

const NOW=Date.parse('2026-09-24T10:00:00Z');
const cfg={energyMax:15,regroupEnergy:3,operationDurationMinutes:10,damageScale:10,minDamage:100,maxDamage:5000,damageVariancePercent:0,infiltrationHpPercent:12,carpetBombingHpPercent:10,airDefenseInterceptPercent:75,ironWallHealPercent:20,counterBatterySuppressionPercent:70};
const operations=Object.fromEntries(['ASSAULT','INFILTRATION','CARPET_BOMBING','SPG_BARRAGE','IRON_WALL','AIR_DEFENSE','COUNTER_BATTERY','REGROUP'].map(key=>[key,{name:key,category:'OFFENSE',summary:key,asset:'a.webp'}]));
const schema=`
CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
CREATE TABLE territory_war_v3_rounds(id INTEGER PRIMARY KEY,status TEXT,formed_at TEXT,recruitment_ends_at TEXT,version INTEGER DEFAULT 1,current_front_id INTEGER,ends_at TEXT,truce_ends_at TEXT,a_operation TEXT,b_operation TEXT,a_operation_ends_at TEXT,b_operation_ends_at TEXT,a_total_damage INTEGER DEFAULT 0,b_total_damage INTEGER DEFAULT 0,updated_at TEXT);
CREATE TABLE territory_war_v3_users(round_id INTEGER,user_id INTEGER,side TEXT,status TEXT,deck_snapshot TEXT DEFAULT '[]',deck_power INTEGER DEFAULT 0,formation_power INTEGER DEFAULT 0,loadout_bonus_json TEXT,formation_breakdown_json TEXT,energy INTEGER DEFAULT 0,last_recharged_at TEXT,attacks INTEGER DEFAULT 0,damage INTEGER DEFAULT 0,front_finishes INTEGER DEFAULT 0,defense_wins INTEGER DEFAULT 0,counter_contribution INTEGER DEFAULT 0,PRIMARY KEY(round_id,user_id));
CREATE TABLE territory_war_v3_fronts(id INTEGER PRIMARY KEY,round_id INTEGER,status TEXT,version INTEGER DEFAULT 1,a_hp INTEGER,b_hp INTEGER,a_max_hp INTEGER,b_max_hp INTEGER,updated_at TEXT);
CREATE TABLE territory_war_v3_commander_overrides(round_id INTEGER,side TEXT,user_id INTEGER,PRIMARY KEY(round_id,side));
CREATE TABLE territory_war_v3_notices(round_id INTEGER,type TEXT,side TEXT,title TEXT,message TEXT,payload_json TEXT);
CREATE TABLE clan_seasons(id INTEGER PRIMARY KEY,season_no INTEGER,phase TEXT);
CREATE TABLE clan_organizations(id INTEGER PRIMARY KEY,name TEXT,mark_key TEXT,primary_color TEXT);
CREATE TABLE clan_season_teams(season_id INTEGER,clan_id INTEGER,PRIMARY KEY(season_id,clan_id));
CREATE TABLE clan_members(season_id INTEGER,clan_id INTEGER,user_id INTEGER,PRIMARY KEY(season_id,user_id));
CREATE TABLE users(id INTEGER PRIMARY KEY);
CREATE TABLE pvp_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT);
CREATE TABLE pvp_active_presets(user_id INTEGER PRIMARY KEY,preset_no INTEGER);
CREATE TABLE pvp_deck_presets(user_id INTEGER,preset_no INTEGER,card_ids TEXT,PRIMARY KEY(user_id,preset_no));
`;
async function fixture(t,postgres){
  let DB;
  if(postgres){const pg=new PGlite();t.after(()=>pg.close());await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");await pg.exec(schema);const client={async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length}}};DB=new __postgresCompatTest.PostgresD1Database(client)}
  else{const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(schema);const prepare=(sql,values=[])=>({sql,values,bind(...next){return prepare(sql,next)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}});DB={prepare,async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}}}
  const env={DB},p=(s,...v)=>DB.prepare(s).bind(...v);
  if(postgres)await DB.execSchema(["CREATE FUNCTION sqlite_datetime(text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT CASE WHEN $1='now' THEN sqlite_now() ELSE to_char(timezone('UTC',$1::timestamptz),'YYYY-MM-DD HH24:MI:SS') END$$"]);
  await p("INSERT INTO app_meta(key,value) VALUES('safe_runtime_upgrade_v2120_territory_foundation_fast_gate','1')").run();
  await ensureTerritoryClanSchema(env);await ensureTerritoryClanSchema(env);
  await p("INSERT INTO territory_war_v3_rounds(id,status,recruitment_ends_at) VALUES(1,'RECRUITING','2099-01-01T00:00:00Z')").run();
  await p("INSERT INTO clan_seasons VALUES(2,2,'ACTIVE')").run();
  for(let clan=1;clan<=8;clan++){
    await p('INSERT INTO clan_organizations VALUES(?,?,?,?)',clan,'CLAN '+clan,'DK','#123456').run();await p('INSERT INTO clan_season_teams VALUES(2,?)',clan).run();
    for(let i=0;i<clan;i++){const user=clan*100+i;await p('INSERT INTO users VALUES(?)',user).run();await p('INSERT INTO clan_members VALUES(2,?,?)',clan,user).run();await p('INSERT INTO pvp_decks VALUES(?,?)',user,i===0?'[]':'["a","b","c","d","e"]').run()}
  }
  return {env,p,round:()=>p('SELECT * FROM territory_war_v3_rounds WHERE id=1').first()};
}
async function battle(f){
  await openClanWarfare(f.env,await f.round(),cfg);
  await f.p("UPDATE territory_war_v3_rounds SET status='ACTIVE',current_front_id=1,ends_at='2026-09-25T00:00:00Z' WHERE id=1").run();
  await f.p("UPDATE territory_war_v3_users SET status='ACTIVE',deck_power=1000000,formation_power=1000000,attacks=1,energy=1").run();
  const mine=await f.p("SELECT * FROM territory_war_v3_users WHERE side='A' ORDER BY user_id LIMIT 1").first();
  await f.p("INSERT INTO territory_war_v3_commander_overrides VALUES(1,'A',?)",mine.user_id).run();
  await f.p("INSERT INTO territory_war_v3_fronts(id,round_id,status,a_hp,b_hp,a_max_hp,b_max_hp) VALUES(1,1,'ACTIVE',500000,500000,1000000,1000000)").run();
  return {mine,args:async(op='INFILTRATION',requestId='SKILL:request:0001',now=NOW)=>({round:await f.round(),front:await f.p('SELECT * FROM territory_war_v3_fronts WHERE id=1').first(),mine,operation:op,cfg,requestId,damageFor:territorySiegeDamage,definition:operations[op],now})};
}

test('eight clans are shuffled once into exactly four per side',()=>{
  const clans=Array.from({length:8},(_,i)=>({clan_id:i+1}));const result=randomClanSides(clans,()=>0);
  assert.equal(result.filter(r=>r.side==='A').length,4);assert.equal(result.filter(r=>r.side==='B').length,4);assert.equal(new Set(result.map(r=>r.clan_id)).size,8);assert.notDeepEqual(result.map(r=>r.clan_id),clans.map(r=>r.clan_id));assert.throws(()=>randomClanSides(clans.slice(1)));assert.throws(()=>randomClanSides(Array(8).fill(clans[0])));
});
test('clanless balancing preserves all clan sides even with uneven rosters',()=>{
  const fixed=Array.from({length:20},(_,i)=>({side:i<15?'A':'B',item:{user_id:i+1,side:i<15?'A':'B',mandatory_clan:1,deck_power:1000+i}}));
  const free=Array.from({length:14},(_,i)=>({user_id:100+i,deck_power:5000+i,balance_previous_result:i%2?'WIN':'LOSE'}));
  const result=__territoryClanTest.balancedSideAssignments(free,fixed);
  assert.equal(result.assignments.length,34);for(const before of fixed)assert.equal(result.assignments.find(e=>e.item.user_id===before.item.user_id).side,before.side);assert.equal(result.aCount,17);assert.equal(result.bCount,17);
});

for(const pg of [false,true]){
  const dialect=pg?'PostgreSQL':'SQLite';
  test(`${dialect}: old foundation marker still receives schema; full roster and marks are frozen`,async t=>{
    const f=await fixture(t,pg);await f.p("INSERT INTO pvp_active_presets VALUES(101,2)").run();await f.p('INSERT INTO pvp_deck_presets VALUES(101,2,?)','["v","w","x","y","z"]').run();
    // Use a real roster member with an active preset, not its fallback deck.
    await f.p('UPDATE pvp_active_presets SET user_id=201').run();await f.p('UPDATE pvp_deck_presets SET user_id=201').run();
    const opened=await openClanWarfare(f.env,await f.round(),cfg),members=(await f.p('SELECT * FROM territory_war_v3_users ORDER BY user_id').all()).results;
    assert.equal(opened.warfare_version,4);assert.equal(members.length,36);assert.ok(members.every(m=>Number(m.mandatory_clan)===1));assert.equal(members.find(m=>Number(m.user_id)===100).deck_snapshot,'[]');assert.equal(members.find(m=>Number(m.user_id)===201).deck_snapshot,'["v","w","x","y","z"]');
    const teams=(await f.p('SELECT * FROM territory_war_clans').all()).results;assert.equal(teams.filter(c=>c.side==='A').length,4);for(const member of members)assert.equal(member.side,teams.find(c=>Number(c.clan_id)===Number(member.clan_id)).side);
    await f.p('DELETE FROM clan_members WHERE user_id=100').run();await openClanWarfare(f.env,await f.round(),cfg);assert.equal((await f.p('SELECT COUNT(*) n FROM territory_war_v3_users').first()).n,36);assert.deepEqual((await f.p('SELECT * FROM territory_war_clans').all()).results,teams);
    const view=await territoryClanView(f.env,await f.round());assert.equal(view.teams.length,8);assert.equal(view.teams.reduce((n,c)=>n+c.memberCount,0),36);
  });
  test(`${dialect}: incomplete clan catalog waits without partial enrollment`,async t=>{
    const f=await fixture(t,pg);await f.p('DELETE FROM clan_season_teams WHERE clan_id=8').run();assert.equal((await openClanWarfare(f.env,await f.round(),cfg)).clanOpeningPending,true);assert.equal((await f.p('SELECT COUNT(*) n FROM territory_war_v3_users').first()).n,0);assert.equal((await f.round()).clan_opened_at,null);
  });
  test(`${dialect}: damage, individual 45 minute cooldowns and idempotent receipts`,async t=>{
    const f=await fixture(t,pg),b=await battle(f),first=await applyTerritorySkill(f.env,await b.args());assert.equal(first.damage,120000);
    assert.equal((await f.p('SELECT b_hp FROM territory_war_v3_fronts').first()).b_hp,380000);
    const receipt=await territorySkillReceipt(f.env,b.mine.user_id,'SKILL:request:0001','INFILTRATION');assert.equal(receipt.replayed,true);assert.equal(receipt.damage,120000);
    await assert.rejects(territorySkillReceipt(f.env,999,'SKILL:request:0001','INFILTRATION'));
    await assert.rejects(applyTerritorySkill(f.env,await b.args('INFILTRATION','SKILL:too-soon',NOW+TERRITORY_SKILL_COOLDOWN_MS-1)));
    assert.equal((await f.p('SELECT COUNT(*) n FROM territory_war_skill_receipts').first()).n,1);
    const commanders={A:{user_id:b.mine.user_id}},state=await territorySkillState(f.env,await f.round(),operations,'A',commanders,b.mine.user_id,NOW+1);
    assert.equal(state.A.skills.INFILTRATION.ready,false);assert.equal(state.A.skills.ASSAULT.ready,true);assert.equal(state.B.skills.INFILTRATION.ready,true);
    await applyTerritorySkill(f.env,await b.args('ASSAULT','SKILL:other-skill',NOW+1));
    await applyTerritorySkill(f.env,await b.args('INFILTRATION','SKILL:after-45m',NOW+TERRITORY_SKILL_COOLDOWN_MS));
    assert.equal((await f.p('SELECT COUNT(*) n FROM territory_war_skill_receipts').first()).n,3);
    assert.equal((await f.p('SELECT a_total_damage FROM territory_war_v3_rounds').first()).a_total_damage,280000);
    assert.equal((await f.p('SELECT SUM(attacks) n FROM territory_war_v3_users').first()).n,36);
  });
  test(`${dialect}: stale front, commander change, truce and failed batch have no damage or cooldown`,async t=>{
    const f=await fixture(t,pg),b=await battle(f),stale=await b.args();await f.p('UPDATE territory_war_v3_fronts SET version=version+1').run();await assert.rejects(applyTerritorySkill(f.env,stale));
    const other=await f.p("SELECT user_id FROM territory_war_v3_users WHERE side='A' AND user_id<>? LIMIT 1",b.mine.user_id).first();await f.p('UPDATE territory_war_v3_commander_overrides SET user_id=?',other.user_id).run();await assert.rejects(applyTerritorySkill(f.env,await b.args()));
    await f.p('UPDATE territory_war_v3_commander_overrides SET user_id=?',b.mine.user_id).run();await f.p("UPDATE territory_war_v3_rounds SET truce_ends_at='2026-09-24T11:00:00Z'").run();await assert.rejects(applyTerritorySkill(f.env,await b.args()));
    assert.equal((await f.p('SELECT b_hp FROM territory_war_v3_fronts').first()).b_hp,500000);assert.equal((await f.p('SELECT COUNT(*) n FROM territory_war_skill_cooldowns').first()).n,0);assert.equal((await f.p('SELECT COUNT(*) n FROM territory_war_mutation_guards').first()).n,0);
    await f.p('UPDATE territory_war_v3_rounds SET truce_ends_at=NULL').run();
    const before=await f.round();await f.p("INSERT INTO territory_war_skill_receipts VALUES('SKILL:request:0001',1,999,'B','ASSAULT','{}',1)").run();await assert.rejects(applyTerritorySkill(f.env,await b.args()));assert.deepEqual(await f.round(),before);assert.equal((await f.p('SELECT b_hp FROM territory_war_v3_fronts').first()).b_hp,500000);
  });
  test(`${dialect}: defense activated between round/front reads is rechecked without charging cooldown`,async t=>{
    const f=await fixture(t,pg),b=await battle(f),before=await b.args('CARPET_BOMBING','SKILL:opposing-race');
    await f.p("UPDATE territory_war_v3_rounds SET b_operation='AIR_DEFENSE',b_operation_ends_at='2026-09-24T11:00:00Z',skill_action_token='OTHER:COMMITTED',version=version+1").run();
    await f.p('UPDATE territory_war_v3_fronts SET version=version+1').run();
    before.front=await f.p('SELECT * FROM territory_war_v3_fronts WHERE id=1').first();
    await assert.rejects(applyTerritorySkill(f.env,before));
    assert.equal((await f.p('SELECT COUNT(*) n FROM territory_war_skill_cooldowns').first()).n,0);
    const result=await applyTerritorySkill(f.env,await b.args('CARPET_BOMBING','SKILL:opposing-race'));
    assert.equal(result.intercepted,true);assert.equal(result.damage,25000);
    assert.equal((await f.p('SELECT b_hp FROM territory_war_v3_fronts').first()).b_hp,475000);
  });
}
test('skill effects reuse siege power formula, interception, healing bounds and last HP floor',()=>{
  const input={round:{b_operation:'AIR_DEFENSE',b_operation_ends_at:'2026-09-24T11:00:00Z'},front:{id:1,b_hp:500000,b_max_hp:1000000,a_hp:990000,a_max_hp:1000000},mine:{side:'A',deck_power:1000000},cfg,requestId:'SKILL:formula',damageFor:territorySiegeDamage,now:NOW};
  assert.equal(territorySkillEffect({...input,operation:'CARPET_BOMBING'}).damage,25000);assert.equal(territorySkillEffect({...input,operation:'IRON_WALL'}).heal,10000);assert.equal(territorySkillEffect({...input,operation:'SPG_BARRAGE'}).damage,60000);assert.equal(territorySkillEffect({...input,front:{...input.front,b_hp:10},operation:'INFILTRATION'}).damage,9);
});
test('live wiring preserves commander authority, mandatory roster and standalone skill cooldown UI',()=>{
  const source=readFileSync(new URL('../functions/_territory_war.js',import.meta.url),'utf8'),client=readFileSync(new URL('../js/territory-war-v1811.js',import.meta.url),'utf8');
  assert.match(source,/await ensureFoundation\(env\);await ensureTerritoryClanSchema\(env\)/);assert.match(source,/mandatory_clan=0/);assert.match(source,/개막 클랜의 진영은 고정/);assert.match(source,/현재 지정된 진영 지휘관만/);assert.match(client,/스킬마다 각각 45분/);assert.match(client,/data-skill-ready-at/);assert.match(client,/localStorage\.setItem\(key,requestId\)/);assert.match(client,/clan-marks|clan\/marks/);
});

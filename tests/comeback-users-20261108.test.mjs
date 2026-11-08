import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {COMEBACK,comebackState,handleComeback,grantComebackFinalIfReady} from '../functions/_comeback_event.js';
import {LOAN_PREFIX,LOAN_CODES,PLAYABLE_MERCENARY_COUNTS,PLAYABLE_LEVELS} from '../functions/_comeback_loans.js';
import {mercenaryLevelStateFromStorage} from '../shared/mercenary-level-v1.mjs';
import {comebackOwnedPower} from '../functions/_comeback_power.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {ascendantEquipmentFixture} from './helpers/ascendant-equipment-db.mjs';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryGrowthLaunchPolicy} from '../shared/mercenary-growth-launch-20261016.mjs';
import {MERCENARY_LEVEL_KEY} from '../shared/mercenary-level-v1.mjs';
import {battleConfig,mercenarySnapshotPower,saveMercenaryLoadout,releasedMercenaryFormations,mercenaryAccountState,rankedOwnedMercenaries} from '../functions/_mercenary_account.js';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';
import {questPeriod} from '../functions/_quest_hub.js';

async function fixture(t,pg){
 const auto=pg?'BIGSERIAL PRIMARY KEY':'INTEGER PRIMARY KEY AUTOINCREMENT';
 const schema=`
 CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,banned_until TEXT,coin BIGINT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_attendance_summary_v1401(user_id BIGINT PRIMARY KEY,total_days INTEGER,last_attendance_date TEXT);
 CREATE TABLE attendance_logs(user_id BIGINT,attendance_date TEXT,PRIMARY KEY(user_id,attendance_date));
 CREATE TABLE account_sync_versions_v1(user_id BIGINT PRIMARY KEY,revision BIGINT,domains TEXT);
 CREATE TABLE ranked_duo_policy_version_v1(id BIGINT PRIMARY KEY,revision BIGINT);
 CREATE TABLE user_second_verifications(user_id BIGINT,provider TEXT,provider_user_id TEXT);
 CREATE TABLE quest_weekly_claims_v1(user_id BIGINT,quest_id TEXT,week_key TEXT,status TEXT,created_at TEXT,PRIMARY KEY(user_id,quest_id,week_key));
 CREATE TABLE organization_rounds_v1(id TEXT PRIMARY KEY,scope TEXT,phase TEXT,created_at BIGINT);
 CREATE TABLE organization_members_v1(user_id BIGINT,round_id TEXT);
 CREATE TABLE joint_atomic_guards_v1(token TEXT PRIMARY KEY,verified INTEGER CHECK(verified=1));
 CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,code TEXT UNIQUE,is_active BIGINT,is_public BIGINT,slot TEXT DEFAULT 'TOP',total_power BIGINT DEFAULT 0);
 CREATE TABLE character_garage_items(id BIGINT PRIMARY KEY,code TEXT UNIQUE,is_active BIGINT,is_public BIGINT,total_power BIGINT DEFAULT 0);
 CREATE TABLE user_equipment_instances(id ${auto},user_id BIGINT,equipment_id BIGINT,source_type TEXT,source_id TEXT,request_id TEXT,acquired_at TEXT);
 CREATE TABLE user_garage_vehicles(user_id BIGINT,garage_id BIGINT,source_type TEXT,source_id TEXT,acquired_at TEXT,PRIMARY KEY(user_id,garage_id));
 CREATE TABLE equipment_forge_states_v1(instance_id BIGINT PRIMARY KEY,user_id BIGINT,level BIGINT,revision BIGINT);
 CREATE TABLE user_equipment_loadout(user_id INTEGER,instance_id INTEGER);
 CREATE TABLE user_mercenary_loadout_v1(user_id INTEGER,mercenary_code TEXT);
 CREATE TABLE user_equipment_counts_v1(user_id BIGINT,equipment_id BIGINT,quantity BIGINT,PRIMARY KEY(user_id,equipment_id));
 CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,power_type TEXT,base_power BIGINT);
 CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT,breakthrough_level BIGINT,PRIMARY KEY(user_id,card_id));
 CREATE TABLE card_unique_effects(card_id TEXT PRIMARY KEY,attack_percent INTEGER,defense_percent INTEGER,hp_percent INTEGER,speed_percent INTEGER,is_active INTEGER,scope_pve INTEGER);
 CREATE TABLE character_titles(id BIGINT PRIMARY KEY,pve_power BIGINT,is_active INTEGER);
 CREATE TABLE user_character_titles(user_id BIGINT,title_id BIGINT,expires_at TEXT,PRIMARY KEY(user_id,title_id));
 CREATE TABLE avatar_catalog_v1(code TEXT PRIMARY KEY,effect_type TEXT,effect_value INTEGER,is_active INTEGER);
 CREATE TABLE avatar_effect_options_v1(avatar_code TEXT,effect_type TEXT,effect_value INTEGER);
 CREATE TABLE avatar_user_ownership_v1(user_id BIGINT,avatar_code TEXT,expires_at TEXT,PRIMARY KEY(user_id,avatar_code));
 CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,payload_json TEXT,revision INTEGER);
 CREATE TABLE ranked_duo_accounts_v1(user_id BIGINT PRIMARY KEY,source_version BIGINT);
 CREATE TABLE coin_logs(id ${auto},user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
 CREATE TABLE user_mercenary_cards_v1(user_id BIGINT,mercenary_code TEXT,total_copies BIGINT,duplicate_count BIGINT,first_obtained_at TEXT,last_obtained_at TEXT,PRIMARY KEY(user_id,mercenary_code));
 CREATE TABLE mercenary_card_acquisitions_v1(acquisition_id TEXT PRIMARY KEY,user_id BIGINT,mercenary_code TEXT,is_duplicate BIGINT,total_copies_after BIGINT,duplicate_count_after BIGINT,created_at TEXT);
 CREATE TABLE user_mercenary_levels_v1(user_id BIGINT,mercenary_code TEXT,level BIGINT,experience BIGINT,breakthrough_mask BIGINT,revision BIGINT);
 INSERT INTO users VALUES(1,'USER','ACTIVE',NULL,100000000000000001),(2,'USER','ACTIVE',NULL,0);
 INSERT INTO character_garage_items(id,code,is_active,is_public) VALUES(1,'BOREAS_OMEGA',1,1);`;
 let DB;
 if(pg){
  const engine=new PGlite();t.after(()=>engine.close());
  await engine.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;"+schema);
  DB=new __postgresCompatTest.PostgresD1Database({async query(arg){const r=await engine.query(typeof arg==='string'?arg:arg.text,typeof arg==='string'?[]:arg.values);return {...r,rowCount:r.affectedRows??r.rows.length};}});
 }else{
  const engine=new DatabaseSync(':memory:');engine.exec(schema);t.after(()=>engine.close());
  const execute=s=>{const q=engine.prepare(s.sql);if(q.columns().length)return {results:q.all(...s.params)};return {meta:{changes:Number(q.run(...s.params).changes)}};};
  DB={prepare(sql){return {sql,params:[],bind(...params){return {...this,params};},async first(){return execute(this).results[0]||null;},async all(){return execute(this);},async run(){return execute(this);}};},async batch(stmts){engine.exec('BEGIN');try{const result=stmts.map(execute);engine.exec('COMMIT');return result;}catch(e){engine.exec('ROLLBACK');throw e;}}};
 }
 const env={DB},p=(q,...args)=>DB.prepare(q).bind(...args),run=(q,...args)=>p(q,...args).run();
 let power=8500001;
 const deps={ownedPower:async()=>({total:power}),authenticate:async()=>({id:1}),json:(body,status)=>({body,status}),withUserMutationLock:async(_env,_id,_path,work)=>work()};
 const request=(action,method=action==='status'?'GET':'POST')=>handleComeback({env,deps,request:{method},path:'comeback/'+action});
 const claim=()=>request('claim');
 for(const [i,c] of COMEBACK.equipment.entries())await run('INSERT INTO character_equipment_items(id,code,is_active,is_public) VALUES(?,?,1,1)',i+1,c);
 return {env,p,run,request,claim,deps,setPower:value=>{power=value;}};
}
for(const pg of [false,true])test((pg?'PostgreSQL':'SQLite')+' 기존 유저 카미시로 임무, 복귀 자격 전환과 대여 기간 고정',async t=>{
 const {env,p,run,request,claim,setPower}=await fixture(t,pg),prefix=COMEBACK.id;
 assert.equal((await request('enroll')).body.grant,undefined);
 await run("INSERT INTO user_second_verifications VALUES(1,'PLAYDK','verified-1')");
 assert.equal((await request('status')).body.canEnroll,true);
 const period=questPeriod(),week=period.weekKey,old='2020-01-01 00:00:00';
 await run("INSERT INTO quest_weekly_claims_v1 VALUES(1,'POST',?,'COMPLETED',?)",week,old);
 const enrolled=(await request('enroll')).body.grant;
 assert.equal(enrolled.kind,'MISSION');assert.equal(enrolled.alreadyCompletedWeek,week);
 assert.deepEqual((await request('enroll')).body.grant,enrolled);
 assert.equal((await p('SELECT value FROM app_meta WHERE key=?',LOAN_PREFIX+'1').first()),null);
 assert.equal((await request('supplies','GET')).body.reason,'ATTENDANCE');
 const expiry='2001-02-01 00:00:00',priorLoan={...enrolled,kind:'VETERAN',loanStartedAt:'2001-01-02 00:00:00',expiresAt:expiry};
 await run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(priorLoan),prefix+':mission:1');
 await run('INSERT INTO app_meta VALUES(?,?,?)',LOAN_PREFIX+'1',expiry,old);
 const addWeek=async n=>{const key=new Date(Date.parse(week+'T00:00:00Z')+n*7*86400000).toISOString().slice(0,10);await run("INSERT INTO quest_weekly_claims_v1 VALUES(1,'POST',?,'COMPLETED',?)",key,key+' 12:00:00');};
 await addWeek(1);assert.equal((await request('status')).body.weeks.length,1);
 await addWeek(2);assert.equal(await grantComebackFinalIfReady(env,1),false);
 await run("INSERT INTO organization_rounds_v1 VALUES('live','LIVE','ASSIGNED',1)");await run("INSERT INTO organization_members_v1 VALUES(1,'live')");
 const outcomes=await Promise.all([grantComebackFinalIfReady(env,1),grantComebackFinalIfReady(env,1)]);assert.equal(outcomes.filter(Boolean).length,1);
 assert.equal((await claim()).body.phase,'COMPLETE');assert.equal((await claim()).body.grant.kind,'VETERAN');
 // Later return eligibility opens the regular supplies without extending this loan or repeating the shared reward.
 await run("INSERT INTO user_attendance_summary_v1401 VALUES(1,30,'2026-01-30')");setPower(8500000);
 assert.equal((await request('supplies','GET')).body.phase,'ELIGIBLE');assert.equal((await request('receive')).body.phase,'DIALOGUE_REQUIRED');
 await request('talk');const supplies=await request('receive');assert.equal(supplies.body.awarded,true);assert.equal(supplies.body.phase,'COMPLETE');
 assert.equal(supplies.body.grant.expiresAt,expiry);assert.equal((await p('SELECT value FROM app_meta WHERE key=?',LOAN_PREFIX+'1').first()).value,expiry);
 await request('receive');assert.equal(Number((await p("SELECT COUNT(*) n FROM coin_logs").first()).n),1);
 assert.equal(Number((await p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code=?',COMEBACK.followup).first()).total_copies),1);
 assert.equal(Number((await p('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1').first()).n),1);
});

for(const pg of [false,true])test((pg?'PostgreSQL':'SQLite')+' 복귀 자격, 보급 원복·중복 방지, 대여 만료 및 2주 후속 지급',async t=>{
 const {env,p,run,request,claim,setPower}=await fixture(t,pg);
 const stamp='2020-01-01 00:00:00',week=questPeriod().weekKey;
 const count=async(table,where='')=>Number((await p('SELECT COUNT(*) n FROM '+table+' '+where).first()).n);
 const balance=async()=>(await p('SELECT CAST(coin AS TEXT) value FROM users WHERE id=1').first()).value;
 const levels=async()=>Object.fromEntries((await p(`SELECT * FROM ${PLAYABLE_LEVELS} WHERE user_id=1`).all()).results.map(row=>[row.mercenary_code,mercenaryLevelStateFromStorage(row).level]));
 const playable=async()=>(await p(`SELECT * FROM ${PLAYABLE_MERCENARY_COUNTS} WHERE user_id=1 ORDER BY mercenary_code`).all()).results;
 assert.equal((await request('status')).body.phase,'INELIGIBLE');
 await run("INSERT INTO user_attendance_summary_v1401 VALUES(1,29,'2026-01-29')");
 assert.equal((await request('status')).body.attendance,29);
 await run("INSERT INTO attendance_logs VALUES(1,'2026-01-29'),(1,'2026-01-30')");
 assert.equal((await request('status')).body.phase,'VERIFY');
 await run("INSERT INTO user_second_verifications VALUES(1,'PLAYDK','account-one')");
 assert.equal((await request('status')).body.reason,'POWER');
 setPower(8500000);
 assert.equal((await request('status')).body.phase,'ELIGIBLE');
 assert.equal((await request('enter')).status,409);
 assert.equal((await request('claim','GET')).status,405);
 await run('INSERT INTO app_meta VALUES(?,?,?)',COMEBACK.id+':dialogue:2',stamp,stamp);
 assert.equal((await claim()).body.phase,'DIALOGUE_REQUIRED'); // Another account spoke.
 for(let i=0;i<2;i++)assert.equal((await request('talk')).body.phase,'DIALOGUE');
 assert.equal((await request('enter')).status,409); // Cached lobby even after a valid conversation.
 assert.equal(await count('coin_logs'),0);assert.equal(await count('user_equipment_instances'),0);
 assert.equal(await count('user_garage_vehicles'),0);assert.equal(await count('app_meta',"WHERE key LIKE 'comeback26:loan:%'"),0);
 assert.equal(await balance(),'100000000000000001');
 setPower(8500001);assert.equal((await claim()).body.reason,'POWER');setPower(8500000);
 await run("INSERT INTO user_garage_vehicles VALUES(1,1,'EXISTING','keep',?)",stamp);
 await run("INSERT INTO user_mercenary_cards_v1 VALUES(1,?,2,1,?,?)",LOAN_CODES[0],stamp,stamp);
 await run("INSERT INTO user_mercenary_levels_v1 VALUES(1,?,3,0,0,1)",LOAN_CODES[0]);
 await run("INSERT INTO quest_weekly_claims_v1 VALUES(1,'POST',?,'COMPLETED',?)",week,stamp);
 await run('UPDATE character_equipment_items SET is_public=0 WHERE id=3');
 assert.equal((await claim()).status,503);assert.equal(await count('coin_logs'),0);assert.equal(await balance(),'100000000000000001');
 await run('UPDATE character_equipment_items SET is_public=1 WHERE id=3');
 const responses=await Promise.all([claim(),claim()]);
 assert(responses.every(r=>r.body.phase==='MISSIONS'));assert.equal(responses.filter(r=>r.body.awarded).length,1);
 const state=await comebackState(env,1),grant=state.grant;assert.ok(grant.dialogueStartedAt<=grant.startedAt);assert.equal((await p('SELECT value FROM app_meta WHERE key=?',COMEBACK.id+':dialogue:1').first()),null);
 assert.equal(grant.alreadyCompletedWeek,week);assert.equal(grant.attendance,30);assert.equal(grant.power.total,8500000);
 setPower(90000000); // Receiving the supplies never cancels the follow-up mission.
 assert.equal(Date.parse(grant.expiresAt.replace(' ','T')+'Z')-Date.parse(grant.startedAt.replace(' ','T')+'Z'),30*86400000);
 assert.equal(await balance(),'103000000000000001');assert.equal(await count('coin_logs'),1);
 assert.equal(await count('equipment_forge_states_v1','WHERE level=10'),4);assert.equal(await count('user_equipment_instances'),4);
 assert.equal(await count('user_garage_vehicles'),1);assert.equal((await p('SELECT source_type FROM user_garage_vehicles').first()).source_type,'EXISTING');
 assert.equal(await count('user_mercenary_cards_v1'),1);assert.equal((await playable()).length,2);assert.deepEqual(await levels(),Object.fromEntries(LOAN_CODES.map(c=>[c,21])));
 await run("UPDATE app_meta SET value=CURRENT_TIMESTAMP WHERE key=?",LOAN_PREFIX+'1');
 assert.deepEqual(await levels(),{[LOAN_CODES[0]]:3});assert.equal((await playable()).length,1);
 assert.equal(Number((await playable())[0].total_copies),2);
 const later=i=>new Date(Date.parse(week+'T00:00:00Z')+i*7*86400000).toISOString().slice(0,10);
 for(const i of [1,2])await run("INSERT INTO quest_weekly_claims_v1 VALUES(1,'POST',?,'COMPLETED',?)",later(i),later(i)+' 04:01:00');
 await run("INSERT INTO organization_rounds_v1 VALUES('test','TEST','ASSIGNED',1),('live','LIVE','ASSIGNED',2),('old','LIVE','ASSIGNED',0)");
 await run("INSERT INTO organization_members_v1 VALUES(1,'old'),(1,'test')");
 assert.equal(await grantComebackFinalIfReady(env,1),false);
 await run("INSERT INTO organization_members_v1 VALUES(1,'live')");
 await run("UPDATE quest_weekly_claims_v1 SET status='PENDING' WHERE week_key=?",later(2));
 assert.equal(await grantComebackFinalIfReady(env,1),false);
 await run("UPDATE quest_weekly_claims_v1 SET status='COMPLETED' WHERE week_key=?",later(2));
 assert.deepEqual((await Promise.all([grantComebackFinalIfReady(env,1),grantComebackFinalIfReady(env,1)])).sort(),[false,true]);
 const final=await comebackState(env,1);assert.equal(final.phase,'COMPLETE');assert.deepEqual(final.final.weeks,[later(1),later(2)]);
 assert.equal(await count('mercenary_card_acquisitions_v1'),1);
 assert.equal(Number((await p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE mercenary_code=?',COMEBACK.followup).first()).total_copies),1);
 assert.equal((await claim()).body.phase,'COMPLETE');assert.equal(await count('joint_atomic_guards_v1'),0);
});

// Change the worn setup, stack sizes and an oversized suit independently from the sources of owned power.
for(const pg of [false,true])test((pg?'PostgreSQL':'SQLite')+' 미장착 보유분·같은 종류 최고 강화·배틀슈트 제외',async t=>{
 const {env,run}=await fixture(t,pg);
 const config=MERCENARY_CMS_SEED.document;
 await run("INSERT INTO mercenary_cms_documents_v1 VALUES('config',?,1)",JSON.stringify(config));
 await run("INSERT INTO app_meta(key,value) VALUES('avatar_settings_v1',?),('card_unique_effect_settings_v1',?)",JSON.stringify({mode:'ON'}),JSON.stringify({enabled:true}));
 await run("UPDATE character_equipment_items SET total_power=100 WHERE id IN (1,2)");
 await run("INSERT INTO character_equipment_items VALUES(5,'X_BODY',1,1,'BATTLE_SUIT',90000000),(6,'MERC_ARMOR',1,1,'TOP',90)");
 await run("INSERT INTO user_equipment_instances(id,user_id,equipment_id) VALUES(1,1,1),(2,1,1),(3,1,1),(4,1,2),(5,1,5),(6,1,6)");
 await run('INSERT INTO equipment_forge_states_v1 VALUES(1,1,5,1),(2,1,10,1),(5,1,10,1)');
 await run("INSERT INTO app_meta(key,value) VALUES('equipment_counts_v1_ready','1')");
 await run('INSERT INTO user_equipment_counts_v1 VALUES(1,1,3),(1,2,1),(1,5,1),(1,6,1)');
 await run("UPDATE character_garage_items SET total_power=900 WHERE id=1");
 await run("INSERT INTO character_garage_items VALUES(2,'SECOND_CAR',1,1,800)");
 await run('INSERT INTO user_garage_vehicles(user_id,garage_id) VALUES(1,1),(1,2)');
 await run("INSERT INTO character_titles VALUES(1,50,1),(2,20,1),(3,80000,1)");
 await run("INSERT INTO user_character_titles VALUES(1,1,NULL),(1,2,NULL),(1,3,'2000-01-01 00:00:00')");
 await run("INSERT INTO avatar_catalog_v1 VALUES('A','COIN_GAIN_PERCENT',80,1),('B','BATTLE_POWER_PERCENT',5,1),('C','BATTLE_POWER_PERCENT',100,1)");
 await run("INSERT INTO avatar_effect_options_v1 VALUES('A','BATTLE_POWER_BASIS_POINTS',250),('A','BATTLE_POWER_PERCENT',2)");
 await run("INSERT INTO avatar_user_ownership_v1 VALUES(1,'A',NULL),(1,'B',NULL),(1,'C','2000-01-01 00:00:00')");
 const mercs=['V-969','V-977','V-978'];
 for(const code of mercs)await run('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies) VALUES(1,?,99)',code);
 for(let i=1;i<=7;i++){
   await run("INSERT INTO cards_effective_v1210 VALUES(?,?,'R','NONE',10)",'C'+i,'카드 '+i);
   await run('INSERT INTO user_cards VALUES(1,?,99,?)','C'+i,i);
 }
 await run("INSERT INTO card_unique_effects VALUES('C1',100,0,100,0,1,1)");
 const deps={readBattleSettings:async()=>({}),cardBattlePower:(card,level)=>Number(card.base_power)+level};
 const read=()=>comebackOwnedPower(env,1,deps);
 const power=await read();
 const gear=forgePower(100,10).total+100+90,cards=109; // 7 ten-power cards + 1..7 enhancement + C1 unique ability
 const mercenaries=mercs.reduce((n,code)=>n+mercenarySnapshotPower(battleConfig(config,code,1)),0);
 const subtotal=gear+cards+mercenaries+1700+70,avatar=Math.round(subtotal*0.075);
 assert.deepEqual(power,{equipment:gear,cards,mercenaries,vehicles:1700,titles:70,avatar,avatarPercent:7.5,total:subtotal+avatar});
 // Start with empty loadouts, then equip ordinary gear, the suit and one mercenary.
 await run('INSERT INTO user_equipment_loadout VALUES(1,1),(1,5)');
 await run("INSERT INTO user_mercenary_loadout_v1 VALUES(1,'V-969')");
 await run('UPDATE user_cards SET quantity=1');await run('UPDATE user_mercenary_cards_v1 SET total_copies=1');
 await run('UPDATE character_equipment_items SET total_power=99999999 WHERE id=5');
 assert.deepEqual(await read(),power);
 await run('DELETE FROM user_equipment_loadout');await run('DELETE FROM user_mercenary_loadout_v1');
 assert.deepEqual(await read(),power);
});

for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+' 대여 용병의 실제 도감·진형·전투 레벨과 만료',async t=>{
 const f=await ascendantEquipmentFixture(t,{postgres}),id=f.user.id,loan=LOAN_PREFIX+id;
 await ensureMercenaryLevelSchema(f.env);await f.setting(MERCENARY_LEVEL_KEY,mercenaryGrowthLaunchPolicy());
 await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',loan,'2099-01-01 00:00:00').run();
 const modes=['PVE','PVP'];
 for(const [i,mode] of modes.entries()){
   const code=LOAN_CODES[i];
   await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCodes:[code],revision:1});
   const active=(await releasedMercenaryFormations(f.env,[id],mode)).get(id).mercenaries;
   assert.deepEqual(active.map(m=>[m.code,m.level]),[[code,21]]);
 }
 const codex=await mercenaryAccountState(f.env,f.user);
 assert.deepEqual(codex.cards.filter(c=>LOAN_CODES.includes(c.code)).map(c=>[c.code,c.level,Boolean(c.loanUntil)]),LOAN_CODES.map(c=>[c,21,true]));
 const ranked=async()=>(await rankedOwnedMercenaries(f.env,[id])).get(id).map(m=>m.code);
 assert(LOAN_CODES.every(c=>codex.cards.some(row=>row.code===c)));
 assert(LOAN_CODES.every(c=>(codex.cards.find(row=>row.code===c)).canDeploy));assert((await ranked()).includes(LOAN_CODES[0]));
 await f.p('UPDATE app_meta SET value=? WHERE key=?','2000-01-01 00:00:00',loan).run();
 const expired=await mercenaryAccountState(f.env,f.user);
 for(const mode of modes){
   assert.equal((await releasedMercenaryFormations(f.env,[id],mode)).get(id).mercenaries.length,0);
   assert.equal(expired.loadouts[mode].mercenaryCode,null);
 }
 assert(!expired.cards.some(c=>LOAN_CODES.includes(c.code)));assert(!(await ranked()).some(c=>LOAN_CODES.includes(c)));
});

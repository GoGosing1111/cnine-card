import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {releaseFmDimwoos,FM_AVATAR,FM_GRANT_KEY,FM_EXPECTED_EFFECTS} from '../scripts/ops/avatar-fm-dimwoos-release.mjs';
let fixtureId=0;
async function fixture(){
 const pg=new PGlite(),api=await import('../functions/_avatar.js?dimwoos='+fixtureId++);
 await pg.exec(`CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,coin BIGINT,status TEXT);
 INSERT INTO users SELECT n,'FM member '||n,CASE WHEN n=1 THEN 'OWNER' ELSE 'USER' END,777,'ACTIVE' FROM generate_series(1,21) n;
 INSERT INTO users VALUES(4773,'진짜디임','USER',888,'ACTIVE'),(9999,'Other clan','USER',999,'ACTIVE');
 CREATE TABLE clan_seasons(id BIGINT PRIMARY KEY,season_no INT,phase TEXT,max_members INT);
 INSERT INTO clan_seasons VALUES(5,2,'ACTIVE',20);
 CREATE TABLE clan_organizations(id BIGINT PRIMARY KEY,name TEXT,is_active INT);
 INSERT INTO clan_organizations VALUES(7,'FM',1),(8,'Other',1);
 CREATE TABLE clan_season_teams(season_id BIGINT,clan_id BIGINT,master_user_id BIGINT);
 INSERT INTO clan_season_teams VALUES(5,7,1),(5,8,9999);
 CREATE TABLE clan_members(season_id BIGINT,clan_id BIGINT,user_id BIGINT,member_role TEXT,preferred_role TEXT,draft_pick_no INT,joined_at TEXT,updated_at TEXT,PRIMARY KEY(season_id,user_id));
 INSERT INTO clan_members SELECT 5,7,n,CASE WHEN n=1 THEN 'MASTER' ELSE 'MEMBER' END,'BALANCED',n,'before','before' FROM generate_series(1,21) n;
 INSERT INTO clan_members VALUES(5,8,9999,'MASTER','BALANCED',0,'before','before');
 CREATE TABLE clan_draft_pool(season_id BIGINT,user_id BIGINT,candidate_key TEXT,preferred_role TEXT,activity_window TEXT,deck_snapshot TEXT,status TEXT,drafted_clan_id BIGINT,pick_no INT,registered_at TEXT,updated_at TEXT,PRIMARY KEY(season_id,user_id));
 CREATE TABLE user_second_verifications(user_id BIGINT,provider TEXT);
 INSERT INTO user_second_verifications VALUES(4773,'PLAYDK');
 CREATE TABLE pvp_active_presets(user_id BIGINT,preset_no INT);
 CREATE TABLE pvp_deck_presets(user_id BIGINT,preset_no INT,card_ids TEXT);
 CREATE TABLE pvp_decks(user_id BIGINT,card_ids TEXT);
 INSERT INTO pvp_decks VALUES(4773,'["1","2","3","4","5"]');
 CREATE TABLE clan_wars(id BIGINT,season_id BIGINT);
 CREATE TABLE clan_war_battles(season_id BIGINT,attacker_user_id BIGINT,defender_user_id BIGINT,status TEXT);
 CREATE TABLE clan_war_reservation_locks(war_id BIGINT,user_id BIGINT,expires_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 INSERT INTO app_meta VALUES('avatar_settings_v1','{"mode":"ON","shopEnabled":true,"version":3}',NULL);`);
 const client={async query(input,values){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?values||[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length}}};
 const db=new __postgresCompatTest.PostgresD1Database(client),env={DB:db};
 await api.ensureAvatarFoundation(env);
 await pg.exec("UPDATE avatar_catalog_v1 SET effect_type='COIN_GAIN_PERCENT',effect_value=75,is_active=1,is_public=1,version=3 WHERE code='T1_JOEUN';DELETE FROM avatar_effect_options_v1 WHERE avatar_code='T1_JOEUN'");
 for(const e of FM_EXPECTED_EFFECTS)await pg.query("INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) VALUES('T1_JOEUN',$1,$2,$3)",[e.option_order,e.effect_type,e.effect_value]);
 const expectedRedraft={version:1,seasonId:5,startsAt:'2026-09-16T00:00:00Z',participantCount:40,quotas:{7:20,8:20},activeRosterOverrides:{7:{maxMembers:21,operationId:'ops:previous-admission:v1'}}};
 await pg.query("INSERT INTO app_meta(key,value) VALUES('clan_redraft_v20260916:5',$1)",[JSON.stringify(expectedRedraft)]);
 const plan={expectedSeasonId:5,expectedClanId:7,expectedRecipientIds:[...Array.from({length:21},(_,i)=>i+1),4773],expectedRedraft};
 const q=async(s,v=[])=>(await pg.query(s,v)).rows;
 const call=(id,path,body)=>api.handleAvatar({env,path,deps:{authenticate:async()=>({id,role:'USER'}),readBody:r=>r.json(),json:(body,status=200)=>({body,status})},request:new Request('https://qa.test/api/'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
 return {pg,api,db,env,plan,q,call};
}
async function absent(f){
 assert.equal((await f.q('SELECT * FROM avatar_catalog_v1 WHERE code=$1',[FM_AVATAR.code])).length,0);
 assert.equal((await f.q('SELECT * FROM avatar_user_ownership_v1 WHERE avatar_code=$1',[FM_AVATAR.code])).length,0);
 assert.equal((await f.q('SELECT * FROM clan_members WHERE user_id=4773')).length,0);
 assert.equal((await f.q('SELECT * FROM clan_draft_pool WHERE user_id=4773')).length,0);
 assert.equal((await f.q('SELECT * FROM app_meta WHERE key=$1',[FM_GRANT_KEY])).length,0);
 assert.deepEqual(JSON.parse((await f.q("SELECT value FROM app_meta WHERE key='clan_redraft_v20260916:5'"))[0].value),f.plan.expectedRedraft);
 assert.equal((await f.q('SELECT * FROM admin_logs')).length,0);
}
test('FM admission and 22 eleven-day grants are atomic, idempotent and expire through the live avatar API',async()=>{
 const f=await fixture();try{
 const before=await f.q('SELECT * FROM users ORDER BY id'),members=await f.q('SELECT * FROM clan_members ORDER BY user_id'),season=await f.q('SELECT * FROM clan_seasons');
 const dry=await releaseFmDimwoos(f.db,{...f.plan,dryRun:true});assert.equal(dry.rolledBack,true);await absent(f);
 const r=await releaseFmDimwoos(f.db,f.plan);assert.equal(r.granted,22);assert.deepEqual(r.effects,FM_EXPECTED_EFFECTS);assert.equal(r.clan.maxMembers,22);assert.equal(r.admitted.userId,4773);
 const utc=x=>Date.parse(x.replace(' ','T')+'Z');assert.equal(utc(r.expiresAt)-utc(r.acquiredAt),11*86400000);
 assert.deepEqual(await f.q('SELECT * FROM users ORDER BY id'),before);
 assert.deepEqual(await f.q('SELECT * FROM clan_seasons'),season);
 assert.deepEqual(await f.q('SELECT * FROM clan_members WHERE user_id<>4773 ORDER BY user_id'),members);
 assert.deepEqual(await f.q('SELECT * FROM avatar_user_loadout_v1'),[]);
 const redraft=JSON.parse((await f.q("SELECT value FROM app_meta WHERE key='clan_redraft_v20260916:5'"))[0].value);
 assert.equal(redraft.activeRosterOverrides[7].maxMembers,22);assert.deepEqual(redraft.quotas,f.plan.expectedRedraft.quotas);assert.equal(redraft.participantCount,40);
 assert.equal((await f.q('SELECT * FROM admin_logs')).length,3);
 assert.deepEqual(await releaseFmDimwoos(f.db,f.plan),{...r,replayed:true});
 assert.equal((await f.q('SELECT * FROM admin_logs')).length,3);
 const owned=(await f.call(4773,'avatar/catalog')).body.avatars.find(a=>a.code===FM_AVATAR.code);
 assert.equal(owned.owned,true);assert.equal(owned.expiresAt,r.expiresAt);assert.deepEqual(owned.effects,[{type:'COIN_GAIN_PERCENT',value:75},{type:'RAID_EXTRA_ENTRY',value:10}]);
 assert.equal((await f.call(9999,'avatar/equip',{avatarCode:FM_AVATAR.code})).status,404);
 assert.equal((await f.call(4773,'avatar/purchase',{avatarCode:FM_AVATAR.code,requestId:'not-for-sale'})).status,404);
 assert.equal((await f.call(4773,'avatar/equip',{avatarCode:FM_AVATAR.code})).status,200);
 const effect=await f.api.equippedAvatarEffect(f.env,4773);assert.equal(f.api.applyAvatarCoinGain(100,effect).total,175);assert.equal(f.api.applyAvatarRaidEntryBonus(3,effect).limit,13);
 for(const p of [effect.lobbyImage,effect.lobbyMobileImage,effect.equipmentImage])assert.ok((await readFile(new URL('../'+p,import.meta.url))).length>0);
 await f.q('UPDATE avatar_user_ownership_v1 SET expires_at=sqlite_now() WHERE user_id=4773 AND avatar_code=$1',[FM_AVATAR.code]);
 assert.equal(await f.api.equippedAvatarEffect(f.env,4773),null);assert.equal((await f.call(4773,'avatar/equip',{avatarCode:FM_AVATAR.code})).status,404);
 }finally{await f.pg.close()}
});
test('recipient insert failure rolls back admission, capacity, avatar and audits',async()=>{
 const f=await fixture();try{await f.q("ALTER TABLE avatar_user_ownership_v1 ADD CONSTRAINT grant_failure CHECK(user_id<>4773 OR avatar_code<>'FM_DIMWOOS')");await assert.rejects(releaseFmDimwoos(f.db,f.plan),/grant_failure/);await absent(f)}finally{await f.pg.close()}
});
test('changed source effects reject before all mutations',async()=>{
 const f=await fixture();try{await f.q("UPDATE avatar_effect_options_v1 SET effect_value=4 WHERE avatar_code='T1_JOEUN' AND option_order=1");await assert.rejects(releaseFmDimwoos(f.db,f.plan),/options changed/);await absent(f)}finally{await f.pg.close()}
});
test('changed FM roster and occupied serial are rejected',async()=>{
 const f=await fixture();try{await f.q('UPDATE clan_members SET clan_id=8 WHERE user_id=21');await assert.rejects(releaseFmDimwoos(f.db,f.plan),/recipients changed/);await absent(f);await f.q('UPDATE clan_members SET clan_id=7 WHERE user_id=21');await f.q("UPDATE avatar_catalog_v1 SET serial='A-21' WHERE code='T1_JOEUN'");await assert.rejects(releaseFmDimwoos(f.db,f.plan),/already exists/);await absent(f)}finally{await f.pg.close()}
});
test('missing admission prerequisites or changed capacity cannot partially grant the avatar',async()=>{
 const f=await fixture();try{await f.q('DELETE FROM user_second_verifications WHERE user_id=4773');await assert.rejects(releaseFmDimwoos(f.db,f.plan),/verification missing/);await absent(f);await f.q("INSERT INTO user_second_verifications VALUES(4773,'PLAYDK')");await assert.rejects(releaseFmDimwoos(f.db,{...f.plan,expectedRedraft:{}}),/capacity metadata changed/);await absent(f)}finally{await f.pg.close()}
});

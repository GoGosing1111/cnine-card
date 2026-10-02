import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {releaseLgAyoon,LG_AVATAR,EXPECTED_EFFECTS,OPERATION_KEY} from '../scripts/ops/avatar-lg-ayoon-release-20261003.mjs';
const END='2099-10-11T13:00:00Z';
let instance=0;
async function fixture(){
 const pg=new PGlite(),api=await import('../functions/_avatar.js?lg-ayoon-test='+instance++);
 await pg.exec(`
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE TABLE users(id bigint PRIMARY KEY,nickname text,status text,role text,coin bigint DEFAULT 100);
 INSERT INTO users(id,nickname,status,role) VALUES(1,'Owner','ACTIVE','OWNER'),(5209,'김아윤','ACTIVE','USER'),(900,'Other clan','ACTIVE','USER');
 CREATE TABLE user_second_verifications(user_id bigint,provider text);
 INSERT INTO user_second_verifications VALUES(5209,'PLAYDK');
 CREATE TABLE clan_seasons(id bigint PRIMARY KEY,season_no int,phase text,max_members int,ends_at text);
 INSERT INTO clan_seasons VALUES(6,3,'ACTIVE',22,'${END}');
 CREATE TABLE clan_organizations(id bigint PRIMARY KEY,name text,is_active int);
 INSERT INTO clan_organizations VALUES(5,'LG',1),(7,'Other',1);
 CREATE TABLE clan_season_teams(season_id bigint,clan_id bigint,master_user_id bigint,score bigint);
 INSERT INTO clan_season_teams VALUES(6,5,2,777),(6,7,900,999);
 CREATE TABLE clan_members(season_id bigint,clan_id bigint,user_id bigint,member_role text,preferred_role text,draft_pick_no int,
 contribution_score bigint DEFAULT 0,battle_wins int DEFAULT 0,battle_losses int DEFAULT 0,joined_at text,updated_at text,PRIMARY KEY(season_id,user_id));
 INSERT INTO clan_members(season_id,clan_id,user_id,member_role) VALUES(6,7,900,'MASTER');
 CREATE TABLE clan_draft_pool(season_id bigint,user_id bigint,candidate_key text,preferred_role text,activity_window text,deck_snapshot text,status text,
 drafted_clan_id bigint,pick_no int,registered_at text,updated_at text,total_score bigint DEFAULT 0,PRIMARY KEY(season_id,user_id),UNIQUE(season_id,candidate_key));
 CREATE TABLE clan_wars(id bigint,season_id bigint);
 CREATE TABLE clan_war_battles(season_id bigint,attacker_user_id bigint,defender_user_id bigint,status text);
 CREATE TABLE clan_war_reservation_locks(user_id bigint,war_id bigint,expires_at text);
 CREATE TABLE pvp_decks(user_id bigint,card_ids text);
 CREATE TABLE pvp_deck_presets(user_id bigint,preset_no int,card_ids text);
 CREATE TABLE pvp_active_presets(user_id bigint,preset_no int);
 INSERT INTO pvp_decks VALUES(5209,'[1,2,3,4,5]');
 INSERT INTO app_meta VALUES('avatar_settings_v1','{"mode":"ON","shopEnabled":true,"version":3}',NULL);
 `);
 const q=async(sql,args=[])=>(await pg.query(sql,args)).rows;
 const beforeIds=Array.from({length:17},(_,i)=>i+2);
 for(const id of beforeIds){
  await q("INSERT INTO users(id,nickname,status,role) VALUES($1,$2,'ACTIVE','USER')",[id,'LG member '+id]);
  await q('INSERT INTO clan_members(season_id,clan_id,user_id,member_role) VALUES(6,5,$1,$2)',[id,id===2?'MASTER':'MEMBER']);
 }
 await q('INSERT INTO app_meta(key,value) VALUES($1,$2)',['clan_redraft_v20260916:6',JSON.stringify({version:1,allocation:'BALANCED_EIGHT_CLANS_V1',seasonId:6,startsAt:'2026-09-29T12:26:49.107Z',participantCount:140,quotas:{1:18,2:17,3:17,4:17,5:18,6:18,7:18,8:17}})]);
 let failAudit=false;
 const client={async query(input,args){const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?args||[]:input.values||[];
  if(failAudit&&sql.includes("'OPS_LG_AYOON_ADMISSION_AVATAR'"))throw Error('Injected final audit failure');
  const result=await pg.query(sql,values);return {...result,rowCount:result.affectedRows??result.rows.length};
 }};
 const db=new __postgresCompatTest.PostgresD1Database(client),env={DB:db};await api.ensureAvatarFoundation(env);
 await q("INSERT INTO avatar_catalog_v1(code,serial,name,effect_type,effect_value,is_active,is_public,version) VALUES('LG_HI_HEEYA','A-27','LG 하이희야','DROP_RATE_PERCENT',30,1,1,1)");
 for(const e of EXPECTED_EFFECTS)await q("INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) VALUES('LG_HI_HEEYA',$1,$2,$3)",[e.option_order,e.effect_type,e.effect_value]);
 await q("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type) VALUES(2,'LG_HI_HEEYA','EVENT')");
 await q("INSERT INTO avatar_user_loadout_v1(user_id,avatar_code,updated_at) VALUES(2,'LG_HI_HEEYA','2020-01-01 00:00:00')");
 const options={expectedSeasonId:6,expectedClanId:5,expectedBeforeRecipientIds:beforeIds,expectedSeasonEndsAt:END,expectedSourceVersion:1,expectedCapacity:18};
 const snapshot=async()=>{
  const result={};
  for(const [table,order] of [['users','id'],['clan_members','user_id'],['clan_season_teams','clan_id'],['clan_draft_pool','user_id'],['avatar_catalog_v1','code'],['avatar_effect_options_v1','avatar_code,option_order'],['avatar_user_ownership_v1','avatar_code,user_id'],['avatar_user_loadout_v1','user_id'],['app_meta','key'],['admin_logs','id']])result[table]=await q('SELECT * FROM '+table+' ORDER BY '+order);
  return result;
 };
 const call=(userId,path,body)=>api.handleAvatar({env,path,deps:{authenticate:async()=>({id:userId,role:'USER'}),readBody:r=>r.json(),json:(body,status=200)=>({body,status})},request:new Request('https://qa.test/api/'+path,body?{method:'POST',body:JSON.stringify(body)}:{})});
 return {pg,q,db,env,api,options,snapshot,call,failAudit:()=>{failAudit=true;}};
}

test('admission and 18 seasonal avatar grants are atomic, replay once, equip and expire via the real API',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot(),dry=await releaseLgAyoon(f.db,{...f.options,dryRun:true});
  assert.equal(dry.granted,18);assert.equal(dry.rolledBack,true);assert.deepEqual(await f.snapshot(),before);
  const result=await releaseLgAyoon(f.db,f.options),after=await f.snapshot();
  assert.equal(result.admission.userId,5209);assert.equal(result.admission.clanId,5);assert.equal(result.admission.memberCount,18);assert.equal(result.admission.maxMembers,18);
  assert.equal(result.expiresAt,'2099-10-11 13:00:00');assert.deepEqual(result.effects,EXPECTED_EFFECTS);
  assert.deepEqual(after.clan_members.filter(m=>m.user_id!==5209),before.clan_members);
  assert.equal(after.clan_draft_pool[0].drafted_clan_id,5);assert.equal(after.clan_draft_pool[0].status,'DRAFTED');
  for(const name of ['users','clan_season_teams','avatar_user_loadout_v1'])assert.deepEqual(after[name],before[name]);
  assert.deepEqual(after.avatar_user_ownership_v1.filter(o=>o.avatar_code!==LG_AVATAR.code),before.avatar_user_ownership_v1);
  const ownership=after.avatar_user_ownership_v1.filter(o=>o.avatar_code===LG_AVATAR.code);
  assert.equal(ownership.length,18);assert.ok(ownership.every(o=>o.source_ref===OPERATION_KEY&&o.expires_at===result.expiresAt));
  assert.equal((await releaseLgAyoon(f.db,f.options)).replayed,true);assert.deepEqual(await f.snapshot(),after);
  const avatar=(await f.call(5209,'avatar/catalog')).body.avatars.find(a=>a.code===LG_AVATAR.code);
  assert.equal(avatar.owned,true);assert.equal(avatar.expiresAt,result.expiresAt);assert.deepEqual(avatar.effects,EXPECTED_EFFECTS.map(e=>({type:e.effect_type,value:e.effect_value})));
  assert.equal((await f.call(900,'avatar/equip',{avatarCode:LG_AVATAR.code})).status,404);
  assert.equal((await f.call(5209,'avatar/purchase',{avatarCode:LG_AVATAR.code,requestId:'not-for-sale'})).status,404);
  assert.equal((await f.call(5209,'avatar/equip',{avatarCode:LG_AVATAR.code})).status,200);
  const equipped=await f.api.equippedAvatarEffect(f.env,5209);assert.deepEqual(equipped.effects,avatar.effects);
  assert.equal(f.api.applyAvatarCoinGain(100,equipped).total,200);assert.equal(f.api.applyAvatarRaidEntryBonus(3,equipped).limit,13);
  await f.q('UPDATE avatar_user_ownership_v1 SET expires_at=sqlite_now() WHERE avatar_code=$1',[LG_AVATAR.code]);
  assert.equal(await f.api.equippedAvatarEffect(f.env,5209),null);assert.equal((await f.call(5209,'avatar/equip',{avatarCode:LG_AVATAR.code})).status,404);
 }finally{await f.pg.close();}
});

test('invalid deck, stale roster/season/options, serial collision, partial grant and audit failure roll back admission too',async()=>{
 for(const sql of [
  "UPDATE pvp_decks SET card_ids='[]' WHERE user_id=5209",
  'UPDATE clan_members SET clan_id=7 WHERE user_id=3',
  "UPDATE clan_seasons SET ends_at='2099-10-12T13:00:00Z'",
  "UPDATE avatar_effect_options_v1 SET effect_value=5 WHERE avatar_code='LG_HI_HEEYA' AND option_order=1",
  "UPDATE avatar_catalog_v1 SET serial='A-34' WHERE code='LG_HI_HEEYA'",
  "ALTER TABLE avatar_user_ownership_v1 ADD CONSTRAINT fail_last_grant CHECK(user_id<>5209 OR avatar_code<>'LG_AYOON')",
  null
 ]){
  const f=await fixture();try{if(sql)await f.q(sql);else f.failAudit();const before=await f.snapshot();await assert.rejects(releaseLgAyoon(f.db,f.options));assert.deepEqual(await f.snapshot(),before);}finally{await f.pg.close();}
 }
});

test('approved face source, production image paths, generated alpha and equipment cache are connected',async()=>{
 const read=name=>readFile(new URL('../'+name,import.meta.url));
 const manifest=JSON.parse(await read('preview/avatar-lg-ayoon-v1/manifest.json'));
 assert.equal(manifest.faceApproval.sha256,'cb6faae9846f90c37f2923cf163496537867039762ea26e20afd749922a00dad');
 for(const [name,file] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await read('preview/avatar-lg-ayoon-v1/assets/'+name)).digest('hex'),file.sha256);
 assert.equal(manifest.alpha.borderNontransparentPixels,0);assert.ok(manifest.alpha.clearPixels>1024*1536*.45);
 for(const field of ['lobby_image','lobby_mobile_image','equipment_image'])assert.ok((await read(LG_AVATAR[field])).length>0);
 const m=await sharp(await read(LG_AVATAR.equipment_image)).metadata();assert.equal(m.width,640);assert.equal(m.height,1088);assert.equal(m.hasAlpha,true);
 const [css,app,index]=await Promise.all(['css/character-loadout-v2.css','js/app.js','index.html'].map(async name=>(await read(name)).toString()));
 assert.match(css,/data-avatar-code='LG_AYOON'[\s\S]*?bottom: 15%/);
 assert.match(app,/character-loadout-v2\.css[^']*lgAyoon=20261003/);
 assert.match(index,/js\/app\.js[^"]*lgAyoon=20261003/);
});

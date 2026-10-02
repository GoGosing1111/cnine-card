import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PGlite} from '@electric-sql/pglite';
import {releaseHanwhaDiimAvatar,OPERATION_KEY,CATALOG,TARGET,EFFECTS} from '../scripts/ops/clan-hanwha-diim-avatar-release-20261003.mjs';
const ENDS='2099-10-11T13:00:00Z';
async function fixture(){
 const pg=new PGlite();
 await pg.exec(`
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE TABLE users(id bigint PRIMARY KEY,nickname text,status text,role text,coin bigint DEFAULT 100);
 INSERT INTO users VALUES(1,'Owner','ACTIVE','OWNER',100);
 CREATE TABLE clan_seasons(id bigint PRIMARY KEY,season_no int,phase text,ends_at text);
 INSERT INTO clan_seasons VALUES(6,3,'ACTIVE','${ENDS}');
 CREATE TABLE clan_organizations(id bigint PRIMARY KEY,name text,is_active int);
 INSERT INTO clan_organizations VALUES(4,'한화',1);
 CREATE TABLE clan_members(season_id bigint,clan_id bigint,user_id bigint,member_role text DEFAULT 'MEMBER',contribution_score bigint DEFAULT 80,PRIMARY KEY(season_id,user_id));
 CREATE TABLE avatar_catalog_v1(code text PRIMARY KEY,serial text UNIQUE,name text,call_sign text,role_label text,description text,lobby_image text,lobby_mobile_image text,equipment_image text,accent text,acquisition_type text,coin_price bigint,source_label text,source_detail text,effect_type text,effect_value numeric,is_active int,is_public int,sale_enabled int,sort_order int,version int DEFAULT 1);
 CREATE TABLE avatar_effect_options_v1(avatar_code text,option_order int,effect_type text,effect_value numeric,PRIMARY KEY(avatar_code,option_order));
 CREATE TABLE avatar_user_ownership_v1(user_id bigint,avatar_code text,source_type text,source_ref text,acquired_at text,expires_at text,PRIMARY KEY(user_id,avatar_code));
 CREATE TABLE avatar_user_loadout_v1(user_id bigint,avatar_code text);
 `);
 const ids=[TARGET.userId,...Array.from({length:18},(_,i)=>400+i)].sort((a,b)=>a-b);
 for(const id of ids){
  await pg.query("INSERT INTO users(id,nickname,status,role) VALUES($1,$2,'ACTIVE','USER')",[id,id===TARGET.userId?TARGET.nickname:'Member '+id]);
  await pg.query('INSERT INTO clan_members(season_id,clan_id,user_id) VALUES(6,4,$1)',[id]);
  await pg.query("INSERT INTO avatar_user_loadout_v1 VALUES($1,'OLD_AVATAR')",[id]);
 }
 const src={...CATALOG,code:'HANWHA_KANGGUYEOL',serial:'A-31',name:'한화 강구열'};
 await pg.query('INSERT INTO avatar_catalog_v1('+Object.keys(src).join(',')+') VALUES('+Object.keys(src).map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(src));
 for(const e of EFFECTS)await pg.query("INSERT INTO avatar_effect_options_v1 VALUES('HANWHA_KANGGUYEOL',$1,$2,$3)",[e.option_order,e.effect_type,e.effect_value]);
 let failure=null;
 const db={dialect:'postgres',enqueue:fn=>fn(),client:{async query({text,values=[]}){
  if(failure==='audit'&&text.includes("'OPS_HANWHA_DIIM_AVATAR_RELEASE'"))throw Error('Injected audit failure');
  const result=await pg.query(text,values);
  if(failure==='grant-count'&&text.startsWith('INSERT INTO avatar_user_ownership_v1'))return {rows:[]};
  return result;
 }}};
 const snapshot=async()=>{const out={};for(const [table,order] of [['app_meta','key'],['admin_logs','id'],['users','id'],['clan_members','user_id'],['avatar_catalog_v1','code'],['avatar_effect_options_v1','avatar_code,option_order'],['avatar_user_ownership_v1','avatar_code,user_id'],['avatar_user_loadout_v1','user_id']])out[table]=(await pg.query('SELECT * FROM '+table+' ORDER BY '+order)).rows;return out};
 return {pg,db,snapshot,options:{expectedSeasonEndsAt:ENDS,expectedRecipients:ids,expectedSourceVersion:1},fail:k=>failure=k};
}
test('all 19 current Hanwha members get the exact options and expiry; dry-run/retry preserve balances and memberships',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot(),dry=await releaseHanwhaDiimAvatar(f.db,{...f.options,dryRun:true});
  assert.equal(dry.granted,19);assert.equal(dry.rolledBack,true);assert.deepEqual(await f.snapshot(),before);
  const live=await releaseHanwhaDiimAvatar(f.db,f.options),after=await f.snapshot();
  assert.equal(live.granted,19);assert.equal(live.expiresAt,'2099-10-11 13:00:00');assert.deepEqual(live.effects,EFFECTS);
  assert.equal(live.diimMembership,'ALREADY_HANWHA');
  assert.deepEqual(after.avatar_user_ownership_v1.map(r=>Number(r.user_id)),f.options.expectedRecipients);
  assert.ok(after.avatar_user_ownership_v1.every(r=>r.avatar_code===CATALOG.code&&r.expires_at===live.expiresAt&&r.source_ref===OPERATION_KEY&&r.source_type==='EVENT'));
  const catalog=after.avatar_catalog_v1.find(r=>r.code===CATALOG.code);
  assert.equal(catalog.sale_enabled,0);assert.equal(catalog.coin_price,null);assert.equal(catalog.is_public,1);
  for(const table of ['users','clan_members','avatar_user_loadout_v1'])assert.deepEqual(after[table],before[table]);
  assert.equal((await releaseHanwhaDiimAvatar(f.db,f.options)).replayed,true);assert.deepEqual(await f.snapshot(),after);
 }finally{await f.pg.close()}
});
test('a grant-count mismatch or audit failure rolls back catalog, options, grants and receipt together',async()=>{
 for(const failure of ['grant-count','audit']){
  const f=await fixture();try{
   const before=await f.snapshot();f.fail(failure);
   await assert.rejects(()=>releaseHanwhaDiimAvatar(f.db,f.options),/Grant row count|audit failure/);
   assert.deepEqual(await f.snapshot(),before);
  }finally{await f.pg.close()}
 }
});
test('changed season, member identity, options, version or serial stops the operation without partial writes',async()=>{
 for(const sql of [
  "UPDATE clan_seasons SET ends_at='2099-10-12T13:00:00Z'",
  "UPDATE clan_seasons SET ends_at='2020-01-01T00:00:00Z'",
  "UPDATE clan_seasons SET phase='COMPLETE'",
  'UPDATE clan_members SET clan_id=2 WHERE user_id=4773',
  "UPDATE users SET nickname='other' WHERE id=4773",
  'UPDATE avatar_effect_options_v1 SET effect_value=31 WHERE option_order=0',
  'UPDATE avatar_catalog_v1 SET version=2',
  "UPDATE avatar_catalog_v1 SET serial='A-33'"
 ]){
  const f=await fixture();try{
   await f.pg.exec(sql);const before=await f.snapshot();
   await assert.rejects(()=>releaseHanwhaDiimAvatar(f.db,f.options),/Season|roster|Source|serial/);
   assert.deepEqual(await f.snapshot(),before);
  }finally{await f.pg.close()}
 }
});
test('saved originals and runtime images match their hashes; complete transparent body connects to the live equipment loader',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../preview/avatar-hanwha-diim-v1/manifest.json',import.meta.url)));
 assert.equal(manifest.currentRevision,3);assert.equal(manifest.newPoseFromOriginalFace,true);
 assert.equal(manifest.maleUniformReference,false);assert.equal(manifest.alpha.borderNontransparentPixels,0);
 assert.ok(manifest.alpha.clearPixels>1024*1536*.5);
 for(const [name,value] of Object.entries(manifest.files)){
  const bytes=await readFile(new URL('../preview/avatar-hanwha-diim-v1/assets/'+name,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),value.sha256);
 }
 const metadata=await sharp(await readFile(new URL('../'+CATALOG.equipment_image,import.meta.url))).metadata();
 assert.equal(metadata.width,640);assert.equal(metadata.height,1088);assert.equal(metadata.hasAlpha,true);
 for(const field of ['lobby_image','lobby_mobile_image','equipment_image'])assert.ok((await readFile(new URL('../'+CATALOG[field],import.meta.url))).length>0);
 const [css,app,index]=await Promise.all(['css/character-loadout-v2.css','js/app.js','index.html'].map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
 assert.match(css,/data-avatar-code='HANWHA_DIIM'.*bottom: 15%/);
 assert.match(app,/character-loadout-v2\.css[^']*hanwhaDiim=20261003/);
 assert.match(index,/js\/app\.js[^"]*hanwhaDiim=20261003/);
});

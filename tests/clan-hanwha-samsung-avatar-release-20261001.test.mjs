import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PGlite} from '@electric-sql/pglite';
import {releaseClanAvatars,OPERATION_KEY,CATALOGS,TARGETS,EFFECTS} from '../scripts/ops/clan-hanwha-samsung-avatar-release-20261001.mjs';
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
 INSERT INTO clan_organizations VALUES(2,'삼성',1),(4,'한화',1);
 CREATE TABLE clan_members(season_id bigint,clan_id bigint,user_id bigint,PRIMARY KEY(season_id,user_id));
 CREATE TABLE avatar_catalog_v1(code text PRIMARY KEY,serial text UNIQUE,name text,call_sign text,role_label text,description text,lobby_image text,lobby_mobile_image text,equipment_image text,accent text,acquisition_type text,coin_price bigint,source_label text,source_detail text,effect_type text,effect_value numeric,is_active int,is_public int,sale_enabled int,sort_order int,version int DEFAULT 1);
 CREATE TABLE avatar_effect_options_v1(avatar_code text,option_order int,effect_type text,effect_value numeric,PRIMARY KEY(avatar_code,option_order));
 CREATE TABLE avatar_user_ownership_v1(user_id bigint,avatar_code text,source_type text,source_ref text,acquired_at text,expires_at text,PRIMARY KEY(user_id,avatar_code));
 CREATE TABLE avatar_user_loadout_v1(user_id bigint,avatar_code text);
 `);
 const expectedRecipients={};
 for(const t of TARGETS){
  const ids=[t.userId,...Array.from({length:17},(_,i)=>t.clanId*100+i)].sort((a,b)=>a-b);expectedRecipients[t.clanId]=ids;
  for(const id of ids){
   await pg.query("INSERT INTO users(id,nickname,status,role) VALUES($1,$2,'ACTIVE','USER')",[id,id===t.userId?t.nickname:'Member '+id]);
   await pg.query('INSERT INTO clan_members VALUES(6,$1,$2)',[t.clanId,id]);
   await pg.query("INSERT INTO avatar_user_loadout_v1 VALUES($1,'OLD_AVATAR')",[id]);
  }
 }
 const src={...CATALOGS[0],code:'T1_ORIKKUNG_CHAINGUN',serial:'A-30'};
 await pg.query('INSERT INTO avatar_catalog_v1('+Object.keys(src).join(',')+') VALUES('+Object.keys(src).map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(src));
 for(const e of EFFECTS)await pg.query("INSERT INTO avatar_effect_options_v1 VALUES('T1_ORIKKUNG_CHAINGUN',$1,$2,$3)",[e.option_order,e.effect_type,e.effect_value]);
 let failure=null;
 const db={dialect:'postgres',enqueue:fn=>fn(),client:{async query({text,values=[]}){
  if(failure==='audit'&&text.includes("'OPS_HANWHA_SAMSUNG_AVATAR_RELEASE'"))throw Error('Injected audit failure');
  const result=await pg.query(text,values);
  if(failure==='second-grant'&&text.startsWith('INSERT INTO avatar_user_ownership_v1')&&values[2]==='SAMSUNG_JUSEONG')return {rows:[]};
  return result;
 }}};
 const snapshot=async()=>{const out={};for(const [t,o] of [['app_meta','key'],['admin_logs','id'],['users','id'],['clan_members','user_id'],['avatar_catalog_v1','code'],['avatar_effect_options_v1','avatar_code,option_order'],['avatar_user_ownership_v1','avatar_code,user_id'],['avatar_user_loadout_v1','user_id']])out[t]=(await pg.query('SELECT * FROM '+t+' ORDER BY '+o)).rows;return out};
 return {pg,db,snapshot,options:{expectedSeasonEndsAt:ENDS,expectedRecipients,expectedSourceVersion:1},fail:k=>failure=k};
}
test('both clans receive exact copied options and seasonal expiry; dry-run/replay preserve accounts',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot(),dry=await releaseClanAvatars(f.db,{...f.options,dryRun:true});
  assert.equal(dry.granted,36);assert.equal(dry.rolledBack,true);assert.deepEqual(await f.snapshot(),before);
  const live=await releaseClanAvatars(f.db,f.options),after=await f.snapshot();
  assert.equal(live.granted,36);assert.equal(live.expiresAt,'2099-10-11 13:00:00');assert.deepEqual(live.effects,EFFECTS);
  for(const t of TARGETS){
   const rows=after.avatar_user_ownership_v1.filter(o=>o.avatar_code===t.catalog.code);
   assert.deepEqual(rows.map(r=>Number(r.user_id)).sort((a,b)=>a-b),f.options.expectedRecipients[t.clanId]);
   assert.ok(rows.every(r=>r.expires_at===live.expiresAt&&r.source_ref===OPERATION_KEY));
   const c=after.avatar_catalog_v1.find(r=>r.code===t.catalog.code);assert.equal(c.sale_enabled,0);assert.equal(c.coin_price,null);assert.equal(c.is_active,1);
  }
  for(const t of ['users','clan_members','avatar_user_loadout_v1'])assert.deepEqual(after[t],before[t]);
  assert.equal((await releaseClanAvatars(f.db,f.options)).replayed,true);assert.deepEqual(await f.snapshot(),after);
 }finally{await f.pg.close()}
});
test('second clan grant or final audit failure rolls both registrations and all grants back',async()=>{
 for(const failure of ['second-grant','audit']){
  const f=await fixture();try{const before=await f.snapshot();f.fail(failure);await assert.rejects(()=>releaseClanAvatars(f.db,f.options),/Grant row count|audit failure/);assert.deepEqual(await f.snapshot(),before)}finally{await f.pg.close()}
 }
});
test('changed season, roster, reference options or duplicate serial fail without partial grants',async()=>{
 for(const sql of ["UPDATE clan_seasons SET ends_at='2099-10-12T13:00:00Z'","UPDATE clan_seasons SET ends_at='2020-01-01T00:00:00Z'","DELETE FROM clan_members WHERE user_id=4718","UPDATE avatar_effect_options_v1 SET effect_value=31 WHERE option_order=0","UPDATE avatar_catalog_v1 SET serial='A-32'"]){
  const f=await fixture();try{await f.pg.exec(sql);const before=await f.snapshot();await assert.rejects(()=>releaseClanAvatars(f.db,f.options),/Season|roster|effects|serial/);assert.deepEqual(await f.snapshot(),before)}finally{await f.pg.close()}
 }
});
test('catalog runtime images preserve generated alpha and checked source hashes',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../preview/avatar-hanwha-samsung-v1/manifest.json',import.meta.url)));
 for(const [key,a] of Object.entries(manifest.avatars)){
  assert.equal(a.alpha.borderNontransparentPixels,0);assert.ok(a.alpha.clearPixels>1024*1536*.5);
  for(const [name,v] of Object.entries(a.files)){
   const bytes=await readFile(new URL('../preview/avatar-hanwha-samsung-v1/assets/'+name,import.meta.url));
   assert.equal(createHash('sha256').update(bytes).digest('hex'),v.sha256);
  }
  const m=await sharp(await readFile(new URL('../preview/avatar-hanwha-samsung-v1/assets/'+key+'-equipment-v1-640.webp',import.meta.url))).metadata();
  assert.equal(m.width,640);assert.equal(m.height,1088);assert.equal(m.hasAlpha,true);
 }
 for(const c of CATALOGS)for(const field of ['lobby_image','lobby_mobile_image','equipment_image'])assert.ok((await readFile(new URL('../'+c[field],import.meta.url))).length>0);
});
test('live equipment loader includes the new avatar layout and refreshed stylesheet cache',async()=>{
 const [css,app,index]=await Promise.all(['css/character-loadout-v2.css','js/app.js','index.html'].map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
 assert.match(css,/data-avatar-code='HANWHA_KANGGUYEOL'.*data-avatar-code='SAMSUNG_JUSEONG'.*bottom: 15%/);
 assert.match(app,/character-loadout-v2\.css[^']*clanAvatars=20261001/);
 assert.match(index,/js\/app\.js[^"]*clanAvatars=20261001/);
});

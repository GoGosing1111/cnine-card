import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import * as api from '../functions/_avatar.js';

test('DK event avatar supports an 11-day cosmetic ownership through the live catalog and equip API',async()=>{
 const item=JSON.parse(await readFile(new URL('../preview/avatar-kangguyeol-dk-v1/catalog.json',import.meta.url),'utf8'));
 const pg=new PGlite();
 try{
  await pg.exec(`CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
   CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
   CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,coin BIGINT);
   INSERT INTO users VALUES(1,'DK recipient','USER',777),(2,'Nonrecipient','USER',888);
   INSERT INTO app_meta VALUES('avatar_settings_v1','{"mode":"ON","shopEnabled":true,"version":3}',NULL);`);
  const client={async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length}}};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  await api.ensureAvatarFoundation(env);
  const before=(await pg.query('SELECT * FROM avatar_catalog_v1 ORDER BY code')).rows;
  const fields=Object.keys(item);
  await pg.query(`INSERT INTO avatar_catalog_v1(${fields.join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(item));
  const call=(id,path,body)=>api.handleAvatar({env,path,
   deps:{authenticate:async()=>({id,role:'USER'}),readBody:r=>r.json(),json:(body,status=200)=>({body,status})},
   request:new Request('https://qa.test/api/'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
  const expiry=new Date(Date.now()+11*24*60*60*1000).toISOString().replace('T',' ').slice(0,19);
  await api.grantAvatarOwnership(env,{userId:1,avatarCode:item.code,sourceType:'EVENT',sourceRef:'qa-dk-eleven-days',expiresAt:expiry.replace(' ','T')+'Z'});
  const row=(await pg.query('SELECT * FROM avatar_user_ownership_v1 WHERE user_id=1')).rows[0];
  assert.equal(row.expires_at,expiry);
  assert.ok(Math.abs((Date.parse(row.expires_at.replace(' ','T')+'Z')-Date.parse(row.acquired_at.replace(' ','T')+'Z'))/1000-950400)<=1);
  assert.equal((await pg.query('SELECT * FROM avatar_user_loadout_v1')).rows.length,0,'grant does not auto-equip');
  const owned=(await call(1,'avatar/catalog')).body.avatars.find(a=>a.code===item.code);
  assert.equal(owned.owned,true);assert.equal(owned.expiresAt,expiry);assert.deepEqual(owned.effects,[]);
  const nonowned=(await call(2,'avatar/catalog')).body.avatars.find(a=>a.code===item.code);
  assert.equal(nonowned.owned,false);
  assert.equal((await call(2,'avatar/equip',{avatarCode:item.code})).status,404);
  assert.equal((await call(1,'avatar/purchase',{avatarCode:item.code,requestId:'dk-avatar-not-for-sale'})).status,404);
  assert.equal((await call(1,'avatar/equip',{avatarCode:item.code})).status,200);
  const equipped=await api.equippedAvatarEffect(env,1);
  assert.equal(equipped.code,item.code);assert.deepEqual(equipped.effects,[]);
  assert.equal(equipped.lobbyImage,item.lobby_image);assert.equal(equipped.lobbyMobileImage,item.lobby_mobile_image);assert.equal(equipped.equipmentImage,item.equipment_image);
  assert.equal(api.applyAvatarCoinGain(100,equipped).total,100);
  for(const path of [equipped.lobbyImage,equipped.lobbyMobileImage,equipped.equipmentImage])assert.ok((await readFile(new URL('../'+path,import.meta.url))).length>0);
  await pg.query("UPDATE avatar_user_ownership_v1 SET expires_at='2000-01-01 00:00:00' WHERE user_id=1");
  const expired=(await call(1,'avatar/catalog')).body.avatars.find(a=>a.code===item.code);
  assert.equal(expired.owned,false);assert.equal(expired.equipped,false);
  assert.equal(await api.equippedAvatarEffect(env,1),null);
  assert.equal((await call(1,'avatar/equip',{avatarCode:item.code})).status,404);
  assert.deepEqual((await pg.query('SELECT id,coin FROM users ORDER BY id')).rows,[{id:1,coin:777},{id:2,coin:888}]);
  const cold=await import('../functions/_avatar.js?dk-cold-start');await cold.ensureAvatarFoundation(env);
  assert.equal((await pg.query('SELECT code FROM avatar_catalog_v1 WHERE code=$1',[item.code])).rows.length,1);
  assert.deepEqual((await pg.query('SELECT * FROM avatar_catalog_v1 WHERE code<>$1 ORDER BY code',[item.code])).rows,before);
 }finally{await pg.close()}
});

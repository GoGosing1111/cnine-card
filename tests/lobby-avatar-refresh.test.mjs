import test from 'node:test';
import assert from 'node:assert/strict';
import {SeasonSQLiteDB} from './helpers/season-s1-db.mjs';
import {handleChief} from '../functions/_chief.js';
import {ensureAvatarFoundation} from '../functions/_avatar.js';

test('chief status returns the viewer loadout during a vacancy and clears expired ownership',async t=>{
 const DB=new SeasonSQLiteDB(),env={DB};
 t.after(()=>DB.sql.close());
 DB.sql.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin INTEGER);
 INSERT INTO users VALUES(1,'viewer','USER','ACTIVE',0),(2,'other','USER','ACTIVE',0);`);
 await ensureAvatarFoundation(env);
 const {code}=DB.sql.prepare('SELECT code FROM avatar_catalog_v1 WHERE is_active=1 AND is_public=1 LIMIT 1').get();
 DB.sql.prepare("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type) VALUES(1,?,'DROP')").run(code);
 DB.sql.prepare('INSERT INTO avatar_user_loadout_v1(user_id,avatar_code) VALUES(1,?)').run(code);
 const status=async id=>(await handleChief({env,path:'chief/status',request:new Request('https://game.test/api/chief/status'),deps:{authenticate:async()=>({id}),json:body=>body}})).chief;
 const mine=await status(1);assert.equal(mine.active,false);assert.equal(mine.viewerAvatar.code,code);assert.ok(mine.viewerAvatar.lobbyImage);
 assert.equal((await status(2)).viewerAvatar,null);
 DB.sql.prepare('UPDATE avatar_user_ownership_v1 SET expires_at=? WHERE user_id=1').run('2000-01-01 00:00:00');
 assert.equal((await status(1)).viewerAvatar,null);
});

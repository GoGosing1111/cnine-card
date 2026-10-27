import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import nodePg from 'pg';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {classicFixture} from './helpers/classic-colosseum-db.mjs';
import {CLASSIC_KEYS,classicRoomKey,classicUserKey} from '../shared/classic-colosseum-v1.mjs';

for(const pipeline of [false,true])test(`classic match uses PostgreSQL ${pipeline?'pipeline':'sequential'} atomic guards and immutable settlement`,async t=>{
 const f=classicFixture(),pg=new PGlite();t.after(async()=>{f.close();await pg.close();});
 await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
 for(const table of f.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table'").all()){
  await pg.exec(table.sql);
  for(const row of f.db.prepare('SELECT * FROM '+table.name).all())await pg.query(`INSERT INTO ${table.name}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));
 }
 let failCommit=false;
 const DB=new __postgresCompatTest.PostgresD1Database({async query(input){
  let sql=typeof input==='string'?input:input.text;
  if(failCommit&&pipeline&&sql.includes(CLASSIC_KEYS.news)&&sql.includes('COMMIT')){failCommit=false;sql=sql.replace(/COMMIT;?\s*$/,'SELECT classic_injected_missing_function(); COMMIT;');}
  if(pipeline&&typeof input==='string'){const r=(await pg.exec(sql)).map(r=>({...r,rowCount:r.affectedRows??r.rows.length}));return r.length===1?r[0]:r;}
  const r=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};
 },...(pipeline?{escapeLiteral:v=>nodePg.Client.prototype.escapeLiteral.call(null,v)}:{})});
 f.env.DB=DB;f.deps.authenticate=req=>DB.prepare('SELECT * FROM users WHERE id=?').bind(Number(req.headers.get('x-classic-user'))).first();
 const read=async key=>JSON.parse((await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first())?.value||'null');
 const on=await f.call('admin/classic-colosseum/settings',{method:'POST',body:{enabled:true,revision:0}});assert.equal(on.status,200);
 const id=crypto.randomUUID(),invite=await f.call('admin/classic-colosseum/invite',{method:'POST',body:{requestId:id,userA:2,userB:3}});assert.equal(invite.status,200);
 const act=async(user,action,extra={})=>f.call('classic-colosseum/'+action,{user,method:'POST',body:{matchId:id,revision:(await read(classicRoomKey(id))).revision,...extra}});
 for(const user of [2,3])assert.equal((await act(user,'accept')).status,200);
 for(const user of [2,3])assert.equal((await act(user,'loadout',{loadout:f.loadout})).status,200);
 assert.equal((await act(2,'ready')).status,200);
 if(pipeline)failCommit=true;
 const result=await act(3,'ready');
 if(pipeline){assert.equal(result.status,500);assert.equal(await read(CLASSIC_KEYS.news),null);assert.equal((await read(classicUserKey(2))).results.length,0);f.advance(31000);assert.equal((await act(2,'recover')).status,200);}
 else assert.equal(result.status,200);
 const replay=await f.call('classic-colosseum/replay?id='+id,{user:2});assert.equal(replay.status,200);assert.equal(replay.sceneAssetKey,'CLASSIC_COLOSSEUM');
 assert.equal((await read(CLASSIC_KEYS.news)).length,1);assert.equal((await act(2,'recover')).room.status,'COMPLETED');assert.equal((await read(CLASSIC_KEYS.news)).length,1);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM joint_atomic_guards_v1').first()).count,0);
 assert.equal((await f.call('admin/classic-colosseum/users?q=%25')).users.length,0);
 assert.equal((await f.call('admin/classic-colosseum/settings',{method:'POST',body:{enabled:false,revision:0}})).code,'CLASSIC_CONFLICT');
 assert((await DB.prepare('SELECT coin FROM users').all()).results.every(r=>Number(r.coin)===987654));
});

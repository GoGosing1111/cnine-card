import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {accountRankAward} from '../../functions/_account_rank.js';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
const source=fs.readFileSync(new URL('../../functions/_seal_battle.js',import.meta.url),'utf8');
export const sealModule=()=>Function('accountRankAward',source.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')+';return {ensureFoundation,ensureMasterStarSchema,cleanSettings,normalizeEvent,saveSettings,loadSettings,adminStart,handleSealBattle,statusPayload,claimClearReward};')(accountRankAward);
export async function sealStarFixture(dialect='sqlite'){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,coin INTEGER DEFAULT 1000,card_shards INTEGER DEFAULT 7);
 CREATE TABLE coin_logs(id INTEGER PRIMARY KEY,user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
 CREATE TABLE shard_logs(id INTEGER PRIMARY KEY,user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
 CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
 CREATE TABLE inventory_logs(id INTEGER PRIMARY KEY,user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT);
 CREATE TABLE admin_logs(id INTEGER PRIMARY KEY,admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 INSERT INTO app_meta(key,value) VALUES('safe_runtime_upgrade_v1287_seal_attempt_recharge','1'),('safe_runtime_upgrade_v1288_seal_rank_rewards','1');`);
 const sqliteDB={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async run(){const r=sqlite.prepare(sql).run(...this.args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}};},async batch(stmts){sqlite.exec('BEGIN');try{const rows=[];for(const s of stmts)rows.push(await s.run());sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 let api=sealModule(),DB=sqliteDB,pg,client;
 const owner={id:1,role:'OWNER'},user={id:2,role:'USER'};
 const deps={json:(body,status=200)=>({body,status}),readBody:r=>r.json(),authenticate:async()=>owner,requirePermission:async()=>owner,columnExists:async(_env,t,c)=>sqlite.prepare(`PRAGMA table_info(${t})`).all().some(row=>row.name===c),raidDeckPower:async()=>({power:20000,basePower:20000,cards:[],ids:[1,2,3,4,5]})};
 await api.ensureFoundation({DB},deps);
 if(dialect==='postgres'){
   pg=new PGlite();await pg.exec(fs.readFileSync(new URL('../../scripts/postgres-runtime-compat.sql',import.meta.url),'utf8'));
   await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");
   for(const {sql} of sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name<>'sqlite_sequence'").all())await pg.exec(sql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g,'BIGSERIAL PRIMARY KEY').replace(/id INTEGER PRIMARY KEY,/g,'id BIGSERIAL PRIMARY KEY,').replace(/\bINTEGER\b/g,'BIGINT').replace(/CURRENT_TIMESTAMP/g,'sqlite_now()'));
   await pg.exec('DROP TABLE seal_battle_clear_rewards_v20260925;');
   client={async query(input,args=[]){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?args:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}};
   DB=new __postgresCompatTest.PostgresD1Database(client);api=sealModule();
   deps.columnExists=async(_env,t,c)=>(await client.query('SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2',[t,c])).rows.length>0;
 }
 const env={DB},run=(sql,...args)=>DB.prepare(sql).bind(...args).run(),row=(sql,...args)=>DB.prepare(sql).bind(...args).first();
 await run("INSERT OR IGNORE INTO app_meta(key,value) VALUES('safe_runtime_upgrade_v1287_seal_attempt_recharge','1'),('safe_runtime_upgrade_v1288_seal_rank_rewards','1')");
 await api.ensureFoundation(env,deps);
 await run("INSERT INTO users(id,nickname,role) VALUES(1,'QA OWNER','OWNER'),(2,'QA USER','USER')");
 await run("INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1)");
 const settings=api.cleanSettings({mode:'ON',minRewardAttempts:20,clearReward:{coin:5000000000,shards:3,masterStar:200000},rankRewards:{enabled:false}});
 await api.saveSettings(env,settings);const event=await api.adminStart(env,settings,owner);
 await run("INSERT INTO seal_battle_user_progress(event_id,user_id,day_key,total_attempts) VALUES(?,2,'2026-09-25',20)",event.id);
 let failure='',lost=false;const batch=DB.batch.bind(DB);
 DB.batch=async stmts=>{const items=stmts.map(s=>failure&&(s.sql||s.source||'').includes(failure)?DB.prepare('INSERT INTO inventory_logs(injected_missing_column) VALUES(1)'):s);const result=await batch(items);if(lost){lost=false;throw Error('LOST_COMMIT_REPLY');}return result;};
 const request=(path,body,role='OWNER')=>api.handleSealBattle({path,env,deps:{...deps,authenticate:async()=>({id:role==='OWNER'?1:2,role}),requirePermission:async()=>({id:1,role})},request:new Request('https://qa.invalid/api/'+path,{method:body?(path.endsWith('settings')?'PATCH':'POST'):'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})});
 return {api,env,DB,deps,user,owner,settings,event,pg,client,run,row,request,fail:value=>failure=value,loseReply:()=>lost=true,close:async()=>{sqlite.close();if(pg)await pg.close();}};
}

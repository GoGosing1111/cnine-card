import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {DEFENSE_KEY,defaultDefenseSettings} from '../../shared/monster-defense-v1.mjs';
export async function defenseRewardFixture(postgres=false){
 let pg,sqlite,DB;
 if(postgres){
  pg=new PGlite();await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");
  DB=new __postgresCompatTest.PostgresD1Database({async query(q){const r=await pg.query(q.text||q,q.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});
 }else{
  sqlite=new DatabaseSync(':memory:');
  DB={prepare(sql){return {sql,args:[],bind(...args){return {...this,args};},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...this.args).changes)}};}};},async batch(rows){sqlite.exec('BEGIN');try{const result=rows.map(row=>({meta:{changes:Number(sqlite.prepare(row.sql).run(...row.args).changes)}}));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 }
 const schema=`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE users(id INTEGER PRIMARY KEY,coin BIGINT);INSERT INTO users VALUES(1,1000),(2,1000),(3,1000);CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,image_url TEXT,is_active INTEGER);INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별','',1),('EMPEROR_ENERGY','엠퍼러 에너지','assets/items/emperor-energy-v1.webp',1),('PET_ESSENCE','펫 정수','',1);CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,updated_at TEXT,PRIMARY KEY(user_id,item_code));CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);CREATE TABLE coin_logs(user_id INTEGER,change_amount BIGINT,balance_after BIGINT,reason TEXT);`;
 if(pg)await pg.exec(schema);else sqlite.exec(schema);
 const env={DB},writeSettings=cfg=>DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(DEFENSE_KEY,JSON.stringify(cfg)).run();
 await writeSettings(defaultDefenseSettings());
 return {env,writeSettings,first:sql=>DB.prepare(sql).first(),run:sql=>DB.prepare(sql).run(),close:()=>pg?pg.close():sqlite.close()};
}
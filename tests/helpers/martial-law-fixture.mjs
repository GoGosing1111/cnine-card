import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import nodePg from 'pg';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {handleMartialLawAdmin} from '../../functions/_martial_law.js';
import {RANKED_REFORM_SCHEMA} from '../../functions/_ranked_reform.js';
export const martialOwner={id:1,role:'OWNER',nickname:'핑크빛유두'};
export async function martialFixture({postgres=false}={}){
 let now=Math.floor(Date.now()/1000)*1000,fail='',lose=false,native,pg,DB;
 const schema=[
  'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT)',
  'CREATE TABLE admin_logs(admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)',
  'CREATE TABLE user_battle_energy(user_id INTEGER PRIMARY KEY,energy INTEGER,last_recharged_at TEXT,last_daily_reset_date TEXT,updated_at TEXT)',
  'CREATE TABLE user_apocalypse_energy(user_id INTEGER PRIMARY KEY,energy INTEGER,last_recharged_at TEXT,updated_at TEXT)',
  'CREATE TABLE user_pvp_energy(user_id INTEGER PRIMARY KEY,energy INTEGER,last_recharged_at TEXT,updated_at TEXT)',
  'CREATE TABLE users(id INTEGER PRIMARY KEY,coin BIGINT,magic_crystals INTEGER)',
  'CREATE TABLE pvp_profiles(user_id INTEGER PRIMARY KEY,season_score INTEGER)',
  'CREATE TABLE pvp_ranked_match_tickets_v1671(token TEXT PRIMARY KEY,attacker_id INTEGER,used_at TEXT,expires_at TEXT)',
  ...RANKED_REFORM_SCHEMA
 ];
 if(postgres){
  pg=new PGlite();await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;"+schema.join(';'));
  DB=new __postgresCompatTest.PostgresD1Database({escapeLiteral:nodePg.Client.prototype.escapeLiteral,async query(input){
   let sql=typeof input==='string'?input:input.text;const lost=lose&&sql.includes('INSERT INTO admin_logs');if(lost)lose=false;
   if(fail&&sql.includes(fail)){sql=sql.replace(fail,'INSERT INTO missing_audit_table');fail=''}
   if(typeof input==='string'){const results=(await pg.exec(sql)).map(row=>({...row,rowCount:row.affectedRows??row.rows.length}));if(lost)throw Error('LOST_RESPONSE');return results.length===1?results[0]:results;}
   const row=await pg.query(sql,input.values||[]);return {...row,rowCount:row.affectedRows??row.rows.length};
  }});
 }else{
  native=new DatabaseSync(':memory:');native.exec(schema.join(';'));
  const execute=s=>{if(fail&&s.sql.includes(fail)){fail='';throw Error('INJECTED_AUDIT_FAILURE')}const stmt=native.prepare(s.sql);return stmt.columns().length?{results:stmt.all(...s.values),meta:{changes:0}}:{results:[],meta:{changes:Number(stmt.run(...s.values).changes)}};};
  DB={prepare(sql){return {sql,values:[],bind(...values){return {...this,values}},async first(){return execute(this).results[0]||null},async all(){return execute(this)},async run(){return execute(this)}}},async batch(list){native.exec('BEGIN');let result;try{result=list.map(execute);native.exec('COMMIT')}catch(error){native.exec('ROLLBACK');throw error}if(lose&&list.some(s=>s.sql.includes('INSERT INTO admin_logs'))){lose=false;throw Error('LOST_RESPONSE')}return result}};
 }
 const env={DB},p=(sql,...args)=>DB.prepare(sql).bind(...args);
 const deps={authenticate:async request=>request.identity,json:(body,status=200)=>({body,status}),readBody:request=>request.json(),now:()=>now};
 const request=(identity=martialOwner,method='GET',body)=>handleMartialLawAdmin({env,deps,request:{identity,method,json:async()=>body}});
 return {env,p,DB,request,get now(){return now},set now(value){now=value},failAudit(){fail='INSERT INTO admin_logs'},loseResponse(){lose=true},async close(){if(pg)await pg.close();else native.close()}};
}


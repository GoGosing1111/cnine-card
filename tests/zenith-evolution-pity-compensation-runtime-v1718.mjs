import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleEvolution} from '../functions/_evolution.js';

class Statement{
  constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args}
  bind(...args){return new Statement(this.db,this.sql,args)}
  first(){return this.db.prepare(this.sql).get(...this.args)||null}
  all(){return {results:this.db.prepare(this.sql).all(...this.args)}}
  run(){const result=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(result.changes||0)}}}
}
class D1{
  constructor(db){this.db=db}
  prepare(sql){return new Statement(this.db,sql)}
  batch(statements){this.db.exec('BEGIN IMMEDIATE');try{const results=statements.map(statement=>statement.run());this.db.exec('COMMIT');return results}catch(error){this.db.exec('ROLLBACK');throw error}}
}

const db=new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
  CREATE TABLE members(id INTEGER PRIMARY KEY,is_active INTEGER);
  CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,member_id INTEGER,title TEXT,rarity TEXT,is_active INTEGER,card_status TEXT);
  CREATE TABLE users(id INTEGER PRIMARY KEY,coin INTEGER,card_shards INTEGER DEFAULT 0);
  CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER DEFAULT 0,first_obtained_at TEXT,last_obtained_at TEXT,PRIMARY KEY(user_id,card_id));
  CREATE TABLE card_evolution_progress(user_id INTEGER,source_card_id TEXT,failed_attempts INTEGER,total_attempts INTEGER,is_success INTEGER,reward_card_id TEXT,completed_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,source_card_id));
  CREATE TABLE card_evolution_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,source_card_id TEXT,attempt_no INTEGER,coin_cost INTEGER,shard_cost INTEGER,success_rate REAL,is_pity INTEGER,is_success INTEGER,reward_card_id TEXT,reward_duplicate INTEGER,reward_shards INTEGER,evolution_type TEXT,master_star_cost INTEGER,request_id TEXT UNIQUE,source_consumed INTEGER,source_quantity_before INTEGER,source_quantity_after INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE pve_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT,updated_at TEXT);
  CREATE TABLE pvp_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT,updated_at TEXT);
  CREATE TABLE pvp_deck_presets(user_id INTEGER,preset_no INTEGER,card_ids TEXT,updated_at TEXT,PRIMARY KEY(user_id,preset_no));
  INSERT INTO app_meta VALUES('safe_runtime_upgrade_v1703_evolution_source_consumption','1',CURRENT_TIMESTAMP);
  INSERT INTO members VALUES(1,1);
  INSERT INTO cards_effective_v1210 VALUES('limited-13',1,'리미티드 원본','LIMITED',1,'PUBLIC');
  INSERT INTO cards_effective_v1210 VALUES('zenith-a',1,'제니스 A','ZENITH',1,'PUBLIC');
  INSERT INTO cards_effective_v1210 VALUES('zenith-b',1,'제니스 B','ZENITH',1,'PUBLIC');
  INSERT INTO users VALUES(77,99999999,0);
  INSERT INTO user_cards VALUES(77,'limited-13',1,13,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  INSERT INTO card_evolution_progress VALUES(77,'limited-13',7,7,0,NULL,NULL,CURRENT_TIMESTAMP);
  INSERT INTO pve_decks VALUES(77,'["limited-13","safe"]',CURRENT_TIMESTAMP);
  INSERT INTO pvp_decks VALUES(77,'["limited-13","safe"]',CURRENT_TIMESTAMP);
  INSERT INTO pvp_deck_presets VALUES(77,1,'["limited-13","safe"]',CURRENT_TIMESTAMP);
`);
const env={DB:new D1(db)};
const deps={authenticate:async()=>null,json:(body,status=200)=>({body,status})};
const response=await handleEvolution({path:'evolution/overview',request:{},env,deps});
assert.equal(response.status,401);
assert.deepEqual({...db.prepare("SELECT quantity,breakthrough_level FROM user_cards WHERE user_id=77 AND card_id='limited-13'").get()},{quantity:0,breakthrough_level:0});
assert.equal(db.prepare("SELECT SUM(quantity) quantity FROM user_cards WHERE user_id=77 AND card_id LIKE 'zenith-%'").get().quantity,1);
assert.deepEqual({...db.prepare("SELECT failed_attempts,total_attempts,is_success FROM card_evolution_progress WHERE user_id=77 AND source_card_id='limited-13'").get()},{failed_attempts:0,total_attempts:7,is_success:1});
assert.deepEqual({...db.prepare('SELECT is_pity,is_success,coin_cost,master_star_cost,source_consumed,source_quantity_before,source_quantity_after FROM card_evolution_logs').get()},{is_pity:1,is_success:1,coin_cost:0,master_star_cost:0,source_consumed:1,source_quantity_before:1,source_quantity_after:0});
assert.equal(db.prepare('SELECT applied FROM zenith_evolution_pity_compensations_v1718').get().applied,1);
assert.equal(db.prepare('SELECT card_ids FROM pve_decks WHERE user_id=77').get().card_ids,'["safe"]');
assert.equal(db.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=77').get().card_ids,'["safe"]');
assert.equal(db.prepare('SELECT card_ids FROM pvp_deck_presets WHERE user_id=77').get().card_ids,'["safe"]');
assert.deepEqual(JSON.parse(db.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1718_zenith_evolution_pity'").get().value),{pityAttempts:7,compensated:1});

console.log('ZENITH evolution V1718 runtime compensation: atomic grant, source consumption, deck cleanup and audit verified');

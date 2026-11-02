import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const original=JSON.parse(await fs.readFile(new URL('./plan.json',import.meta.url),'utf8'));
const plan={...original,recipients:original.recipients.map(t=>({...t,identityHash:hash({provider:'PLAYDK',providerUserId:'fixture-5147'})})),logFloor:{inventory:'0',audit:'0'}};
const source=(await fs.readFile(new URL('./grant.mjs',import.meta.url),'utf8')).replace("import plan from './plan.json' with {type:'json'};",'const plan='+JSON.stringify(plan)+';').replace("HASH='b846d118833da5ded52d3a9f1919a3cac071e6f5d3b2518dbac63b2451c4c5c3'","HASH='"+hash(plan)+"'");
const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')),token='a'.repeat(64),opts=()=>({leaseToken:token,lockDeadline:Date.now()+120000});
async function fixture(){
 const db=new PGlite();await db.exec(`
 CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 CREATE TABLE user_second_verifications(user_id bigint PRIMARY KEY,provider text,provider_user_id text);
 CREATE TABLE inventory_items(code text PRIMARY KEY,name text,is_active bigint);
 CREATE TABLE account_sync_versions_v1(user_id bigint PRIMARY KEY,revision bigint,domains jsonb,updated_at timestamptz);
 CREATE TABLE user_mutation_locks_v1520(user_id bigint PRIMARY KEY,token text,action_path text,lease_until_ms bigint);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint,unseen_quantity bigint,created_at text,updated_at text,PRIMARY KEY(user_id,item_code));
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies integer);
 CREATE TABLE user_mercenary_levels_v1(user_id bigint,mercenary_code text,level integer);
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,experience bigint);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint PRIMARY KEY,mercenary_code text);
 CREATE TABLE pig_coin_wallets_v1(user_id bigint PRIMARY KEY,balance bigint);
 CREATE TABLE account_rank_progress_v1(user_id bigint PRIMARY KEY,total_ticks bigint,updated_at text);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE inventory_logs(id bigserial PRIMARY KEY,user_id bigint,item_code text,change_amount bigint,balance_after bigint,reason text,reference_type text,reference_id text,admin_id bigint,created_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text,created_at text);
 INSERT INTO users VALUES(1,'owner','OWNER','ACTIVE',0,0,0),(5147,'T-Money™','USER','ACTIVE',10000000000000001,239595322,97168),(42,'other','USER','ACTIVE',100,2,3);
 INSERT INTO user_second_verifications VALUES(5147,'PLAYDK','fixture-5147');
 INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1);
 INSERT INTO account_sync_versions_v1 VALUES(5147,77,'{"wallet":"75","inventory":"76","collection":"74"}',NULL);
 INSERT INTO cnine_user_inventory VALUES(5147,'MASTER_STAR',178897696,101713444,'original','old'),(5147,'MATERIAL',7,1,'original','old'),(42,'MASTER_STAR',13,0,'original','old');
 INSERT INTO user_mercenary_cards_v1 VALUES(5147,'V-979',1);
 INSERT INTO user_mercenary_levels_v1 VALUES(5147,'V-979',10);
 INSERT INTO user_mercenary_growth_v1 VALUES(5147,'V-979',200);
 INSERT INTO user_mercenary_loadout_v1 VALUES(5147,'V-979');
 INSERT INTO pig_coin_wallets_v1 VALUES(5147,2000);
 INSERT INTO account_rank_progress_v1 VALUES(5147,10000,'old');
 INSERT INTO app_meta VALUES('support_package_coin_v1:5147','{"restricted":1000,"cursor":0}','old');
 `);
 const pf=JSON.parse(await fs.readFile(new URL('./preflight.json',import.meta.url),'utf8'));const triggers=pf.triggers.filter(t=>t.relname==='cnine_user_inventory');await db.exec(triggers[0].function);for(const t of triggers)await db.exec(t.definition);
 await db.query('INSERT INTO user_mutation_locks_v1520 VALUES($1,$2,$3,$4)',['5147',token,api.OP,Date.now()+120000]);
 const client={query:(sql,args)=>sql.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):db.query(sql,args)};return {db,client};
}
test('adds exactly 10 billion Master Stars once and preserves other assets, rank and unrelated users',async()=>{
 const {db,client}=await fixture();try{const before=await api.state(client);await db.exec('BEGIN');const r=await api.grant(client,api.HASH,opts());await db.exec('COMMIT');assert.equal(r.receipt.grants[0].after,'10178897696');assert.deepEqual(api.protectedState(await api.state(client)),api.protectedState(before));
 const replay=await api.grant({query:(s,a)=>{assert.match(s,/^SELECT\b/);return client.query(s,a);}});assert(replay.replayed);assert.deepEqual(replay.receipt,r.receipt);assert.equal((await api.artifacts(client)).logs.length,1);assert.equal((await db.query("SELECT quantity::text FROM cnine_user_inventory WHERE user_id=42")).rows[0].quantity,'13');
 }finally{await db.close();}
});
test('missing Master Star row is created with the same exact amount and inventory sync',async()=>{
 const {db,client}=await fixture();try{await db.exec("DELETE FROM cnine_user_inventory WHERE user_id=5147 AND item_code='MASTER_STAR';BEGIN");const r=await api.grant(client,api.HASH,opts());assert.equal(r.receipt.grants[0].before,'0');assert.equal(r.receipt.grants[0].after,'10000000000');await db.exec('ROLLBACK');}finally{await db.close();}
});
test('SQL failure after balance, ledger and audit writes rolls everything back',async()=>{
 const {db,client}=await fixture();try{const before=await api.state(client);await db.exec('BEGIN');await assert.rejects(api.grant({query:(s,a)=>s.startsWith('INSERT INTO app_meta(')?client.query('SELECT 1/0'):client.query(s,a)},api.HASH,opts()),/division by zero/);await db.exec('ROLLBACK');assert.deepEqual(await api.state(client),before);assert.deepEqual(await api.artifacts(client),{receipt:null,logs:[],audits:[]});}finally{await db.close();}
});
test('changed identity and unsafe resulting amounts cannot pay',async()=>{
 const {db,client}=await fixture();try{await db.exec("UPDATE user_second_verifications SET provider_user_id='changed';BEGIN");await assert.rejects(api.grant(client,api.HASH,opts()),/identityHash changed/);await db.exec('ROLLBACK');await db.exec("UPDATE user_second_verifications SET provider_user_id='fixture-5147';UPDATE cnine_user_inventory SET quantity=9007199254740991 WHERE user_id=5147 AND item_code='MASTER_STAR';BEGIN");await assert.rejects(api.grant(client,api.HASH,opts()),/Unsupported resulting balance/);await db.exec('ROLLBACK');assert.equal(await api.receipt(client),null);}finally{await db.close();}
});
test('wrong plan or missing lock cannot pay, and post-grant spending is not reset by replay',async()=>{
 const {db,client}=await fixture();try{await assert.rejects(api.grant(client,'wrong',opts()));await db.exec('BEGIN;DELETE FROM user_mutation_locks_v1520');await assert.rejects(api.grant(client,api.HASH,opts()),/Missing account lease/);await db.exec('ROLLBACK;BEGIN');await api.grant(client,api.HASH,opts());await db.exec("COMMIT;UPDATE cnine_user_inventory SET quantity=quantity-15 WHERE user_id=5147 AND item_code='MASTER_STAR'");const before=await api.state(client);assert((await api.grant({query:(s,a)=>{assert.match(s,/^SELECT\b/);return client.query(s,a);}})).replayed);assert.deepEqual(await api.state(client),before);}finally{await db.close();}
});

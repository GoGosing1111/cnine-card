import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {applyReverseLandDailyPolicy,REGISTERED_IDS,OPERATION_KEY} from '../scripts/ops/reverse-land-daily-20261020.mjs';
import {runLandDailySchedule} from '../workers/clan-draft/src/land-daily.js';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';

async function fixture(t){
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec(`
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT DEFAULT 'ACTIVE',role TEXT DEFAULT 'USER',banned_until TEXT,coin BIGINT DEFAULT 100);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE soopketland_accounts(slot TEXT PRIMARY KEY,user_id BIGINT);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,description TEXT,is_active INTEGER);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
 CREATE TABLE soopketland_ticket_lots(id TEXT PRIMARY KEY,user_id BIGINT,issued_by BIGINT,quantity INTEGER,remaining INTEGER,coupon_uses INTEGER,plan_json TEXT,created_at TEXT);
 CREATE TABLE soopketland_actions(request_id TEXT PRIMARY KEY,user_id BIGINT,action TEXT,plan_json TEXT,response_json TEXT,created_at TEXT);
 CREATE TABLE soopketland_atomic_guard(id TEXT PRIMARY KEY,verified INTEGER CHECK(verified=1));
 CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT);
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 CREATE TABLE soopketland_coupons(code TEXT PRIMARY KEY,reward_json TEXT,max_uses INTEGER,used_count INTEGER);
 CREATE TABLE soopketland_rolls(request_id TEXT PRIMARY KEY,response_json TEXT);
 CREATE TABLE soopketland_redemptions(code TEXT,user_id BIGINT,response_json TEXT);
 INSERT INTO users(id,nickname,role) VALUES(1,'OWNER','OWNER'),(5399,'이전 스트리머','USER');
 INSERT INTO inventory_items VALUES('SOOPKETLAND_TICKET','old',1);
 INSERT INTO app_meta VALUES('soopketland_settings_v2039','{"weights":{"COIN":12600,"EMPEROR_ENERGY":1500,"MASTER_STAR":12600,"STARLIGHT_ARMOR_CORE":3000,"PINGDU_THANKS_GIFT_BOX":300}}','old');
 INSERT INTO soopketland_coupons VALUES('existing','{"key":"COIN","amount":100000000}',200,17);
 INSERT INTO soopketland_rolls VALUES('old-roll','{"ok":true}');
 INSERT INTO soopketland_redemptions VALUES('existing',1,'{"ok":true}');
 `);
 for(const id of REGISTERED_IDS){await pg.query('INSERT INTO users(id,nickname) VALUES($1,$2)',[id,'streamer'+id]);await pg.query('INSERT INTO soopketland_accounts VALUES($1,$2)',['streamer'+id,id]);}
 for(const id of [1,5399,...REGISTERED_IDS]){
  await pg.query("INSERT INTO cnine_user_inventory VALUES($1,'SOOPKETLAND_TICKET',20,20,'old','old'),($1,'OTHER_ITEM',7,7,'old','old')",[id]);
  await pg.query("INSERT INTO soopketland_ticket_lots VALUES($1,$2,1,20,20,100,'{}','old')",['old-'+id,id]);
 }
 const client={async query(input,args=[]){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?args:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length}}};
 const tables=['users','app_meta','soopketland_accounts','inventory_items','cnine_user_inventory','soopketland_ticket_lots','soopketland_actions','inventory_logs','admin_logs','soopketland_coupons','soopketland_rolls','soopketland_redemptions'];
 const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await client.query(`SELECT row_to_json(t) r FROM ${table} t ORDER BY row_to_json(t)::text`)).rows.map(r=>r.r)])));
 return {pg,client,snapshot};
}
test('PostgreSQL reset and today grants commit together, preserve prior coupons/other items and replay without resetting later balances',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 const dry=await applyReverseLandDailyPolicy(f.client);assert.equal(dry.receipt.resetTickets,220);assert.equal(dry.receipt.daily.issued,9);assert.deepEqual(await f.snapshot(),before);
 const applied=await applyReverseLandDailyPolicy(f.client,{commit:true});assert.equal(applied.receipt.daily.issued,9);
 const after=await f.snapshot();
 for(const table of ['users','soopketland_accounts','soopketland_coupons','soopketland_rolls','soopketland_redemptions'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.cnine_user_inventory.filter(r=>r.item_code==='OTHER_ITEM'),before.cnine_user_inventory.filter(r=>r.item_code==='OTHER_ITEM'));
 assert.deepEqual(after.app_meta.find(r=>r.key==='soopketland_settings_v2039'),before.app_meta[0]);
 for(const row of after.cnine_user_inventory.filter(r=>r.item_code==='SOOPKETLAND_TICKET'))assert.equal(Number(row.quantity),REGISTERED_IDS.includes(Number(row.user_id))?10:0);
 for(const lot of after.soopketland_ticket_lots)assert.equal(lot.remaining,lot.id.startsWith('old-')?0:10);
 await f.pg.query("UPDATE cnine_user_inventory SET quantity=8 WHERE user_id=4718 AND item_code='SOOPKETLAND_TICKET'");
 const consumed=await f.snapshot();assert.equal((await applyReverseLandDailyPolicy(f.client,{commit:true})).replayed,true);assert.deepEqual(await f.snapshot(),consumed);
 assert.ok(after.app_meta.some(r=>r.key===OPERATION_KEY+':before'));
});
test('audit failure rolls reset, catalog, policy, daily inventory and receipts back; changed roster fails closed',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 await f.pg.exec("ALTER TABLE admin_logs ADD CONSTRAINT fail_audit CHECK(action_type<>'OPS_REVERSE_LAND_DAILY')");
 await assert.rejects(()=>applyReverseLandDailyPolicy(f.client,{commit:true}),/fail_audit/);assert.deepEqual(await f.snapshot(),before);
 await f.pg.exec('ALTER TABLE admin_logs DROP CONSTRAINT fail_audit; DELETE FROM soopketland_accounts WHERE user_id=4718');
 const changed=await f.snapshot();await assert.rejects(()=>applyReverseLandDailyPolicy(f.client,{commit:true}),/registration changed/);assert.deepEqual(await f.snapshot(),changed);
});
test('scheduler uses shared daily receipt logic and closes its connection on success or error; server source does not consume Pages assets',async()=>{
 let closed=0;const db={};const openDatabase=async()=>({db,close:async()=>closed++});
 assert.deepEqual(await runLandDailySchedule({}, {openDatabase,timestamp:123,issue:async(d,options)=>{assert.equal(d,db);assert.equal(options.timestamp,123);return {issued:9}}}),{issued:9});
 await assert.rejects(()=>runLandDailySchedule({}, {openDatabase,issue:async()=>{throw Error('unavailable')}}),/unavailable/);assert.equal(closed,2);
 assert.equal(isProductionFile('workers/clan-draft/src/land-daily.js'),false);
});

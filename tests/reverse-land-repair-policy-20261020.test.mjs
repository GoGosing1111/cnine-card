import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {applyLandRepairPolicy,SETTINGS_KEY,OPERATION_KEY,TARGET_WEIGHTS} from '../scripts/ops/reverse-land-repair-20261020.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`
  CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at timestamptz);
  CREATE TABLE users(id bigint,role text,status text);
  INSERT INTO users VALUES(1,'OWNER','ACTIVE');
  CREATE TABLE inventory_items(code text,name text,is_active int,image_url text);
  INSERT INTO inventory_items VALUES('PINGDU_REPAIR_COUPON','핑두 리페어 쿠폰',1,'assets/items/pingdu-repair-coupon-v1.webp');
  CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
  CREATE TABLE soopketland_coupons(code text,reward_json text,max_uses int,used_count int);
  INSERT INTO soopketland_coupons VALUES('old-coin','{"key":"COIN","amount":100000000}',200,17),('old-stars','{"key":"MASTER_STAR","amount":5000000}',150,1);
  CREATE TABLE soopketland_ticket_lots(id text,remaining int,coupon_uses int);
  INSERT INTO soopketland_ticket_lots VALUES('old-lot',7,150);
  CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity int);
  INSERT INTO cnine_user_inventory VALUES(2,'SOOPKETLAND_TICKET',7),(20,'PINGDU_REPAIR_COUPON',3);
 `);
 const initial={weights:{COIN:12600,EMPEROR_ENERGY:1500,MASTER_STAR:12600,STARLIGHT_ARMOR_CORE:3000,PINGDU_THANKS_GIFT_BOX:300},custom:'preserve'};
 await db.query('INSERT INTO app_meta VALUES($1,$2,NOW())',[SETTINGS_KEY,JSON.stringify(initial)]);
 await db.query("INSERT INTO app_meta VALUES('soopketland_daily_policy_v1',$1,NOW())",[JSON.stringify({enabled:true,quantity:10,couponUses:150,startsOn:'2026-10-20'})]);
 const get=async()=>JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',[SETTINGS_KEY])).rows[0].value);
 const snapshot=async()=>({coupons:(await db.query('SELECT * FROM soopketland_coupons ORDER BY code')).rows,lots:(await db.query('SELECT * FROM soopketland_ticket_lots')).rows,inventory:(await db.query('SELECT * FROM cnine_user_inventory ORDER BY user_id')).rows,daily:(await db.query("SELECT value FROM app_meta WHERE key='soopketland_daily_policy_v1'")).rows});
 return {db,initial,get,snapshot};
}
test('repair policy is transactional, preserves issued prizes/tickets/daily policy, and replays without overwriting later OWNER edits',async t=>{
 const f=await fixture(t),protectedBefore=await f.snapshot();
 const dry=await applyLandRepairPolicy(f.db);assert.equal(dry.committed,false);assert.deepEqual(await f.get(),f.initial);
 assert.equal((await f.db.query('SELECT count(*) n FROM admin_logs')).rows[0].n,0);
 assert.equal((await f.db.query('SELECT count(*) n FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0].n,0);
 const applied=await applyLandRepairPolicy(f.db,{commit:true});
 assert.equal(applied.committed,true);assert.equal(applied.repairAmount,1);
 assert.deepEqual((await f.get()).weights,TARGET_WEIGHTS);assert.equal((await f.get()).custom,'preserve');
 assert.deepEqual(Object.values(TARGET_WEIGHTS).map(n=>n/300),[60,5,14,10,1,10]);
 assert.equal((await f.db.query('SELECT count(*) n FROM admin_logs')).rows[0].n,1);
 assert.deepEqual(await f.snapshot(),protectedBefore);
 const edited={...f.initial,weights:{...TARGET_WEIGHTS,COIN:17000,MASTER_STAR:5200}};
 await f.db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(edited),SETTINGS_KEY]);
 assert.equal((await applyLandRepairPolicy(f.db,{commit:true})).replayed,true);assert.deepEqual(await f.get(),edited);
 assert.equal((await f.db.query('SELECT count(*) n FROM admin_logs')).rows[0].n,1);
});
test('changed OWNER odds, disabled item and audit failure leave settings and receipts untouched',async t=>{
 for(const kind of ['odds','item','audit'])await t.test(kind,async t=>{
  const f=await fixture(t);
  if(kind==='odds')await f.db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify({...f.initial,weights:{...f.initial.weights,COIN:12900}}),SETTINGS_KEY]);
  if(kind==='item')await f.db.exec('UPDATE inventory_items SET is_active=0');
  if(kind==='audit')await f.db.exec("ALTER TABLE admin_logs ADD CONSTRAINT reject_audit CHECK(action_type<>'OPS_REVERSE_LAND_REPAIR')");
  const before=await f.get(),protectedBefore=await f.snapshot();
  await assert.rejects(()=>applyLandRepairPolicy(f.db,{commit:true}));
  assert.deepEqual(await f.get(),before);assert.deepEqual(await f.snapshot(),protectedBefore);
  assert.equal((await f.db.query('SELECT count(*) n FROM admin_logs')).rows[0].n,0);
  assert.equal((await f.db.query('SELECT count(*) n FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0].n,0);
 });
});

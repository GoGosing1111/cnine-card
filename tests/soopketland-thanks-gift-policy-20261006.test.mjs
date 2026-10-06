import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {applyLandGiftPolicy,SETTINGS_KEY,OPERATION_KEY,TARGET_WEIGHTS} from '../scripts/ops/soopketland-thanks-gift-20261006.mjs';
async function fixture(){
 const db=new PGlite();await db.exec("CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at timestamptz);CREATE TABLE users(id bigint,role text,status text);INSERT INTO users VALUES(1,'OWNER','ACTIVE');CREATE TABLE inventory_items(code text,name text,is_active int);INSERT INTO inventory_items VALUES('PINGDU_THANKS_GIFT_BOX','핑두의 감사 선물',1);CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);");
 const initial={weights:{COIN:9916,SUPERSTAR_GUARANTEED_PACK:1500,MASTER_STAR:9916,BLACK_MIRACLE_PACK:5668,STARLIGHT_ARMOR_CORE:3000},custom:'preserve'};
 await db.query('INSERT INTO app_meta VALUES($1,$2,NOW())',[SETTINGS_KEY,JSON.stringify(initial)]);
 return {db,initial,get:async()=>JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',[SETTINGS_KEY])).rows[0].value)};
}
test('land policy dry run rolls back settings, audit and receipt; apply is atomic and replay preserves later OWNER changes',async()=>{
 const f=await fixture();try{
  const dry=await applyLandGiftPolicy(f.db);assert.equal(dry.committed,false);assert.deepEqual(await f.get(),f.initial);
  assert.equal((await f.db.query('SELECT count(*) n FROM admin_logs')).rows[0].n,0);
  const applied=await applyLandGiftPolicy(f.db,{commit:true});assert.equal(applied.committed,true);assert.deepEqual((await f.get()).weights,TARGET_WEIGHTS);assert.equal((await f.get()).custom,'preserve');
  assert.equal((await f.db.query('SELECT count(*) n FROM admin_logs')).rows[0].n,1);
  const edited={...f.initial,weights:{...TARGET_WEIGHTS,COIN:12900,PINGDU_THANKS_GIFT_BOX:0}};
  await f.db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(edited),SETTINGS_KEY]);
  assert.equal((await applyLandGiftPolicy(f.db,{commit:true})).replayed,true);assert.deepEqual(await f.get(),edited);
 }finally{await f.db.close();}
});
test('changed OWNER odds cannot be overwritten by the one-time policy',async()=>{
 const f=await fixture();try{
  const changed={...f.initial,weights:{...f.initial.weights,COIN:10000}};await f.db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(changed),SETTINGS_KEY]);
  await assert.rejects(()=>applyLandGiftPolicy(f.db,{commit:true}),/Current live odds changed/);assert.deepEqual(await f.get(),changed);assert.equal((await f.db.query('SELECT count(*) n FROM admin_logs')).rows[0].n,0);
 }finally{await f.db.close();}
});
test('audit failure rolls back the land settings and prevents a completed receipt',async()=>{
 const f=await fixture();try{
  await f.db.exec("ALTER TABLE admin_logs ADD CONSTRAINT inject_failure CHECK(action_type<>'OPS_SOOPKETLAND_REWARDS')");
  await assert.rejects(()=>applyLandGiftPolicy(f.db,{commit:true}));assert.deepEqual(await f.get(),f.initial);assert.equal((await f.db.query('SELECT count(*) n FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0].n,0);
 }finally{await f.db.close();}
});

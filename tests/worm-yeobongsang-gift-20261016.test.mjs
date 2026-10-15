import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {grant,verify,TARGETS,PLAN_HASH,OPERATION_KEY,ITEM} from '../scripts/ops/worm-yeobongsang-gift-20261016.mjs';
import {TARGETS as PREVIOUS} from '../scripts/ops/worm-named-gifts-two-20261016.mjs';

test('user-confirmed 여봉상 receives two once; previous 21 accounts and failed transactions stay unchanged',async()=>{
 const db=new PGlite();try{
  assert.equal(TARGETS.length,1);assert.equal(TARGETS[0].userId,'5598');assert.equal(TARGETS[0].nickname,'여봉상');assert.equal(TARGETS[0].inputNickname,'안경!');
  await db.exec(`
   CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT DEFAULT 999,card_shards BIGINT DEFAULT 123,magic_crystals BIGINT DEFAULT 456);
   INSERT INTO users(id,nickname,status,role) VALUES(1,'owner','ACTIVE','OWNER');
   CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INT);
   CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
   CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT,created_at TEXT);
   CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);
   CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
  `);
  const all=[...PREVIOUS,...TARGETS];
  await db.query("INSERT INTO users(id,nickname,status,role) SELECT id,nickname,'ACTIVE','USER' FROM unnest($1::bigint[],$2::text[]) t(id,nickname)",[all.map(t=>t.userId),all.map(t=>t.nickname)]);
  await db.query('INSERT INTO inventory_items VALUES($1,$2,1)',[ITEM,'지렁이대회 사은품']);
  await db.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) SELECT id,$1,3,1 FROM users',[ITEM]);
  const snapshot=async()=>{const out={};for(const table of ['users','cnine_user_inventory','inventory_logs','admin_logs','app_meta'])out[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return out;};
  const options={expectedPlanHash:PLAN_HASH,lockDeadline:Date.now()+120000,commit:true};
  const before=await snapshot();assert.equal((await grant(db,{...options,commit:false})).committed,false);assert.deepEqual(await snapshot(),before);
  const broken={async query(sql,args){if(sql.startsWith('INSERT INTO admin_logs'))throw Error('Audit unavailable');return db.query(sql,args);}};
  await assert.rejects(grant(broken,options),/Audit unavailable/);assert.deepEqual(await snapshot(),before);
  const result=await grant(db,options);assert.equal(result.verification.recipients,1);assert.equal(result.verification.totalBoxes,2);
  const after=await snapshot();assert.deepEqual(after.users,before.users);
  assert.deepEqual(after.cnine_user_inventory.filter(r=>String(r.user_id)!=='5598'),before.cnine_user_inventory.filter(r=>String(r.user_id)!=='5598'));
  const stock=after.cnine_user_inventory.find(r=>String(r.user_id)==='5598');assert.equal(Number(stock.quantity),5);assert.equal(Number(stock.unseen_quantity),3);
  assert.equal(after.inventory_logs.length,1);assert.equal(after.app_meta[0].key,OPERATION_KEY);
  assert.equal((await grant(db,options)).replayed,true);assert.deepEqual(await snapshot(),after);assert.equal((await verify(db)).totalBoxes,2);
 }finally{await db.close();}
});

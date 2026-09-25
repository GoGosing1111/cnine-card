import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../functions/_mercenary_draw_accounting.js';
import {grantStoryWinners,verifyStoryWinners,OPERATION_KEY,TARGETS} from '../scripts/ops/chuseok-story-winners-20260925.mjs';

async function fixture({existing=false,failure=''}={}){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT,card_shards BIGINT,magic_crystals BIGINT);
 INSERT INTO users VALUES(1,'핑크빛유두','OWNER','ACTIVE',10,20,30),(295,'모래','USER','ACTIVE',11,21,31),(4391,'더듬이구','USER','ACTIVE',12,22,32),(4540,'지아영','USER','ACTIVE',13,23,33),(2,'다른유저','USER','ACTIVE',14,24,34);
 CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,revision INTEGER,payload_json TEXT);
 INSERT INTO mercenary_cms_documents_v1 VALUES('config',57,'{"mercenaries":[{"code":"V-021","name":"오메가-X","rank":"SSS"}]}');
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
 INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
 INSERT INTO cnine_user_inventory VALUES(295,'MASTER_STAR',100,1,'old','old'),(4391,'MASTER_STAR',200,2,'old','old'),(4540,'MASTER_STAR',300,3,'old','old'),(4540,'OTHER',400,4,'old','old'),(2,'MASTER_STAR',500,5,'old','old');
 CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT ${failure==='inventory'?"CHECK(item_code<>'MASTER_STAR')":''},change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT,created_at TEXT);
 CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT,revision INTEGER);
 INSERT INTO user_mercenary_loadout_v1 VALUES(295,'V-001',4),(4391,'V-004',8),(4540,'V-021',9);
 CREATE TABLE user_mercenary_growth_v1(user_id BIGINT,mercenary_code TEXT,level INTEGER,experience BIGINT,revision INTEGER,PRIMARY KEY(user_id,mercenary_code));
 INSERT INTO user_mercenary_growth_v1 VALUES(295,'V-001',6,200,4),(4391,'V-004',8,250,8),(4540,'V-021',10,350,9);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT ${failure==='receipt'?"CHECK(value NOT LIKE '%COMPLETED%')":''},updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT ${failure==='audit'?"CHECK(target_id<>'4540')":''},before_data TEXT,after_data TEXT,created_at TEXT);`);
 for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await db.exec(sql);
 await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(295,'V-001',2,1,'old','old'),(4391,'V-004',3,2,'old','old'),(4540,'V-021',1,0,'old','old'),(2,'V-021',1,0,'old','old')");
 if(existing)await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(295,'V-021',2,1,'old','old'),(4391,'V-021',4,3,'old','old')");
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)},q:async(sql,args=[])=>(await db.query(sql,args)).rows};
}
async function snapshot(q){const data={};for(const table of ['users','cnine_user_inventory','user_mercenary_cards_v1','mercenary_card_acquisitions_v1','mercenary_card_atomic_guard_v1','user_mercenary_loadout_v1','user_mercenary_growth_v1','inventory_logs','admin_logs','app_meta','mercenary_cms_documents_v1','inventory_items'])data[table]=await q(`SELECT * FROM ${table} ORDER BY 1,2`);return data;}

for(const existing of [false,true])test(`exact approved recipients and additive rewards, dry run and replay (existing=${existing})`,async()=>{
 const {db,client,q}=await fixture({existing});try{
  const before=await snapshot(q);
  assert.equal((await grantStoryWinners(client,{dryRun:true})).dryRun,true);assert.deepEqual(await snapshot(q),before);
  const result=await grantStoryWinners(client),after=await snapshot(q);
  assert.deepEqual(result.recipients.map(({userId,nickname,rewardType,code,quantity})=>({userId,nickname,rewardType,code,quantity})),TARGETS);
  assert.equal(result.recipients[0].afterCopies,existing?3:1);assert.equal(result.recipients[1].afterCopies,existing?5:1);
  const stars=after.cnine_user_inventory.find(row=>Number(row.user_id)===4540&&row.item_code==='MASTER_STAR');
  assert.equal(Number(stars.quantity),1000300);assert.equal(Number(stars.unseen_quantity),1000003);
  assert.equal(after.mercenary_card_acquisitions_v1.length,2);assert.equal(after.inventory_logs.length,1);assert.equal(after.admin_logs.length,3);assert.equal(after.app_meta.length,1);assert.equal(after.app_meta[0].key,OPERATION_KEY);
  for(const table of ['users','user_mercenary_loadout_v1','user_mercenary_growth_v1','mercenary_card_atomic_guard_v1','mercenary_cms_documents_v1','inventory_items'])assert.deepEqual(after[table],before[table]);
  const unrelated=row=>!([295,4391].includes(Number(row.user_id))&&row.mercenary_code==='V-021');
  assert.deepEqual(after.user_mercenary_cards_v1.filter(unrelated),before.user_mercenary_cards_v1.filter(unrelated));
  const otherItems=row=>Number(row.user_id)!==4540||row.item_code!=='MASTER_STAR';assert.deepEqual(after.cnine_user_inventory.filter(otherItems),before.cnine_user_inventory.filter(otherItems));
  assert.equal((await grantStoryWinners(client)).replayed,true);assert.deepEqual(await snapshot(q),after);
  assert.equal((await verifyStoryWinners(q)).status,'COMPLETED');
 }finally{await db.close()}
});

for(const failure of ['inventory','audit','receipt'])test(`${failure} failure rolls back all three prizes, ledgers and receipt`,async()=>{
 const {db,client,q}=await fixture({failure});try{const before=await snapshot(q);await assert.rejects(()=>grantStoryWinners(client),/check constraint/);assert.deepEqual(await snapshot(q),before)}finally{await db.close()}
});

test('changed nickname blocks the entire operation',async()=>{
 const {db,client,q}=await fixture();try{await db.exec("UPDATE users SET nickname='다른계정' WHERE id=4391");const before=await snapshot(q);await assert.rejects(()=>grantStoryWinners(client),/nickname changed/);assert.deepEqual(await snapshot(q),before)}finally{await db.close()}
});

test('lost COMMIT response and later spending do not cause duplicate rewards',async()=>{
 const {db,client,q}=await fixture();try{
  const uncertain={query:async(sql,args=[])=>{const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('Commit response lost');return result}};
  await assert.rejects(()=>grantStoryWinners(uncertain),/Commit response lost/);
  await db.exec("UPDATE cnine_user_inventory SET quantity=quantity-75 WHERE user_id=4540 AND item_code='MASTER_STAR'");
  const before=await snapshot(q);assert.equal((await grantStoryWinners(client)).replayed,true);assert.deepEqual(await snapshot(q),before);
 }finally{await db.close()}
});

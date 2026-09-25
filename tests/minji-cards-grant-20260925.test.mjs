import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import catalog from '../scripts/ops/minji-cards-grant-20260925.catalog.json' with {type:'json'};
import {grantMinjiCards,verifyMinjiCards,OPERATION_KEY,TARGET} from '../scripts/ops/minji-cards-grant-20260925.mjs';

async function fixture({failAudit=false,failReceipt=false}={}){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123,card_shards BIGINT DEFAULT 456,magic_crystals BIGINT DEFAULT 789);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'관리자','OWNER','ACTIVE'),(5589,'민지','USER','ACTIVE'),(5590,'다른유저','USER','ACTIVE');
 CREATE TABLE members(id BIGINT PRIMARY KEY,is_active INTEGER);INSERT INTO members VALUES(1,1),(2,0);
 CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,member_id BIGINT,is_active INTEGER DEFAULT 1,card_status TEXT DEFAULT 'PUBLIC');
 CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT NOT NULL DEFAULT 1,breakthrough_level BIGINT NOT NULL DEFAULT 0,breakthrough_fail_count BIGINT NOT NULL DEFAULT 0,first_obtained_at TEXT DEFAULT 'original',last_obtained_at TEXT DEFAULT 'original',unrelated_stat TEXT DEFAULT 'preserved',PRIMARY KEY(user_id,card_id));
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT ${failReceipt?"CHECK(value='REJECTED')":''},updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT ${failAudit?"CHECK(action_type='REJECTED')":''},target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const card of catalog)await db.query('INSERT INTO cards_effective_v1210(id,title,rarity,member_id) VALUES($1,$2,$3,1)',[card.id,card.title,card.grade]);
 await db.exec(`INSERT INTO cards_effective_v1210 VALUES('hidden','숨김','FUR',1,1,'HIDDEN'),('inactive','퇴사','SUPERSTAR',1,0,'RETIRED'),('member-off','비활성','ZENITH',2,1,'PUBLIC'),('other-grade','다른등급','MA',1,1,'PUBLIC');
 INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES(5589,'other-grade',9,8,3),(5590,'other-grade',99,1,0);`);
 for(const [card,quantity,level,fail] of [[catalog[0],7,3,5],[catalog[1],2,14,3],[catalog[2],3,13,4],[catalog[3],0,0,9]])
  await db.query('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES(5589,$1,$2,$3,$4)',[card.id,quantity,level,fail]);
 const client={async query(sql,args=[]){const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length}}};
 return {db,client};
}
async function snapshot(db){
 const data={};for(const table of ['users','user_cards','app_meta','admin_logs'])data[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows;
 return data;
}

test('exactly 50 eligible cards are added at +13, preserving duplicates, higher enhancement and unrelated data; retry grants nothing',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),receipt=await grantMinjiCards(client,{commit:true});
  assert.equal(receipt.totalGranted,50);assert.deepEqual(receipt.counts,{SUPERSTAR:7,FUR:14,ZENITH:29});
  assert.equal(receipt.cardChanges[0].quantityBefore,7);assert.equal(receipt.cardChanges[0].quantityAfter,8);assert.equal(receipt.cardChanges[0].levelAfter,13);
  assert.equal(receipt.cardChanges[1].levelAfter,14);assert.equal(receipt.cardChanges[3].quantityAfter,1);
  const after=await snapshot(db);
  assert.deepEqual(after.users,before.users);
  assert.deepEqual(after.user_cards.filter(r=>Number(r.user_id)!==TARGET.id||r.card_id==='other-grade'),before.user_cards.filter(r=>Number(r.user_id)!==TARGET.id||r.card_id==='other-grade'));
  assert.equal(after.user_cards.filter(r=>Number(r.user_id)===TARGET.id).length,51);
  const owned=new Map(after.user_cards.filter(r=>Number(r.user_id)===TARGET.id).map(r=>[r.card_id,r]));
  assert.equal(Number(owned.get(catalog[0].id).breakthrough_fail_count),0);assert.equal(Number(owned.get(catalog[1].id).breakthrough_fail_count),3);
  assert.equal(Number(owned.get(catalog[2].id).breakthrough_fail_count),4);assert.equal(Number(owned.get(catalog[3].id).breakthrough_fail_count),0);
  assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta[0].key,OPERATION_KEY);
  assert.equal((await verifyMinjiCards(client)).verifiedCards,50);
  assert.equal((await grantMinjiCards(client,{commit:true})).replayed,true);assert.deepEqual(await snapshot(db),after);
 }finally{await db.close()}
});

test('default preview performs full verification then rolls every inventory, audit and receipt change back',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),preview=await grantMinjiCards(client);
  assert.equal(preview.committed,false);assert.equal(preview.totalGranted,50);assert.deepEqual(await snapshot(db),before);
 }finally{await db.close()}
});

test('audit or completion receipt failure rolls all 50 grants back and permits a clean retry',async()=>{
 for(const options of [{failAudit:true},{failReceipt:true}]){
  const {db,client}=await fixture(options);try{
   const before=await snapshot(db);await assert.rejects(()=>grantMinjiCards(client,{commit:true}),/check constraint/);assert.deepEqual(await snapshot(db),before);
   await db.exec(options.failAudit?'ALTER TABLE admin_logs DROP CONSTRAINT admin_logs_action_type_check':'ALTER TABLE app_meta DROP CONSTRAINT app_meta_value_check');
   assert.equal((await grantMinjiCards(client,{commit:true})).totalGranted,50);assert.equal((await verifyMinjiCards(client)).verifiedCards,50);
  }finally{await db.close()}
 }
});

test('lost commit acknowledgement is recovered through the durable receipt without a second grant',async()=>{
 const {db,client}=await fixture();try{
  const lost={async query(sql,args){const r=await client.query(sql,args);if(sql==='COMMIT')throw Error('lost commit response');return r;}};
  await assert.rejects(()=>grantMinjiCards(lost,{commit:true}),/lost commit response/);
  const after=await snapshot(db);assert.equal((await grantMinjiCards(client,{commit:true})).replayed,true);assert.deepEqual(await snapshot(db),after);
  assert.equal((await verifyMinjiCards(client)).verifiedCards,50);
 }finally{await db.close()}
});

test('ambiguous or inactive target and equal-count catalog replacement fail before any grant',async()=>{
 for(const sql of ["INSERT INTO users(id,nickname,role,status) VALUES(5591,'민지','USER','ACTIVE')","UPDATE users SET status='BANNED' WHERE id=5589",`UPDATE cards_effective_v1210 SET id='unreviewed-card' WHERE id='${catalog[0].id}'`]){
  const {db,client}=await fixture();try{
   await db.exec(sql);const before=await snapshot(db);await assert.rejects(()=>grantMinjiCards(client,{commit:true}));assert.deepEqual(await snapshot(db),before);
  }finally{await db.close()}
 }
});

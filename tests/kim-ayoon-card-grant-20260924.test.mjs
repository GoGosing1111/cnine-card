import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {grantKimAyoonCards,OPERATION_KEY} from '../scripts/ops/kim-ayoon-card-grant-20260924.mjs';

async function fixture({failLog=false}={}){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123,card_shards BIGINT DEFAULT 456,magic_crystals BIGINT DEFAULT 789);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'관리자','OWNER','ACTIVE'),(5209,'김아윤','USER','ACTIVE'),(5210,'다른유저','USER','ACTIVE');
 CREATE TABLE members(id BIGINT PRIMARY KEY,is_active INTEGER DEFAULT 1);INSERT INTO members VALUES(1,1),(2,0);
 CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,member_id BIGINT,is_active INTEGER DEFAULT 1,card_status TEXT DEFAULT 'PUBLIC');
 CREATE TABLE magic_cards(id BIGINT PRIMARY KEY,code TEXT,name TEXT,is_active INTEGER DEFAULT 1);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT NOT NULL DEFAULT 1,breakthrough_level BIGINT NOT NULL DEFAULT 0,breakthrough_fail_count BIGINT NOT NULL DEFAULT 0,first_obtained_at TEXT DEFAULT 'original',last_obtained_at TEXT DEFAULT 'original',PRIMARY KEY(user_id,card_id));
 CREATE TABLE user_magic_cards(user_id BIGINT,magic_card_id BIGINT,quantity BIGINT NOT NULL DEFAULT 1,enhancement_level BIGINT NOT NULL DEFAULT 0,first_obtained_at TEXT DEFAULT 'original',updated_at TEXT DEFAULT 'original',PRIMARY KEY(user_id,magic_card_id));
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT ${failLog?"CHECK(action_type='REJECTED')":''},target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(let n=1;n<=21;n++)await db.query('INSERT INTO cards_effective_v1210(id,title,rarity,member_id) VALUES($1,$2,$3,1)',[`card-${n}`,`카드${n}`,n<=14?'FUR':'SUPERSTAR']);
 for(let n=1;n<=14;n++)await db.query('INSERT INTO magic_cards(id,code,name) VALUES($1,$2,$3)',[n,`magic-${n}`,`마법${n}`]);
 await db.exec(`INSERT INTO cards_effective_v1210 VALUES('retired','퇴사','FUR',1,0,'RETIRED'),('hidden','숨김','FUR',1,1,'HIDDEN'),('member-off','퇴사멤버','FUR',2,1,'PUBLIC'),('other-grade','다른등급','ZENITH',1,1,'PUBLIC');
 INSERT INTO magic_cards VALUES(99,'inactive','비활성',0);
 INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES(5209,'card-1',7,10,2),(5209,'card-2',3,14,1),(5209,'other-grade',8,3,0),(5210,'card-1',11,2,0);
 INSERT INTO user_magic_cards(user_id,magic_card_id,quantity,enhancement_level) VALUES(5209,1,5,9),(5209,2,4,3),(5209,99,6,0),(5210,1,99,0);`);
 const client={async query(sql,args=[]){const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows??result.rows.length}}};
 return {db,client};
}
async function snapshot(db){
 const result={};for(const table of ['users','user_cards','user_magic_cards','app_meta','admin_logs'])result[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows;return result;
}

test('grant covers only active public catalogs, preserves balances/other inventory and never grants twice',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),receipt=await grantKimAyoonCards(client);
  assert.deepEqual(receipt.counts,{FUR:14,SUPERSTAR:7,MAGIC:14});assert.equal(receipt.magicLevel,9);
  assert.deepEqual(receipt.cardChanges.find(row=>row.id==='card-1'),{id:'card-1',quantityBefore:7,quantityAfter:8,levelBefore:10,levelAfter:13,title:'카드1',grade:'FUR'});
  assert.equal(receipt.cardChanges.find(row=>row.id==='card-2').levelAfter,14);
  const after=await snapshot(db);
  assert.deepEqual(after.users,before.users);
  assert.equal(after.user_cards.filter(row=>Number(row.user_id)===5209).length,22);
  assert.equal(after.user_magic_cards.filter(row=>Number(row.user_id)===5209).length,15);
  assert.deepEqual(after.user_cards.filter(row=>Number(row.user_id)===5210),before.user_cards.filter(row=>Number(row.user_id)===5210));
  assert.deepEqual(after.user_magic_cards.filter(row=>Number(row.user_id)===5210),before.user_magic_cards.filter(row=>Number(row.user_id)===5210));
  assert.equal(Number(after.user_cards.find(row=>Number(row.user_id)===5209&&row.card_id==='card-1').breakthrough_fail_count),0);
  assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta[0].key,OPERATION_KEY);
  assert.equal((await grantKimAyoonCards(client)).replayed,true);
  assert.deepEqual(await snapshot(db),after);
 }finally{await db.close()}
});

test('audit failure rolls both inventories and the operation receipt back atomically',async()=>{
 const {db,client}=await fixture({failLog:true});try{
  const before=await snapshot(db);
  await assert.rejects(()=>grantKimAyoonCards(client),/check constraint/);
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close()}
});

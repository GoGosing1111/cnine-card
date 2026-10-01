import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {CARDS,upgradePinklightFur,verifyPinklightFur} from '../scripts/ops/pinklight-fur-plus15-20261002.mjs';
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT,card_shards BIGINT,magic_crystals BIGINT);
 INSERT INTO users VALUES(1,'핑크빛유두','ACTIVE','OWNER',123,456,789),(2,'다른계정','ACTIVE','USER',99,88,77);
 CREATE TABLE members(id BIGINT PRIMARY KEY,name TEXT,is_active INTEGER);INSERT INTO members VALUES(1,'이예준',1);
 CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,member_id BIGINT,is_active INTEGER,card_status TEXT);
 CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT,breakthrough_level BIGINT,breakthrough_fail_count BIGINT,first_obtained_at TEXT DEFAULT 'first',last_obtained_at TEXT DEFAULT 'last',PRIMARY KEY(user_id,card_id));
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT);INSERT INTO cnine_user_inventory VALUES(1,'MASTER_STAR',3000000,100),(1,'OTHER',3,1);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const [i,c] of CARDS.entries()){
  await db.query('INSERT INTO cards_effective_v1210 VALUES($1,$2,$3,1,1,$4)',[c.id,c.title,'FUR','PUBLIC']);
  await db.query('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES(1,$1,$2,13,$3),(2,$1,5,8,2)',[c.id,i+1,i]);
 }
 await db.exec("INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES(1,'OTHER',3,10,4)");return db;
}
async function snapshot(db){const s={};for(const table of ['users','user_cards','cnine_user_inventory','app_meta','admin_logs'])s[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return s;}
test('all three owned cards reach +15 atomically, preserving balances/copies/other holdings; replay creates no duplicate audit',async t=>{
 const db=await fixture(t),before=await snapshot(db),receipt=await upgradePinklightFur(db,{commit:true}),after=await snapshot(db);
 assert.equal(receipt.cards.length,3);assert.ok(receipt.cards.every(c=>c.levelBefore===13&&c.levelAfter===15&&c.quantityBefore===c.quantityAfter));
 assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);
 const expected=before.user_cards.map(r=>Number(r.user_id)===1&&CARDS.some(c=>c.id===r.card_id)?{...r,breakthrough_level:15,breakthrough_fail_count:0}:r);
 const norm=rows=>rows.map(r=>({...r,user_id:Number(r.user_id),quantity:Number(r.quantity),breakthrough_level:Number(r.breakthrough_level),breakthrough_fail_count:Number(r.breakthrough_fail_count)}));
 assert.deepEqual(norm(after.user_cards),norm(expected));assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta.length,1);
 assert.equal((await upgradePinklightFur(db,{commit:true})).replayed,true);assert.deepEqual(await snapshot(db),after);
 assert.ok((await verifyPinklightFur(db)).current.every(c=>c.level===15));
});
test('dry run, failure on the second update and audit failure roll back all three cards; retry succeeds',async t=>{
 const db=await fixture(t),before=await snapshot(db);await upgradePinklightFur(db);assert.deepEqual(await snapshot(db),before);
 let n=0;const midway={query(sql,args){if(sql.startsWith('UPDATE user_cards')&&++n===2)throw Error('Second update failed');return db.query(sql,args);}};
 await assert.rejects(upgradePinklightFur(midway,{commit:true}),/Second update failed/);assert.deepEqual(await snapshot(db),before);
 const auditFail={query(sql,args){if(sql.startsWith('INSERT INTO admin_logs'))throw Error('Audit failed');return db.query(sql,args);}};
 await assert.rejects(upgradePinklightFur(auditFail,{commit:true}),/Audit failed/);assert.deepEqual(await snapshot(db),before);
 assert.equal((await upgradePinklightFur(db,{commit:true})).cards.length,3);
});
test('duplicate nickname, missing holding and in-progress enhancement reject the entire batch without writes',async t=>{
 const db=await fixture(t);await db.exec("INSERT INTO users VALUES(3,'핑크빛유두','ACTIVE','USER',0,0,0)");
 let before=await snapshot(db);await assert.rejects(upgradePinklightFur(db,{commit:true}),/Exactly one/);assert.deepEqual(await snapshot(db),before);
 await db.exec('DELETE FROM users WHERE id=3');await db.query('UPDATE user_cards SET breakthrough_fail_count=-1 WHERE user_id=1 AND card_id=$1',[CARDS[0].id]);
 before=await snapshot(db);await assert.rejects(upgradePinklightFur(db,{commit:true}),/in progress/);assert.deepEqual(await snapshot(db),before);
 await db.query('DELETE FROM user_cards WHERE user_id=1 AND card_id=$1',[CARDS[0].id]);
 before=await snapshot(db);await assert.rejects(upgradePinklightFur(db,{commit:true}),/All three existing holdings/);assert.deepEqual(await snapshot(db),before);
});

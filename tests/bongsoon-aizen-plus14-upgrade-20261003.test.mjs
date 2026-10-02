import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {upgradeBongsoonAizen,verifyBongsoonAizen,CARD} from '../scripts/ops/bongsoon-aizen-plus14-upgrade-20261003.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT,card_shards BIGINT,magic_crystals BIGINT);
 INSERT INTO users VALUES(1,'관리자','ACTIVE','OWNER',0,0,0),(5426,'나무늘봉순','ACTIVE','USER',123,456,789),(66,'다른유저','ACTIVE','USER',99,88,77);
 CREATE TABLE members(id BIGINT PRIMARY KEY,is_active INTEGER);INSERT INTO members VALUES(1,1);
 CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,member_id BIGINT,is_active INTEGER,card_status TEXT);
 CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT,breakthrough_level BIGINT,breakthrough_fail_count BIGINT,first_obtained_at TEXT DEFAULT 'first',last_obtained_at TEXT DEFAULT 'last',PRIMARY KEY(user_id,card_id));
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT);
 INSERT INTO cnine_user_inventory VALUES(5426,'MASTER_STAR',3000000,100);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 await db.query('INSERT INTO cards_effective_v1210 VALUES($1,$2,$3,1,1,$4)',[CARD.id,CARD.title,CARD.grade,'PUBLIC']);
 await db.query('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES(5426,$1,9,13,11),(66,$1,7,8,2),(5426,$2,3,10,4)',[CARD.id,'OTHER']);
 return db;
}
async function snapshot(db){const state={};for(const table of ['users','user_cards','cnine_user_inventory','app_meta','admin_logs'])state[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return state;}

test('existing card reaches +14 without copies or cost; retry does not repeat writes',async t=>{
 const db=await fixture(t),before=await snapshot(db),receipt=await upgradeBongsoonAizen(db,{commit:true}),after=await snapshot(db);
 assert.equal(receipt.levelBefore,13);assert.equal(receipt.levelAfter,14);assert.equal(receipt.quantityBefore,9);assert.equal(receipt.quantityAfter,9);
 assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);
 const expected=structuredClone(before.user_cards),target=expected.find(row=>Number(row.user_id)===5426&&row.card_id===CARD.id);target.breakthrough_level=14;target.breakthrough_fail_count=0;
 const normalized=rows=>rows.map(row=>({...row,user_id:Number(row.user_id),quantity:Number(row.quantity),breakthrough_level:Number(row.breakthrough_level),breakthrough_fail_count:Number(row.breakthrough_fail_count)}));
 assert.deepEqual(normalized(after.user_cards),normalized(expected));assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta.length,1);
 assert.equal((await upgradeBongsoonAizen(db,{commit:true})).replayed,true);assert.deepEqual(await snapshot(db),after);
 assert.equal((await verifyBongsoonAizen(db)).currentLevel,14);
});

test('dry run and audit failure roll back the card update; failed transaction can retry',async t=>{
 const db=await fixture(t),before=await snapshot(db);assert.equal((await upgradeBongsoonAizen(db)).committed,false);assert.deepEqual(await snapshot(db),before);
 const client={query(sql,args){if(sql.startsWith('INSERT INTO admin_logs'))throw Error('Audit failed');return db.query(sql,args);}};
 await assert.rejects(upgradeBongsoonAizen(client,{commit:true}),/Audit failed/);assert.deepEqual(await snapshot(db),before);
 assert.equal((await upgradeBongsoonAizen(db,{commit:true})).levelAfter,14);
});

test('ambiguous account or absent owned card is rejected without any writes',async t=>{
 const db=await fixture(t);await db.exec("INSERT INTO users VALUES(67,'나무늘봉순','ACTIVE','USER',0,0,0)");
 let before=await snapshot(db);await assert.rejects(upgradeBongsoonAizen(db,{commit:true}),/Exactly one/);assert.deepEqual(await snapshot(db),before);
 await db.exec('DELETE FROM users WHERE id=67');await db.query('DELETE FROM user_cards WHERE user_id=5426 AND card_id=$1',[CARD.id]);
 before=await snapshot(db);await assert.rejects(upgradeBongsoonAizen(db,{commit:true}),/Existing owned card/);assert.deepEqual(await snapshot(db),before);
});


test('an existing +15 is preserved rather than downgraded',async t=>{
 const db=await fixture(t);await db.query('UPDATE user_cards SET breakthrough_level=15,breakthrough_fail_count=3 WHERE user_id=5426 AND card_id=$1',[CARD.id]);
 const before=await snapshot(db),receipt=await upgradeBongsoonAizen(db,{commit:true}),after=await snapshot(db);
 assert.equal(receipt.changed,false);assert.equal(receipt.levelAfter,15);assert.deepEqual(after.user_cards,before.user_cards);assert.deepEqual(after.users,before.users);
});

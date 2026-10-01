import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {CARD,TARGETS,EXCLUDED,upgradeSooplandBJCheetah,verifySooplandBJCheetah} from '../scripts/ops/soopland-bj-cheetah-plus15-20261002.mjs';
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT,card_shards BIGINT,magic_crystals BIGINT);
 CREATE TABLE members(id BIGINT PRIMARY KEY,name TEXT,is_active INTEGER);INSERT INTO members VALUES(1,'이예준',1);
 CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,member_id BIGINT,is_active INTEGER,card_status TEXT);
 CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT,breakthrough_level BIGINT,breakthrough_fail_count BIGINT,first_obtained_at TEXT DEFAULT 'first',last_obtained_at TEXT DEFAULT 'last',PRIMARY KEY(user_id,card_id));
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT);
 CREATE TABLE soopketland_accounts(slot TEXT PRIMARY KEY,user_id BIGINT UNIQUE,bound_at TEXT DEFAULT 'bound');
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 await db.query('INSERT INTO cards_effective_v1210 VALUES($1,$2,$3,1,1,$4)',[CARD.id,CARD.title,'FUR','PUBLIC']);
 for(const [i,u] of [EXCLUDED,...TARGETS,{id:6000,nickname:'미등록 유저'}].entries()){
  await db.query('INSERT INTO users VALUES($1,$2,$3,$4,123,456,789)',[u.id,u.nickname,'ACTIVE',u.id===1?'OWNER':'USER']);
  await db.query('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES($1,$2,$3,$4,$5),($1,$6,3,10,4)',[u.id,CARD.id,i+2,u.id===1?15:13,u.id===1?0:6,'OTHER']);
  await db.query('INSERT INTO cnine_user_inventory VALUES($1,$2,3000000,100),($1,$3,3,1)',[u.id,'MASTER_STAR','OTHER']);
  if(u.slot)await db.query('INSERT INTO soopketland_accounts(slot,user_id) VALUES($1,$2)',[u.slot,u.id]);
 }
 return db;
}
async function snapshot(db){const s={};for(const table of ['users','user_cards','cnine_user_inventory','soopketland_accounts','app_meta','admin_logs'])s[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return s;}
const norm=rows=>rows.map(r=>({...r,user_id:Number(r.user_id),quantity:Number(r.quantity),breakthrough_level:Number(r.breakthrough_level),breakthrough_fail_count:Number(r.breakthrough_fail_count)}));
test('all eight registered BJs reach +15; Pinklight, non-BJs, other cards, copies and balances stay unchanged; retry is idempotent',async t=>{
 const db=await fixture(t),before=await snapshot(db),receipt=await upgradeSooplandBJCheetah(db,{commit:true}),after=await snapshot(db);
 assert.equal(receipt.accounts,8);assert.equal(receipt.changed,8);assert.ok(receipt.targets.every(r=>r.levelAfter===15&&r.quantityBefore===r.quantityAfter));
 assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);assert.deepEqual(after.soopketland_accounts,before.soopketland_accounts);
 const expected=before.user_cards.map(r=>r.card_id===CARD.id&&TARGETS.some(t=>t.id===Number(r.user_id))?{...r,breakthrough_level:15,breakthrough_fail_count:0}:r);
 assert.deepEqual(norm(after.user_cards),norm(expected));assert.equal(after.admin_logs.length,8);assert.ok(after.admin_logs.every(r=>r.target_id!=='1'));assert.equal(after.app_meta.length,1);
 assert.equal((await upgradeSooplandBJCheetah(db,{commit:true})).replayed,true);assert.deepEqual(await snapshot(db),after);assert.ok((await verifySooplandBJCheetah(db)).current.every(r=>r.level===15));
});
test('dry run, fourth-card update failure and third-audit failure roll back the full batch; retry succeeds',async t=>{
 const db=await fixture(t),before=await snapshot(db);await upgradeSooplandBJCheetah(db);assert.deepEqual(await snapshot(db),before);
 let updates=0;const midway={query(sql,args){if(sql.startsWith('UPDATE user_cards')&&++updates===4)throw Error('Fourth update failed');return db.query(sql,args);}};
 await assert.rejects(upgradeSooplandBJCheetah(midway,{commit:true}),/Fourth update failed/);assert.deepEqual(await snapshot(db),before);
 let audits=0;const auditFail={query(sql,args){if(sql.startsWith('INSERT INTO admin_logs')&&++audits===3)throw Error('Third audit failed');return db.query(sql,args);}};
 await assert.rejects(upgradeSooplandBJCheetah(auditFail,{commit:true}),/Third audit failed/);assert.deepEqual(await snapshot(db),before);assert.equal((await upgradeSooplandBJCheetah(db,{commit:true})).accounts,8);
});
test('changed BJ binding, zero owned copies and an in-progress enhancement reject every write',async t=>{
 const db=await fixture(t);await db.query('UPDATE soopketland_accounts SET user_id=6000 WHERE slot=$1',[TARGETS[0].slot]);
 let before=await snapshot(db);await assert.rejects(upgradeSooplandBJCheetah(db,{commit:true}),/roster changed/);assert.deepEqual(await snapshot(db),before);
 await db.query('UPDATE soopketland_accounts SET user_id=$1 WHERE slot=$2',[TARGETS[0].id,TARGETS[0].slot]);await db.query('UPDATE user_cards SET quantity=0 WHERE user_id=$1 AND card_id=$2',[TARGETS[0].id,CARD.id]);
 before=await snapshot(db);await assert.rejects(upgradeSooplandBJCheetah(db,{commit:true}),/Existing owned/);assert.deepEqual(await snapshot(db),before);
 await db.query('UPDATE user_cards SET quantity=3,breakthrough_fail_count=-1 WHERE user_id=$1 AND card_id=$2',[TARGETS[0].id,CARD.id]);
 before=await snapshot(db);await assert.rejects(upgradeSooplandBJCheetah(db,{commit:true}),/in progress/);assert.deepEqual(await snapshot(db),before);
});

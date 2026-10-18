import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {grant,verify,TARGET} from '../scripts/ops/yeobongsang-room-sponsor-20261018.mjs';
const options=()=>({dryRun:false,lockDeadline:Date.now()+120000});
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 INSERT INTO users VALUES(1,'관리자','OWNER','ACTIVE',123,456,789),(5598,'여봉상','USER','ACTIVE',191915387110,91,82),(9999,'다른계정','USER','ACTIVE',11,22,33);
 CREATE TABLE inventory_items(code text PRIMARY KEY,name text,is_active bigint);INSERT INTO inventory_items VALUES('SUIT_CORE_6','슈트 코어 6',1);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint,unseen_quantity bigint,created_at text,updated_at text,PRIMARY KEY(user_id,item_code));
 INSERT INTO cnine_user_inventory VALUES(5598,'MASTER_STAR',100,1,'old','old'),(9999,'SUIT_CORE_6',8,0,'old','old');
 CREATE TABLE coin_logs(id bigserial PRIMARY KEY,user_id bigint,change_amount bigint,balance_after bigint,reason text,admin_id bigint,created_at text);
 CREATE TABLE inventory_logs(id bigserial PRIMARY KEY,user_id bigint,item_code text,change_amount bigint,balance_after bigint,reason text,reference_type text,reference_id text,admin_id bigint,created_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text,created_at text);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);`);
 const snapshot=async()=>{const out={};for(const table of ['users','cnine_user_inventory','coin_logs','inventory_logs','admin_logs','app_meta'])out[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return out;};
 return {db,snapshot};
}
test('exact account gets two units atomically; dry-run, replay and later spending never duplicate the award',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 await grant(db,{...options(),dryRun:true});assert.deepEqual(await snapshot(),before);
 const result=await grant(db,options()),after=await snapshot();assert.equal(result.receipt.units,2);assert.equal(result.receipt.coinGranted,'4000000000000');assert.equal(result.receipt.coresGranted,20);
 assert.equal(result.receipt.after.coin,'4191915387110');assert.equal(result.receipt.after.quantity,'20');assert.equal(result.receipt.after.unseenQuantity,'20');
 assert.deepEqual(after.users.filter(r=>Number(r.id)!==TARGET.id),before.users.filter(r=>Number(r.id)!==TARGET.id));
 assert.deepEqual(after.cnine_user_inventory.filter(r=>Number(r.user_id)!==TARGET.id||r.item_code!=='SUIT_CORE_6'),before.cnine_user_inventory);
 const noWrites={query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql));return db.query(sql,args);}};
 assert.equal((await grant(noWrites,options())).replayed,true);assert.deepEqual(await snapshot(),after);
 await db.exec("UPDATE users SET coin=0,nickname='새닉네임' WHERE id=5598;UPDATE cnine_user_inventory SET quantity=0,unseen_quantity=0 WHERE user_id=5598 AND item_code='SUIT_CORE_6'");
 assert.equal((await verify(db)).verified,true);assert.equal((await grant(noWrites,options())).replayed,true);
});
test('any failed inventory, ledger, audit or receipt write rolls back the entire combined reward',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 for(const table of ['cnine_user_inventory','coin_logs','inventory_logs','admin_logs','app_meta']){
  let failed=false;const fault={query:(sql,args)=>{if(sql.startsWith('INSERT INTO '+table)){failed=true;throw Error('Injected write failure');}return db.query(sql,args);}};
  await assert.rejects(grant(fault,options()),/Injected write failure/);assert(failed);assert.deepEqual(await snapshot(),before);
 }
});
test('identity, expired lease and overflow are rejected; an unacknowledged commit is recovered once',async t=>{
 const {db,snapshot}=await fixture(t);
 await assert.rejects(grant(db,{...options(),lockDeadline:Date.now()}),/Live account lock/);
 await db.exec("UPDATE users SET nickname='다른이름' WHERE id=5598");await assert.rejects(grant(db,options()),/nickname changed/);
 await db.exec("UPDATE users SET nickname='여봉상',coin=9007199254740991 WHERE id=5598");await assert.rejects(grant(db,options()),/Balance overflow/);
 await db.exec("UPDATE users SET coin=191915387110 WHERE id=5598;INSERT INTO cnine_user_inventory VALUES(5598,'SUIT_CORE_6',7,3,'old','old')");
 let lost=false;const fault={query:async(sql,args)=>{const result=await db.query(sql,args);if(sql==='COMMIT'&&!lost){lost=true;throw Error('Lost commit response');}return result;}};
 await assert.rejects(grant(fault,options()),/Lost commit response/);const after=await snapshot(),replay=await grant(db,options());assert.equal(replay.replayed,true);assert.equal(replay.receipt.after.quantity,'27');assert.equal(replay.receipt.after.unseenQuantity,'23');assert.deepEqual(await snapshot(),after);
});

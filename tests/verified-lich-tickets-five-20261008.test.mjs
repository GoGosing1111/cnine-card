import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {OPERATION_KEY,ITEM_CODE,inspectVerifiedLichTickets,grantVerifiedLichTickets,verifyVerifiedLichTickets} from '../scripts/ops/verified-lich-tickets-five-20261008.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 9000000000,card_shards BIGINT DEFAULT 123,magic_crystals BIGINT DEFAULT 456);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'인증오너','OWNER','ACTIVE'),(2,'인증관리자','ADMIN','ACTIVE'),(3,'인증유저','USER','ACTIVE'),(4,'정지','USER','BANNED'),(5,'미인증','USER','ACTIVE'),(6,'미인증오너','OWNER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT);INSERT INTO user_second_verifications VALUES(1,'PLAYDK'),(2,'PLAYDK'),(3,'WAGO'),(4,'PLAYDK');
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active BIGINT);INSERT INTO inventory_items VALUES('LICH_KING_ENTRY_TICKET','리치왕 정벌 입장권',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,extra TEXT DEFAULT 'preserve',PRIMARY KEY(user_id,item_code));
 INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(3,'LICH_KING_ENTRY_TICKET',4,2,'old','old'),(3,'MASTER_STAR',100,0,'old','old'),(4,'LICH_KING_ENTRY_TICKET',3,0,'old','old');
 CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT,created_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGINT PRIMARY KEY,user_id BIGINT,title TEXT);INSERT INTO user_messages VALUES(99,3,'기존 메시지');`);
 return db;
}
async function snapshot(db){const state={};for(const table of ['users','user_second_verifications','inventory_items','cnine_user_inventory','inventory_logs','admin_logs','app_meta','user_messages'])state[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return state;}
async function grant(db,options={}){const plan=await inspectVerifiedLichTickets(db);return grantVerifiedLichTickets(db,{expectedRecipientHash:plan.recipientHash,commit:true,...options});}

test('all active verified roles/providers beyond a CMS page get +5 exactly; other holdings and currency survive',async t=>{
 const db=await fixture(t);
 await db.exec("INSERT INTO users(id,nickname,role,status) SELECT n,'추가 '||n,'USER','ACTIVE' FROM generate_series(100,304) n;INSERT INTO user_second_verifications SELECT n,'PLAYDK' FROM generate_series(100,304) n");
 const before=await snapshot(db),receipt=await grant(db),after=await snapshot(db);
 assert.equal(receipt.recipientCount,208);assert.equal(receipt.totalItems,1040);assert.deepEqual(receipt.roles,{OWNER:1,ADMIN:1,USER:206});
 for(const table of ['users','user_second_verifications','inventory_items','user_messages'])assert.deepEqual(after[table],before[table]);
 const untouched=r=>r.item_code!==ITEM_CODE||Number(r.user_id)===4;
 assert.deepEqual(after.cnine_user_inventory.filter(untouched),before.cnine_user_inventory.filter(untouched));
 const held=after.cnine_user_inventory.find(r=>Number(r.user_id)===3&&r.item_code===ITEM_CODE);
 assert.equal(Number(held.quantity),9);assert.equal(Number(held.unseen_quantity),7);assert.equal(held.created_at,'old');assert.equal(held.extra,'preserve');
 assert.equal(after.inventory_logs.length,208);assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta[0].key,OPERATION_KEY);
 assert.equal((await verifyVerifiedLichTickets(db)).duplicates,0);
});

test('dry run and partial inventory, audit or final receipt failures roll the whole grant back',async t=>{
 const db=await fixture(t),plan=await inspectVerifiedLichTickets(db),before=await snapshot(db);
 assert.equal((await grant(db,{commit:false})).committed,false);assert.deepEqual(await snapshot(db),before);
 for(const statement of ['INSERT INTO admin_logs','INSERT INTO app_meta']){
  const client={query(sql,args){if(sql.startsWith(statement))throw Error('injected write failure');return db.query(sql,args);}};
  await assert.rejects(grantVerifiedLichTickets(client,{expectedRecipientHash:plan.recipientHash,commit:true}),/injected write failure/);
  assert.deepEqual(await snapshot(db),before);
 }
 await db.exec("CREATE FUNCTION skip_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id=1 THEN RETURN NULL; END IF; RETURN NEW; END; $$; CREATE TRIGGER skip_one BEFORE INSERT ON cnine_user_inventory FOR EACH ROW EXECUTE FUNCTION skip_item();");
 await assert.rejects(grant(db),/Partial inventory grant/);assert.deepEqual(await snapshot(db),before);
 await db.exec('DROP TRIGGER skip_one ON cnine_user_inventory');assert.equal((await grant(db)).recipientCount,3);
});

test('changed roster, inactive item or unsafe item quantity prevents any grant',async t=>{
 const db=await fixture(t),plan=await inspectVerifiedLichTickets(db);
 await db.exec("INSERT INTO user_second_verifications VALUES(5,'PLAYDK')");let before=await snapshot(db);
 await assert.rejects(grantVerifiedLichTickets(db,{expectedRecipientHash:plan.recipientHash,commit:true}),/recipient list changed/);assert.deepEqual(await snapshot(db),before);
 await db.exec('DELETE FROM user_second_verifications WHERE user_id=5;UPDATE inventory_items SET is_active=0');before=await snapshot(db);
 await assert.rejects(grant(db),/Active item required/);assert.deepEqual(await snapshot(db),before);
 await db.exec("UPDATE inventory_items SET is_active=1;UPDATE cnine_user_inventory SET quantity=9007199254740991 WHERE user_id=3 AND item_code='LICH_KING_ENTRY_TICKET'");before=await snapshot(db);
 await assert.rejects(grant(db),/safe range/);assert.deepEqual(await snapshot(db),before);
});

test('lost commit reply and later spending or newly verified users never cause duplicate credit',async t=>{
 const db=await fixture(t),plan=await inspectVerifiedLichTickets(db);
 const dropped={async query(sql,args){const r=await db.query(sql,args);if(sql==='COMMIT')throw Error('lost acknowledgement');return r;}};
 await assert.rejects(grantVerifiedLichTickets(dropped,{expectedRecipientHash:plan.recipientHash,commit:true}),/lost acknowledgement/);
 await db.exec("UPDATE cnine_user_inventory SET quantity=quantity-1 WHERE user_id=3 AND item_code='LICH_KING_ENTRY_TICKET';DELETE FROM user_second_verifications WHERE user_id=3;INSERT INTO user_second_verifications VALUES(5,'PLAYDK')");
 const before=await snapshot(db),result=await grantVerifiedLichTickets(db,{expectedRecipientHash:plan.recipientHash,commit:true});
 assert.equal(result.replayed,true);assert.deepEqual(await snapshot(db),before);assert.equal((await verifyVerifiedLichTickets(db)).recipientCount,3);
});

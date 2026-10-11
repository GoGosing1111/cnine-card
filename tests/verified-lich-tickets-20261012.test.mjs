import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {OPERATION_KEY,ITEM_CODE,inspectVerifiedLichTickets,grantVerifiedLichTickets,verifyVerifiedLichTickets} from '../scripts/ops/verified-lich-tickets-20261012.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 9000000000,card_shards BIGINT DEFAULT 123,magic_crystals BIGINT DEFAULT 456);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'인증오너','OWNER','ACTIVE'),(2,'인증기사','ADMIN','ACTIVE'),(3,'보유만','USER','ACTIVE'),(4,'정지기사','USER','BANNED'),(5,'미인증기사','USER','ACTIVE'),(6,'미인증오너','OWNER','ACTIVE'),(7,'기간만료','USER','ACTIVE'),(8,'다른칭호','USER','ACTIVE'),(9,'소유권없음','USER','ACTIVE'),(10,'기간유효','USER','ACTIVE'),(11,'칭호없음','USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT);INSERT INTO user_second_verifications VALUES(1,'PLAYDK'),(2,'PLAYDK'),(3,'WAGO'),(4,'PLAYDK'),(7,'PLAYDK'),(8,'PLAYDK'),(9,'PLAYDK'),(10,'PLAYDK'),(11,'PLAYDK');
 CREATE TABLE character_titles(id BIGINT PRIMARY KEY,code TEXT,name TEXT,is_active BIGINT);INSERT INTO character_titles VALUES(50,'RAID_BUS_DRIVER','버스기사',1),(51,'OTHER','다른 칭호',1);
 CREATE TABLE user_character_titles(user_id BIGINT,title_id BIGINT,expires_at TEXT,PRIMARY KEY(user_id,title_id));
 INSERT INTO user_character_titles VALUES(2,50,NULL),(3,50,NULL),(4,50,NULL),(5,50,NULL),(7,50,'2000-01-01T00:00:00.000Z'),(8,50,NULL),(8,51,NULL),(10,50,'2999-01-01T00:00:00.000Z');
 CREATE TABLE user_title_loadout(user_id BIGINT PRIMARY KEY,title_id BIGINT);INSERT INTO user_title_loadout VALUES(2,50),(4,50),(5,50),(7,50),(8,51),(9,50),(10,50);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active BIGINT);INSERT INTO inventory_items VALUES('LICH_KING_ENTRY_TICKET','리치왕 정벌 입장권',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,extra TEXT DEFAULT 'preserve',PRIMARY KEY(user_id,item_code));
 INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(3,'LICH_KING_ENTRY_TICKET',4,2,'old','old'),(3,'MASTER_STAR',100,0,'old','old'),(4,'LICH_KING_ENTRY_TICKET',3,0,'old','old');
 CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT,created_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGINT PRIMARY KEY,user_id BIGINT,title TEXT);INSERT INTO user_messages VALUES(99,3,'기존 메시지');`);
 return db;
}
async function snapshot(db){const state={};for(const table of ['users','user_second_verifications','character_titles','user_character_titles','user_title_loadout','inventory_items','cnine_user_inventory','inventory_logs','admin_logs','app_meta','user_messages'])state[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return state;}
async function grant(db,options={}){const plan=await inspectVerifiedLichTickets(db);return grantVerifiedLichTickets(db,{expectedRecipientHash:plan.recipientHash,commit:true,...options});}

test('all active verified users beyond CMS pagination get 10; only valid equipped bus drivers get 30 total',async t=>{
 const db=await fixture(t);await db.exec("INSERT INTO users(id,nickname,role,status) SELECT n,'추가 '||n,'USER','ACTIVE' FROM generate_series(100,304) n;INSERT INTO user_second_verifications SELECT n,'PLAYDK' FROM generate_series(100,304) n");
 const before=await snapshot(db),{receipt:r,verification}=await grant(db),after=await snapshot(db);
 assert.equal(r.recipientCount,213);assert.equal(r.baseRecipients,211);assert.equal(r.busDriverRecipients,2);assert.equal(r.totalItems,2170);
 assert.deepEqual(r.recipients.filter(x=>x.amount===30).map(x=>x.userId),['2','10']);
 for(const id of ['1','3','7','8','9','11'])assert.equal(r.recipients.find(x=>x.userId===id).amount,10);
 for(const id of ['4','5','6'])assert.equal(r.recipients.some(x=>x.userId===id),false);
 for(const table of ['users','user_second_verifications','character_titles','user_character_titles','user_title_loadout','inventory_items','user_messages'])assert.deepEqual(after[table],before[table]);
 const untouched=row=>row.item_code!==ITEM_CODE||Number(row.user_id)===4;assert.deepEqual(after.cnine_user_inventory.filter(untouched),before.cnine_user_inventory.filter(untouched));
 const held=after.cnine_user_inventory.find(row=>Number(row.user_id)===3&&row.item_code===ITEM_CODE);assert.equal(Number(held.quantity),14);assert.equal(Number(held.unseen_quantity),12);assert.equal(held.created_at,'old');assert.equal(held.extra,'preserve');
 assert.equal(after.inventory_logs.length,213);assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta[0].key,OPERATION_KEY);assert.equal(verification.duplicates,0);
});

test('dry run and missing inventory, audit or final receipt writes roll back the entire allocation',async t=>{
 const db=await fixture(t),plan=await inspectVerifiedLichTickets(db),before=await snapshot(db);
 assert.equal((await grant(db,{commit:false})).committed,false);assert.deepEqual(await snapshot(db),before);
 for(const statement of ['INSERT INTO admin_logs','INSERT INTO app_meta']){
  const client={query(sql,args){if(sql.startsWith(statement))throw Error('injected write failure');return db.query(sql,args);}};
  await assert.rejects(grantVerifiedLichTickets(client,{expectedRecipientHash:plan.recipientHash,commit:true}),/injected write failure/);assert.deepEqual(await snapshot(db),before);
 }
 await db.exec("CREATE FUNCTION skip_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id=2 THEN RETURN NULL; END IF; RETURN NEW; END; $$; CREATE TRIGGER skip_one BEFORE INSERT ON cnine_user_inventory FOR EACH ROW EXECUTE FUNCTION skip_item();");
 await assert.rejects(grant(db),/Partial inventory grant/);assert.deepEqual(await snapshot(db),before);
});

test('changed verification or equipped title, inactive catalog and unsafe inventory stop the grant',async t=>{
 const db=await fixture(t),plan=await inspectVerifiedLichTickets(db);
 await db.exec("INSERT INTO user_second_verifications VALUES(5,'PLAYDK')");let before=await snapshot(db);
 await assert.rejects(grantVerifiedLichTickets(db,{expectedRecipientHash:plan.recipientHash,commit:true}),/list or equipped title changed/);assert.deepEqual(await snapshot(db),before);
 await db.exec('DELETE FROM user_second_verifications WHERE user_id=5;INSERT INTO user_title_loadout VALUES(3,50)');before=await snapshot(db);
 await assert.rejects(grantVerifiedLichTickets(db,{expectedRecipientHash:plan.recipientHash,commit:true}),/list or equipped title changed/);assert.deepEqual(await snapshot(db),before);
 await db.exec('DELETE FROM user_title_loadout WHERE user_id=3;UPDATE inventory_items SET is_active=0');before=await snapshot(db);
 await assert.rejects(grant(db),/Active item required/);assert.deepEqual(await snapshot(db),before);
 await db.exec('UPDATE inventory_items SET is_active=1;UPDATE character_titles SET is_active=0 WHERE id=50');before=await snapshot(db);
 await assert.rejects(grant(db),/Active bus-driver title required/);assert.deepEqual(await snapshot(db),before);
 await db.exec("UPDATE character_titles SET is_active=1 WHERE id=50;UPDATE cnine_user_inventory SET quantity=9007199254740991 WHERE user_id=3 AND item_code='LICH_KING_ENTRY_TICKET'");before=await snapshot(db);
 await assert.rejects(grant(db),/safe range/);assert.deepEqual(await snapshot(db),before);
});

test('lost commit reply, subsequent spending, title switches and newly verified users never duplicate grants',async t=>{
 const db=await fixture(t),plan=await inspectVerifiedLichTickets(db);
 const dropped={async query(sql,args){const result=await db.query(sql,args);if(sql==='COMMIT')throw Error('lost acknowledgement');return result;}};
 await assert.rejects(grantVerifiedLichTickets(dropped,{expectedRecipientHash:plan.recipientHash,commit:true}),/lost acknowledgement/);
 await db.exec("UPDATE cnine_user_inventory SET quantity=quantity-1 WHERE user_id=3 AND item_code='LICH_KING_ENTRY_TICKET';DELETE FROM user_second_verifications WHERE user_id=3;INSERT INTO user_second_verifications VALUES(5,'PLAYDK');DELETE FROM user_title_loadout WHERE user_id=2;INSERT INTO user_title_loadout VALUES(3,50)");
 const before=await snapshot(db),result=await grantVerifiedLichTickets(db,{expectedRecipientHash:plan.recipientHash,commit:true});
 assert.equal(result.replayed,true);assert.deepEqual(await snapshot(db),before);assert.equal((await verifyVerifiedLichTickets(db)).recipientCount,8);
});

test('verification detects extra operation ledgers as well as missing or wrong-sized grants',async t=>{
 const db=await fixture(t);await grant(db);
 await db.exec("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id FROM inventory_logs LIMIT 1");
 await assert.rejects(verifyVerifiedLichTickets(db),/Missing or duplicate/);
 await db.exec('DELETE FROM inventory_logs WHERE id=(SELECT MAX(id) FROM inventory_logs);UPDATE inventory_logs SET change_amount=40 WHERE user_id=2');
 await assert.rejects(verifyVerifiedLichTickets(db));
});

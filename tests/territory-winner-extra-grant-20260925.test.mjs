import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {grantTerritoryWinnerExtra,inspectTerritoryWinnerExtra,verifyTerritoryWinnerExtra,OPERATION_KEY,ROUND,RECIPIENT_COUNT,COIN_PER_USER,STARS_PER_USER} from '../scripts/ops/territory-winner-extra-grant-20260925.mjs';
const USER_IDS=Array.from({length:RECIPIENT_COUNT},(_,i)=>100+i);
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT DEFAULT 'USER',status TEXT DEFAULT 'ACTIVE',coin BIGINT DEFAULT 9012345678901,card_shards BIGINT DEFAULT 123,magic_crystals BIGINT DEFAULT 456,clan_id BIGINT DEFAULT 99);
 CREATE TABLE territory_war_v3_rounds(id BIGINT PRIMARY KEY,status TEXT,battle_name TEXT,winner_side TEXT,settled_at TEXT);
 CREATE TABLE territory_war_v3_users(round_id BIGINT,user_id BIGINT,side TEXT,status TEXT,attacks BIGINT,clan_id BIGINT,PRIMARY KEY(round_id,user_id));
 CREATE TABLE territory_war_v3_rewards(round_id BIGINT,user_id BIGINT,result TEXT,coin BIGINT,claimed_at TEXT,PRIMARY KEY(round_id,user_id));
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active BIGINT);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,extra TEXT DEFAULT 'unchanged',PRIMARY KEY(user_id,item_code));
 CREATE TABLE coin_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,admin_id BIGINT,created_at TEXT);
 CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT,created_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1);
 INSERT INTO users(id,nickname,role) VALUES(1,'관리자','OWNER'),(6000,'패배팀','USER'),(6001,'다음회차','USER');
 INSERT INTO territory_war_v3_rounds VALUES(62,'RECRUITING','다음회차',NULL,NULL);
 INSERT INTO territory_war_v3_users VALUES(60,6000,'A','ACTIVE',999,6),(62,6001,'B','ACTIVE',999,7);
 INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(6000,'MASTER_STAR',40,4,'original','original'),(6001,'MASTER_STAR',50,5,'original','original');`);
 await db.query("INSERT INTO territory_war_v3_rounds VALUES($1,'FINISHED',$2,$3,$4)",[ROUND.id,ROUND.battleName,ROUND.winnerSide,ROUND.settledAt]);
 await db.query("INSERT INTO users(id,nickname) SELECT id,'승리팀 '||id FROM unnest($1::bigint[]) id",[USER_IDS]);
 await db.query("INSERT INTO territory_war_v3_users SELECT 60,id,'B','ACTIVE',CASE WHEN id<111 THEN 0 ELSE 200 END,CASE WHEN id=100 THEN NULL ELSE 7 END FROM unnest($1::bigint[]) id",[USER_IDS]);
 await db.query("INSERT INTO territory_war_v3_rewards SELECT 60,id,CASE WHEN id<111 THEN 'INELIGIBLE' ELSE 'WIN' END,9000000000,CASE WHEN id=111 THEN 'already-claimed' ELSE NULL END FROM unnest($1::bigint[]) id",[USER_IDS]);
 await db.query("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT id,'MASTER_STAR',12345,345,'original','original' FROM unnest($1::bigint[]) id WHERE id%2=0",[USER_IDS]);
 await db.query("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT id,'OTHER_ITEM',3,2,'original','original' FROM unnest($1::bigint[]) id",[USER_IDS]);
 const client={query:(sql,args=[])=>db.query(sql,args)},plan=await inspectTerritoryWinnerExtra(client);
 return {db,client,plan,grant:(options={})=>grantTerritoryWinnerExtra(client,{expectedRecipientHash:plan.recipientHash,commit:true,...options})};
}
async function snapshot(db){const out={};for(const table of ['users','territory_war_v3_rounds','territory_war_v3_users','territory_war_v3_rewards','inventory_items','cnine_user_inventory','coin_logs','inventory_logs','admin_logs','app_meta'])out[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows;return out;}

test('all 89 fixed-round winners receive 100만 stars and 500억 once, including low-attack, claimed and unaffiliated participants',async()=>{
 const f=await fixture();try{
  const before=await snapshot(f.db),receipt=await f.grant(),after=await snapshot(f.db);
  assert.equal(receipt.recipientCount,89);assert.equal(receipt.totalCoin,'4450000000000');assert.equal(receipt.totalStars,'89000000');
  for(const row of after.users){const old=before.users.find(u=>u.id===row.id);assert.equal(BigInt(row.coin),BigInt(old.coin)+(USER_IDS.includes(Number(row.id))?BigInt(COIN_PER_USER):0n));assert.deepEqual({...row,coin:old.coin},old);}
  for(const id of USER_IDS){const old=before.cnine_user_inventory.find(r=>Number(r.user_id)===id&&r.item_code==='MASTER_STAR'),row=after.cnine_user_inventory.find(r=>Number(r.user_id)===id&&r.item_code==='MASTER_STAR');assert.equal(BigInt(row.quantity),BigInt(old?.quantity??0)+BigInt(STARS_PER_USER));assert.equal(BigInt(row.unseen_quantity),BigInt(old?.unseen_quantity??0)+BigInt(STARS_PER_USER));assert.equal(row.extra,'unchanged');if(old)assert.equal(row.created_at,old.created_at);}
  const untouched=r=>!USER_IDS.includes(Number(r.user_id))||r.item_code!=='MASTER_STAR';assert.deepEqual(after.cnine_user_inventory.filter(untouched),before.cnine_user_inventory.filter(untouched));
  for(const table of ['territory_war_v3_rounds','territory_war_v3_users','territory_war_v3_rewards','inventory_items'])assert.deepEqual(after[table],before[table]);
  assert.equal(after.coin_logs.length,89);assert.equal(after.inventory_logs.length,89);assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta[0].key,OPERATION_KEY);
  assert.equal((await verifyTerritoryWinnerExtra(f.client)).duplicates,0);assert.equal((await f.grant()).replayed,true);assert.deepEqual(await snapshot(f.db),after);
 }finally{await f.db.close()}
});

test('default preview fully verifies amounts and preserves wallets, inventories and receipts by rollback',async()=>{
 const f=await fixture();try{const before=await snapshot(f.db),r=await grantTerritoryWinnerExtra(f.client,{expectedRecipientHash:f.plan.recipientHash});assert.equal(r.committed,false);assert.equal(r.recipientCount,89);assert.deepEqual(await snapshot(f.db),before);}finally{await f.db.close()}
});

test('partial star credit or ledger, audit and final receipt failure rolls all grants back and allows retry',async()=>{
 for(const fault of [
  "CREATE FUNCTION skip_one_star() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id=100 THEN RETURN NULL; END IF; RETURN NEW; END; $$; CREATE TRIGGER skip_one BEFORE INSERT ON cnine_user_inventory FOR EACH ROW EXECUTE FUNCTION skip_one_star();",
  'ALTER TABLE coin_logs ADD CONSTRAINT forced_failure CHECK(change_amount<0)',
  'ALTER TABLE inventory_logs ADD CONSTRAINT forced_failure CHECK(change_amount<0)',
  'ALTER TABLE admin_logs ADD CONSTRAINT forced_failure CHECK(admin_id<0)',
  "ALTER TABLE app_meta ADD CONSTRAINT forced_failure CHECK(key='not-the-grant')"
 ]){const f=await fixture();try{await f.db.exec(fault);const before=await snapshot(f.db);await assert.rejects(f.grant());assert.deepEqual(await snapshot(f.db),before);if(fault.startsWith('ALTER TABLE admin_logs')){await f.db.exec('ALTER TABLE admin_logs DROP CONSTRAINT forced_failure');assert.equal((await f.grant()).recipientCount,89);}}finally{await f.db.close()}}
});

test('wrong round result, settlement, equal-size roster substitution, inactive account/catalog and overflow refuse payment',async()=>{
 for(const change of ["UPDATE territory_war_v3_rounds SET winner_side='A' WHERE id=60","UPDATE territory_war_v3_rounds SET settled_at='changed' WHERE id=60","UPDATE territory_war_v3_users SET user_id=6001 WHERE round_id=60 AND user_id=100","UPDATE users SET status='BANNED' WHERE id=100","UPDATE inventory_items SET is_active=0",'UPDATE users SET coin=9007199254740991 WHERE id=100']){
  const f=await fixture();try{await f.db.exec(change);const before=await snapshot(f.db);await assert.rejects(f.grant());assert.deepEqual(await snapshot(f.db),before);}finally{await f.db.close()}
 }
});

test('lost commit response retries from exact ledger ids without another credit, even after normal spending',async()=>{
 const f=await fixture();try{
  const lost={async query(sql,args=[]){const r=await f.client.query(sql,args);if(sql==='COMMIT')throw Error('commit response lost');return r;}};
  await assert.rejects(grantTerritoryWinnerExtra(lost,{expectedRecipientHash:f.plan.recipientHash,commit:true}),/commit response lost/);
  await f.db.exec("UPDATE users SET coin=coin-10 WHERE id=100;UPDATE cnine_user_inventory SET quantity=quantity-2 WHERE user_id=100 AND item_code='MASTER_STAR'");
  const after=await snapshot(f.db);assert.equal((await f.grant()).replayed,true);assert.deepEqual(await snapshot(f.db),after);assert.equal((await verifyTerritoryWinnerExtra(f.client)).recipientCount,89);
 }finally{await f.db.close()}
});

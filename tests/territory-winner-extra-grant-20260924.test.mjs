import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {grantTerritoryWinnerExtra,OPERATION_KEY,ROUND,USER_IDS,COIN_PER_USER,STARS_PER_USER} from '../scripts/ops/territory-winner-extra-grant-20260924.mjs';

async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT DEFAULT 'USER',status TEXT DEFAULT 'ACTIVE',coin BIGINT DEFAULT 1234567890123 CHECK(coin>=0),card_shards BIGINT DEFAULT 123,magic_crystals BIGINT DEFAULT 456);
 CREATE TABLE territory_war_v3_rounds(id BIGINT PRIMARY KEY,status TEXT,battle_name TEXT,winner_side TEXT,settled_at TEXT);
 CREATE TABLE territory_war_v3_users(round_id BIGINT,user_id BIGINT,side TEXT,status TEXT,attacks BIGINT,clan_id BIGINT,PRIMARY KEY(round_id,user_id));
 CREATE TABLE territory_war_v3_rewards(round_id BIGINT,user_id BIGINT,result TEXT,coin BIGINT,claimed_at TEXT,PRIMARY KEY(round_id,user_id));
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active BIGINT);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT CHECK(quantity>=0),unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
 CREATE TABLE coin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,admin_id BIGINT,created_at TEXT);
 CREATE TABLE inventory_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT,created_at TEXT);
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1),('OTHER_ITEM','다른 아이템',1);
 INSERT INTO users(id,nickname,role) VALUES(1,'관리자','OWNER'),(6000,'패배팀','USER'),(6001,'미참가','USER');
 INSERT INTO territory_war_v3_users VALUES(58,6000,'A','ACTIVE',300,6);
 INSERT INTO cnine_user_inventory VALUES(6000,'MASTER_STAR',40,4,'original','original'),(6001,'MASTER_STAR',50,5,'original','original');`);
 await db.query("INSERT INTO territory_war_v3_rounds VALUES($1,'FINISHED',$2,$3,$4)",[ROUND.id,ROUND.battleName,ROUND.winnerSide,ROUND.settledAt]);
 await db.query("INSERT INTO users(id,nickname) SELECT id,'대상 '||id FROM unnest($1::bigint[]) id",[USER_IDS]);
 await db.query("INSERT INTO territory_war_v3_users SELECT 58,id,'B','ACTIVE',CASE WHEN id=8 THEN 0 ELSE 200 END,CASE WHEN id=145 THEN NULL ELSE 7 END FROM unnest($1::bigint[]) id",[USER_IDS]);
 await db.query("INSERT INTO territory_war_v3_rewards SELECT 58,id,CASE WHEN id=8 THEN 'INELIGIBLE' ELSE 'WIN' END,9000000000,CASE WHEN id=13 THEN 'already-claimed' ELSE NULL END FROM unnest($1::bigint[]) id",[USER_IDS]);
 await db.query("INSERT INTO cnine_user_inventory SELECT id,'MASTER_STAR',12345,345,'original','original' FROM unnest($1::bigint[]) id WHERE id%2=0",[USER_IDS]);
 await db.query("INSERT INTO cnine_user_inventory SELECT id,'OTHER_ITEM',3,2,'original','original' FROM unnest($1::bigint[]) id",[USER_IDS]);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){const result={};for(const table of ['users','territory_war_v3_rounds','territory_war_v3_users','territory_war_v3_rewards','inventory_items','cnine_user_inventory','coin_logs','inventory_logs','admin_logs','app_meta'])result[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows;return result;}

test('credits the fixed 87-person winner roster once with exact BIGINT amounts, including unclaimed, low-attack and unaffiliated winners',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),receipt=await grantTerritoryWinnerExtra(client),after=await snapshot(db);
  assert.equal(receipt.recipientCount,87);assert.equal(receipt.totalCoin,'2610000000000');assert.equal(receipt.totalStars,'17400000');
  assert.deepEqual(receipt.userIds,USER_IDS);
  for(const row of after.users){const original=before.users.find(user=>user.id===row.id),winner=USER_IDS.includes(Number(row.id));assert.equal(BigInt(row.coin),BigInt(original.coin)+(winner?BigInt(COIN_PER_USER):0n));assert.deepEqual({...row,coin:original.coin},original);}
  for(const id of USER_IDS){const original=before.cnine_user_inventory.find(row=>Number(row.user_id)===id&&row.item_code==='MASTER_STAR'),afterStar=after.cnine_user_inventory.find(row=>Number(row.user_id)===id&&row.item_code==='MASTER_STAR');assert.equal(BigInt(afterStar.quantity),BigInt(original?.quantity??0)+BigInt(STARS_PER_USER));assert.equal(BigInt(afterStar.unseen_quantity),BigInt(original?.unseen_quantity??0)+BigInt(STARS_PER_USER));}
  const untouched=row=>!USER_IDS.includes(Number(row.user_id))||row.item_code!=='MASTER_STAR';
  assert.deepEqual(after.cnine_user_inventory.filter(untouched),before.cnine_user_inventory.filter(untouched));
  for(const table of ['territory_war_v3_rounds','territory_war_v3_users','territory_war_v3_rewards','inventory_items'])assert.deepEqual(after[table],before[table]);
  assert.equal(after.coin_logs.length,87);assert.equal(after.inventory_logs.length,87);assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta.length,1);
  assert.equal((await grantTerritoryWinnerExtra(client)).replayed,true);assert.deepEqual(await snapshot(db),after);
 }finally{await db.close();}
});

test('partial inventory credit, ledger, audit or final receipt failure rolls both currencies and all records back',async()=>{
 for(const fault of [
  "CREATE FUNCTION skip_one_star() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id=8 THEN RETURN NULL; END IF; RETURN NEW; END; $$; CREATE TRIGGER skip_one BEFORE INSERT ON cnine_user_inventory FOR EACH ROW EXECUTE FUNCTION skip_one_star();",
  'ALTER TABLE inventory_logs ADD CONSTRAINT forced_failure CHECK(change_amount<0)',
  'ALTER TABLE admin_logs ADD CONSTRAINT forced_failure CHECK(admin_id<0)',
  "ALTER TABLE app_meta ADD CONSTRAINT forced_failure CHECK(key='not-the-grant')"
 ]){const {db,client}=await fixture();try{await db.exec(fault);const before=await snapshot(db);await assert.rejects(grantTerritoryWinnerExtra(client));assert.deepEqual(await snapshot(db),before);}finally{await db.close();}}
});

test('changed result, roster or inactive star catalog refuses the operation without a partial payment',async()=>{
 for(const change of ["UPDATE territory_war_v3_rounds SET winner_side='A' WHERE id=58","UPDATE territory_war_v3_users SET side='A' WHERE user_id=8","UPDATE inventory_items SET is_active=0 WHERE code='MASTER_STAR'"]){const {db,client}=await fixture();try{await db.exec(change);const before=await snapshot(db);await assert.rejects(grantTerritoryWinnerExtra(client));assert.deepEqual(await snapshot(db),before);}finally{await db.close();}}
});

test('lost commit response is recovered by the persisted receipt without crediting a second time',async()=>{
 const {db,client}=await fixture();try{
  let fail=true;
  const dropped={async query(sql,args=[]){const result=await client.query(sql,args);if(sql==='COMMIT'&&fail){fail=false;throw Error('commit response lost');}return result;}};
  await assert.rejects(grantTerritoryWinnerExtra(dropped),/commit response lost/);
  const after=await snapshot(db);assert.equal(after.app_meta[0].key,OPERATION_KEY);assert.equal(after.coin_logs.length,87);
  assert.equal((await grantTerritoryWinnerExtra(client)).replayed,true);assert.deepEqual(await snapshot(db),after);
 }finally{await db.close();}
});

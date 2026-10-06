import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {TARGETS,OPERATION_KEY,grantAttendanceGift,verifyAttendanceGift} from '../scripts/ops/attendance-top100-gift-20261006.mjs';

async function fixture() {
  const db=new PGlite();
  await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT DEFAULT 'USER',status TEXT DEFAULT 'ACTIVE',coin BIGINT DEFAULT 9012345678901,card_shards BIGINT DEFAULT 123,magic_crystals BIGINT DEFAULT 456,untouched TEXT DEFAULT 'preserved');
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active BIGINT);
    CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,untouched TEXT DEFAULT 'preserved',PRIMARY KEY(user_id,item_code));
    CREATE TABLE coin_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,admin_id BIGINT,created_at TEXT);
    CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT,created_at TEXT);
    CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1);
    INSERT INTO users(id,nickname,role) VALUES(1,'관리자','OWNER'),(999999,'명단 외 계정','USER');
    INSERT INTO cnine_user_inventory VALUES(999999,'MASTER_STAR',40,4,'original','original','preserved');`);
  await db.query(`INSERT INTO users(id,nickname,role)
    SELECT x.id,x.nickname,CASE WHEN x.id=83 THEN 'ADMIN' ELSE 'USER' END
    FROM jsonb_to_recordset($1::jsonb) AS x(id bigint,nickname text)`,[JSON.stringify(TARGETS.map(r=>({id:r.userId,nickname:r.nickname})))]);
  const ids=TARGETS.map(r=>r.userId);
  await db.query(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
    SELECT id,'MASTER_STAR',12345,345,'original','original' FROM unnest($1::bigint[]) id WHERE id%2=0`,[ids]);
  await db.query(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
    SELECT id,'OTHER_ITEM',30,2,'original','original' FROM unnest($1::bigint[]) id`,[ids]);
  return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db) {
  const out={};
  for(const table of ['users','inventory_items','cnine_user_inventory','coin_logs','inventory_logs','admin_logs','app_meta'])out[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows;
  return out;
}

test('fixed 100 recipients receive exact 5천억 and 500만 once; preview, unrelated accounts and items stay intact',async()=>{
  const f=await fixture();
  try {
    const before=await snapshot(f.db),preview=await grantAttendanceGift(f.client);
    assert.equal(preview.committed,false);assert.equal(preview.recipientCount,100);assert.deepEqual(await snapshot(f.db),before);
    const receipt=await grantAttendanceGift(f.client,{commit:true}),after=await snapshot(f.db),ids=new Set(TARGETS.map(r=>r.userId));
    assert.equal(receipt.totalCoin,'50000000000000');assert.equal(receipt.totalStars,'500000000');
    for(const row of after.users) {
      const old=before.users.find(u=>String(u.id)===String(row.id));
      assert.equal(BigInt(row.coin),BigInt(old.coin)+(ids.has(String(row.id))?500000000000n:0n));
      assert.deepEqual({...row,coin:old.coin},old);
    }
    for(const r of TARGETS) {
      const old=before.cnine_user_inventory.find(i=>String(i.user_id)===r.userId&&i.item_code==='MASTER_STAR');
      const held=after.cnine_user_inventory.find(i=>String(i.user_id)===r.userId&&i.item_code==='MASTER_STAR');
      assert.equal(BigInt(held.quantity),BigInt(old?.quantity??0)+5000000n);
      assert.equal(BigInt(held.unseen_quantity),BigInt(old?.unseen_quantity??0)+5000000n);
      assert.equal(held.untouched,'preserved');if(old)assert.equal(held.created_at,old.created_at);
    }
    const untouched=r=>!ids.has(String(r.user_id))||r.item_code!=='MASTER_STAR';
    assert.deepEqual(after.cnine_user_inventory.filter(untouched),before.cnine_user_inventory.filter(untouched));
    assert.equal(after.coin_logs.length,100);assert.equal(after.inventory_logs.length,100);assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta[0].key,OPERATION_KEY);
    assert.equal((await verifyAttendanceGift(f.client)).recipientCount,100);
    assert.equal((await grantAttendanceGift(f.client,{commit:true})).replayed,true);assert.deepEqual(await snapshot(f.db),after);
  } finally {await f.db.close();}
});

test('star ledger or final receipt failure rolls back all 100 grants and a clean retry pays once',async()=>{
  for(const table of ['inventory_logs','app_meta']) {
    const f=await fixture();
    try {
      await f.db.exec(table==='inventory_logs'?'ALTER TABLE inventory_logs ADD CONSTRAINT forced_failure CHECK(change_amount<0)':"ALTER TABLE app_meta ADD CONSTRAINT forced_failure CHECK(key='wrong-key')");
      const before=await snapshot(f.db);
      await assert.rejects(grantAttendanceGift(f.client,{commit:true}));assert.deepEqual(await snapshot(f.db),before);
      await f.db.exec(`ALTER TABLE ${table} DROP CONSTRAINT forced_failure`);
      assert.equal((await grantAttendanceGift(f.client,{commit:true})).recipientCount,100);
    } finally {await f.db.close();}
  }
});

test('lost commit response followed by normal spending still replays original receipt without a second grant',async()=>{
  const f=await fixture();
  try {
    const lost={async query(sql,args=[]){const result=await f.client.query(sql,args);if(sql==='COMMIT')throw Error('commit response lost');return result;}};
    await assert.rejects(grantAttendanceGift(lost,{commit:true}),/commit response lost/);
    const id=TARGETS[0].userId;
    await f.db.query('UPDATE users SET coin=coin-10 WHERE id=$1',[id]);
    await f.db.query("UPDATE cnine_user_inventory SET quantity=quantity-2 WHERE user_id=$1 AND item_code='MASTER_STAR'",[id]);
    const spent=await snapshot(f.db);
    assert.equal((await grantAttendanceGift(f.client,{commit:true})).replayed,true);assert.deepEqual(await snapshot(f.db),spent);
    assert.equal((await verifyAttendanceGift(f.client)).recipientCount,100);
  } finally {await f.db.close();}
});

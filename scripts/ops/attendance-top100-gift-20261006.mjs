// One-time direct grant for the exact TOP 100 shown to the user. No runtime hook.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const OPERATION_KEY = 'ops:attendance-top100-gift:20261006:v1';
export const COIN_PER_USER = '500000000000';
export const STARS_PER_USER = '5000000';
export const REASON = '누적 출석 TOP 100 보상 · 20261006';
export const REFERENCE_TYPE = 'ATTENDANCE_TOP100_GRANT';
export const RECIPIENT_HASH = 'c4fc44872e818d1476ec13d91361d41ed9918db292153071454445af6bb8bafe';
const manifest = JSON.parse(readFileSync(new URL('./attendance-top100-gift-20261006.targets.json', import.meta.url), 'utf8'));
assert.equal(createHash('sha256').update(JSON.stringify(manifest.recipients)).digest('hex'), RECIPIENT_HASH, 'Reviewed roster changed');
export const TARGETS = Object.freeze(manifest.recipients.map(r => Object.freeze({...r})).sort((a,b) => Number(a.userId)-Number(b.userId)));
const ids = TARGETS.map(r => r.userId);
assert.equal(ids.length, 100); assert.equal(new Set(ids).size, 100);
const sortedIds = (rows, field='user_id') => rows.map(r => String(r[field])).sort((a,b) => Number(a)-Number(b));
const safeAmount = (amount, increase) => assert.ok(BigInt(amount ?? 0)>=0n && BigInt(amount ?? 0)+BigInt(increase)<=BigInt(Number.MAX_SAFE_INTEGER), 'Balance outside exact supported range');
const walletSql = 'SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id';
const inventorySql = "SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR' ORDER BY user_id";

export async function verifyAttendanceGift(client, receipt) {
  if (!receipt) {
    const saved = (await client.query('SELECT value FROM app_meta WHERE key=$1', [OPERATION_KEY])).rows[0];
    assert.ok(saved, 'Completion receipt missing'); receipt = JSON.parse(saved.value);
  }
  assert.equal(receipt.status, 'COMPLETED'); assert.equal(receipt.operationKey, OPERATION_KEY);
  assert.equal(receipt.recipientHash, RECIPIENT_HASH); assert.equal(receipt.recipientCount, 100);
  assert.equal(receipt.coinPerUser, COIN_PER_USER); assert.equal(receipt.starsPerUser, STARS_PER_USER);
  assert.equal(receipt.totalCoin, '50000000000000'); assert.equal(receipt.totalStars, '500000000');
  assert.deepEqual(receipt.recipients.map(r => r.userId), ids);
  assert.deepEqual(receipt.recipients.map(r => r.nickname), TARGETS.map(r => r.nickname));
  const coins = (await client.query('SELECT id,user_id,change_amount,balance_after,reason FROM coin_logs WHERE id=ANY($1::bigint[]) ORDER BY user_id', [receipt.recipients.map(r => r.coinLogId)])).rows;
  const stars = (await client.query('SELECT id,user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id FROM inventory_logs WHERE id=ANY($1::bigint[]) ORDER BY user_id', [receipt.recipients.map(r => r.starLogId)])).rows;
  assert.deepEqual(sortedIds(coins), ids); assert.deepEqual(sortedIds(stars), ids);
  for (let i=0; i<ids.length; i++) {
    const r=receipt.recipients[i], coin=coins[i], star=stars[i];
    assert.equal(String(coin.change_amount), COIN_PER_USER); assert.equal(String(coin.balance_after), r.coinAfter); assert.equal(coin.reason, REASON);
    assert.equal(BigInt(r.coinAfter)-BigInt(r.coinBefore), BigInt(COIN_PER_USER));
    assert.equal(star.item_code, 'MASTER_STAR'); assert.equal(String(star.change_amount), STARS_PER_USER); assert.equal(String(star.balance_after), r.starsAfter);
    assert.equal(BigInt(r.starsAfter)-BigInt(r.starsBefore), BigInt(STARS_PER_USER));
    assert.equal(BigInt(r.unseenAfter)-BigInt(r.unseenBefore), BigInt(STARS_PER_USER));
    assert.equal(star.reason, REASON); assert.equal(star.reference_type, REFERENCE_TYPE); assert.equal(star.reference_id, OPERATION_KEY);
  }
  const audit = (await client.query('SELECT action_type,target_id FROM admin_logs WHERE id=$1', [receipt.adminLogId])).rows[0];
  assert.equal(audit?.action_type, 'OPS_ATTENDANCE_TOP100_GRANT'); assert.equal(audit.target_id, OPERATION_KEY);
  return {status:'VERIFIED',recipientCount:100,coinLogs:coins.length,starLogs:stars.length,coinPerUser:COIN_PER_USER,starsPerUser:STARS_PER_USER,totalCoin:receipt.totalCoin,totalStars:receipt.totalStars,adminLogId:receipt.adminLogId,completedAt:receipt.completedAt};
}

export async function grantAttendanceGift(client, {commit=false}={}) {
  const q = async (sql,args=[]) => (await client.query(sql,args)).rows;
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='5s'"); await client.query("SET LOCAL statement_timeout='20s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [OPERATION_KEY]);
    const [saved] = await q('SELECT value FROM app_meta WHERE key=$1', [OPERATION_KEY]);
    if (saved) {
      const receipt=JSON.parse(saved.value), verification=await verifyAttendanceGift(client,receipt);
      await client.query('ROLLBACK'); return {...receipt,verification,replayed:true};
    }
    const [item] = await q("SELECT code,name,is_active FROM inventory_items WHERE code='MASTER_STAR' FOR SHARE");
    assert.ok(item?.name==='마스터의 별' && Number(item.is_active)===1, 'Master Star catalog changed');
    const [owner] = await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");
    assert.ok(owner, 'Owner audit identity missing');
    const wallets = await q(walletSql+' FOR UPDATE', [ids]);
    assert.deepEqual(sortedIds(wallets,'id'), ids, 'Missing target account');
    assert.deepEqual(wallets.map(r => r.nickname), TARGETS.map(r => r.nickname), 'Target nickname changed');
    assert.ok(wallets.every(r => r.status==='ACTIVE'), 'Target account inactive');
    const inventory = await q(inventorySql+' FOR UPDATE', [ids]);
    const oldStars = new Map(inventory.map(r => [String(r.user_id),r]));
    for (const wallet of wallets) {
      const held=oldStars.get(String(wallet.id));
      safeAmount(wallet.coin,COIN_PER_USER); safeAmount(held?.quantity,STARS_PER_USER); safeAmount(held?.unseen_quantity,STARS_PER_USER);
    }
    const now=new Date().toISOString();
    const coinLogs = await q(`WITH credited AS (
      UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id,coin
    ) INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at)
      SELECT id,$2::bigint,coin,$3,$4,$5 FROM credited RETURNING id,user_id,change_amount,balance_after`, [ids,COIN_PER_USER,REASON,owner.id,now]);
    assert.deepEqual(sortedIds(coinLogs),ids,'Partial coin credit or ledger write');
    const starLogs = await q(`WITH credited AS (
      INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      SELECT id,'MASTER_STAR',$2::bigint,$2::bigint,$3,$3 FROM unnest($1::bigint[]) AS id ORDER BY id
      ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
      unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at RETURNING user_id,quantity
    ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
      SELECT user_id,'MASTER_STAR',$2::bigint,quantity,$4,$5,$6,$7,$3 FROM credited RETURNING id,user_id,change_amount,balance_after`, [ids,STARS_PER_USER,now,REASON,REFERENCE_TYPE,OPERATION_KEY,owner.id]);
    assert.deepEqual(sortedIds(starLogs),ids,'Partial star credit or ledger write');
    const afterWallets=await q(walletSql,[ids]), afterInventory=await q(inventorySql,[ids]);
    assert.deepEqual(sortedIds(afterWallets,'id'),ids); assert.deepEqual(sortedIds(afterInventory),ids);
    const coins=new Map(coinLogs.map(r=>[String(r.user_id),r])), stars=new Map(starLogs.map(r=>[String(r.user_id),r]));
    const recipients=wallets.map((wallet,i)=>{
      const id=String(wallet.id), after=afterWallets[i], previous=oldStars.get(id), itemAfter=afterInventory[i], coin=coins.get(id), star=stars.get(id);
      assert.equal(BigInt(after.coin),BigInt(wallet.coin)+BigInt(COIN_PER_USER));
      assert.deepEqual({...after,coin:wallet.coin},wallet,'Unrelated account fields changed');
      assert.equal(BigInt(itemAfter.quantity),BigInt(previous?.quantity??0)+BigInt(STARS_PER_USER));
      assert.equal(BigInt(itemAfter.unseen_quantity),BigInt(previous?.unseen_quantity??0)+BigInt(STARS_PER_USER));
      if(previous) assert.deepEqual({...itemAfter,quantity:previous.quantity,unseen_quantity:previous.unseen_quantity,updated_at:previous.updated_at},previous,'Unrelated inventory fields changed');
      assert.equal(String(coin.change_amount),COIN_PER_USER); assert.equal(String(coin.balance_after),String(after.coin));
      assert.equal(String(star.change_amount),STARS_PER_USER); assert.equal(String(star.balance_after),String(itemAfter.quantity));
      return {userId:id,nickname:wallet.nickname,attendanceDays:TARGETS[i].attendanceDays,position:TARGETS[i].position,coinBefore:String(wallet.coin),coinAfter:String(after.coin),starsBefore:String(previous?.quantity??0),starsAfter:String(itemAfter.quantity),unseenBefore:String(previous?.unseen_quantity??0),unseenAfter:String(itemAfter.unseen_quantity),coinLogId:String(coin.id),starLogId:String(star.id)};
    });
    const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,delivery:'DIRECT',snapshotAtKst:manifest.asOfKst,recipientCount:100,recipientHash:RECIPIENT_HASH,coinPerUser:COIN_PER_USER,starsPerUser:STARS_PER_USER,totalCoin:String(100n*BigInt(COIN_PER_USER)),totalStars:String(100n*BigInt(STARS_PER_USER)),recipients,completedAt:now};
    const audit=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
      VALUES($1,'OPS_ATTENDANCE_TOP100_GRANT','ATTENDANCE_TOP100',$2,$3,$4,$5) RETURNING id`, [owner.id,OPERATION_KEY,JSON.stringify({snapshotAtKst:manifest.asOfKst,recipientHash:RECIPIENT_HASH,priorOperation:null}),JSON.stringify({...receipt,authorization:'해당 인원들에 5천억 코인,500만 마별 지급해; TOP 100 전체 100명'}),now]);
    assert.equal(audit.length,1,'Audit record missing'); receipt.adminLogId=String(audit[0].id);
    const written=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key', [OPERATION_KEY,JSON.stringify(receipt),now]);
    assert.equal(written.length,1,'Completion receipt missing');
    const verification=await verifyAttendanceGift(client,receipt);
    await client.query(commit?'COMMIT':'ROLLBACK');
    return {...receipt,verification,committed:commit,replayed:false};
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{}); throw error;
  }
}

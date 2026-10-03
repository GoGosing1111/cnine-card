import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:four-user-coin-stars:20261003:v1';
export const COIN_EACH='1000000000000';
export const TARGETS=Object.freeze([
 {userId:'4235',nickname:'도댕',stars:'30000000'},
 {userId:'4540',nickname:'지아영',stars:'10000000'},
 {userId:'4598',nickname:'암살자..',stars:'30000000'},
 {userId:'4757',nickname:'음주플레이어',stars:'10000000'}
]);
export const RECIPIENT_HASH=createHash('sha256').update(JSON.stringify({targets:TARGETS,coinEach:COIN_EACH})).digest('hex');
const REASON='암살자·도댕·지아영·음주플레이어 지정 지급 (2026-10-03)';
const ACTION='OPS_FOUR_USER_COIN_STARS_GRANT',REFERENCE='OPS_NAMED_COIN_STARS';
const ids=TARGETS.map(t=>t.userId),q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const walletSql='SELECT id::text id,nickname,status,coin::text coin,card_shards::text card_shards,magic_crystals::text magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id';
const inventorySql="SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR' ORDER BY user_id";
const safe=(value,delta)=>assert.ok(BigInt(value??0)>=0n&&BigInt(value??0)+BigInt(delta)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsupported resulting balance');

export async function inspectFourRewards(client){
 const wallets=await q(client,walletSql,[ids]);assert.deepEqual(wallets.map(w=>w.id),ids);
 for(const t of TARGETS){const w=wallets.find(w=>w.id===t.userId);assert.equal(w.nickname,t.nickname);assert.equal(w.status,'ACTIVE');}
 const names=await q(client,'SELECT nickname,COUNT(*)::int count FROM users WHERE nickname=ANY($1::text[]) GROUP BY nickname',[TARGETS.map(t=>t.nickname)]);
 assert.equal(names.length,4);assert.ok(names.every(n=>n.count===1),'Ambiguous target nickname');
 const inventory=await q(client,inventorySql,[ids]);
 const [item]=await q(client,"SELECT code,name,is_active FROM inventory_items WHERE code='MASTER_STAR'");assert.equal(item?.name,'마스터의 별');assert.equal(Number(item.is_active),1);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 const receipt=saved?parse(saved.value):null;
 // The atomic completion receipt supplies exact ledger IDs; avoid history scans.
 const coinLogs=receipt?await q(client,'SELECT id::text id FROM coin_logs WHERE id=ANY($1::bigint[])',[receipt.recipients.map(r=>r.coinLogId)]):[];
 const starLogs=receipt?await q(client,'SELECT id::text id FROM inventory_logs WHERE id=ANY($1::bigint[])',[receipt.recipients.map(r=>r.starLogId)]):[];
 return {operationKey:OPERATION_KEY,recipientHash:RECIPIENT_HASH,targets:TARGETS,coinEach:COIN_EACH,totalCoin:'4000000000000',totalStars:'80000000',wallets,inventory,coinLogs,starLogs,receipt};
}

export async function verifyFourRewards(client,receipt){
 if(!receipt){const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved);receipt=parse(saved.value);}
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.recipientHash,RECIPIENT_HASH);assert.equal(receipt.delivery,'DIRECT');
 assert.equal(receipt.coinEach,COIN_EACH);assert.equal(receipt.totalCoin,'4000000000000');assert.equal(receipt.totalStars,'80000000');assert.equal(receipt.recipientCount,4);
 assert.deepEqual(receipt.recipients.map(r=>({userId:r.userId,nickname:r.nickname,stars:r.starsGranted})),TARGETS);
 const coinLogs=await q(client,'SELECT id::text id,user_id::text user_id,change_amount::text amount,balance_after::text balance_after,reason FROM coin_logs WHERE id=ANY($1::bigint[]) ORDER BY user_id',[receipt.recipients.map(r=>r.coinLogId)]);
 const starLogs=await q(client,'SELECT id::text id,user_id::text user_id,item_code,change_amount::text amount,balance_after::text balance_after,reason,reference_type,reference_id FROM inventory_logs WHERE id=ANY($1::bigint[]) ORDER BY user_id',[receipt.recipients.map(r=>r.starLogId)]);
 assert.deepEqual(coinLogs.map(r=>r.user_id),ids);assert.deepEqual(starLogs.map(r=>r.user_id),ids);
 for(let i=0;i<4;i++){
  const r=receipt.recipients[i],coin=coinLogs[i],star=starLogs[i];
  assert.equal(coin.id,r.coinLogId);assert.equal(coin.reason,REASON);assert.equal(coin.amount,COIN_EACH);assert.equal(coin.balance_after,r.coinAfter);assert.equal(BigInt(r.coinAfter)-BigInt(r.coinBefore),BigInt(COIN_EACH));
  assert.equal(star.id,r.starLogId);assert.equal(star.item_code,'MASTER_STAR');assert.equal(star.amount,r.starsGranted);assert.equal(star.balance_after,r.starsAfter);assert.equal(star.reason,REASON);assert.equal(star.reference_type,REFERENCE);assert.equal(star.reference_id,OPERATION_KEY);
  assert.equal(BigInt(r.starsAfter)-BigInt(r.starsBefore),BigInt(r.starsGranted));assert.equal(BigInt(r.unseenAfter)-BigInt(r.unseenBefore),BigInt(r.starsGranted));
 }
 const [audit]=await q(client,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]);assert.equal(audit?.action_type,ACTION);assert.equal(audit.target_id,OPERATION_KEY);
 const {adminLogId,...audited}=receipt;assert.deepEqual(parse(audit.after_data),audited);
 return {status:'VERIFIED',recipients:4,coinLogs:4,starLogs:4,totalCoin:receipt.totalCoin,totalStars:receipt.totalStars,duplicates:0,adminLogId};
}

// The caller also holds the existing per-user gameplay leases for these four accounts.
export async function grantFourRewards(client,{expectedRecipientHash,commit=false,failAfterCoins=false,leaseDeadline}={}){
 assert.equal(expectedRecipientHash,RECIPIENT_HASH);assert.ok(Number.isFinite(leaseDeadline)&&Date.now()<leaseDeadline-5000,'Active gameplay leases required');
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='15s'");
  await q(client,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=parse(saved.value),verification=await verifyFourRewards(client,receipt);await client.query('ROLLBACK');return {receipt,verification,replayed:true};}
  await q(client,walletSql+' FOR UPDATE',[ids]);await q(client,inventorySql+' FOR UPDATE',[ids]);
  const before=await inspectFourRewards(client);assert.equal(before.coinLogs.length,0);assert.equal(before.starLogs.length,0);
  const [owner]=await q(client,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
  for(const t of TARGETS){const w=before.wallets.find(w=>w.id===t.userId),s=before.inventory.find(s=>String(s.user_id)===t.userId);safe(w.coin,COIN_EACH);safe(s?.quantity,t.stars);safe(s?.unseen_quantity,t.stars);}
  const now=new Date().toISOString();
  const coinLogs=await q(client,`WITH credited AS (
   UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id,coin
  ) INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at)
   SELECT id,$2::bigint,coin,$3,$4,$5 FROM credited RETURNING id::text id,user_id::text user_id`,[ids,COIN_EACH,REASON,owner.id,now]);
  assert.equal(coinLogs.length,4);if(failAfterCoins)throw Error('EXPECTED_PARTIAL_COIN_FAILURE');
  const starLogs=await q(client,`WITH credited AS (
   INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT id,'MASTER_STAR',amount,amount,$3,$3 FROM unnest($1::bigint[],$2::bigint[]) AS t(id,amount) ORDER BY id
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
   unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at RETURNING user_id,quantity
  ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   SELECT c.user_id,'MASTER_STAR',t.amount,c.quantity,$4,$5,$6,$7,$3 FROM credited c JOIN unnest($1::bigint[],$2::bigint[]) AS t(id,amount) ON t.id=c.user_id
   RETURNING id::text id,user_id::text user_id`,[ids,TARGETS.map(t=>t.stars),now,REASON,REFERENCE,OPERATION_KEY,owner.id]);assert.equal(starLogs.length,4);
  const afterWallets=await q(client,walletSql,[ids]),afterInventory=await q(client,inventorySql,[ids]);
  assert.deepEqual(afterWallets.map(w=>w.id),ids);assert.deepEqual(afterInventory.map(s=>String(s.user_id)),ids);
  const recipients=TARGETS.map(t=>{
   const w=before.wallets.find(w=>w.id===t.userId),a=afterWallets.find(w=>w.id===t.userId),s=before.inventory.find(s=>String(s.user_id)===t.userId),b=afterInventory.find(s=>String(s.user_id)===t.userId);
   assert.equal(BigInt(a.coin)-BigInt(w.coin),BigInt(COIN_EACH));assert.deepEqual({...a,coin:w.coin},w);
   assert.equal(BigInt(b.quantity)-BigInt(s?.quantity??0),BigInt(t.stars));assert.equal(BigInt(b.unseen_quantity)-BigInt(s?.unseen_quantity??0),BigInt(t.stars));
   if(s)assert.deepEqual({...b,quantity:s.quantity,unseen_quantity:s.unseen_quantity,updated_at:s.updated_at},s);
   return {userId:t.userId,nickname:t.nickname,coinGranted:COIN_EACH,starsGranted:t.stars,coinBefore:w.coin,coinAfter:a.coin,starsBefore:String(s?.quantity??0),starsAfter:String(b.quantity),unseenBefore:String(s?.unseen_quantity??0),unseenAfter:String(b.unseen_quantity),coinLogId:coinLogs.find(l=>l.user_id===t.userId).id,starLogId:starLogs.find(l=>l.user_id===t.userId).id};
  });
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,recipientHash:RECIPIENT_HASH,actor:'SYSTEM_OPS',delivery:'DIRECT',recipientCount:4,coinEach:COIN_EACH,totalCoin:'4000000000000',totalStars:'80000000',recipients,authorization:'암살자.. / 도댕 각 1조 코인 + 마별 3000만; 지아영 / 음주플레이어 각 1조 코인 + 마별 1000만 지급',completedAt:now};
  const [audit]=await q(client,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text id',[owner.id,ACTION,'USER_GROUP',OPERATION_KEY,JSON.stringify({existingCoinLogs:0,existingStarLogs:0}),JSON.stringify(receipt),now]);assert.ok(audit);receipt.adminLogId=audit.id;
  assert.equal((await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1);
  const verification=await verifyFourRewards(client,receipt);assert.ok(Date.now()<leaseDeadline-2000,'Gameplay lease expired before commit');
  await client.query(commit?'COMMIT':'ROLLBACK');return {receipt,verification,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

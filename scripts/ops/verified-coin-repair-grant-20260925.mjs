import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:verified-coin-500eok-repair:20260925:v1';
export const COIN_PER_USER='50000000000';
export const ITEM_CODE='PINGDU_REPAIR_COUPON';
export const ITEM_PER_USER='1';
export const REASON='2차 인증 유저 코인 500억·리페어권 1개 지급 · 20260925';
export const REFERENCE_TYPE='VERIFIED_COIN_REPAIR_GRANT';
const eligibility=`UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE'
 AND EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id)`;
const recipientsSql=`SELECT u.id::text id,UPPER(TRIM(COALESCE(u.role,'USER'))) role FROM users u WHERE ${eligibility} ORDER BY u.id LIMIT 10001`;
const safeMaximum=BigInt(Number.MAX_SAFE_INTEGER);
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const sortedIds=(rows,field='user_id')=>rows.map(row=>String(row[field])).sort((a,b)=>Number(a)-Number(b));
const summary=rows=>({recipientCount:rows.length,recipientHash:digest(rows),roles:rows.reduce((out,r)=>(out[r.role]=(out[r.role]||0)+1,out),{}),recipients:rows});
const exactAmount=(value,addition)=>{const n=BigInt(value??0);assert.ok(n>=0n&&n+BigInt(addition)<=safeMaximum,'Balance outside exact supported range');};

export async function inspectVerifiedCoinRepair(client){
 const recipients=(await client.query(recipientsSql)).rows;
 const item=(await client.query('SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE])).rows[0];
 const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
 return {...summary(recipients),item,coinPerUser:COIN_PER_USER,itemPerUser:ITEM_PER_USER,totalCoin:String(BigInt(recipients.length)*BigInt(COIN_PER_USER)),receipt:saved?JSON.parse(saved.value):null};
}

export async function verifyVerifiedCoinRepair(client,receipt){
 if(!receipt){
  const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];assert.ok(saved,'Completed receipt missing');receipt=JSON.parse(saved.value);
 }
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.coinPerUser,COIN_PER_USER);assert.equal(receipt.itemCode,ITEM_CODE);assert.equal(receipt.itemPerUser,ITEM_PER_USER);
 assert.equal(receipt.recipientCount,receipt.recipients.length);
 const roster=receipt.recipients.map(r=>({id:String(r.userId),role:r.role}));
 assert.equal(receipt.recipientHash,digest(roster));
 const ids=roster.map(r=>r.id);assert.equal(new Set(ids).size,ids.length);
 const coins=(await client.query('SELECT id,user_id,change_amount,balance_after,reason FROM coin_logs WHERE id=ANY($1::bigint[]) ORDER BY user_id',[receipt.recipients.map(r=>r.coinLogId)])).rows;
 const items=(await client.query('SELECT id,user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id FROM inventory_logs WHERE id=ANY($1::bigint[]) ORDER BY user_id',[receipt.recipients.map(r=>r.itemLogId)])).rows;
 assert.deepEqual(sortedIds(coins),ids);assert.deepEqual(sortedIds(items),ids);
 for(let i=0;i<ids.length;i++){
  const before=receipt.recipients[i],coin=coins[i],item=items[i];
  assert.equal(String(coin.change_amount),COIN_PER_USER);assert.equal(String(coin.balance_after),before.coinAfter);assert.equal(coin.reason,REASON);
  assert.equal(BigInt(before.coinAfter)-BigInt(before.coinBefore),BigInt(COIN_PER_USER));
  assert.equal(item.item_code,ITEM_CODE);assert.equal(String(item.change_amount),ITEM_PER_USER);assert.equal(String(item.balance_after),before.itemAfter);
  assert.equal(BigInt(before.itemAfter)-BigInt(before.itemBefore),1n);assert.equal(BigInt(before.unseenAfter)-BigInt(before.unseenBefore),1n);
  assert.equal(item.reason,REASON);assert.equal(item.reference_type,REFERENCE_TYPE);assert.equal(item.reference_id,OPERATION_KEY);
 }
 const audit=(await client.query('SELECT id,action_type,target_id FROM admin_logs WHERE id=$1',[receipt.auditId])).rows[0];
 assert.equal(audit?.action_type,'OPS_VERIFIED_COIN_REPAIR_GRANT');assert.equal(audit.target_id,OPERATION_KEY);
 return {status:'VERIFIED',recipientCount:ids.length,coinLogs:coins.length,itemLogs:items.length,coinPerUser:COIN_PER_USER,itemCode:ITEM_CODE,itemPerUser:ITEM_PER_USER,totalCoin:receipt.totalCoin,totalItems:receipt.totalItems,duplicates:0,auditId:receipt.auditId,completedAt:receipt.completedAt};
}

// Explicit one-time direct credit. No messages, public routes, startup hooks or schema changes.
export async function grantVerifiedCoinRepair(client,{expectedRecipientHash,commit=false}={}){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Reviewed recipient hash required');
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){
   const receipt=JSON.parse(saved.value),verification=await verifyVerifiedCoinRepair(client,receipt);
   await client.query('ROLLBACK');return {...receipt,verification,replayed:true};
  }
  const roster=await q(recipientsSql+' FOR UPDATE OF u'),plan=summary(roster),ids=roster.map(r=>r.id);
  assert.ok(ids.length>0&&ids.length<=10000,'Recipient count outside reviewed operational bounds');
  assert.equal(plan.recipientHash,expectedRecipientHash,'Verified recipient list changed; inspect again');
  const verifications=await q('SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[ids]);
  assert.deepEqual(sortedIds(verifications),ids,'Secondary verification changed');
  const [item]=await q('SELECT code,name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE]);
  assert.ok(item?.name==='핑두 리페어 쿠폰'&&Number(item.is_active)===1,'Repair coupon catalog changed');
  const [owner]=await q("SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");
  assert.ok(owner,'Active owner audit identity missing');
  const wallets=await q('SELECT id,status,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
  assert.deepEqual(sortedIds(wallets,'id'),ids);
  const inventory=await q('SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id FOR UPDATE',[ids,ITEM_CODE]);
  const oldItems=new Map(inventory.map(row=>[String(row.user_id),row]));
  for(const wallet of wallets){const held=oldItems.get(String(wallet.id));exactAmount(wallet.coin,COIN_PER_USER);exactAmount(held?.quantity,ITEM_PER_USER);exactAmount(held?.unseen_quantity,ITEM_PER_USER);}
  const now=new Date().toISOString();
  const coinLogs=await q(`WITH credited AS (
   UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id,coin
  ) INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at)
   SELECT id,$2::bigint,coin,$3,$4,$5 FROM credited RETURNING id,user_id,change_amount,balance_after`,[ids,COIN_PER_USER,REASON,owner.id,now]);
  assert.deepEqual(sortedIds(coinLogs),ids,'Partial coin credit or ledger write');
  const itemLogs=await q(`WITH credited AS (
   INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT id,$2,$3::bigint,$3::bigint,$4,$4 FROM unnest($1::bigint[]) AS id ORDER BY id
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
   unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
   RETURNING user_id,quantity
  ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   SELECT user_id,$2,$3::bigint,quantity,$5,$6,$7,$8,$4 FROM credited RETURNING id,user_id,change_amount,balance_after`,[ids,ITEM_CODE,ITEM_PER_USER,now,REASON,REFERENCE_TYPE,OPERATION_KEY,owner.id]);
  assert.deepEqual(sortedIds(itemLogs),ids,'Partial repair credit or ledger write');
  const afterWallets=await q('SELECT id,status,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
  const afterInventory=await q('SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id',[ids,ITEM_CODE]);
  assert.deepEqual(sortedIds(afterWallets,'id'),ids);assert.deepEqual(sortedIds(afterInventory),ids);
  const coinLedger=new Map(coinLogs.map(r=>[String(r.user_id),r])),itemLedger=new Map(itemLogs.map(r=>[String(r.user_id),r]));
  const recipients=wallets.map((wallet,i)=>{
   const id=String(wallet.id),after=afterWallets[i],previous=oldItems.get(id),itemAfter=afterInventory[i];
   assert.equal(BigInt(after.coin),BigInt(wallet.coin)+BigInt(COIN_PER_USER));assert.deepEqual({...after,coin:wallet.coin},wallet,'Other wallet fields changed');
   assert.equal(BigInt(itemAfter.quantity),BigInt(previous?.quantity??0)+1n);assert.equal(BigInt(itemAfter.unseen_quantity),BigInt(previous?.unseen_quantity??0)+1n);
   if(previous)assert.deepEqual({...itemAfter,quantity:previous.quantity,unseen_quantity:previous.unseen_quantity,updated_at:previous.updated_at},previous,'Other inventory fields changed');
   const coinLog=coinLedger.get(id),itemLog=itemLedger.get(id);
   assert.equal(String(coinLog.change_amount),COIN_PER_USER);assert.equal(String(coinLog.balance_after),String(after.coin));
   assert.equal(String(itemLog.change_amount),ITEM_PER_USER);assert.equal(String(itemLog.balance_after),String(itemAfter.quantity));
   return {userId:id,role:roster[i].role,coinBefore:String(wallet.coin),coinAfter:String(after.coin),itemBefore:String(previous?.quantity??0),itemAfter:String(itemAfter.quantity),unseenBefore:String(previous?.unseen_quantity??0),unseenAfter:String(itemAfter.unseen_quantity),coinLogId:String(coinLog.id),itemLogId:String(itemLog.id)};
  });
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',delivery:'DIRECT',eligibility:'All ACTIVE secondary-verified accounts, all roles',recipientCount:ids.length,recipientHash:plan.recipientHash,roles:plan.roles,
   coinPerUser:COIN_PER_USER,itemCode:ITEM_CODE,itemPerUser:ITEM_PER_USER,totalCoin:String(BigInt(ids.length)*BigInt(COIN_PER_USER)),totalItems:String(ids.length),recipients,completedAt:now};
  const audit=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,'OPS_VERIFIED_COIN_REPAIR_GRANT','VERIFIED_USERS',$2,$3,$4,$5) RETURNING id`,[owner.id,OPERATION_KEY,JSON.stringify({recipientHash:plan.recipientHash,recipientCount:ids.length,priorOperation:null}),JSON.stringify({...receipt,authorization:'2차인증 유저 전원 코인 500억 리페어권 1개 지급해'}),now]);
  assert.equal(audit.length,1,'Audit record missing');receipt.auditId=String(audit[0].id);
  const written=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]);assert.equal(written.length,1,'Completion receipt missing');
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

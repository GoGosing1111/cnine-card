import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const ROUND_ID='68f4947a-af39-4be2-934b-191bb9df4594',OPERATION_KEY='ops:coup-participation20:20261019:v1';
export const RECIPIENT_HASH='c1c9da9ea814abc803b8ca11fdf29e600d9cfbd2081e5a33476e9f72f7f4068b';
export const COUNT=97,AMOUNT='600000000000',TOTAL='58200000000000',ITEM='MERCENARY_SSS_CARD_SHARD',ITEM_AMOUNT=2;
const ACTION='OPS_COUP_PARTICIPATION20_REWARDS',COIN_LOG_FLOOR='93553154',REASON='2026-10-19 쿠데타 · 출격 20회 이상 · 승패 무관 6,000억 코인·SSS 용병 카드 조각 2개';
const q=async(c,s,v=[])=>(await c.query(s,v)).rows;
const one=rows=>{assert.equal(rows.length,1);return rows[0];};
const hash=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>({userId:r.id,side:r.side,attacks:r.attacks})))).digest('hex');
export async function audience(c,{lock=false}={}){
 const round=one(await q(c,'SELECT id,status,winner,finished_at::text FROM coup_rounds_v2115 WHERE id=$1'+(lock?' FOR SHARE':''),[ROUND_ID]));
 assert.deepEqual(round,{id:ROUND_ID,status:'FINISHED',winner:'CHIEF',finished_at:'1792420063131'});
 const rows=await q(c,`SELECT p.user_id::text id,p.side,p.attacks::int attacks,u.nickname,u.status,u.role,u.coin::text coin,u.card_shards::text card_shards,u.magic_crystals::text magic_crystals,
  COALESCE(i.quantity,0)::text quantity,COALESCE(i.unseen_quantity,0)::text unseen_quantity,(i.user_id IS NOT NULL) has_inventory
  FROM coup_participants_v2115 p JOIN users u ON u.id=p.user_id LEFT JOIN cnine_user_inventory i ON i.user_id=p.user_id AND i.item_code=$2
  WHERE p.round_id=$1 AND p.attacks>=20 ORDER BY p.user_id`+(lock?' FOR UPDATE OF u FOR SHARE OF p':''),[ROUND_ID,ITEM]);
 assert.equal(rows.length,COUNT);assert.equal(hash(rows),RECIPIENT_HASH);assert.ok(rows.every(r=>r.status==='ACTIVE'));
 if(lock){
  const ids=rows.map(r=>r.id);
  await q(c,'SELECT user_id FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id FOR UPDATE',[ids,ITEM]);
  // Preserve the trigger's per-account locks across a rollback-to-savepoint test.
  // Otherwise a concurrent writer can take a sync row while our wallet rows remain locked.
  const sync=await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id::text FOR UPDATE',[ids]);assert.equal(sync.length,COUNT,'Account sync rows must already exist');
 }
 return {round,rows};
}
export async function savedReceipt(c){const [row]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);return row?JSON.parse(row.value):null;}
export async function artifacts(c){return {
 receipts:await q(c,'SELECT key FROM app_meta WHERE key=$1',[OPERATION_KEY]),
 audits:await q(c,'SELECT id::text FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]),
 coins:await q(c,'SELECT id::text FROM coin_logs WHERE id>$1::bigint AND reason=$2',[COIN_LOG_FLOOR,REASON]),
 items:await q(c,"SELECT id::text FROM inventory_logs WHERE item_code=$1 AND reason=$2 AND reference_type='SYSTEM_GRANT' AND reference_id=$3",[ITEM,REASON,OPERATION_KEY])
};}
export async function verify(c,r,{exact=false}={}){
 assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.status,'COMPLETED');assert.equal(r.roundId,ROUND_ID);assert.equal(r.recipientHash,RECIPIENT_HASH);assert.equal(r.amountEach,AMOUNT);assert.equal(r.totalCoin,TOTAL);assert.equal(r.itemCode,ITEM);assert.equal(r.itemEach,2);assert.equal(r.totalItems,194);assert.equal(r.recipients.length,COUNT);
 assert.equal(hash(r.recipients.map(x=>({id:x.userId,side:x.side,attacks:x.attacks}))),RECIPIENT_HASH);
 const coins=await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs l WHERE id=ANY($1::bigint[]) ORDER BY l.user_id',[r.recipients.map(x=>x.coinLogId)]);
 const items=await q(c,"SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reference_id,reference_type,admin_id::text FROM inventory_logs l WHERE item_code=$1 AND reason=$2 AND reference_type='SYSTEM_GRANT' AND reference_id=$3 ORDER BY l.user_id",[ITEM,REASON,OPERATION_KEY]);
 assert.equal(coins.length,COUNT);assert.equal(items.length,COUNT);
 for(const [i,row]of r.recipients.entries()){
  const coin=coins[i],item=items[i];assert.equal(coin.user_id,row.userId);assert.equal(coin.id,row.coinLogId);assert.equal(coin.change_amount,AMOUNT);assert.equal(coin.balance_after,row.coinAfter);assert.equal(coin.reason,REASON);assert.equal(coin.admin_id,r.adminId);
  assert.equal(item.user_id,row.userId);assert.equal(item.id,row.itemLogId);assert.equal(item.item_code,ITEM);assert.equal(item.change_amount,'2');assert.equal(item.balance_after,row.quantityAfter);assert.equal(item.reference_id,OPERATION_KEY);assert.equal(item.reference_type,'SYSTEM_GRANT');assert.equal(item.admin_id,r.adminId);
  assert.equal(BigInt(row.coinAfter)-BigInt(row.coinBefore),BigInt(AMOUNT));assert.equal(BigInt(row.quantityAfter)-BigInt(row.quantityBefore),2n);assert.equal(BigInt(row.unseenAfter)-BigInt(row.unseenBefore),2n);
 }
 const audit=one(await q(c,'SELECT id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]));assert.equal(audit.id,r.auditId);const {auditId,...payload}=r;assert.deepEqual(JSON.parse(audit.after_data),payload);
 const found=await artifacts(c);assert.equal(found.receipts.length,1);assert.equal(found.audits.length,1);assert.equal(found.coins.length,COUNT);assert.equal(found.items.length,COUNT);
 if(exact){const {rows}=await audience(c);for(const [i,row]of r.recipients.entries()){assert.equal(rows[i].coin,row.coinAfter);assert.equal(rows[i].quantity,row.quantityAfter);assert.equal(rows[i].unseen_quantity,row.unseenAfter);}}
 return {status:'VERIFIED',recipientCount:COUNT,chiefRecipients:r.recipients.filter(x=>x.side==='CHIEF').length,rebelRecipients:r.recipients.filter(x=>x.side==='REBEL').length,coinPerUser:AMOUNT,totalCoin:TOTAL,itemCode:ITEM,itemPerUser:2,totalItems:194,coinLogs:COUNT,inventoryLogs:COUNT,auditRecords:1,completionReceipts:1,duplicates:0,missing:0,auditId:r.auditId,completedAt:r.completedAt};
}
// Caller owns the transaction and live USER_LOCK + database leases for every recipient.
export async function grant(c,expectedHash,{leaseToken,lockDeadline}={}){
 assert.equal(expectedHash,RECIPIENT_HASH,'Reviewed recipient hash required');assert.match(String(leaseToken||''),/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+20000);
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const saved=await savedReceipt(c);if(saved)return {receipt:saved,replayed:true,verification:await verify(c,saved)};
 const identity=one(await q(c,'SELECT current_database() db,pg_is_in_recovery() replica'));assert.equal(identity.db,'cnine');assert.equal(identity.replica,false);
 const before=await audience(c,{lock:true}),ids=before.rows.map(x=>x.id);
 const leases=await q(c,'SELECT user_id::text FROM user_mutation_locks_v1520 l WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4 ORDER BY l.user_id',[ids,leaseToken,OPERATION_KEY,Date.now()+15000]);assert.deepEqual(leases.map(x=>x.user_id),ids,'Missing live account leases');
 for(const rows of Object.values(await artifacts(c)))assert.equal(rows.length,0,'Partial reward requires reconciliation');
 const mismatches=await q(c,'SELECT p.user_id FROM coup_participants_v2115 p LEFT JOIN (SELECT user_id,COUNT(*) n FROM coup_attacks_v2115 WHERE round_id=$1 GROUP BY user_id) a ON a.user_id=p.user_id WHERE p.round_id=$1 AND p.attacks<>COALESCE(a.n,0)',[ROUND_ID]);assert.equal(mismatches.length,0);
 const item=one(await q(c,'SELECT code,name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM]));assert.equal(item.name,'SSS 용병 카드 조각');assert.equal(Number(item.is_active),1);
 const owner=one(await q(c,"SELECT id::text FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 for(const row of before.rows){const coin=BigInt(row.coin);assert.ok(coin>=-BigInt(Number.MAX_SAFE_INTEGER)&&coin+BigInt(AMOUNT)<=BigInt(Number.MAX_SAFE_INTEGER));for(const key of ['quantity','unseen_quantity'])assert.ok(BigInt(row[key])>=0n&&BigInt(row[key])+2n<=BigInt(Number.MAX_SAFE_INTEGER));}
 const now=new Date().toISOString();
 const coins=await q(c,`WITH credited AS (UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id,coin)
  INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at) SELECT id,$2::bigint,coin,$3,$4,$5 FROM credited RETURNING id::text,user_id::text,balance_after::text`,[ids,AMOUNT,REASON,owner.id,now]);assert.equal(coins.length,COUNT);
 const inventory=await q(c,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
  SELECT id,$2,2,2,$3,$3 FROM unnest($1::bigint[]) id ORDER BY id
  ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
  RETURNING user_id::text,quantity::text,unseen_quantity::text`,[ids,ITEM,now]);assert.equal(inventory.length,COUNT);
 const items=await q(c,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
  SELECT user_id,item_code,2,quantity,$3,'SYSTEM_GRANT',$4,$5,$6 FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2
  RETURNING id::text,user_id::text,balance_after::text`,[ids,ITEM,REASON,OPERATION_KEY,owner.id,now]);assert.equal(items.length,COUNT);
 const after=await audience(c);
 const recipients=before.rows.map((row,i)=>{
  const expected={...row,coin:(BigInt(row.coin)+BigInt(AMOUNT)).toString(),quantity:(BigInt(row.quantity)+2n).toString(),unseen_quantity:(BigInt(row.unseen_quantity)+2n).toString(),has_inventory:true};assert.deepEqual(after.rows[i],expected);
  const coin=one(coins.filter(x=>x.user_id===row.id)),item=one(items.filter(x=>x.user_id===row.id));
  return {userId:row.id,nickname:row.nickname,side:row.side,attacks:row.attacks,coinBefore:row.coin,coinAfter:expected.coin,coinLogId:coin.id,quantityBefore:row.quantity,quantityAfter:expected.quantity,unseenBefore:row.unseen_quantity,unseenAfter:expected.unseen_quantity,itemLogId:item.id};
 });
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,roundId:ROUND_ID,recipientHash:RECIPIENT_HASH,recipientCount:COUNT,amountEach:AMOUNT,totalCoin:TOTAL,itemCode:ITEM,itemName:item.name,itemEach:2,totalItems:194,delivery:'DIRECT',eligibility:'Completed sorties >= 20, both sides, all win/loss/draw outcomes',adminId:owner.id,recipients,completedAt:now};
 const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,$2,'COUP_PARTICIPANTS',$3,$4,$5,$6) RETURNING id::text",[owner.id,ACTION,OPERATION_KEY,JSON.stringify({roundId:ROUND_ID,recipientHash:RECIPIENT_HASH,recipientCount:COUNT}),JSON.stringify(receipt),now]));receipt.auditId=audit.id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
 const verification=await verify(c,receipt,{exact:true});assert.ok(lockDeadline>Date.now()+5000,'Account leases expiring before commit');return {receipt,replayed:false,verification};
}

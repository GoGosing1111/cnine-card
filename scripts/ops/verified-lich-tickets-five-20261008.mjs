import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:verified-lich-tickets-five:20261008:v1';
export const ITEM_CODE='LICH_KING_ENTRY_TICKET',ITEM_NAME='리치왕 정벌 입장권',AMOUNT=5;
export const REASON='2차 인증 유저 전체 정벌 입장권 5개 지급 · 20261008';
const REFERENCE_TYPE='OPS_VERIFIED_LICH_TICKETS';
const recipientsSql=`SELECT u.id::text id,UPPER(TRIM(COALESCE(u.role,'USER'))) role FROM users u
 WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE'
 AND EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id) ORDER BY u.id LIMIT 10001`;
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const sortedIds=(rows,field='user_id')=>rows.map(r=>String(r[field])).sort((a,b)=>Number(a)-Number(b));
const qFor=client=>async(sql,args=[])=>(await client.query(sql,args)).rows;
const summary=recipients=>({recipientCount:recipients.length,recipientHash:digest(recipients),recipients,roles:recipients.reduce((a,r)=>(a[r.role]=(a[r.role]||0)+1,a),{})});
const inventorySql='SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id';

export async function inspectVerifiedLichTickets(client){
 const q=qFor(client),recipients=await q(recipientsSql);
 assert.ok(recipients.length<=10000,'Recipient count exceeds operational limit');
 const [item]=await q('SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE]);
 const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 const excluded=await q(`SELECT UPPER(TRIM(COALESCE(u.status,'ACTIVE'))) status,COUNT(*)::int count
  FROM users u WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))<>'ACTIVE'
  AND EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id) GROUP BY 1 ORDER BY 1`);
 return {operationKey:OPERATION_KEY,itemCode:ITEM_CODE,itemName:ITEM_NAME,amountEach:AMOUNT,...summary(recipients),
  totalItems:recipients.length*AMOUNT,item,excludedInactive:excluded,receipt:prior?JSON.parse(prior.value):null};
}

export async function verifyVerifiedLichTickets(client,receipt){
 const q=qFor(client);
 if(!receipt){const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(prior,'Completed receipt missing');receipt=JSON.parse(prior.value);}
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.itemCode,ITEM_CODE);assert.equal(receipt.amountEach,AMOUNT);assert.equal(receipt.delivery,'DIRECT');
 assert.equal(receipt.recipientCount,receipt.recipients.length);assert.equal(receipt.totalItems,receipt.recipientCount*AMOUNT);
 const roster=receipt.recipients.map(r=>({id:r.userId,role:r.role})),ids=roster.map(r=>r.id);
 assert.equal(receipt.recipientHash,digest(roster));assert.equal(new Set(ids).size,ids.length);
 const logs=await q('SELECT id,user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id FROM inventory_logs WHERE id=ANY($1::bigint[]) ORDER BY user_id',[receipt.recipients.map(r=>r.logId)]);
 assert.deepEqual(sortedIds(logs),ids,'Missing or duplicate inventory ledger');
 for(let i=0;i<logs.length;i++){
  const log=logs[i],r=receipt.recipients[i];
  assert.equal(log.item_code,ITEM_CODE);assert.equal(Number(log.change_amount),AMOUNT);assert.equal(String(log.balance_after),r.quantityAfter);
  assert.equal(BigInt(r.quantityAfter)-BigInt(r.quantityBefore),BigInt(AMOUNT));assert.equal(BigInt(r.unseenAfter)-BigInt(r.unseenBefore),BigInt(AMOUNT));
  assert.equal(log.reason,REASON);assert.equal(log.reference_type,REFERENCE_TYPE);assert.equal(log.reference_id,OPERATION_KEY);
 }
 const [audit]=await q('SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
 assert.equal(audit?.action_type,REFERENCE_TYPE);assert.equal(audit.target_id,OPERATION_KEY);
 const {auditId,...details}=receipt;assert.deepEqual(JSON.parse(audit.after_data),details,'Audit differs from receipt');
 return {status:'VERIFIED',operationKey:OPERATION_KEY,delivery:'DIRECT',recipientCount:ids.length,roles:receipt.roles,itemCode:ITEM_CODE,itemName:ITEM_NAME,amountEach:AMOUNT,totalItems:receipt.totalItems,inventoryLogs:logs.length,duplicates:0,auditId:receipt.auditId,completedAt:receipt.completedAt};
}

// Explicit one-time grant; the entire recipient list, +5 items, ledgers and receipt
// commit together. Verification reads immutable ledgers after tickets are spent.
export async function grantVerifiedLichTickets(client,{expectedRecipientHash,commit=false}={}){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Inspected recipient hash required');
 const q=qFor(client);
 // Ordered user/inventory row locks and verification share locks stabilize the
 // inspected recipients without snapshot conflicts from unrelated live play.
 await client.query('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){const receipt=JSON.parse(prior.value),verification=await verifyVerifiedLichTickets(client,receipt);await client.query('ROLLBACK');return {...receipt,verification,committed:false,replayed:true};}
  const roster=await q(recipientsSql+' FOR UPDATE OF u'),plan=summary(roster),ids=roster.map(r=>r.id);
  assert.ok(ids.length>0&&ids.length<=10000,'Recipient count outside operational bounds');
  assert.equal(plan.recipientHash,expectedRecipientHash,'Verified recipient list changed; inspect again');
  const verifications=await q('SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[ids]);
  assert.deepEqual(sortedIds(verifications),ids,'Secondary verification changed');
  const [item]=await q('SELECT code,name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE]);
  assert.equal(item?.name,ITEM_NAME);assert.equal(Number(item.is_active),1,'Active item required');
  const [owner]=await q("SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Audit owner missing');
  const walletsSql='SELECT id,status,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id';
  const walletsBefore=await q(walletsSql,[ids]);
  const inventoryBefore=await q(inventorySql+' FOR UPDATE',[ids,ITEM_CODE]),beforeMap=new Map(inventoryBefore.map(r=>[String(r.user_id),r]));
  for(const row of inventoryBefore)for(const field of ['quantity','unseen_quantity'])assert.ok(BigInt(row[field])>=0n&&BigInt(row[field])+BigInt(AMOUNT)<=BigInt(Number.MAX_SAFE_INTEGER),'Inventory quantity outside safe range');
  const at=new Date().toISOString();
  const logs=await q(`WITH credited AS (
   INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT id,$2,$3::bigint,$3::bigint,$4,$4 FROM unnest($1::bigint[]) AS id ORDER BY id
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
    unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
   RETURNING user_id,quantity
  ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   SELECT user_id,$2,$3::bigint,quantity,$5,$6,$7,$8,$4 FROM credited RETURNING id,user_id,change_amount,balance_after`,
   [ids,ITEM_CODE,AMOUNT,at,REASON,REFERENCE_TYPE,OPERATION_KEY,owner.id]);
  assert.deepEqual(sortedIds(logs),ids,'Partial inventory grant or missing ledger');
  const after=await q(inventorySql,[ids,ITEM_CODE]);assert.deepEqual(sortedIds(after),ids,'Missing inventory after grant');
  assert.deepEqual(await q(walletsSql,[ids]),walletsBefore,'Unrequested currency change');
  const ledger=new Map(logs.map(r=>[String(r.user_id),r]));
  const recipients=after.map((row,i)=>{
   const id=String(row.user_id),before=beforeMap.get(id),log=ledger.get(id);
   assert.equal(BigInt(row.quantity),BigInt(before?.quantity??0)+BigInt(AMOUNT));
   assert.equal(BigInt(row.unseen_quantity),BigInt(before?.unseen_quantity??0)+BigInt(AMOUNT));
   if(before)assert.deepEqual({...row,quantity:before.quantity,unseen_quantity:before.unseen_quantity,updated_at:before.updated_at},before,'Unrequested inventory field changed');
   assert.equal(Number(log.change_amount),AMOUNT);assert.equal(String(log.balance_after),String(row.quantity));
   return {userId:id,role:roster[i].role,quantityBefore:String(before?.quantity??0),quantityAfter:String(row.quantity),unseenBefore:String(before?.unseen_quantity??0),unseenAfter:String(row.unseen_quantity),logId:String(log.id)};
  });
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',delivery:'DIRECT',authorization:'2차인증 유저 전체 정벌 입장권 5개씩 지급',
   eligibility:'All ACTIVE secondary-verified accounts, all roles and verification providers',recipientCount:ids.length,recipientHash:plan.recipientHash,roles:plan.roles,
   itemCode:ITEM_CODE,itemName:ITEM_NAME,amountEach:AMOUNT,totalItems:ids.length*AMOUNT,recipients,completedAt:at};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
   [owner.id,REFERENCE_TYPE,'VERIFIED_USERS',OPERATION_KEY,JSON.stringify({recipientHash:plan.recipientHash,recipientCount:ids.length}),JSON.stringify(receipt),at]);
  assert.ok(audit,'Audit missing');receipt.auditId=String(audit.id);
  const written=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),at]);assert.equal(written.length,1,'Receipt missing');
  const verification=await verifyVerifiedLichTickets(client,receipt);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,verification,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

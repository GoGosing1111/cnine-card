import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:verified-lich-tickets-10-bus30:20261012:v1';
export const ITEM_CODE='LICH_KING_ENTRY_TICKET',ITEM_NAME='리치왕 정벌 입장권',TITLE_CODE='RAID_BUS_DRIVER';
export const BASE_AMOUNT=10,BUS_AMOUNT=30;
export const REASON='2차 인증 유저 리치왕 공대 생성권 지급 · 버스기사 착용 30개 / 그 외 10개 · 20261012';
const REFERENCE_TYPE='OPS_VERIFIED_LICH_TICKETS';
const recipientsSql=`SELECT u.id::text id,UPPER(TRIM(COALESCE(u.role,'USER'))) role,
 CASE WHEN EXISTS(SELECT 1 FROM user_title_loadout l
  JOIN character_titles t ON t.id=l.title_id AND t.code='RAID_BUS_DRIVER' AND t.is_active=1
  JOIN user_character_titles o ON o.user_id=l.user_id AND o.title_id=l.title_id
   AND (o.expires_at IS NULL OR o.expires_at::timestamptz>CURRENT_TIMESTAMP)
  WHERE l.user_id=u.id) THEN 30 ELSE 10 END amount
 FROM users u WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE'
 AND EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id) ORDER BY u.id LIMIT 10001`;
const qFor=client=>async(sql,args=[])=>(await client.query(sql,args)).rows;
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const idsOf=rows=>rows.map(r=>String(r.user_id)).sort((a,b)=>Number(a)-Number(b));
const summarize=rows=>({recipientHash:digest(rows),recipientCount:rows.length,
 baseRecipients:rows.filter(r=>r.amount===BASE_AMOUNT).length,busDriverRecipients:rows.filter(r=>r.amount===BUS_AMOUNT).length,
 totalItems:rows.reduce((n,r)=>n+r.amount,0),roles:rows.reduce((a,r)=>(a[r.role]=(a[r.role]||0)+1,a),{})});
const inventorySql='SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id';
// Match the deployed inventory ledger index prefix. The production ledger has
// tens of millions of rows; reference_id alone would cause a full-table scan.
const ledgerSql='SELECT id,user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id FROM inventory_logs WHERE item_code=$1 AND reason=$2 AND reference_type=$3 AND reference_id=$4 ORDER BY user_id,id';
const ledgerArgs=[ITEM_CODE,REASON,REFERENCE_TYPE,OPERATION_KEY];

export async function inspectVerifiedLichTickets(client){
 const q=qFor(client),recipients=await q(recipientsSql);assert.ok(recipients.length<=10000,'Recipient limit exceeded');
 const [item]=await q('SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE]);
 const [title]=await q('SELECT id,code,name,is_active FROM character_titles WHERE code=$1',[TITLE_CODE]);
 const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 const excludedInactive=await q(`SELECT UPPER(TRIM(COALESCE(u.status,'ACTIVE'))) status,COUNT(*)::int count FROM users u
  WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))<>'ACTIVE' AND EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id) GROUP BY 1 ORDER BY 1`);
 return {operationKey:OPERATION_KEY,itemCode:ITEM_CODE,itemName:ITEM_NAME,item,title,...summarize(recipients),recipients,excludedInactive,receipt:prior?JSON.parse(prior.value):null};
}

export async function verifyVerifiedLichTickets(client,receipt){
 const q=qFor(client);
 if(!receipt){const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(prior,'Completed receipt missing');receipt=JSON.parse(prior.value);}
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.itemCode,ITEM_CODE);assert.equal(receipt.delivery,'DIRECT');
 const roster=receipt.recipients.map(r=>({id:r.userId,role:r.role,amount:r.amount})),ids=roster.map(r=>r.id),summary=summarize(roster);
 assert.ok(roster.every(r=>[BASE_AMOUNT,BUS_AMOUNT].includes(r.amount)));assert.equal(new Set(ids).size,ids.length);
 for(const key of Object.keys(summary))assert.deepEqual(receipt[key],summary[key],key);
 const logs=await q(ledgerSql,ledgerArgs);
 assert.deepEqual(idsOf(logs),ids,'Missing or duplicate inventory ledger');
 for(let i=0;i<logs.length;i++){
  const log=logs[i],r=receipt.recipients[i];
  assert.equal(String(log.id),r.logId);assert.equal(log.item_code,ITEM_CODE);assert.equal(Number(log.change_amount),r.amount);
  assert.equal(String(log.balance_after),r.quantityAfter);assert.equal(log.reason,REASON);
  assert.equal(BigInt(r.quantityAfter)-BigInt(r.quantityBefore),BigInt(r.amount));assert.equal(BigInt(r.unseenAfter)-BigInt(r.unseenBefore),BigInt(r.amount));
 }
 const [audit]=await q('SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
 assert.equal(audit?.action_type,REFERENCE_TYPE);assert.equal(audit.target_id,OPERATION_KEY);
 const {auditId,...details}=receipt;assert.deepEqual(JSON.parse(audit.after_data),details,'Audit differs from receipt');
 return {status:'VERIFIED',operationKey:OPERATION_KEY,delivery:'DIRECT',...summary,itemCode:ITEM_CODE,itemName:ITEM_NAME,
  baseAmount:BASE_AMOUNT,busDriverAmount:BUS_AMOUNT,inventoryLogs:logs.length,missing:0,duplicates:0,auditId:receipt.auditId,completedAt:receipt.completedAt};
}

// One-shot, additive inventory credit. Membership and amounts are frozen in the
// receipt; later title switches, verification or spending cannot repeat this grant.
export async function grantVerifiedLichTickets(client,{expectedRecipientHash,commit=false}={}){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Inspected recipient hash required');
 const q=qFor(client);await client.query('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");await q("SET LOCAL TIME ZONE 'UTC'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){const receipt=JSON.parse(prior.value),verification=await verifyVerifiedLichTickets(client,receipt);await client.query('ROLLBACK');return {receipt,verification,committed:false,replayed:true};}
  assert.equal((await q(ledgerSql,ledgerArgs)).length,0,'Orphan grant ledger exists');
  const roster=await q(recipientsSql+' FOR UPDATE OF u'),ids=roster.map(r=>r.id);
  assert.ok(ids.length>0&&ids.length<=10000,'Recipient count outside operational bounds');
  assert.equal(digest(roster),expectedRecipientHash,'Verified recipient list or equipped title changed; inspect again');
  const verifications=await q('SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[ids]);
  assert.deepEqual(idsOf(verifications),ids,'Secondary verification changed');
  const [title]=await q('SELECT id,code,name,is_active FROM character_titles WHERE code=$1 FOR SHARE',[TITLE_CODE]);
  assert.equal(title?.name,'버스기사');assert.equal(Number(title.is_active),1,'Active bus-driver title required');
  await q('SELECT user_id,title_id FROM user_title_loadout WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[ids]);
  await q('SELECT user_id,title_id FROM user_character_titles WHERE user_id=ANY($1::bigint[]) AND title_id=$2 ORDER BY user_id FOR SHARE',[ids,title.id]);
  assert.deepEqual(await q(recipientsSql),roster,'Recipient or title changed while locking');
  const at=(await q('SELECT CURRENT_TIMESTAMP AS at'))[0].at;
  const eligibilityAsOf=at instanceof Date?at.toISOString():new Date(at).toISOString();
  const [item]=await q('SELECT code,name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE]);
  assert.equal(item?.name,ITEM_NAME);assert.equal(Number(item.is_active),1,'Active item required');
  const [owner]=await q("SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Audit owner missing');
  const walletsSql='SELECT id,status,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id';
  const walletsBefore=await q(walletsSql,[ids]),amounts=roster.map(r=>r.amount),amountMap=new Map(roster.map(r=>[r.id,r.amount]));
  const before=await q(inventorySql+' FOR UPDATE',[ids,ITEM_CODE]),beforeMap=new Map(before.map(r=>[String(r.user_id),r]));
  for(const row of before)for(const key of ['quantity','unseen_quantity'])assert.ok(BigInt(row[key])>=0n&&BigInt(row[key])+BigInt(amountMap.get(String(row.user_id)))<=BigInt(Number.MAX_SAFE_INTEGER),'Inventory quantity outside safe range');
  const writtenAt=new Date().toISOString();
  const logs=await q(`WITH allocations AS (SELECT * FROM unnest($1::bigint[],$3::bigint[]) AS a(user_id,amount)),credited AS (
   INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT user_id,$2,amount,amount,$4,$4 FROM allocations ORDER BY user_id
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
    unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
   RETURNING user_id,quantity
  ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   SELECT c.user_id,$2,a.amount,c.quantity,$5,$6,$7,$8,$4 FROM credited c JOIN allocations a USING(user_id)
   RETURNING id,user_id,change_amount,balance_after`,[ids,ITEM_CODE,amounts,writtenAt,REASON,REFERENCE_TYPE,OPERATION_KEY,owner.id]);
  assert.deepEqual(idsOf(logs),ids,'Partial inventory grant or missing ledger');
  const after=await q(inventorySql,[ids,ITEM_CODE]);assert.deepEqual(idsOf(after),ids,'Missing inventory after grant');
  assert.deepEqual(await q(walletsSql,[ids]),walletsBefore,'Unrequested currency change');
  const ledger=new Map(logs.map(r=>[String(r.user_id),r]));
  const recipients=after.map((row,i)=>{
   const userId=String(row.user_id),old=beforeMap.get(userId),log=ledger.get(userId),amount=amounts[i];
   assert.equal(BigInt(row.quantity),BigInt(old?.quantity??0)+BigInt(amount));assert.equal(BigInt(row.unseen_quantity),BigInt(old?.unseen_quantity??0)+BigInt(amount));
   if(old)assert.deepEqual({...row,quantity:old.quantity,unseen_quantity:old.unseen_quantity,updated_at:old.updated_at},old,'Unrequested inventory field changed');
   assert.equal(Number(log.change_amount),amount);assert.equal(String(log.balance_after),String(row.quantity));
   return {userId,role:roster[i].role,amount,quantityBefore:String(old?.quantity??0),quantityAfter:String(row.quantity),unseenBefore:String(old?.unseen_quantity??0),unseenAfter:String(row.unseen_quantity),logId:String(log.id)};
  });
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',delivery:'DIRECT',authorization:'2차인증 유저 리치왕 공대 생성권 10개지급, 버스기사 칭호 착용 유저는 30개지급',
   eligibility:'ACTIVE secondary-verified accounts, all roles/providers; valid equipped RAID_BUS_DRIVER gets 30 total, all other eligible users get 10.',
   eligibilityAsOf,...summarize(roster),itemCode:ITEM_CODE,itemName:ITEM_NAME,baseAmount:BASE_AMOUNT,busDriverAmount:BUS_AMOUNT,recipients,completedAt:writtenAt};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
   [owner.id,REFERENCE_TYPE,'VERIFIED_USERS',OPERATION_KEY,JSON.stringify({recipientHash:expectedRecipientHash,recipientCount:ids.length}),JSON.stringify(receipt),writtenAt]);
  assert.ok(audit,'Audit missing');receipt.auditId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),writtenAt])).length,1,'Receipt missing');
  const verification=await verifyVerifiedLichTickets(client,receipt);
  await client.query(commit?'COMMIT':'ROLLBACK');return {receipt,verification,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

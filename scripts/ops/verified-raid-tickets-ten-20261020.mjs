import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:verified-raid-tickets-ten:20261020:v1';
export const AMOUNT=10;
// Display names changed; these are the existing item IDs consumed by each raid.
export const ITEMS=[
 {code:'LICH_KING_ENTRY_TICKET',name:'이스겐 정벌 입장권',catalogName:'리치왕 정벌 입장권'},
 {code:'MADARA_RAID_ENTRY_TICKET',name:'바르센 레이드 입장권',catalogName:'마다라 레이드 입장권'}
];
export const REASON='2차 인증 전체 유저 이스겐 정벌·바르센 레이드 입장권 각 10개 지급 · 20261020';
export const REFERENCE_TYPE='OPS_VERIFIED_RAID_TICKETS';
const codes=ITEMS.map(item=>item.code);
const recipientsSql=`SELECT u.id::text id,UPPER(TRIM(COALESCE(u.role,'USER'))) role FROM users u
 WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE'
 AND EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id) ORDER BY u.id LIMIT 10001`;
const inventorySql='SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=ANY($2::text[]) ORDER BY user_id,item_code';
const ledgerSql='SELECT id,user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id FROM inventory_logs WHERE item_code=ANY($1::text[]) AND reason=$2 AND reference_type=$3 AND reference_id=$4 ORDER BY user_id,item_code';
const ledgerArgs=[codes,REASON,REFERENCE_TYPE,OPERATION_KEY];
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const qFor=client=>async(sql,args=[])=>(await client.query(sql,args)).rows;
const key=(userId,code)=>`${userId}:${code}`;
const sortedIds=rows=>rows.map(r=>String(r.user_id)).sort((a,b)=>Number(a)-Number(b));
const rowKeys=rows=>rows.map(r=>key(r.user_id,r.item_code)).sort();
const expectedKeys=ids=>ids.flatMap(id=>codes.map(code=>key(id,code))).sort();
const countBy=(rows,field)=>rows.reduce((a,r)=>(a[r[field]]=(a[r[field]]||0)+1,a),{});
const summary=recipients=>({recipientCount:recipients.length,recipientHash:digest(recipients),recipients,roles:countBy(recipients,'role')});

export async function inspectVerifiedRaidTickets(client){
 const q=qFor(client),recipients=await q(recipientsSql);
 assert.ok(recipients.length<=10000,'Recipient count exceeds operational limit');
 const items=await q('SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code',[codes]);
 const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 const excludedInactive=await q(`SELECT UPPER(TRIM(COALESCE(u.status,'ACTIVE'))) status,COUNT(*)::int count
  FROM users u WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))<>'ACTIVE'
  AND EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id) GROUP BY 1 ORDER BY 1`);
 const verifications=await q('SELECT user_id,provider FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[recipients.map(r=>r.id)]);
 return {operationKey:OPERATION_KEY,amountEach:AMOUNT,...summary(recipients),items,
  totalPerItem:recipients.length*AMOUNT,totalItems:recipients.length*AMOUNT*ITEMS.length,
  providerCounts:countBy(verifications,'provider'),excludedInactive,receipt:prior?JSON.parse(prior.value):null};
}

export async function verifyVerifiedRaidTickets(client,receipt){
 const q=qFor(client);
 if(!receipt){
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  assert.ok(prior,'Completed receipt missing');receipt=JSON.parse(prior.value);
 }
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.delivery,'DIRECT');assert.equal(receipt.amountEach,AMOUNT);
 assert.deepEqual(receipt.items,ITEMS.map(({code,name})=>({code,name})));
 assert.equal(receipt.recipientCount,receipt.recipients.length);
 assert.ok(receipt.recipientCount>0&&receipt.recipientCount<=10000);
 assert.equal(receipt.totalPerItem,receipt.recipientCount*AMOUNT);
 assert.equal(receipt.totalItems,receipt.totalPerItem*ITEMS.length);
 const roster=receipt.recipients.map(r=>({id:r.userId,role:r.role})),ids=roster.map(r=>r.id);
 assert.equal(receipt.recipientHash,digest(roster));assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual(receipt.roles,countBy(roster,'role'));
 const logs=await q(ledgerSql,ledgerArgs);
 assert.deepEqual(rowKeys(logs),expectedKeys(ids),'Missing or duplicate inventory ledger');
 const logMap=new Map(logs.map(log=>[key(log.user_id,log.item_code),log]));
 for(const recipient of receipt.recipients){
  assert.deepEqual(recipient.items.map(item=>item.code),codes);
  for(const item of recipient.items){
   const log=logMap.get(key(recipient.userId,item.code));
   assert.equal(String(log.id),item.logId);assert.equal(Number(log.change_amount),AMOUNT);
   assert.equal(String(log.balance_after),item.quantityAfter);
   assert.equal(BigInt(item.quantityAfter)-BigInt(item.quantityBefore),BigInt(AMOUNT));
   assert.equal(BigInt(item.unseenAfter)-BigInt(item.unseenBefore),BigInt(AMOUNT));
   assert.equal(log.reason,REASON);assert.equal(log.reference_type,REFERENCE_TYPE);assert.equal(log.reference_id,OPERATION_KEY);
  }
 }
 const [audit]=await q('SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
 assert.equal(audit?.action_type,REFERENCE_TYPE);assert.equal(audit.target_id,OPERATION_KEY);
 const {auditId,...details}=receipt;assert.deepEqual(JSON.parse(audit.after_data),details,'Audit differs from receipt');
 return {status:'VERIFIED',operationKey:OPERATION_KEY,delivery:'DIRECT',recipientCount:ids.length,roles:receipt.roles,
  providerCounts:receipt.providerCounts,items:receipt.items,amountEach:AMOUNT,totalPerItem:receipt.totalPerItem,
  totalItems:receipt.totalItems,inventoryLogs:logs.length,missing:0,duplicates:0,auditId:receipt.auditId,completedAt:receipt.completedAt};
}

// Both item grants, ledgers, audit and receipt commit together. Post-commit
// verification uses immutable ledgers so normal spending never triggers a retry.
export async function grantVerifiedRaidTickets(client,{expectedRecipientHash,commit=false}={}){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Inspected recipient hash required');
 const q=qFor(client);
 await client.query('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){
   const receipt=JSON.parse(prior.value),verification=await verifyVerifiedRaidTickets(client,receipt);
   await client.query('ROLLBACK');return {...receipt,verification,committed:false,replayed:true};
  }
  const existing=await q(ledgerSql+' LIMIT 1',ledgerArgs);
  assert.equal(existing.length,0,'Existing grant without receipt requires reconciliation');
  const roster=await q(recipientsSql+' FOR UPDATE OF u'),plan=summary(roster),ids=roster.map(r=>r.id);
  assert.ok(ids.length>0&&ids.length<=10000,'Recipient count outside operational bounds');
  assert.equal(plan.recipientHash,expectedRecipientHash,'Verified recipient list changed; inspect again');
  const verifications=await q('SELECT user_id,provider FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[ids]);
  assert.deepEqual(sortedIds(verifications),ids,'Secondary verification changed');
  const items=await q('SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[codes]);
  assert.equal(items.length,ITEMS.length,'Both raid items required');
  for(let i=0;i<ITEMS.length;i++){
   assert.equal(items[i].code,ITEMS[i].code);assert.equal(items[i].name,ITEMS[i].catalogName);
   assert.equal(Number(items[i].is_active),1,'Active item required');
  }
  const [owner]=await q("SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");
  assert.ok(owner,'Audit owner missing');
  const walletsSql='SELECT id,status,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id';
  const walletsBefore=await q(walletsSql,[ids]);
  const inventoryBefore=await q(inventorySql+' FOR UPDATE',[ids,codes]);
  const beforeMap=new Map(inventoryBefore.map(row=>[key(row.user_id,row.item_code),row]));
  for(const row of inventoryBefore)for(const field of ['quantity','unseen_quantity']){
   assert.ok(BigInt(row[field])>=0n&&BigInt(row[field])+BigInt(AMOUNT)<=BigInt(Number.MAX_SAFE_INTEGER),'Inventory quantity outside safe range');
  }
  const at=new Date().toISOString();
  const logs=await q(`WITH credited AS (
   INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT u.id,i.code,$3::bigint,$3::bigint,$4,$4
   FROM unnest($1::bigint[]) AS u(id) CROSS JOIN unnest($2::text[]) AS i(code) ORDER BY u.id,i.code
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
    unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
   RETURNING user_id,item_code,quantity
  ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   SELECT user_id,item_code,$3::bigint,quantity,$5,$6,$7,$8,$4 FROM credited
   RETURNING id,user_id,item_code,change_amount,balance_after`,
   [ids,codes,AMOUNT,at,REASON,REFERENCE_TYPE,OPERATION_KEY,owner.id]);
  assert.deepEqual(rowKeys(logs),expectedKeys(ids),'Partial inventory grant or missing ledger');
  const after=await q(inventorySql,[ids,codes]);
  assert.deepEqual(rowKeys(after),expectedKeys(ids),'Missing inventory after grant');
  assert.deepEqual(await q(walletsSql,[ids]),walletsBefore,'Unrequested currency change');
  const afterMap=new Map(after.map(row=>[key(row.user_id,row.item_code),row]));
  const ledger=new Map(logs.map(row=>[key(row.user_id,row.item_code),row]));
  const recipients=roster.map(user=>({
   userId:user.id,role:user.role,items:ITEMS.map(item=>{
    const rowKey=key(user.id,item.code),before=beforeMap.get(rowKey),row=afterMap.get(rowKey),log=ledger.get(rowKey);
    assert.equal(BigInt(row.quantity),BigInt(before?.quantity??0)+BigInt(AMOUNT));
    assert.equal(BigInt(row.unseen_quantity),BigInt(before?.unseen_quantity??0)+BigInt(AMOUNT));
    if(before)assert.deepEqual({...row,quantity:before.quantity,unseen_quantity:before.unseen_quantity,updated_at:before.updated_at},before,'Unrequested inventory field changed');
    assert.equal(Number(log.change_amount),AMOUNT);assert.equal(String(log.balance_after),String(row.quantity));
    return {code:item.code,quantityBefore:String(before?.quantity??0),quantityAfter:String(row.quantity),
     unseenBefore:String(before?.unseen_quantity??0),unseenAfter:String(row.unseen_quantity),logId:String(log.id)};
   })
  }));
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',delivery:'DIRECT',
   authorization:'2차인증 전체유저 이스겐정벌,바르센 레이드 입장권 10개씩 지급해',
   eligibility:'All ACTIVE secondary-verified accounts, all roles and verification providers',
   recipientCount:ids.length,recipientHash:plan.recipientHash,roles:plan.roles,providerCounts:countBy(verifications,'provider'),
   items:ITEMS.map(({code,name})=>({code,name})),amountEach:AMOUNT,totalPerItem:ids.length*AMOUNT,
   totalItems:ids.length*AMOUNT*ITEMS.length,recipients,completedAt:at};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
   [owner.id,REFERENCE_TYPE,'VERIFIED_USERS',OPERATION_KEY,JSON.stringify({recipientHash:plan.recipientHash,recipientCount:ids.length}),JSON.stringify(receipt),at]);
  assert.ok(audit,'Audit missing');receipt.auditId=String(audit.id);
  const written=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),at]);
  assert.equal(written.length,1,'Receipt missing');
  const verification=await verifyVerifiedRaidTickets(client,receipt);
  await client.query(commit?'COMMIT':'ROLLBACK');
  return {...receipt,verification,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

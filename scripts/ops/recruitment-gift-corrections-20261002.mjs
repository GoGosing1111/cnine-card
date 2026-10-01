import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './recruitment-gift-corrections-20261002.targets.json' with {type:'json'};

export const KEY=plan.operationKey,ITEM_CODE=plan.itemCode,ROOMS=plan.rooms;
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
export const TARGETS=[...new Map(ROOMS.flatMap(room=>room.targets).map(target=>[target.userId,target])).values()].sort((a,b)=>a.userId-b.userId);
export const LOCK_TARGETS=TARGETS.filter(target=>ROOMS.some(room=>room.targets.some(row=>row.userId===target.userId&&row.expectedOutcome==='CORRECTION_PENDING')));
const ids=TARGETS.map(row=>row.userId),q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const markerKey=(campaign,userId)=>'ops:recruitment-gift-campaign:'+campaign+':user:'+userId+':v1';
const allMarkerKeys=ROOMS.flatMap(room=>room.targets.map(target=>markerKey(room.campaign,target.userId)));
const balance=row=>({quantity:String(row?.quantity??0),unseenQuantity:String(row?.unseen_quantity??0)});
assert.equal(TARGETS.length,69);assert.equal(LOCK_TARGETS.length,42);assert.equal(allMarkerKeys.length,109);assert.equal(plan.amountPerCampaign,1);
const knownSystemReferences=new Set(plan.reviewedGrants.filter(row=>row.referenceType==='SYSTEM_GRANT').map(row=>row.referenceId));

export async function readEligibility(client){
 const receipts=await q(client,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[ROOMS.map(room=>room.originalOperationKey)]);
 assert.equal(receipts.length,2,'Original completion receipts missing');
 const grants=await q(client,`SELECT l.id,l.user_id,l.change_amount,l.reference_type,l.reference_id,j.kind AS joint_kind,j.status AS joint_status,j.plan_json AS joint_plan
  FROM inventory_logs l LEFT JOIN joint_operations_v1 j ON j.request_id=l.reference_id AND j.user_id=l.user_id
  WHERE l.user_id=ANY($1::bigint[]) AND l.item_code=$2 AND l.change_amount>0 ORDER BY l.user_id,l.id`,[ids,ITEM_CODE]);
 const audits=await q(client,"SELECT id,admin_id,target_id,after_data FROM admin_logs WHERE action_type='RECRUITMENT_GIFT_GRANT' AND target_id=ANY($1::text[])",[ids.map(String)]);
 const pending=await q(client,"SELECT request_id,user_id FROM joint_operations_v1 WHERE user_id=ANY($1::bigint[]) AND kind='RECRUITMENT_GIFT_GRANT' AND status='PENDING'",[LOCK_TARGETS.map(row=>row.userId)]);
 assert.equal(pending.length,0,'Pending manual grants need resolution before correction');
 const messages=await q(client,'SELECT user_id,message_id FROM user_message_rewards WHERE user_id=ANY($1::bigint[]) AND reward_type=$2',[LOCK_TARGETS.map(row=>row.userId),ITEM_CODE]);
 assert.equal(messages.length,0,'New gift messages need review before correction');
 const manual=new Map();
 for(const log of grants){
  if(log.reference_type==='SYSTEM_GRANT'){
   assert.ok(knownSystemReferences.has(log.reference_id),'Unreviewed system grant requires review');continue;
  }
  assert.equal(log.reference_type,'V3_JOINT','Unreviewed grant source');assert.equal(log.joint_kind,'RECRUITMENT_GIFT_GRANT','Unreviewed joint grant');assert.equal(log.joint_status,'COMPLETED','Manual grant is incomplete');
  const detail=parse(log.joint_plan),audit=audits.find(row=>Number(row.target_id)===Number(log.user_id)&&parse(row.after_data).requestId===log.reference_id);
  assert.ok(audit,'Manual grant audit missing');const auditData=parse(audit.after_data);
  assert.equal(auditData.itemCode,ITEM_CODE);assert.equal(Number(log.change_amount),Number(detail.amount));assert.equal(Number(auditData.amount),Number(detail.amount));assert.equal(Number(audit.admin_id),Number(detail.adminId));
  const evidence={logId:String(log.id),requestId:log.reference_id,auditId:String(audit.id),amount:Number(log.change_amount)};
  manual.set(Number(log.user_id),[...(manual.get(Number(log.user_id))||[]),evidence]);
 }
 for(const reviewed of plan.manualEvidence)assert.ok(manual.get(reviewed.userId)?.some(row=>row.logId===reviewed.logId&&row.auditId===reviewed.auditId),'Reviewed manual grant changed');
 return ROOMS.map(room=>{
  const original=parse(receipts.find(row=>row.key===room.originalOperationKey).value);
  assert.equal(original.status,'COMPLETED');assert.equal(original.operationKey,room.originalOperationKey);assert.equal(original.itemCode,ITEM_CODE);
  assert.deepEqual(original.allocations.map(row=>({userId:row.userId,logId:row.logId})),room.originalPaid,'Original paid recipients changed');
  for(const paid of room.originalPaid){
   const log=grants.find(row=>String(row.id)===paid.logId);assert.ok(log);assert.equal(Number(log.user_id),paid.userId);assert.equal(Number(log.change_amount),1);assert.equal(log.reference_id,room.originalOperationKey);
  }
  const originalIds=new Set(room.originalPaid.map(row=>row.userId));
  return {campaign:room.campaign,name:room.name,originalOperationKey:room.originalOperationKey,memo:room.memo,held:room.held,
   recipients:room.targets.map(target=>{
    const source=originalIds.has(target.userId)?'ORIGINAL_GRANTED':manual.has(target.userId)?'MANUAL_GRANTED':'CORRECTION_PENDING';
    if(source==='CORRECTION_PENDING')assert.equal(target.expectedOutcome,'CORRECTION_PENDING','An excluded recipient became eligible without reviewed locking');
    return {userId:target.userId,nickname:target.nickname,source,...(source==='ORIGINAL_GRANTED'?{logId:room.originalPaid.find(row=>row.userId===target.userId).logId}:{}),...(source==='MANUAL_GRANTED'?{manualEvidence:manual.get(target.userId)}:{})};
   })};
 });
}

// Explicit correction authorized for both room lists. Old global once markers are
// historical evidence only; each room has its own completion markers and ledger.
export async function apply(client,{expectedPlanHash,dryRun=false}={}){
 assert.equal(expectedPlanHash,PLAN_HASH);await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='15s'");
  await q(client,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY]);
  const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[KEY]);
  if(saved){const receipt=parse(saved.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.planHash,PLAN_HASH);assert.equal(receipt.operationKey,KEY);await client.query('ROLLBACK');return {receipt,replayed:true,dryRun};}
  const users=await q(client,'SELECT id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);assert.equal(users.length,69);
  const links=await q(client,"SELECT user_id,provider_user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) AND provider='PLAYDK'",[ids]);
  for(const target of TARGETS){const user=users.find(row=>Number(row.id)===target.userId),link=links.filter(row=>Number(row.user_id)===target.userId);assert.equal(user?.nickname,target.nickname);assert.equal(user.status,'ACTIVE');assert.equal(link.length,1);assert.equal(link[0].provider_user_id,target.playdkId);}
  const [item]=await q(client,'SELECT name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE]);assert.equal(item?.name,'영입전 사은품');assert.equal(Number(item.is_active),1);
  const [owner]=await q(client,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
  assert.equal((await q(client,'SELECT key FROM app_meta WHERE key=ANY($1::text[])',[allMarkerKeys])).length,0,'Campaign markers already exist without correction receipt');
  const inventory=await q(client,'SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 FOR UPDATE',[ids,ITEM_CODE]);
  const rooms=await readEligibility(client),now=new Date().toISOString(),allocations=[],currentBalances=new Map(inventory.map(row=>[Number(row.user_id),balance(row)]));
  for(const room of rooms){
   const pending=room.recipients.filter(row=>row.source==='CORRECTION_PENDING'),pendingIds=pending.map(row=>row.userId),referenceId=KEY+':'+room.campaign;
   for(const recipient of pending)for(const value of Object.values(currentBalances.get(recipient.userId)||balance()))assert.ok(BigInt(value)>=0n&&BigInt(value)<BigInt(Number.MAX_SAFE_INTEGER));
   if(!pending.length)continue;
   const changed=await q(client,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
     SELECT user_id,$2,1,1,$3,$3 FROM unnest($1::bigint[]) AS t(user_id)
     ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+1,unseen_quantity=cnine_user_inventory.unseen_quantity+1,updated_at=excluded.updated_at RETURNING user_id,quantity,unseen_quantity`,[pendingIds,ITEM_CODE,now]);assert.equal(changed.length,pending.length);
   const logs=await q(client,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
     SELECT user_id,item_code,1,quantity,$3,'SYSTEM_GRANT',$4,$5,$6 FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 RETURNING id,user_id`,[pendingIds,ITEM_CODE,room.name+' 영입전 명단 누락 보충: 과거 지급과 구분, 이번 명단 1개·운영자 수동 지급 제외',referenceId,owner.id,now]);assert.equal(logs.length,pending.length);
   for(const recipient of pending){
    const before=currentBalances.get(recipient.userId)||balance(),after=balance(changed.find(row=>Number(row.user_id)===recipient.userId)),log=logs.find(row=>Number(row.user_id)===recipient.userId);assert.ok(log);
    assert.equal(BigInt(after.quantity)-BigInt(before.quantity),1n);assert.equal(BigInt(after.unseenQuantity)-BigInt(before.unseenQuantity),1n);currentBalances.set(recipient.userId,after);
    recipient.source='CORRECTION_GRANTED';recipient.logId=String(log.id);
    allocations.push({campaign:room.campaign,userId:recipient.userId,nickname:recipient.nickname,amount:1,before,after,logId:String(log.id),referenceId});
   }
  }
  const afterInventory=await q(client,'SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id',[ids,ITEM_CODE]);
  const accountChanges=TARGETS.map(target=>{
   const before=balance(inventory.find(row=>Number(row.user_id)===target.userId)),after=balance(afterInventory.find(row=>Number(row.user_id)===target.userId)),amount=allocations.filter(row=>row.userId===target.userId).length;
   assert.equal(BigInt(after.quantity)-BigInt(before.quantity),BigInt(amount));assert.equal(BigInt(after.unseenQuantity)-BigInt(before.unseenQuantity),BigInt(amount));
   return {userId:target.userId,nickname:target.nickname,amount,before,after};
  });
  const markers=rooms.flatMap(room=>room.recipients.map(recipient=>({key:markerKey(room.campaign,recipient.userId),value:JSON.stringify({status:'COMPLETED',campaign:room.campaign,userId:recipient.userId,operationKey:KEY,itemCode:ITEM_CODE,source:recipient.source,logId:recipient.logId,manualEvidence:recipient.manualEvidence,completedAt:now})})));
  assert.equal((await q(client,'INSERT INTO app_meta(key,value,updated_at) SELECT key,value,$3 FROM unnest($1::text[],$2::text[]) AS t(key,value) RETURNING key',[markers.map(row=>row.key),markers.map(row=>row.value),now])).length,109);
  const receipt={status:'COMPLETED',operationKey:KEY,planHash:PLAN_HASH,itemCode:ITEM_CODE,policy:plan.policy,amountPerCampaign:1,rooms,allocations,accountChanges,totalBoxes:allocations.length,uniqueRecipients:accountChanges.filter(row=>row.amount>0).length,completedAt:now};
  const [audit]=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
    VALUES($1,'OPS_RECRUITMENT_GIFT_CAMPAIGN_CORRECTION','USER_INVENTORY',$2,$3,$4,$5) RETURNING id`,[owner.id,KEY,JSON.stringify({planHash:PLAN_HASH,originalOperationKeys:ROOMS.map(room=>room.originalOperationKey)}),JSON.stringify(receipt),now]);assert.ok(audit);receipt.auditId=String(audit.id);
  assert.equal((await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[KEY,JSON.stringify(receipt),now])).length,1);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verify(client){
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[KEY]);assert.ok(saved);const receipt=parse(saved.value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,KEY);assert.equal(receipt.planHash,PLAN_HASH);
 const logs=await q(client,'SELECT id,user_id,change_amount,balance_after,reference_id FROM inventory_logs WHERE user_id=ANY($1::bigint[]) AND item_code=$2 AND reference_id=ANY($3::text[])',[ids,ITEM_CODE,ROOMS.map(room=>KEY+':'+room.campaign)]);
 assert.equal(logs.length,receipt.totalBoxes);assert.equal(receipt.allocations.length,receipt.totalBoxes);
 for(const allocation of receipt.allocations){const log=logs.find(row=>String(row.id)===allocation.logId);assert.ok(log);assert.equal(Number(log.user_id),allocation.userId);assert.equal(Number(log.change_amount),1);assert.equal(String(log.balance_after),allocation.after.quantity);assert.equal(log.reference_id,allocation.referenceId);}
 const markers=await q(client,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[allMarkerKeys]);assert.equal(markers.length,109);assert.ok(markers.every(row=>parse(row.value).operationKey===KEY));
 const [audit]=await q(client,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);assert.equal(audit?.action_type,'OPS_RECRUITMENT_GIFT_CAMPAIGN_CORRECTION');assert.equal(audit.target_id,KEY);const {auditId,...recorded}=receipt;assert.deepEqual(parse(audit.after_data),recorded);
 const inventory=await q(client,'SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id',[receipt.accountChanges.filter(row=>row.amount>0).map(row=>row.userId),ITEM_CODE]);
 return {verified:true,receipt,inventory,verification:{totalBoxes:receipt.totalBoxes,uniqueRecipients:receipt.uniqueRecipients,grantLogs:logs.length,campaignMarkers:markers.length,rooms:receipt.rooms.map(room=>({name:room.name,granted:room.recipients.filter(row=>row.source==='CORRECTION_GRANTED').length,originalPaid:room.recipients.filter(row=>row.source==='ORIGINAL_GRANTED').length,manualExcluded:room.recipients.filter(row=>row.source==='MANUAL_GRANTED').length,held:room.held.length}))}};
}

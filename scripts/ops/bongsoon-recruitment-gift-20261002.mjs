import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './bongsoon-recruitment-gift-20261002.targets.json' with {type:'json'};

export const OPERATION_KEY='ops:bongsoon-recruitment-gift:20261002:once:v1';
export const ITEM_CODE='RECRUITMENT_GIFT_BOX',ITEM_NAME='영입전 사은품',TARGETS=plan.targets;
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
export const INITIALLY_UNPAID=TARGETS.filter(x=>!x.priorGrantIds.length&&!x.priorMessageIds.length&&!x.existingOnceMarker&&BigInt(x.inspectedQuantity)===0n);
const ids=TARGETS.map(x=>x.userId),onceKey=id=>'ops:recruitment-gift-once:user:'+id+':v1';
const reason='봉순이 방 영입전 140개 이상 명단: 기존 지급자 제외, 계정당 최초 1회 1개';
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
assert.equal(TARGETS.length,51);assert.equal(new Set(ids).size,51);assert.ok(TARGETS.every(x=>x.contribution>=140));assert.equal(plan.amount,1);assert.equal(plan.maxPerAccount,1);assert.equal(plan.sourceCount,55);assert.equal(plan.held.length,4);assert.equal(plan.duplicatePolicy,'EXCLUDE_ANY_PRIOR_RECRUITMENT_GIFT');

export async function verifyBongsoonRecruitmentGift(client,receipt){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.planHash,PLAN_HASH);assert.equal(receipt.itemCode,ITEM_CODE);
 assert.equal(receipt.allocations.length+receipt.skipped.length,51);assert.equal(new Set([...receipt.allocations,...receipt.skipped].map(x=>x.userId)).size,51);
 const logs=await q(client,'SELECT id,user_id,change_amount,balance_after,reference_type FROM inventory_logs WHERE user_id=ANY($1::bigint[]) AND item_code=$2 AND reference_id=$3 ORDER BY user_id',[ids,ITEM_CODE,OPERATION_KEY]);
 assert.equal(logs.length,receipt.allocations.length);
 for(const row of receipt.allocations){
  const target=TARGETS.find(x=>x.userId===row.userId);assert.equal(row.nickname,target?.nickname);assert.equal(BigInt(row.after.quantity)-BigInt(row.before.quantity),1n);assert.equal(BigInt(row.after.unseenQuantity)-BigInt(row.before.unseenQuantity),1n);
  const log=logs.find(x=>Number(x.user_id)===row.userId);assert.equal(String(log?.id),row.logId);assert.equal(Number(log.change_amount),1);assert.equal(String(log.balance_after),row.after.quantity);assert.equal(log.reference_type,'SYSTEM_GRANT');
 }
 const [audit]=await q(client,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);assert.equal(audit?.action_type,'OPS_BONGSOON_RECRUITMENT_GIFT');assert.equal(audit.target_id,OPERATION_KEY);assert.equal(JSON.parse(audit.after_data).planHash,PLAN_HASH);
 const markers=await q(client,'SELECT key FROM app_meta WHERE key=ANY($1::text[])',[ids.map(onceKey)]);assert.equal(markers.length,51);
 return {granted:receipt.allocations.length,skipped:receipt.skipped.length,totalAccounts:51,grantLogs:logs.length,onceMarkers:markers.length};
}

// One-time operation only. The caller holds USER_LOCK leases for all initially unpaid accounts.
export async function grantBongsoonRecruitmentGift(client,{expectedPlanHash,dryRun=false}={}){
 assert.equal(expectedPlanHash,PLAN_HASH);await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='2s'");await client.query("SET LOCAL statement_timeout='10s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=JSON.parse(saved.value),verification=await verifyBongsoonRecruitmentGift(client,receipt);await client.query('ROLLBACK');return {replayed:true,receipt,verification};}
  const users=await q(client,'SELECT id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);assert.equal(users.length,51);
  const links=await q(client,"SELECT user_id,provider_user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) AND provider='PLAYDK'",[ids]);
  for(const target of TARGETS){const user=users.find(x=>Number(x.id)===target.userId),matches=links.filter(x=>Number(x.user_id)===target.userId);assert.equal(user?.nickname,target.nickname);assert.equal(user?.status,'ACTIVE');assert.equal(matches.length,1);assert.equal(matches[0].provider_user_id,target.playdkId);}
  const [item]=await q(client,'SELECT name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE]);assert.equal(item?.name,ITEM_NAME);assert.equal(Number(item.is_active),1);
  const [owner]=await q(client,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
  const inventory=await q(client,'SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 FOR UPDATE',[ids,ITEM_CODE]);
  const prior=await q(client,'SELECT id,user_id,change_amount,reference_id FROM inventory_logs WHERE user_id=ANY($1::bigint[]) AND item_code=$2 AND change_amount>0',[ids,ITEM_CODE]);
  assert.ok(prior.every(x=>x.reference_id!==OPERATION_KEY),'Grant ledger exists without operation receipt');
  const messages=await q(client,'SELECT user_id,message_id FROM user_message_rewards WHERE user_id=ANY($1::bigint[]) AND reward_type=$2',[ids,ITEM_CODE]);
  const markers=await q(client,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[ids.map(onceKey)]);
  const pending=[],skipped=[],now=new Date().toISOString(),balance=row=>({quantity:String(row?.quantity??0),unseenQuantity:String(row?.unseen_quantity??0)});
  for(const target of TARGETS){
   const owned=inventory.find(x=>Number(x.user_id)===target.userId),logs=prior.filter(x=>Number(x.user_id)===target.userId),mail=messages.filter(x=>Number(x.user_id)===target.userId),marker=markers.find(x=>x.key===onceKey(target.userId));
   assert.ok(target.priorGrantIds.every(id=>logs.some(x=>String(x.id)===id)),'Reviewed previous grant changed');
   if(logs.length||mail.length||marker||BigInt(owned?.quantity??0)>0n){skipped.push({userId:target.userId,nickname:target.nickname,priorGrantIds:logs.map(x=>String(x.id)),priorMessageIds:mail.map(x=>String(x.message_id)),reason:'ALREADY_GRANTED'});continue;}
   assert.ok(INITIALLY_UNPAID.some(x=>x.userId===target.userId),'Previously paid account became eligible without a reviewed USER_LOCK');
   const before=balance(owned);for(const value of Object.values(before))assert.ok(BigInt(value)>=0n&&BigInt(value)<BigInt(Number.MAX_SAFE_INTEGER));pending.push({...target,before});
  }
  const newIds=pending.map(x=>x.userId),allocations=[];
  if(newIds.length){
   const updated=await q(client,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
    SELECT user_id,$2,1,1,$3,$3 FROM unnest($1::bigint[]) AS t(user_id)
    ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+1,unseen_quantity=cnine_user_inventory.unseen_quantity+1,updated_at=excluded.updated_at RETURNING user_id,quantity,unseen_quantity`,[newIds,ITEM_CODE,now]);assert.equal(updated.length,newIds.length);
   const logs=await q(client,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
    SELECT user_id,item_code,1,quantity,$3,'SYSTEM_GRANT',$4,$5,$6 FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 RETURNING id,user_id`,[newIds,ITEM_CODE,reason,OPERATION_KEY,owner.id,now]);assert.equal(logs.length,newIds.length);
   for(const target of pending){const changed=updated.find(x=>Number(x.user_id)===target.userId),log=logs.find(x=>Number(x.user_id)===target.userId);allocations.push({userId:target.userId,nickname:target.nickname,before:target.before,after:balance(changed),logId:String(log.id)});}
  }
  const markerValues=TARGETS.map(target=>JSON.stringify({status:'COMPLETED',itemCode:ITEM_CODE,userId:target.userId,operationKey:OPERATION_KEY,previouslyGranted:skipped.some(x=>x.userId===target.userId),completedAt:now}));
  await q(client,`INSERT INTO app_meta(key,value,updated_at) SELECT key,value,$3 FROM unnest($1::text[],$2::text[]) AS t(key,value) ON CONFLICT(key) DO NOTHING RETURNING key`,[ids.map(onceKey),markerValues,now]);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,itemCode:ITEM_CODE,amountEach:1,maxPerAccount:1,allocations,skipped,held:plan.held,completedAt:now};
  const [audit]=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,'OPS_BONGSOON_RECRUITMENT_GIFT','USER_INVENTORY',$2,$3,$4,$5) RETURNING id`,[owner.id,OPERATION_KEY,JSON.stringify({pending:newIds,skipped:skipped.map(x=>x.userId)}),JSON.stringify(receipt),now]);receipt.auditId=String(audit.id);
  await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]);
  const verification=await verifyBongsoonRecruitmentGift(client,receipt);await client.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt,verification};
 }catch(error){await client.query('ROLLBACK');throw error;}
}

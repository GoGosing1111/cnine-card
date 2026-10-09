import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(fs.readFileSync(new URL('./heeya-noise-event-20261010.json',import.meta.url),'utf8'));
export const PLAN_HASH='32c1ffe01d922732f82bcc20460b2d6827411034598df68beb0adfc11d01a87c';
export const OPERATION_KEY='ops:heeya-noise-event:20261010:v1';
export const ACTION='OPS_HEEYA_NOISE_EVENT_20261010';
const ids=PLAN.recipients.map(r=>r.userId),codes=PLAN.items.map(r=>r.code);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const sorted=rows=>rows.map(r=>String(r.user_id??r.id)).sort((a,b)=>Number(a)-Number(b));
const sortedIds=[...ids].sort((a,b)=>Number(a)-Number(b));
const safe=(value,amount)=>assert.ok(BigInt(value??0)>=0n&&BigInt(value??0)+BigInt(amount)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsupported resulting balance');
function validate(hash){
 assert.equal(hash,PLAN_HASH,'Reviewed plan hash required');
 assert.equal(createHash('sha256').update(JSON.stringify(PLAN)).digest('hex'),PLAN_HASH,'Plan changed');
 assert.equal(PLAN.operationKey,OPERATION_KEY);assert.equal(PLAN.delivery,'DIRECT');assert.equal(PLAN.title,'희야 소음단 이벤트 지급');
 assert.equal(ids.length,40);assert.equal(new Set(ids).size,40);assert.equal(new Set(PLAN.recipients.map(r=>r.nickname)).size,40);
 assert.equal(PLAN.coinPerUser,'500000000000');
 assert.deepEqual(PLAN.items,[{code:'MASTER_STAR',name:'마스터의 별',amount:'5000000'},{code:'EMPEROR_ENERGY',name:'엠퍼러 에너지',amount:'5'}]);
 assert.deepEqual(PLAN.totals,{recipients:40,coin:'20000000000000',MASTER_STAR:'200000000',EMPEROR_ENERGY:'200'});
}
export async function verifyHeeyaRewards(client,receipt,{balances=false}={}){
 validate(receipt.planHash);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.delivery,'DIRECT');assert.equal(receipt.authorization,PLAN.authorization);assert.deepEqual(receipt.totals,PLAN.totals);
 assert.equal(receipt.grants.length,40);assert.deepEqual(receipt.grants.map(r=>({userId:r.userId,nickname:r.nickname})),PLAN.recipients);
 const coins=await q(client,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id=ANY($1::bigint[])',[receipt.grants.map(g=>g.coin.logId)]);
 const items=await q(client,'SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type,reference_id,admin_id::text FROM inventory_logs WHERE id=ANY($1::bigint[])',[receipt.grants.flatMap(g=>g.items.map(i=>i.logId))]);
 assert.deepEqual(sorted(coins),sortedIds);assert.equal(items.length,80);
 for(const gift of PLAN.items)assert.deepEqual(sorted(items.filter(i=>i.item_code===gift.code)),sortedIds);
 const [audit]=await q(client,'SELECT admin_id::text,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
 assert.equal(audit?.admin_id,receipt.adminId);assert.equal(audit.action_type,ACTION);assert.equal(audit.target_id,OPERATION_KEY);
 const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
 const current=balances?await q(client,'SELECT id::text,coin::text FROM users WHERE id=ANY($1::bigint[])',[ids]):[];
 const inventory=balances?await q(client,'SELECT user_id::text,item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=ANY($2::text[])',[ids,codes]):[];
 for(const grant of receipt.grants){
  assert.equal(grant.coin.amount,PLAN.coinPerUser);assert.equal(BigInt(grant.coin.after)-BigInt(grant.coin.before),BigInt(PLAN.coinPerUser));
  assert.equal(grant.items.length,2);
  for(const reward of [grant.coin,...grant.items]){
   const log=reward.code?items.find(i=>i.id===reward.logId):coins.find(i=>i.id===reward.logId);assert.ok(log);
   assert.equal(log.user_id,grant.userId);assert.equal(log.change_amount,reward.amount);assert.equal(log.balance_after,reward.after);assert.equal(log.reason,PLAN.title);assert.equal(log.admin_id,receipt.adminId);
   if(reward.code){const gift=PLAN.items.find(i=>i.code===reward.code);assert.ok(gift);assert.equal(reward.amount,gift.amount);assert.equal(log.item_code,reward.code);assert.equal(log.reference_type,'OPS_EVENT_REWARD');assert.equal(log.reference_id,OPERATION_KEY);
    assert.equal(BigInt(reward.after)-BigInt(reward.before),BigInt(gift.amount));assert.equal(BigInt(reward.unseenAfter)-BigInt(reward.unseenBefore),BigInt(gift.amount));
    if(balances){const held=inventory.find(i=>i.user_id===grant.userId&&i.item_code===reward.code);assert.equal(held?.quantity,reward.after);assert.equal(held.unseen_quantity,reward.unseenAfter);}
   }
  }
  if(balances)assert.equal(current.find(u=>u.id===grant.userId)?.coin,grant.coin.after);
 }
 return {status:'VERIFIED',recipients:40,coinLogs:40,inventoryLogs:80,adminLogs:1,missing:0,duplicates:0,totals:PLAN.totals,auditId:receipt.auditId};
}

// Caller holds gameplay leases and one transaction. No messages or automatic runtime hook.
export async function grantHeeyaRewards(client,hash,{leaseDeadline}={}){
 validate(hash);assert.ok(Date.now()<leaseDeadline-5000,'Active gameplay leases required');
 await q(client,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){const receipt=JSON.parse(saved.value);return {receipt,replayed:true,verification:await verifyHeeyaRewards(client,receipt)};}
 assert.equal((await q(client,'SELECT id FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY])).length,0,'Prior audit without receipt');
 const users=await q(client,'SELECT id::text,nickname,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
 assert.deepEqual(sorted(users),sortedIds);
 const unique=await q(client,'SELECT nickname,COUNT(*)::int count FROM users WHERE nickname=ANY($1::text[]) GROUP BY nickname',[PLAN.recipients.map(r=>r.nickname)]);
 assert.equal(unique.length,40);assert.ok(unique.every(r=>r.count===1),'Ambiguous nickname');
 for(const target of PLAN.recipients){const user=users.find(u=>u.id===target.userId);assert.equal(user.nickname,target.nickname);assert.equal(user.status,'ACTIVE');safe(user.coin,PLAN.coinPerUser);}
 const catalog=await q(client,'SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[codes]);
 for(const gift of PLAN.items){const item=catalog.find(i=>i.code===gift.code);assert.equal(item?.name,gift.name);assert.equal(Number(item.is_active),1);}
 const [owner]=await q(client,"SELECT id::text FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE' FOR SHARE");assert.ok(owner);
 const before=await q(client,'SELECT user_id::text,item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=ANY($2::text[]) ORDER BY user_id,item_code FOR UPDATE',[ids,codes]);
 for(const userId of ids)for(const gift of PLAN.items){const held=before.find(i=>i.user_id===userId&&i.item_code===gift.code);safe(held?.quantity,gift.amount);safe(held?.unseen_quantity,gift.amount);}
 const coins=await q(client,`WITH credited AS (UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id,coin)
  INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id)
  SELECT id,$2::bigint,coin,$3,$4 FROM credited RETURNING id::text,user_id::text,balance_after::text`,[ids,PLAN.coinPerUser,PLAN.title,owner.id]);
 assert.deepEqual(sorted(coins),sortedIds);
 const itemLogs=[];
 for(const gift of PLAN.items){
  const logs=await q(client,`WITH credited AS (
   INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT user_id,$2,$3::bigint,$3::bigint,sqlite_now(),sqlite_now() FROM unnest($1::bigint[]) x(user_id) ORDER BY user_id
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
    unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at RETURNING user_id,quantity
  ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id)
   SELECT user_id,$2,$3::bigint,quantity,$4,'OPS_EVENT_REWARD',$5,$6 FROM credited RETURNING id::text,user_id::text,item_code,balance_after::text`,[ids,gift.code,gift.amount,PLAN.title,OPERATION_KEY,owner.id]);
  assert.deepEqual(sorted(logs),sortedIds);itemLogs.push(...logs);
 }
 const after=await q(client,'SELECT id::text,nickname,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
 for(const user of users){const changed=after.find(u=>u.id===user.id);assert.deepEqual({...changed,coin:user.coin},user,'Other wallet fields changed');}
 const grants=PLAN.recipients.map(target=>{
  const wallet=users.find(u=>u.id===target.userId),coin=coins.find(c=>c.user_id===target.userId);
  return {...target,coin:{amount:PLAN.coinPerUser,before:wallet.coin,after:coin.balance_after,logId:coin.id},items:PLAN.items.map(gift=>{
   const old=before.find(i=>i.user_id===target.userId&&i.item_code===gift.code),log=itemLogs.find(i=>i.user_id===target.userId&&i.item_code===gift.code);
   return {code:gift.code,amount:gift.amount,before:old?.quantity??'0',after:log.balance_after,unseenBefore:old?.unseen_quantity??'0',unseenAfter:String(BigInt(old?.unseen_quantity??0)+BigInt(gift.amount)),logId:log.id};
  })};
 });
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,title:PLAN.title,authorization:PLAN.authorization,delivery:'DIRECT',actor:'SYSTEM_OPS',adminId:owner.id,totals:PLAN.totals,grants,completedAt:new Date().toISOString()};
 const audits=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES($1,$2,'NAMED_USERS',$3,$4,$5) RETURNING id::text`,[owner.id,ACTION,OPERATION_KEY,JSON.stringify({priorOperation:null,planHash:PLAN_HASH,recipients:40}),JSON.stringify(receipt)]);
 assert.equal(audits.length,1);receipt.auditId=audits[0].id;
 assert.equal((await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)])).rowCount,1);
 const verification=await verifyHeeyaRewards(client,receipt,{balances:true});assert.ok(Date.now()<leaseDeadline-3000,'Lease deadline too near to commit');
 return {receipt,replayed:false,verification};
}

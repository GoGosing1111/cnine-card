import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(fs.readFileSync(new URL('./pinball-gifts-20261010.json',import.meta.url),'utf8'));
export const PLAN_HASH='4a1ebb27bcd8e01faaa855a4040e8e85e4ab540c7321f72cf72a8b2a5438281a';
export const OPERATION_KEY='ops:three-room-pinball-gifts:20261010:v1';
export const ACTION='OPS_PINBALL_GIFTS_20261010';
const ids=PLAN.recipients.map(r=>r.userId),codes=PLAN.items.map(r=>r.code);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const sorted=rows=>rows.map(r=>String(r.user_id??r.id)).sort((a,b)=>Number(a)-Number(b));
const sortedIds=[...ids].sort((a,b)=>Number(a)-Number(b));
const amount=(target,unit)=>String(BigInt(target.giftQuantity)*BigInt(unit));
const allocations=unit=>JSON.stringify(PLAN.recipients.map(r=>({user_id:r.userId,amount:amount(r,unit)})));
const safe=(value,delta)=>assert.ok(BigInt(value??0)>=0n&&BigInt(value??0)+BigInt(delta)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsupported resulting balance');
function validate(hash){
 assert.equal(hash,PLAN_HASH,'Reviewed plan hash required');
 assert.equal(createHash('sha256').update(JSON.stringify(PLAN)).digest('hex'),PLAN_HASH,'Plan changed');
 assert.equal(PLAN.operationKey,OPERATION_KEY);assert.equal(PLAN.delivery,'DIRECT');
 assert.equal(ids.length,65);assert.equal(new Set(ids).size,65);assert.equal(new Set(PLAN.recipients.map(r=>r.nickname)).size,65);
 assert.equal(PLAN.unitCoin,'1000000000000');
 assert.deepEqual(PLAN.items,[{code:'MASTER_STAR',name:'마스터의 별',amountPerGift:'10000000'},{code:'EMPEROR_ENERGY',name:'엠퍼러 에너지',amountPerGift:'10'}]);
 assert.deepEqual(PLAN.totals,{recipients:65,giftQuantity:154,coin:'154000000000000',MASTER_STAR:'1540000000',EMPEROR_ENERGY:'1540'});
 assert.equal(PLAN.sourceRows.length,66);assert.equal(new Set(PLAN.sourceRows.map(r=>r.nickname)).size,66);
 assert.deepEqual(PLAN.excluded,[{inputNickname:'천재b',giftQuantity:1,reason:'사용자 명시 제외'}]);
 assert.equal(new Set(PLAN.recipients.map(r=>r.inputNickname)).size,65);
 for(const target of PLAN.recipients){
  const source=PLAN.sourceRows.find(r=>r.nickname===target.inputNickname);assert.ok(source);assert.notEqual(target.inputNickname,'천재b');
  assert.equal(source.giftQuantity,target.giftQuantity);assert.ok([1,2,3].includes(target.giftQuantity));assert.equal(source.heeya+source.bongsoon+source.joeun,source.totalPinball);
 }
 assert.equal(PLAN.recipients.reduce((s,r)=>s+r.giftQuantity,0),154);
 for(const [unit,total] of [[PLAN.unitCoin,PLAN.totals.coin],...PLAN.items.map(i=>[i.amountPerGift,PLAN.totals[i.code]])])assert.equal(String(154n*BigInt(unit)),total);
}
export async function verifyPinballRewards(client,receipt,{balances=false}={}){
 validate(receipt.planHash);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.delivery,'DIRECT');assert.equal(receipt.authorization,PLAN.authorization);assert.deepEqual(receipt.totals,PLAN.totals);
 assert.equal(receipt.grants.length,65);
 assert.deepEqual(receipt.grants.map(({coin,items,...target})=>target),PLAN.recipients);
 const coins=await q(client,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id=ANY($1::bigint[])',[receipt.grants.map(g=>g.coin.logId)]);
 const items=await q(client,'SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type,reference_id,admin_id::text FROM inventory_logs WHERE id=ANY($1::bigint[])',[receipt.grants.flatMap(g=>g.items.map(i=>i.logId))]);
 assert.deepEqual(sorted(coins),sortedIds);assert.equal(items.length,130);
 for(const gift of PLAN.items)assert.deepEqual(sorted(items.filter(i=>i.item_code===gift.code)),sortedIds);
 const audits=await q(client,'SELECT id::text,admin_id::text,action_type,target_id,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]);assert.equal(audits.length,1);
 const [audit]=audits;assert.equal(audit.id,receipt.auditId);assert.equal(audit.admin_id,receipt.adminId);
 const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
 const current=balances?await q(client,'SELECT id::text,coin::text FROM users WHERE id=ANY($1::bigint[])',[ids]):[];
 const inventory=balances?await q(client,'SELECT user_id::text,item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=ANY($2::text[])',[ids,codes]):[];
 for(const grant of receipt.grants){
  const expectedCoin=amount(grant,PLAN.unitCoin);assert.equal(grant.coin.amount,expectedCoin);assert.equal(BigInt(grant.coin.after)-BigInt(grant.coin.before),BigInt(expectedCoin));
  assert.equal(grant.items.length,2);
  for(const reward of [grant.coin,...grant.items]){
   const log=reward.code?items.find(i=>i.id===reward.logId):coins.find(i=>i.id===reward.logId);assert.ok(log);
   assert.equal(log.user_id,grant.userId);assert.equal(log.change_amount,reward.amount);assert.equal(log.balance_after,reward.after);assert.equal(log.reason,PLAN.title);assert.equal(log.admin_id,receipt.adminId);
   if(reward.code){const gift=PLAN.items.find(i=>i.code===reward.code);assert.ok(gift);const expected=amount(grant,gift.amountPerGift);
    assert.equal(reward.amount,expected);assert.equal(log.item_code,reward.code);assert.equal(log.reference_type,'OPS_EVENT_REWARD');assert.equal(log.reference_id,OPERATION_KEY);
    assert.equal(BigInt(reward.after)-BigInt(reward.before),BigInt(expected));assert.equal(BigInt(reward.unseenAfter)-BigInt(reward.unseenBefore),BigInt(expected));
    if(balances){const held=inventory.find(i=>i.user_id===grant.userId&&i.item_code===reward.code);assert.equal(held?.quantity,reward.after);assert.equal(held.unseen_quantity,reward.unseenAfter);}
   }
  }
  if(balances)assert.equal(current.find(u=>u.id===grant.userId)?.coin,grant.coin.after);
 }
 return {status:'VERIFIED',recipients:65,coinLogs:65,inventoryLogs:130,adminLogs:1,missing:0,duplicates:0,totals:PLAN.totals,auditId:receipt.auditId};
}

// Caller holds existing USER_LOCK and database leases and one transaction.
// One-time direct grant only; this module is never imported by game runtime.
export async function grantPinballRewards(client,hash,{leaseDeadline}={}){
 validate(hash);assert.ok(Date.now()<leaseDeadline-5000,'Active gameplay leases required');
 await q(client,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){const receipt=JSON.parse(saved.value);return {receipt,replayed:true,verification:await verifyPinballRewards(client,receipt)};}
 assert.equal((await q(client,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS day"))[0].day,'2026-10-10','One-time grant expired');
 assert.equal((await q(client,'SELECT id FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY])).length,0,'Prior audit without receipt');
 const users=await q(client,'SELECT id::text,nickname,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);assert.deepEqual(sorted(users),sortedIds);
 const unique=await q(client,'SELECT nickname,COUNT(*)::int count FROM users WHERE nickname=ANY($1::text[]) GROUP BY nickname',[PLAN.recipients.map(r=>r.nickname)]);assert.equal(unique.length,65);assert.ok(unique.every(r=>r.count===1),'Ambiguous nickname');
 for(const target of PLAN.recipients){const user=users.find(u=>u.id===target.userId);assert.equal(user.nickname,target.nickname);assert.equal(user.status,'ACTIVE');safe(user.coin,amount(target,PLAN.unitCoin));}
 const catalog=await q(client,'SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[codes]);
 for(const gift of PLAN.items){const item=catalog.find(i=>i.code===gift.code);assert.equal(item?.name,gift.name);assert.equal(Number(item.is_active),1);}
 const [owner]=await q(client,"SELECT id::text FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
 const before=await q(client,'SELECT user_id::text,item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=ANY($2::text[]) ORDER BY user_id,item_code FOR UPDATE',[ids,codes]);
 for(const target of PLAN.recipients)for(const gift of PLAN.items){const held=before.find(i=>i.user_id===target.userId&&i.item_code===gift.code),delta=amount(target,gift.amountPerGift);safe(held?.quantity,delta);safe(held?.unseen_quantity,delta);}
 const coins=await q(client,`WITH allocation AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(user_id bigint,amount bigint)),
  credited AS (UPDATE users u SET coin=u.coin+a.amount FROM allocation a WHERE u.id=a.user_id RETURNING u.id,u.coin)
  INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id)
  SELECT c.id,a.amount,c.coin,$2,$3 FROM credited c JOIN allocation a ON a.user_id=c.id RETURNING id::text,user_id::text,balance_after::text`,[allocations(PLAN.unitCoin),PLAN.title,owner.id]);assert.deepEqual(sorted(coins),sortedIds);
 const itemLogs=[];
 for(const gift of PLAN.items){
  const logs=await q(client,`WITH allocation AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(user_id bigint,amount bigint)),credited AS (
   INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT user_id,$2,amount,amount,sqlite_now(),sqlite_now() FROM allocation ORDER BY user_id
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
    unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at RETURNING user_id,quantity
  ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id)
   SELECT c.user_id,$2,a.amount,c.quantity,$3,'OPS_EVENT_REWARD',$4,$5 FROM credited c JOIN allocation a ON a.user_id=c.user_id
   RETURNING id::text,user_id::text,item_code,balance_after::text`,[allocations(gift.amountPerGift),gift.code,PLAN.title,OPERATION_KEY,owner.id]);assert.deepEqual(sorted(logs),sortedIds);itemLogs.push(...logs);
 }
 const after=await q(client,'SELECT id::text,nickname,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
 for(const user of users){const changed=after.find(u=>u.id===user.id);assert.deepEqual({...changed,coin:user.coin},user,'Other wallet fields changed');}
 const grants=PLAN.recipients.map(target=>{
  const wallet=users.find(u=>u.id===target.userId),coin=coins.find(c=>c.user_id===target.userId);
  return {...target,coin:{amount:amount(target,PLAN.unitCoin),before:wallet.coin,after:coin.balance_after,logId:coin.id},items:PLAN.items.map(gift=>{
   const old=before.find(i=>i.user_id===target.userId&&i.item_code===gift.code),log=itemLogs.find(i=>i.user_id===target.userId&&i.item_code===gift.code),delta=amount(target,gift.amountPerGift);
   return {code:gift.code,amount:delta,before:old?.quantity??'0',after:log.balance_after,unseenBefore:old?.unseen_quantity??'0',unseenAfter:String(BigInt(old?.unseen_quantity??0)+BigInt(delta)),logId:log.id};
  })};
 });
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,title:PLAN.title,authorization:PLAN.authorization,delivery:'DIRECT',actor:'SYSTEM_OPS',adminId:owner.id,totals:PLAN.totals,grants,completedAt:new Date().toISOString()};
 const audits=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES($1,$2,'NAMED_USERS',$3,$4,$5) RETURNING id::text`,[owner.id,ACTION,OPERATION_KEY,JSON.stringify({priorOperation:null,planHash:PLAN_HASH,recipients:65,excluded:PLAN.excluded}),JSON.stringify(receipt)]);assert.equal(audits.length,1);receipt.auditId=audits[0].id;
 assert.equal((await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)])).rowCount,1);
 const verification=await verifyPinballRewards(client,receipt,{balances:true});assert.ok(Date.now()<leaseDeadline-3000,'Lease deadline too near to commit');return {receipt,replayed:false,verification};
}

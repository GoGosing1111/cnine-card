import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(fs.readFileSync(new URL('./jomang-duo-mission-20261009.json',import.meta.url),'utf8'));
export const PLAN_HASH='beddd5517ae6cdb4388e2fa34cbdc7de714223987af1cf846fac1e0be57b07e3';
export const OPERATION_KEY=PLAN.operationKey;
export const ACTION='OPS_JOMANG_DUO_MISSION_20261009';
export const REFERENCE_TYPE='OPS_EVENT_REWARD';
const ids=PLAN.recipients.map(r=>r.userId);
const q=async(client,sql,values=[])=>(await client.query(sql,values)).rows;
const safeMax=BigInt(Number.MAX_SAFE_INTEGER);

function validatePlan(hash){
 assert.equal(hash,PLAN_HASH,'Inspected plan hash required');
 assert.equal(createHash('sha256').update(JSON.stringify(PLAN)).digest('hex'),PLAN_HASH,'Plan changed');
 assert.equal(ids.length,25);assert.equal(new Set(ids).size,25);
 assert.equal(new Set(PLAN.recipients.map(r=>r.participant)).size,25);
 assert.equal(PLAN.coinPerRecipient,'1200000000000');assert.equal(PLAN.masterStarsPerRecipient,'12000000');
 assert.deepEqual(PLAN.totals,{recipients:25,coin:'30000000000000',masterStars:'300000000'});
 assert.equal(PLAN.title,'조망듀오 미션 사은품');assert.equal(PLAN.delivery,'DIRECT');
}

export async function verifyJomangRewards(client,receipt,{balances=false}={}){
 validatePlan(receipt.planHash);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.delivery,'DIRECT');assert.deepEqual(receipt.authorization,PLAN.authorization);
 assert.deepEqual(receipt.totals,PLAN.totals);assert.equal(receipt.grants.length,25);
 assert.equal(new Set(receipt.grants.map(g=>g.userId)).size,25);
 const coins=await q(client,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id=ANY($1::bigint[])',[receipt.grants.map(g=>g.coin.logId)]);
 const stars=await q(client,'SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type,reference_id,admin_id::text FROM inventory_logs WHERE id=ANY($1::bigint[])',[receipt.grants.map(g=>g.masterStars.logId)]);
 const audits=await q(client,'SELECT id::text,admin_id::text,action_type,target_type,target_id,before_data,after_data FROM admin_logs WHERE id=ANY($1::bigint[])',[receipt.grants.map(g=>g.adminLogId)]);
 assert.equal(coins.length,25);assert.equal(stars.length,25);assert.equal(audits.length,25);
 assert.equal(new Set(coins.map(r=>r.user_id)).size,25);assert.equal(new Set(stars.map(r=>r.user_id)).size,25);
 const current=balances?await q(client,`SELECT u.id::text,u.coin::text,i.quantity::text,i.unseen_quantity::text FROM users u
  LEFT JOIN cnine_user_inventory i ON i.user_id=u.id AND i.item_code='MASTER_STAR' WHERE u.id=ANY($1::bigint[])`,[ids]):[];
 for(const expected of PLAN.recipients){
  const grant=receipt.grants.find(g=>g.userId===expected.userId);assert.ok(grant);
  for(const field of Object.keys(expected))assert.deepEqual(grant[field],expected[field]);
  assert.equal(grant.operationKey,OPERATION_KEY);assert.equal(grant.reason,PLAN.title);
  assert.equal(grant.coin.amount,PLAN.coinPerRecipient);assert.equal(grant.masterStars.amount,PLAN.masterStarsPerRecipient);
  assert.equal(BigInt(grant.coin.after)-BigInt(grant.coin.before),BigInt(PLAN.coinPerRecipient));
  assert.equal(BigInt(grant.masterStars.after)-BigInt(grant.masterStars.before),BigInt(PLAN.masterStarsPerRecipient));
  assert.equal(BigInt(grant.masterStars.unseenAfter)-BigInt(grant.masterStars.unseenBefore),BigInt(PLAN.masterStarsPerRecipient));
  const coin=coins.find(r=>r.id===grant.coin.logId),star=stars.find(r=>r.id===grant.masterStars.logId),audit=audits.find(r=>r.id===grant.adminLogId);
  assert.ok(coin&&star&&audit);
  for(const [log,reward] of [[coin,grant.coin],[star,grant.masterStars]]){
   assert.equal(log.user_id,grant.userId);assert.equal(log.change_amount,reward.amount);assert.equal(log.balance_after,reward.after);
   assert.equal(log.reason,PLAN.title);assert.equal(log.admin_id,receipt.adminId);
  }
  assert.equal(star.item_code,'MASTER_STAR');assert.equal(star.reference_type,REFERENCE_TYPE);assert.equal(star.reference_id,OPERATION_KEY);
  assert.equal(audit.action_type,ACTION);assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,grant.userId);assert.equal(audit.admin_id,receipt.adminId);
  const {adminLogId,...logged}=grant;assert.deepEqual(JSON.parse(audit.after_data),logged);
  assert.deepEqual(JSON.parse(audit.before_data),{coin:grant.coin.before,masterStars:grant.masterStars.before,unseenMasterStars:grant.masterStars.unseenBefore});
  if(balances){const row=current.find(r=>r.id===grant.userId);assert.ok(row);
   assert.equal(row.coin,grant.coin.after);assert.equal(row.quantity,grant.masterStars.after);assert.equal(row.unseen_quantity,grant.masterStars.unseenAfter);}
 }
 return {recipients:25,coinLogs:coins.length,inventoryLogs:stars.length,adminLogs:audits.length,missing:0,duplicates:0,totalCoin:PLAN.totals.coin,totalMasterStars:PLAN.totals.masterStars};
}

// Caller must BEGIN and COMMIT/ROLLBACK. Balances, logs and the fixed receipt commit together.
export async function grantJomangRewards(client,hash){
 validatePlan(hash);
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){const receipt=JSON.parse(saved.value);return {receipt,replayed:true,verification:await verifyJomangRewards(client,receipt)};}
 const prior=await q(client,'SELECT id FROM admin_logs WHERE action_type=$1',[ACTION]);assert.equal(prior.length,0,'Prior grant without receipt requires reconciliation');
 const users=await q(client,'SELECT id::text,nickname,status,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
 const providers=await q(client,'SELECT user_id::text,provider,provider_name,provider_user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[ids]);
 assert.equal(users.length,25);
 for(const target of PLAN.recipients){
  const u=users.find(r=>r.id===target.userId),v=providers.find(r=>r.user_id===target.userId);
  assert.equal(u?.nickname,target.gameNickname);assert.equal(u?.status,'ACTIVE');
  assert.equal(v?.provider??null,target.provider);assert.equal(v?.provider_name??null,target.providerName);assert.equal(v?.provider_user_id??null,target.providerUserId);
  assert.ok(BigInt(u.coin)>=0n&&BigInt(u.coin)+BigInt(PLAN.coinPerRecipient)<=safeMax,'Coin storage range exceeded');
 }
 const [owner]=await q(client,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");assert.ok(owner);
 const [item]=await q(client,"SELECT code,name,is_active FROM inventory_items WHERE code='MASTER_STAR' FOR SHARE");
 assert.equal(item?.name,'마스터의 별');assert.equal(Number(item?.is_active),1);
 const before=await q(client,"SELECT user_id::text,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR' ORDER BY user_id FOR UPDATE",[ids]);
 for(const row of before)for(const field of ['quantity','unseen_quantity'])assert.ok(BigInt(row[field])>=0n&&BigInt(row[field])+BigInt(PLAN.masterStarsPerRecipient)<=safeMax,'Inventory storage range exceeded');
 const creditedCoins=await q(client,'UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id::text,coin::text',[ids,PLAN.coinPerRecipient]);assert.equal(creditedCoins.length,25);
 const creditedStars=await q(client,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
  SELECT user_id,'MASTER_STAR',$2::bigint,$2::bigint,sqlite_now(),sqlite_now() FROM unnest($1::bigint[]) x(user_id)
  ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+EXCLUDED.quantity,
   unseen_quantity=cnine_user_inventory.unseen_quantity+EXCLUDED.unseen_quantity,updated_at=EXCLUDED.updated_at
  RETURNING user_id::text,quantity::text,unseen_quantity::text`,[ids,PLAN.masterStarsPerRecipient]);assert.equal(creditedStars.length,25);
 const coinLogs=await q(client,`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id)
  SELECT id,$2::bigint,coin,$3,$4 FROM users WHERE id=ANY($1::bigint[]) RETURNING id::text,user_id::text`,[ids,PLAN.coinPerRecipient,PLAN.title,owner.id]);assert.equal(coinLogs.length,25);
 const starLogs=await q(client,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id)
  SELECT user_id,'MASTER_STAR',$2::bigint,quantity,$3,$4,$5,$6 FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR'
  RETURNING id::text,user_id::text`,[ids,PLAN.masterStarsPerRecipient,PLAN.title,REFERENCE_TYPE,OPERATION_KEY,owner.id]);assert.equal(starLogs.length,25);
 const grants=PLAN.recipients.map(r=>{
  const u=users.find(u=>u.id===r.userId),b=before.find(i=>i.user_id===r.userId),c=creditedCoins.find(u=>u.id===r.userId),s=creditedStars.find(i=>i.user_id===r.userId);
  const coin=coinLogs.find(l=>l.user_id===r.userId),star=starLogs.find(l=>l.user_id===r.userId);assert.ok(u&&c&&s&&coin&&star);
  return {...r,operationKey:OPERATION_KEY,reason:PLAN.title,actor:'CODEX_OPERATIONS',
   coin:{amount:PLAN.coinPerRecipient,before:u.coin,after:c.coin,logId:coin.id},
   masterStars:{amount:PLAN.masterStarsPerRecipient,before:b?.quantity||'0',after:s.quantity,unseenBefore:b?.unseen_quantity||'0',unseenAfter:s.unseen_quantity,logId:star.id}};
 });
 const audits=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  SELECT $1,$2,'USER',x.user_id,x.before_data,x.after_data FROM unnest($3::text[],$4::text[],$5::text[]) x(user_id,before_data,after_data)
  RETURNING id::text,target_id`,[owner.id,ACTION,ids,
   grants.map(g=>JSON.stringify({coin:g.coin.before,masterStars:g.masterStars.before,unseenMasterStars:g.masterStars.unseenBefore})),grants.map(g=>JSON.stringify(g))]);assert.equal(audits.length,25);
 for(const g of grants){const a=audits.find(a=>a.target_id===g.userId);assert.ok(a);g.adminLogId=a.id;}
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:PLAN.authorization,
  delivery:'DIRECT',adminId:owner.id,totals:PLAN.totals,grants,completedAt:new Date().toISOString()};
 assert.equal((await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)])).rowCount,1);
 return {receipt,replayed:false,verification:await verifyJomangRewards(client,receipt,{balances:true})};
}

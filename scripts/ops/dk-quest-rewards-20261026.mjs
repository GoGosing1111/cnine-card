import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';

export const OPERATION_KEY='ops:dk-quest-rewards:20261026:v1';
export const DAILY_KEY='playdk_daily_quest_settings_v1',WEEKLY_KEY='quest_weekly_settings_v20260924';
export const DATE='2026-10-26',START='2026-10-25 15:00:00',END='2026-10-26 15:00:00';
export const DAILY_AMOUNT='5000000000000',WEEKLY_AMOUNT='30000000000000';
export const CAMPAIGN_PREFIX='dk-quest-rewards-20261026-v1:';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const stamp=()=>new Date().toISOString();
const campaign=row=>CAMPAIGN_PREFIX+row.kind.toLowerCase()+':'+hash(row.sourceId).slice(0,24);
const summarize=plan=>({uniqueUsers:new Set(plan.map(r=>r.userId)).size,...Object.fromEntries(['DAILY','WEEKLY'].map(kind=>{const rows=plan.filter(r=>r.kind===kind);return [kind,{count:rows.length,totalCoin:String(rows.reduce((n,r)=>n+BigInt(r.delta),0n))}]}))});
async function start(c){await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');await c.query("SET LOCAL lock_timeout='8s'");await c.query("SET LOCAL statement_timeout='30s'");await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);}
async function saved(c){const [r]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);return r?JSON.parse(r.value):null;}
function checkReceipt(r){assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.planHash,hash(r.plan));return r;}
async function store(c,r){assert.equal((await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at RETURNING key',[OPERATION_KEY,JSON.stringify(r)])).length,1);}
async function audit(c,action,before,after){const [r]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'QUEST_REWARD',$2,$3,$4) RETURNING id::text",[action,OPERATION_KEY,JSON.stringify(before),JSON.stringify(after)]);assert(r);return r.id;}

export async function eligibleQuestDeltas(c){
 const daily=await q(c,`SELECT id::text source_id,user_id::text,quest_date,reward_coin::text amount,post_count::text,claimed_at
  FROM wago_daily_quest_claims WHERE REPLACE(SUBSTR(claimed_at,1,19),'T',' ') >= $1 AND REPLACE(SUBSTR(claimed_at,1,19),'T',' ') < $2 AND reward_coin<$3::bigint ORDER BY user_id,id`,[START,END,DAILY_AMOUNT]);
 const weekly=await q(c,`SELECT q.claim_token source_id,q.user_id::text,q.week_key,q.created_at,q.reward_amount::text amount,q.status,q.reward_type,q.progress::text,q.message_id::text,
  m.user_id::text message_user,r.user_id::text reward_user,r.reward_type attachment_type,r.reward_amount::text attachment_amount
  FROM quest_weekly_claims_v1 q LEFT JOIN user_messages m ON m.id=q.message_id LEFT JOIN user_message_rewards r ON r.message_id=q.message_id
  WHERE q.quest_id='POST' AND REPLACE(SUBSTR(q.created_at,1,19),'T',' ') >= $1 AND REPLACE(SUBSTR(q.created_at,1,19),'T',' ') < $2 AND q.reward_amount<$3::bigint ORDER BY q.user_id,q.week_key`,[START,END,WEEKLY_AMOUNT]);
 const plan=[];
 for(const r of daily){assert(BigInt(r.amount)>=0n&&BigInt(r.post_count)>=0n);plan.push({kind:'DAILY',userId:r.user_id,sourceId:r.source_id,period:r.quest_date,sourceCreatedAt:r.claimed_at,progress:r.post_count,original:r.amount,delta:String(BigInt(DAILY_AMOUNT)-BigInt(r.amount))});}
 for(const r of weekly){
  assert.equal(r.status,'COMPLETED','Pending weekly receipt');assert.equal(r.reward_type,'COIN');assert(BigInt(r.amount)>0n&&BigInt(r.progress)>=0n);
  assert.equal(r.message_user,r.user_id);assert.equal(r.reward_user,r.user_id);assert.equal(r.attachment_type,'COIN');assert.equal(r.attachment_amount,r.amount,'Original weekly attachment changed');
  // An already completed, authorized prior-week exception is still a receipt
  // issued today. Preserve its measured progress instead of fabricating 300.
  plan.push({kind:'WEEKLY',userId:r.user_id,sourceId:r.source_id,period:r.week_key,sourceCreatedAt:r.created_at,progress:r.progress,originalMessageId:r.message_id,original:r.amount,delta:String(BigInt(WEEKLY_AMOUNT)-BigInt(r.amount))});
 }
 assert.equal(new Set(plan.map(campaign)).size,plan.length,'Duplicate source receipt');return plan;
}

// Lock settings before freezing receipts: existing claims hold FOR SHARE until
// commit; stale requests waiting for this cutover fail their policy comparison.
// No user/FK locks are acquired while holding these configuration locks.
export async function configureQuestIncrease(c,{dryRun=false,expectedSettingsHash,now=new Date()}={}){
 const prior=await saved(c);if(prior)return {receipt:checkReceipt(prior),replayed:true,dryRun};
 await start(c);
 try{
  const existing=await saved(c);if(existing){await c.query('ROLLBACK');return {receipt:checkReceipt(existing),replayed:true,dryRun};}
  assert.equal(new Date(now.getTime()+9*3600000).toISOString().slice(0,10),DATE,'Authorized KST date required');
  assert((await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'")).length,'Active OWNER required');
  const rows=await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[DAILY_KEY,WEEKLY_KEY]]);assert.equal(rows.length,2);
  const before=Object.fromEntries(rows.map(r=>[r.key,JSON.parse(r.value)]));assert.equal(hash(before),expectedSettingsHash,'Reviewed settings changed');
  const daily=before[DAILY_KEY],weekly=before[WEEKLY_KEY];assert.equal(daily.requiredPosts,15);assert.equal(daily.enabled,true);assert.equal(daily.postEnabled,true);
  assert.equal(daily.postRewardCoin,100000000000);assert.equal(daily.rewardCoin,100000000000);assert.deepEqual(weekly.quests.POST,{enabled:true,rewardType:'COIN',rewardAmount:1000000000000});assert(Number.isSafeInteger(weekly.revision));
  const after={[DAILY_KEY]:{...daily,postRewardCoin:Number(DAILY_AMOUNT),rewardCoin:Number(DAILY_AMOUNT)},[WEEKLY_KEY]:{...weekly,revision:weekly.revision+1,operationToken:randomUUID(),quests:{...weekly.quests,POST:{...weekly.quests.POST,rewardAmount:Number(WEEKLY_AMOUNT)}}}};
  const plan=await eligibleQuestDeltas(c);assert.equal((await q(c,'SELECT id FROM user_messages WHERE campaign_key LIKE $1',[CAMPAIGN_PREFIX+'%'])).length,0,'Supplement already exists');
  for(const key of [DAILY_KEY,WEEKLY_KEY])assert.equal((await q(c,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[key,JSON.stringify(after[key])])).length,1);
  const receipt={operationKey:OPERATION_KEY,status:'CONFIGURED',date:DATE,receiptWindow:{start:START,end:END,timezone:'UTC'},delivery:'MESSAGE',before,after,plan,planHash:hash(plan),summary:summarize(plan),configuredAt:stamp(),authorization:'DK 글작성 일일 15개 5조·주간 30조. 오늘 수령자는 차액을 메시지 보상으로 소급 지급.'};
  receipt.configAuditId=await audit(c,'OPS_DK_QUEST_REWARDS_CONFIG',before,{after,planHash:receipt.planHash,summary:receipt.summary});await store(c,receipt);
  await c.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,replayed:false,dryRun};
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verifyQuestIncrease(c,receipt){
 checkReceipt(receipt);assert.equal(receipt.status,'COMPLETED');
 const rows=await q(c,`SELECT m.id::text message_id,m.user_id::text,m.campaign_key,r.id::text reward_id,r.user_id::text reward_user,
  r.reward_type,r.reward_amount::text amount,r.claimed_at,cr.reward_amount::text claim_amount,cr.user_id::text claim_user,
  cr.message_id::text claim_message,cr.reward_type claim_type,cr.balance_before::text,cr.balance_after::text
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id
  WHERE m.campaign_key LIKE $1 ORDER BY m.campaign_key,m.user_id`,[CAMPAIGN_PREFIX+'%']);
 assert.equal(rows.length,receipt.plan.length,'Missing or duplicate supplemental message');
 for(const target of receipt.plan){
  const matching=rows.filter(r=>r.user_id===target.userId&&r.campaign_key===campaign(target));assert.equal(matching.length,1);const r=matching[0];
  assert(r.reward_id);assert.equal(r.reward_user,target.userId);assert.equal(r.reward_type,'COIN');assert.equal(r.amount,target.delta);
  assert.equal(BigInt(target.original)+BigInt(r.amount),BigInt(target.kind==='DAILY'?DAILY_AMOUNT:WEEKLY_AMOUNT));
  if(r.claimed_at){assert.equal(r.claim_user,target.userId);assert.equal(r.claim_message,r.message_id);assert.equal(r.claim_type,'COIN');assert.equal(r.claim_amount,r.amount);assert.equal(BigInt(r.balance_after)-BigInt(r.balance_before),BigInt(r.amount));}else assert.equal(r.claim_amount,null);
 }
 assert.deepEqual(await eligibleQuestDeltas(c),receipt.plan,'Eligible receipts changed after cutover');
 assert.equal((await q(c,'SELECT id FROM admin_logs WHERE target_id=$1 AND action_type=$2',[OPERATION_KEY,'OPS_DK_QUEST_REWARDS_RETRO_MESSAGES'])).length,1);
 return {summary:receipt.summary,messages:rows.length,rewards:rows.length,collected:rows.filter(r=>r.claimed_at).length,missing:0,duplicates:0};
}

// Attachments and receipt commit together. Original quest receipts, original
// reward messages and account wallets are never rewritten by this operation.
export async function deliverQuestDeltas(c,{dryRun=false,expectedPlanHash}={}){
 const prior=await saved(c);assert(prior,'Configure first');assert.equal(prior.planHash,expectedPlanHash,'Reviewed plan hash required');
 if(prior.status==='COMPLETED')return {receipt:checkReceipt(prior),verification:await verifyQuestIncrease(c,prior),replayed:true,dryRun};
 await start(c);
 try{
  const receipt=checkReceipt(await saved(c));assert.equal(receipt.planHash,expectedPlanHash);
  if(receipt.status==='COMPLETED'){const verification=await verifyQuestIncrease(c,receipt);await c.query('ROLLBACK');return {receipt,verification,replayed:true,dryRun};}
  assert.equal(receipt.status,'CONFIGURED');assert.deepEqual(await eligibleQuestDeltas(c),receipt.plan,'Eligible receipts changed after cutover');
  const targets=receipt.plan.map(r=>({user_id:r.userId,campaign_key:campaign(r),amount:r.delta,title:(r.kind==='DAILY'?'일일':'주간')+' DK 글작성 퀘스트 보상 인상 차액',body:`오늘(2026년 10월 26일) 수령한 DK 글작성 ${r.kind==='DAILY'?'일일':'주간'} 퀘스트 보상이 ${r.kind==='DAILY'?'5조':'30조'} 코인으로 인상되어 차액 ${Number(r.delta).toLocaleString('ko-KR')} 코인을 추가 지급합니다. 기존 보상 ${Number(r.original).toLocaleString('ko-KR')} 코인은 유지됩니다.${r.kind==='WEEKLY'?' 기존 주간 보상을 아직 받지 않았다면 원래 메시지와 이 메시지의 보상을 각각 수령해 주세요.':''}`}));
  const payload=JSON.stringify(targets);
  const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT user_id,'ADMIN',title,body,'COIN_REWARD',campaign_key FROM jsonb_to_recordset($1::jsonb) AS p(user_id bigint,title text,body text,campaign_key text) ORDER BY user_id,campaign_key RETURNING id::text,user_id::text,campaign_key`,[payload]);assert.equal(messages.length,targets.length,'Partial message insert');
  const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT m.id,m.user_id,'COIN',p.amount FROM jsonb_to_recordset($1::jsonb) AS p(user_id bigint,campaign_key text,amount bigint) JOIN user_messages m ON m.user_id=p.user_id AND m.campaign_key=p.campaign_key ORDER BY m.id RETURNING id::text,message_id::text`,[payload]);assert.equal(rewards.length,targets.length,'Partial reward insert');
  const completed={...receipt,status:'COMPLETED',completedAt:stamp(),messages:messages.map(m=>({userId:m.user_id,campaign:m.campaign_key,messageId:m.id,rewardId:rewards.find(r=>r.message_id===m.id).id}))};
  completed.deliveryAuditId=await audit(c,'OPS_DK_QUEST_REWARDS_RETRO_MESSAGES',{planHash:receipt.planHash},{summary:receipt.summary,messages:completed.messages});await store(c,completed);
  const verification=await verifyQuestIncrease(c,completed);await c.query(dryRun?'ROLLBACK':'COMMIT');return {receipt:completed,verification,replayed:false,dryRun};
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}
}

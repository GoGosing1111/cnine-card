import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';

export const OPERATION_KEY='ops:dk-quest-reward-increase:20261017:v1';
export const DAILY_KEY='playdk_daily_quest_settings_v1';
export const WEEKLY_KEY='quest_weekly_settings_v20260924';
export const DATE='2026-10-17',WEEK='2026-10-12';
export const DAILY_AMOUNT='100000000000',WEEKLY_AMOUNT='1000000000000';
export const CAMPAIGNS={DAILY:'dk-quest-increase-20261017-daily-v1',WEEKLY:'dk-quest-increase-20261017-weekly-v1'};
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const parse=JSON.parse;
const hash=plan=>createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const stamp=()=>new Date().toISOString();
async function start(c){
 await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');
 await c.query("SET LOCAL lock_timeout='8s'");await c.query("SET LOCAL statement_timeout='30s'");
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
}
async function saved(c){const [row]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);return row?parse(row.value):null;}
async function store(c,receipt){
 const rows=await q(c,`INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at RETURNING key`,[OPERATION_KEY,JSON.stringify(receipt)]);
 assert.equal(rows.length,1);
}
async function audit(c,action,before,after){
 const [row]=await q(c,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES(1,$1,'QUEST_REWARD',$2,$3,$4) RETURNING id::text`,[action,OPERATION_KEY,JSON.stringify(before),JSON.stringify(after)]);
 assert.ok(row,'Missing audit');return row.id;
}
export async function eligibleQuestDeltas(c){
 const daily=await q(c,`SELECT id::text source_id,user_id::text,quest_date,reward_coin::text amount,post_count::text
  FROM wago_daily_quest_claims WHERE quest_date=$1 AND reward_coin<$2::bigint ORDER BY user_id`,[DATE,DAILY_AMOUNT]);
 const weekly=await q(c,`SELECT q.claim_token source_id,q.user_id::text,q.reward_amount::text amount,q.status,q.reward_type,q.progress::text,
  m.user_id::text message_user,r.user_id::text reward_user,r.reward_type attachment_type,r.reward_amount::text attachment_amount
  FROM quest_weekly_claims_v1 q LEFT JOIN user_messages m ON m.id=q.message_id
  LEFT JOIN user_message_rewards r ON r.message_id=q.message_id
  WHERE q.week_key=$1 AND q.quest_id='POST' AND q.reward_amount<$2::bigint ORDER BY q.user_id`,[WEEK,WEEKLY_AMOUNT]);
 const plan=[];
 for(const row of daily){
  assert.ok(BigInt(row.amount)>=0n&&BigInt(row.post_count)>=15n,'Invalid daily receipt');
  plan.push({kind:'DAILY',userId:row.user_id,sourceId:row.source_id,original:row.amount,delta:String(BigInt(DAILY_AMOUNT)-BigInt(row.amount))});
 }
 for(const row of weekly){
  assert.equal(row.status,'COMPLETED','Pending weekly receipt');assert.equal(row.reward_type,'COIN');
  assert.ok(BigInt(row.amount)>0n&&BigInt(row.progress)>=300n,'Invalid weekly receipt');
  assert.equal(row.message_user,row.user_id);assert.equal(row.reward_user,row.user_id);
  assert.equal(row.attachment_type,'COIN');assert.equal(row.attachment_amount,row.amount,'Original weekly attachment changed');
  plan.push({kind:'WEEKLY',userId:row.user_id,sourceId:row.source_id,original:row.amount,delta:String(BigInt(WEEKLY_AMOUNT)-BigInt(row.amount))});
 }
 assert.equal(new Set(plan.map(r=>r.kind+':'+r.userId)).size,plan.length,'Duplicate source receipt');
 return plan;
}
const summary=plan=>Object.fromEntries(['DAILY','WEEKLY'].map(kind=>{
 const rows=plan.filter(r=>r.kind===kind);return [kind,{count:rows.length,totalCoin:String(rows.reduce((n,r)=>n+BigInt(r.delta),0n))}];
}));

// Phase 1 locks only settings, then freezes eligible receipts after earlier claims
// have committed. No user/FK locks are acquired while holding settings locks.
export async function configureQuestIncrease(c,{dryRun=false,now=new Date()}={}){
 await start(c);
 try{
  const existing=await saved(c);
  if(existing){assert.equal(existing.operationKey,OPERATION_KEY);assert.equal(existing.planHash,hash(existing.plan));await c.query('ROLLBACK');return {receipt:existing,replayed:true,dryRun};}
  assert.equal(new Date(now.getTime()+9*3600000).toISOString().slice(0,10),DATE,'Operation is limited to the authorized KST date');
  assert.ok((await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'")).length,'Active OWNER required');
  const rows=await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[DAILY_KEY,WEEKLY_KEY]]);
  assert.equal(rows.length,2,'Missing quest settings');
  const before=Object.fromEntries(rows.map(r=>[r.key,parse(r.value)])),daily=before[DAILY_KEY],weekly=before[WEEKLY_KEY];
  assert.equal(daily.postRewardCoin,10000000000);assert.equal(daily.rewardCoin,10000000000);
  assert.equal(daily.enabled,true);assert.equal(daily.postEnabled,true);assert.equal(daily.requiredPosts,15);
  assert.deepEqual(weekly.quests.POST,{enabled:true,rewardType:'COIN',rewardAmount:250000000000});
  assert.ok(Number.isSafeInteger(weekly.revision));
  const after={
   [DAILY_KEY]:{...daily,postRewardCoin:Number(DAILY_AMOUNT),rewardCoin:Number(DAILY_AMOUNT)},
   [WEEKLY_KEY]:{...weekly,revision:weekly.revision+1,operationToken:randomUUID(),quests:{...weekly.quests,POST:{...weekly.quests.POST,rewardAmount:Number(WEEKLY_AMOUNT)}}}
  };
  const plan=await eligibleQuestDeltas(c);
  assert.equal((await q(c,'SELECT id FROM user_messages WHERE campaign_key=ANY($1::text[])',[Object.values(CAMPAIGNS)])).length,0,'Supplement campaign already exists');
  for(const key of [DAILY_KEY,WEEKLY_KEY])assert.equal((await q(c,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[key,JSON.stringify(after[key])])).length,1);
  const receipt={operationKey:OPERATION_KEY,status:'CONFIGURED',date:DATE,week:WEEK,delivery:'MESSAGE',before,after,plan,planHash:hash(plan),summary:summary(plan),configuredAt:stamp(),authorization:'일일퀘스트 1000억, 주간퀘스트 1조. 오늘 일일 및 이번 주 주간 소급 적용.'};
  receipt.configAuditId=await audit(c,'OPS_DK_QUEST_REWARD_INCREASE',before,{after,planHash:receipt.planHash,summary:receipt.summary});
  await store(c,receipt);await c.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,replayed:false,dryRun};
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verifyQuestIncrease(c,receipt){
 assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.planHash,hash(receipt.plan));
 const rows=await q(c,`SELECT m.id::text message_id,m.user_id::text,m.campaign_key,r.id::text reward_id,r.user_id::text reward_user,
  r.reward_type,r.reward_amount::text amount,r.claimed_at,cr.reward_amount::text claim_amount,cr.user_id::text claim_user,
  cr.message_id::text claim_message,cr.reward_type claim_type,cr.balance_before::text,cr.balance_after::text
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id
  WHERE m.campaign_key=ANY($1::text[]) ORDER BY m.campaign_key,m.user_id`,[Object.values(CAMPAIGNS)]);
 assert.equal(rows.length,receipt.plan.length,'Missing or duplicate supplemental message');
 for(const target of receipt.plan){
  const matching=rows.filter(r=>r.user_id===target.userId&&r.campaign_key===CAMPAIGNS[target.kind]);assert.equal(matching.length,1);
  const r=matching[0];assert.ok(r.reward_id);assert.equal(r.reward_user,target.userId);assert.equal(r.reward_type,'COIN');assert.equal(r.amount,target.delta);
  assert.equal(BigInt(target.original)+BigInt(r.amount),BigInt(target.kind==='DAILY'?DAILY_AMOUNT:WEEKLY_AMOUNT));
  if(r.claimed_at){assert.equal(r.claim_user,target.userId);assert.equal(r.claim_message,r.message_id);assert.equal(r.claim_type,'COIN');assert.equal(r.claim_amount,r.amount);assert.equal(BigInt(r.balance_after)-BigInt(r.balance_before),BigInt(r.amount));}
  else assert.equal(r.claim_amount,null);
 }
 // A stale pre-deployment claim must not silently escape the frozen backfill.
 assert.deepEqual(await eligibleQuestDeltas(c),receipt.plan,'Eligible receipts changed after cutover');
 assert.equal((await q(c,'SELECT id FROM admin_logs WHERE target_id=$1 AND action_type=$2',[OPERATION_KEY,'OPS_DK_QUEST_REWARD_RETRO_MESSAGES'])).length,1);
 return {summary:summary(receipt.plan),messages:rows.length,rewards:rows.length,collected:rows.filter(r=>r.claimed_at).length,missing:0,duplicates:0};
}

// Phase 2 creates inbox attachments and the completion receipt atomically. It
// never rewrites original claims/attachments or directly changes player wallets.
export async function deliverQuestDeltas(c,{dryRun=false,expectedPlanHash}={}){
 await start(c);
 try{
  const receipt=await saved(c);assert.ok(receipt,'Configure rewards before delivery');assert.equal(receipt.planHash,expectedPlanHash,'Reviewed plan hash required');
  assert.equal(receipt.planHash,hash(receipt.plan));
  if(receipt.status==='COMPLETED'){const verification=await verifyQuestIncrease(c,receipt);await c.query('ROLLBACK');return {receipt,verification,replayed:true,dryRun};}
  assert.equal(receipt.status,'CONFIGURED');
  assert.deepEqual(await eligibleQuestDeltas(c),receipt.plan,'Eligible receipts changed after cutover');
  const messages=[];
  for(const kind of ['DAILY','WEEKLY']){
   const targets=receipt.plan.filter(r=>r.kind===kind);if(!targets.length)continue;
   const title=kind==='DAILY'?'일일퀘스트 보상 인상 차액':'주간퀘스트 보상 인상 차액';
   const body=kind==='DAILY'?'오늘(2026년 10월 17일) DK 게시글 일일퀘스트 보상이 1,000억 코인으로 인상되어 기존 수령액과의 차액을 지급합니다.':'이번 주(2026년 10월 12일~18일) DK 게시글 주간퀘스트 보상이 1조 코인으로 인상되어 기존 발급액과의 차액을 지급합니다. 기존 주간 보상을 아직 받지 않았다면 원래 메시지와 이 메시지의 보상을 모두 수령해 주세요.';
   const inserted=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
    SELECT id,'ADMIN',$2,$3,'COIN_REWARD',$4 FROM unnest($1::bigint[]) AS id ORDER BY id RETURNING id::text,user_id::text`,[targets.map(r=>r.userId),title,body,CAMPAIGNS[kind]]);
   assert.equal(inserted.length,targets.length,'Partial message insert');
   const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
    SELECT m.id,m.user_id,'COIN',p.amount FROM unnest($2::bigint[],$3::bigint[]) AS p(user_id,amount)
    JOIN user_messages m ON m.user_id=p.user_id AND m.campaign_key=$1 RETURNING id::text,message_id::text`,[CAMPAIGNS[kind],targets.map(r=>r.userId),targets.map(r=>r.delta)]);
   assert.equal(rewards.length,targets.length,'Partial reward insert');
   messages.push(...inserted.map(m=>({kind,userId:m.user_id,messageId:m.id,rewardId:rewards.find(r=>r.message_id===m.id).id})));
  }
  const completed={...receipt,status:'COMPLETED',messages,completedAt:stamp()};
  completed.deliveryAuditId=await audit(c,'OPS_DK_QUEST_REWARD_RETRO_MESSAGES',{planHash:receipt.planHash},{summary:receipt.summary,messages});
  await store(c,completed);const verification=await verifyQuestIncrease(c,completed);
  await c.query(dryRun?'ROLLBACK':'COMMIT');return {receipt:completed,verification,dryRun,replayed:false};
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}
}

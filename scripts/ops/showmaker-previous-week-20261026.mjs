import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import PLAN from './showmaker-previous-week-20261026.plan.json' with {type:'json'};
import {questPeriod,QUEST_SETTINGS_KEY,WEEKLY_QUESTS} from '../../functions/_quest_hub.js';

export {PLAN};
export const OP=PLAN.operationKey,ACTION='OPS_PREVIOUS_WEEK_QUEST_COMPLETE';
export const CAMPAIGN=`weekly-quest:${PLAN.weekKey}:${PLAN.questId}`;
export const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
export const PLAN_HASH=hash(PLAN);
const DAILY_KEY='playdk_daily_quest_settings_v1';
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const saved=async db=>{const rows=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?JSON.parse(one(rows).value):null;};
assert.equal(PLAN.userId,'233');assert.equal(PLAN.questId,'POST');
assert.equal(WEEKLY_QUESTS.find(q=>q.id===PLAN.questId).target,PLAN.requiredPosts);

export async function inspect(db){
 const users=await q(db,'SELECT id::text,nickname,role,status,md5(to_jsonb(u)::text) AS row_hash FROM users u WHERE id=$1',[PLAN.userId]);
 const identities=await q(db,"SELECT user_id::text,provider,provider_user_id,provider_name FROM user_second_verifications WHERE user_id=$1 OR (provider=$2 AND provider_user_id=$3) ORDER BY user_id,provider",[PLAN.userId,PLAN.provider,PLAN.providerUserId]);
 const settings=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[QUEST_SETTINGS_KEY,DAILY_KEY]]);
 const posts=await q(db,'SELECT * FROM quest_weekly_posts_v1 WHERE user_id=$1 ORDER BY week_key',[PLAN.userId]);
 const claims=await q(db,'SELECT * FROM quest_weekly_claims_v1 WHERE user_id=$1 ORDER BY week_key,quest_id',[PLAN.userId]);
 const messages=await q(db,'SELECT id::text,user_id::text,campaign_key,message_type,title,body FROM user_messages WHERE user_id=$1 AND campaign_key=$2 ORDER BY id',[PLAN.userId,CAMPAIGN]);
 return {users,identities,settings,posts,claims,messages,receipt:await saved(db)};
}
const isTarget=c=>c.week_key===PLAN.weekKey&&c.quest_id===PLAN.questId;
const protectedHash=s=>hash({users:s.users,identities:s.identities,settings:s.settings,posts:s.posts,claims:s.claims.filter(c=>!isTarget(c))});

export async function verify(db,receipt){
 receipt??=await saved(db);assert(receipt,'Completion receipt missing');
 assert.deepEqual(await saved(db),receipt);assert.equal(receipt.operationKey,OP);assert.equal(receipt.planHash,PLAN_HASH);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.userId,PLAN.userId);assert.equal(receipt.weekKey,PLAN.weekKey);
 assert.equal(receipt.questId,PLAN.questId);assert.equal(receipt.completionMode,'OWNER_EXCEPTION');
 assert.equal(receipt.rewardAmount,PLAN.rewardAmount);assert.equal(receipt.protectedBefore,receipt.protectedAfter);
 const claim=one(await q(db,'SELECT * FROM quest_weekly_claims_v1 WHERE user_id=$1 AND week_key=$2 AND quest_id=$3',[PLAN.userId,PLAN.weekKey,PLAN.questId]));
 assert.equal(claim.status,'COMPLETED');assert.equal(claim.claim_token,receipt.claimToken);
 assert.equal(Number(claim.progress),PLAN.observedPosts,'Never invent observed post counts');
 assert.equal(claim.reward_type,PLAN.rewardType);assert.equal(String(claim.reward_amount),PLAN.rewardAmount);
 assert.equal(String(claim.message_id),receipt.messageId);
 const message=one(await q(db,'SELECT id::text,user_id::text,message_type,campaign_key FROM user_messages WHERE user_id=$1 AND campaign_key=$2',[PLAN.userId,CAMPAIGN]));
 assert.equal(message.id,receipt.messageId);assert.equal(message.message_type,'ITEM_REWARD');
 const reward=one(await q(db,'SELECT id::text,user_id::text,message_id::text,reward_type,reward_amount::text,claimed_at FROM user_message_rewards WHERE message_id=$1',[receipt.messageId]));
 assert.equal(reward.id,receipt.rewardId);assert.equal(reward.user_id,PLAN.userId);
 assert.equal(reward.reward_type,PLAN.rewardType);assert.equal(reward.reward_amount,PLAN.rewardAmount);
 const credited=await q(db,'SELECT reward_id::text,message_id::text,user_id::text,reward_type,reward_amount::text,credited_at FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=$1',[receipt.rewardId]);
 if(reward.claimed_at){const c=one(credited);assert.equal(c.user_id,PLAN.userId);assert.equal(c.message_id,receipt.messageId);assert.equal(c.reward_type,PLAN.rewardType);assert.equal(c.reward_amount,PLAN.rewardAmount);assert(c.credited_at);}
 else assert.equal(credited.length,0);
 const source=one(await q(db,'SELECT * FROM quest_weekly_posts_v1 WHERE user_id=$1 AND week_key=$2',[PLAN.userId,PLAN.weekKey]));
 assert.equal(hash(source),receipt.sourceHash,'Original post evidence changed');
 const audit=one(await q(db,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));
 assert.equal(audit.id,receipt.auditId);assert.equal(audit.admin_id,'1');
 const {auditId,...recorded}=receipt;assert.deepEqual(JSON.parse(audit.after_data),recorded);
 return {verified:true,userId:PLAN.userId,nickname:PLAN.nickname,weekKey:PLAN.weekKey,lastDate:PLAN.lastDate,questId:PLAN.questId,status:'COMPLETED',observedPosts:PLAN.observedPosts,requiredPosts:PLAN.requiredPosts,completionMode:receipt.completionMode,rewardType:PLAN.rewardType,rewardAmount:PLAN.rewardAmount,delivery:PLAN.delivery,messageId:message.id,rewardId:reward.id,rewardCollected:Boolean(reward.claimed_at),auditId:receipt.auditId,duplicateRewards:0};
}

export async function complete(db,{expectedPlanHash,dryRun=true,now=Date.now()}={}){
 assert.equal(expectedPlanHash,PLAN_HASH,'Reviewed plan required');
 const prior=await saved(db);if(prior)return {replayed:true,committed:true,receipt:prior,verification:await verify(db,prior)};
 const period=questPeriod(now),previous=questPeriod(now-7*86400000);
 assert.equal(period.today,PLAN.operationDateKst,'Only the authorized operation date may create this exception');
 assert.equal(previous.weekKey,PLAN.weekKey);assert.equal(previous.lastDate,PLAN.lastDate);
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='12s'");
  await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
  const replay=await saved(db);if(replay){const verification=await verify(db,replay);await db.query('ROLLBACK');return {replayed:true,committed:true,receipt:replay,verification};}
  one(await q(db,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[PLAN.userId]));
  await q(db,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[PLAN.userId]);
  await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[[QUEST_SETTINGS_KEY,DAILY_KEY]]);
  await q(db,'SELECT user_id FROM quest_weekly_posts_v1 WHERE user_id=$1 AND week_key=$2 FOR SHARE',[PLAN.userId,PLAN.weekKey]);
  const before=await inspect(db),user=one(before.users),identity=one(before.identities);
  assert.equal(user.id,PLAN.userId);assert.equal(user.nickname,PLAN.nickname);assert.equal(user.role,'USER');assert.equal(user.status,'ACTIVE');
  assert.equal(identity.user_id,PLAN.userId);assert.equal(identity.provider,PLAN.provider);assert.equal(identity.provider_user_id,PLAN.providerUserId);
  one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const config=JSON.parse(one(before.settings.filter(s=>s.key===QUEST_SETTINGS_KEY)).value);
  const daily=JSON.parse(one(before.settings.filter(s=>s.key===DAILY_KEY)).value);
  assert.equal(config.revision,PLAN.settingsRevision);assert.deepEqual(config.quests.POST,{enabled:true,rewardType:PLAN.rewardType,rewardAmount:Number(PLAN.rewardAmount)});
  assert.deepEqual([...daily.boardSlugs].sort(),PLAN.boardSlugs);
  const source=one(before.posts.filter(p=>p.week_key===PLAN.weekKey));
  assert.equal(source.provider_user_id,PLAN.providerUserId);assert.equal(Number(source.post_count),PLAN.observedPosts);
  assert.equal(source.checked_at,PLAN.sourceCheckedAt);assert.deepEqual(JSON.parse(source.board_slugs_json),PLAN.boardSlugs);
  assert.equal(before.claims.filter(isTarget).length,0,'Existing weekly receipt must not be overwritten');
  assert.equal(before.messages.length,0,'Existing weekly reward must not be duplicated');
  const token=randomUUID(),createdAt=new Date(now).toISOString();
  one(await q(db,"INSERT INTO quest_weekly_claims_v1(user_id,week_key,quest_id,claim_token,status,progress,reward_type,reward_amount) VALUES($1,$2,$3,$4,'PENDING',$5,$6,$7) RETURNING user_id",[PLAN.userId,PLAN.weekKey,PLAN.questId,token,PLAN.observedPosts,PLAN.rewardType,PLAN.rewardAmount]));
  const message=one(await q(db,"INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES($1,'SYSTEM',$2,$3,'ITEM_REWARD',$4) RETURNING id::text",[PLAN.userId,'주간퀘스트 · PLAY DK 게시글 작성',`${PLAN.weekKey} ~ ${PLAN.lastDate}\n운영자 요청에 따라 지난주 PLAY DK 게시글 작성 퀘스트를 완료 처리했습니다. 주간 보상 1조 코인을 수령해 주세요.`,CAMPAIGN]));
  const reward=one(await q(db,'INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES($1,$2,$3,$4) RETURNING id::text',[message.id,PLAN.userId,PLAN.rewardType,PLAN.rewardAmount]));
  one(await q(db,"UPDATE quest_weekly_claims_v1 SET status='COMPLETED',message_id=$1 WHERE user_id=$2 AND week_key=$3 AND quest_id=$4 AND claim_token=$5 AND status='PENDING' RETURNING user_id",[message.id,PLAN.userId,PLAN.weekKey,PLAN.questId,token]));
  const after=await inspect(db),protectedBefore=protectedHash(before),protectedAfter=protectedHash(after);assert.equal(protectedAfter,protectedBefore,'Unrelated state changed');
  const receipt={operationKey:OP,planHash:PLAN_HASH,status:'COMPLETED',userId:PLAN.userId,nickname:PLAN.nickname,weekKey:PLAN.weekKey,questId:PLAN.questId,completionMode:PLAN.completionMode,observedPosts:PLAN.observedPosts,requiredPosts:PLAN.requiredPosts,rewardType:PLAN.rewardType,rewardAmount:PLAN.rewardAmount,delivery:PLAN.delivery,autoCollectReward:false,messageId:message.id,rewardId:reward.id,claimToken:token,sourceHash:hash(source),protectedBefore,protectedAfter,completedAt:createdAt,authorization:PLAN.authorization};
  const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'WEEKLY_QUEST',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({userId:PLAN.userId,weekKey:PLAN.weekKey,source,existingClaims:0,existingMessages:0}),JSON.stringify(receipt)]));
  receipt.auditId=audit.id;
  one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(receipt),createdAt]));
  const verification=await verify(db,receipt);assert.equal(verification.rewardCollected,false);
  await db.query(dryRun?'ROLLBACK':'COMMIT');
  if(dryRun)assert.deepEqual(await inspect(db),before,'Dry run did not restore original rows');
  return {replayed:false,committed:!dryRun,rollbackVerified:dryRun,receipt,verification};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}

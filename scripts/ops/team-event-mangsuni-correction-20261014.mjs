import assert from 'node:assert/strict';
import {PLAN, PLAN_HASH, OPERATION_KEY as ORIGINAL_KEY, TARGETS, GIFTS, messageBody, verifyTeamEventRewards} from './team-event-diim-rewards-20261014.mjs';

export const KEY='ops:team-event-diim-rewards:mangsuni-correction:20261014:v1';
export const ACTION='OPS_TEAM_EVENT_RECIPIENT_CORRECTION';
export const SOURCE='5140', DESTINATION='4628';
export const PROFILE_ID='0b464ee5', NICKNAME='망순이ෆ';
export const REVOKE_SOURCE='OPS_REVOKED_UNCLAIMED';
const authorization='공백(망액이) > 망순이 특수문자 / [망순이ෆ](https://www.playdk.kr/user/0b464ee5)';
const q=async(c,s,v=[])=>(await c.query(s,v)).rows;
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const campaign=g=>`team-event-diim-20261014-v1-mangsuni-correction-${g.type==='COIN'?'coin':'star'}`;
const campaigns=[...GIFTS.map(g=>g.campaign),...GIFTS.map(campaign)];
const sourceTarget=TARGETS.find(t=>t.userId===SOURCE);
const rowsSql=`SELECT m.id::text message_id,m.user_id::text user_id,m.title,m.body,m.campaign_key,m.sender_type,m.message_type,m.is_read,m.hidden_at,
 r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text reward_amount,r.claimed_at,
 cr.reward_id::text claim_id,cr.message_id::text claim_message_id,cr.user_id::text claim_user_id,cr.reward_type claim_type,cr.reward_amount::text claim_amount,
 cr.source claim_source,cr.balance_before::text,cr.balance_after::text
 FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id
 WHERE m.campaign_key=ANY($1::text[]) ORDER BY m.user_id,m.campaign_key`;

export async function verifyCorrection(c,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,KEY);assert.equal(receipt.originalOperationKey,ORIGINAL_KEY);
 assert.equal(receipt.originalPlanHash,PLAN_HASH);assert.equal(receipt.sourceUserId,SOURCE);assert.equal(receipt.destinationUserId,DESTINATION);
 assert.equal(receipt.destinationNickname,NICKNAME);assert.equal(receipt.providerUserId,PROFILE_ID);assert.equal(receipt.authorization,authorization);
 assert.equal(receipt.noImmediateCredit,true);assert.equal(receipt.mode,'REVOKE_UNCLAIMED_AND_REISSUE');
 assert.equal(receipt.coin,sourceTarget.coin);assert.equal(receipt.masterStar,sourceTarget.masterStar);
 const [originalRow]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[ORIGINAL_KEY]);const original=parse(originalRow?.value);
 assert.equal(original?.status,'COMPLETED');assert.equal(original.planHash,PLAN_HASH);assert.deepEqual(original.recipients,TARGETS);
 assert.deepEqual(original.totals,PLAN.totals);assert.equal(receipt.originalAuditId,original.auditId);
 const originalAudits=await q(c,'SELECT id::text,after_data FROM admin_logs WHERE target_id=$1 AND action_type=$2',[ORIGINAL_KEY,'OPS_TEAM_EVENT_DIIM_REWARD_MESSAGES']);
 assert.equal(originalAudits.length,1);assert.equal(originalAudits[0].id,original.auditId);const {auditId:originalAuditId,...originalAudited}=original;assert.deepEqual(parse(originalAudits[0].after_data),originalAudited);
 const rows=await q(c,rowsSql,[campaigns]);assert.equal(rows.length,98,'Expected 96 original messages plus two corrected messages');
 const replaced=original.deliveries.filter(d=>d.userId===SOURCE);assert.equal(replaced.length,2);assert.deepEqual(receipt.revoked,replaced);
 assert.equal(receipt.deliveries.length,2);
 const effective=[];
 for(const row of rows){
  const gift=GIFTS.find(g=>row.campaign_key===g.campaign||row.campaign_key===campaign(g));assert.ok(gift);
  const replacement=row.campaign_key===campaign(gift), revoked=!replacement&&row.user_id===SOURCE;
  const target=replacement?sourceTarget:TARGETS.find(t=>t.userId===row.user_id);assert.ok(target);
  const delivery=(replacement?receipt.deliveries:original.deliveries).find(d=>d.messageId===row.message_id);
  assert.deepEqual(delivery,{userId:replacement?DESTINATION:row.user_id,campaign:row.campaign_key,messageId:row.message_id,rewardId:row.reward_id});
  assert.equal(row.user_id,replacement?DESTINATION:target.userId);assert.equal(row.reward_user_id,row.user_id);
  assert.equal(row.reward_type,gift.type);assert.equal(row.reward_amount,target[gift.field]);assert.equal(row.title,PLAN.title+' · '+gift.label);
  assert.equal(row.body,messageBody(target,gift));assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,gift.messageType);
  if(row.claim_id){assert.equal(row.claim_message_id,row.message_id);assert.equal(row.claim_user_id,row.user_id);assert.equal(row.claim_type,gift.type);assert.equal(row.claim_amount,target[gift.field]);assert.ok(row.claimed_at);}
  if(revoked){assert.ok(row.claim_id);assert.equal(row.claim_source,REVOKE_SOURCE);assert.equal(row.balance_before,'0');assert.equal(row.balance_after,'0');assert.ok(row.hidden_at);}
  else {
   effective.push(row);
   if(row.claimed_at){assert.ok(row.claim_id);assert.notEqual(row.claim_source,REVOKE_SOURCE);assert.equal(BigInt(row.balance_after)-BigInt(row.balance_before),BigInt(row.reward_amount));}else assert.equal(row.claim_id,null);
   if(replacement&&unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
  }
 }
 const expectedIds=TARGETS.map(t=>t.userId===SOURCE?DESTINATION:t.userId).sort((a,b)=>Number(a)-Number(b));
 for(const gift of GIFTS){const selected=effective.filter(r=>r.reward_type===gift.type);assert.deepEqual(selected.map(r=>r.user_id).sort((a,b)=>Number(a)-Number(b)),expectedIds);assert.equal(selected.reduce((n,r)=>n+BigInt(r.reward_amount),0n).toString(),PLAN.totals[gift.field]);}
 if(receipt.auditId){const audits=await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,KEY]);assert.equal(audits.length,1);assert.equal(audits[0].id,receipt.auditId);assert.equal(audits[0].admin_id,'1');const {auditId,...audited}=receipt;assert.deepEqual(parse(audits[0].after_data),audited);}
 return {recipients:48,winners:8,participantsOnly:40,messages:96,rewards:96,historicalMessages:98,revokedMessages:2,coin:PLAN.totals.coin,masterStar:PLAN.totals.masterStar,claimed:effective.filter(r=>r.claimed_at).length,missing:0,duplicates:0,correctionOperationKey:KEY};
}

export async function correctMangsuniRecipient(c,{expectedProfileId,commit=false}={}){
 assert.equal(expectedProfileId,PROFILE_ID,'Exact user-supplied PLAY DK profile required');
 await c.query('BEGIN');
 try{
  await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='20s'");
  const reserved=await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.length){const [row]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[KEY]);const receipt=parse(row.value),verification=await verifyCorrection(c,receipt);await c.query('ROLLBACK');return {receipt,verification,replayed:true,committed:false};}
  const identities=await q(c,`SELECT u.id::text,u.nickname,u.status,s.provider,s.provider_name,s.provider_user_id FROM users u JOIN user_second_verifications s ON s.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id FOR SHARE OF u,s`,[[DESTINATION,SOURCE]]);
  assert.deepEqual(identities,[{id:DESTINATION,nickname:NICKNAME,status:'ACTIVE',provider:'PLAYDK',provider_name:NICKNAME,provider_user_id:PROFILE_ID},{id:SOURCE,nickname:'공백',status:'ACTIVE',provider:sourceTarget.provider,provider_name:sourceTarget.providerName,provider_user_id:sourceTarget.providerId}],'Recipient identity changed');
  const [balance]=await q(c,"SELECT u.coin::text,COALESCE(i.quantity,0)::text stars FROM users u LEFT JOIN cnine_user_inventory i ON i.user_id=u.id AND i.item_code='MASTER_STAR' WHERE u.id=$1",[DESTINATION]);
  for(const [value,amount] of [[balance.coin,sourceTarget.coin],[balance.stars,sourceTarget.masterStar]])assert.ok(BigInt(value)>=0n&&BigInt(value)+BigInt(amount)<=BigInt(Number.MAX_SAFE_INTEGER),'Destination balance outside supported range');
  const [originalRow]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[ORIGINAL_KEY]);const original=parse(originalRow?.value);assert.ok(original,'Original award receipt required');
  await verifyTeamEventRewards(c,original);
  assert.equal((await q(c,'SELECT id FROM user_messages WHERE user_id=$1 AND (campaign_key=ANY($2::text[]) OR title=ANY($3::text[]))',[DESTINATION,campaigns,GIFTS.map(g=>PLAN.title+' · '+g.label)])).length,0,'Destination already has event rewards');
  const [owner]=await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
  const revoked=original.deliveries.filter(d=>d.userId===SOURCE);assert.equal(revoked.length,2);
  const before=(await q(c,rowsSql,[GIFTS.map(g=>g.campaign)])).filter(r=>r.user_id===SOURCE);
  assert.equal(before.length,2);for(const row of before){assert.equal(row.claimed_at,null,'Source award already claimed');assert.equal(row.claim_id,null,'Source award already claimed');}
  // The existing claim API inserts this same unique receipt before crediting. Reserving
  // both receipt IDs first prevents a stale/in-flight claim from crediting the old user.
  // A concurrent successful claim makes this transaction roll back; no money is clawed back.
  const barriers=await q(c,`INSERT INTO user_message_reward_claim_receipts_v1222(reward_id,message_id,user_id,reward_type,reward_amount,claim_token,balance_before,balance_after,source,credited_at)
   SELECT id,message_id,user_id,reward_type,reward_amount,$3||':'||id::text,0,0,$4,CURRENT_TIMESTAMP FROM user_message_rewards
   WHERE id=ANY($1::bigint[]) AND user_id=$2 AND claimed_at IS NULL ORDER BY id ON CONFLICT DO NOTHING RETURNING reward_id::text`,[revoked.map(d=>d.rewardId),SOURCE,KEY,REVOKE_SOURCE]);
  assert.equal(barriers.length,2,'Source award claimed concurrently; correction cancelled');
  assert.equal((await q(c,'UPDATE user_message_rewards SET claimed_at=CURRENT_TIMESTAMP WHERE id=ANY($1::bigint[]) AND user_id=$2 AND claimed_at IS NULL RETURNING id',[revoked.map(d=>d.rewardId),SOURCE])).length,2);
  assert.equal((await q(c,'UPDATE user_messages SET hidden_at=CURRENT_TIMESTAMP,is_read=1,read_at=COALESCE(read_at,CURRENT_TIMESTAMP::text) WHERE id=ANY($1::bigint[]) AND user_id=$2 RETURNING id',[revoked.map(d=>d.messageId),SOURCE])).length,2);
  const deliveries=[];
  for(const gift of GIFTS){
   const [m]=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES($1,'ADMIN',$2,$3,$4,$5) RETURNING id::text`,[DESTINATION,PLAN.title+' · '+gift.label,messageBody(sourceTarget,gift),gift.messageType,campaign(gift)]);assert.ok(m);
   const [r]=await q(c,'INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES($1,$2,$3,$4) RETURNING id::text',[m.id,DESTINATION,gift.type,sourceTarget[gift.field]]);assert.ok(r);
   deliveries.push({userId:DESTINATION,campaign:campaign(gift),messageId:m.id,rewardId:r.id});
  }
  const receipt={status:'COMPLETED',operationKey:KEY,originalOperationKey:ORIGINAL_KEY,originalPlanHash:PLAN_HASH,originalAuditId:original.auditId,sourceUserId:SOURCE,sourceNickname:'공백',destinationUserId:DESTINATION,destinationNickname:NICKNAME,providerUserId:PROFILE_ID,profileUrl:'https://www.playdk.kr/user/'+PROFILE_ID,authorization,mode:'REVOKE_UNCLAIMED_AND_REISSUE',noImmediateCredit:true,coin:sourceTarget.coin,masterStar:sourceTarget.masterStar,revoked,deliveries,completedAt:new Date().toISOString()};
  await verifyCorrection(c,receipt,{unclaimed:true});
  const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'USER_MESSAGE',$3,$4,$5) RETURNING id::text",[owner.id,ACTION,KEY,JSON.stringify({before,originalReceiptPreserved:true}),JSON.stringify(receipt)]);assert.ok(audit);receipt.auditId=audit.id;
  assert.equal((await q(c,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[KEY,JSON.stringify(receipt)])).length,1);
  const verification=await verifyCorrection(c,receipt,{unclaimed:true});
  await c.query(commit?'COMMIT':'ROLLBACK');return {receipt,verification,replayed:false,committed:commit};
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}
}

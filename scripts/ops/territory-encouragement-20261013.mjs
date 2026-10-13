import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:territory:71:encouragement-attacks20:20261013:v1';
export const CAMPAIGN='territory-encouragement-71-attacks20-20261013-v1-coin';
export const TITLE='영토전 격려 지원금';
export const AMOUNT='200000000000';
export const COUNT=113;
export const RECIPIENT_HASH='f27c751149290a9a5bc7154140fbf659e7cb298313bb4dd0b12d44729960eef6';
export const CUTOFF='2026-10-13 20:58:22 KST';
export const ROUND={id:'71',battle_name:'털',starts_at:'2026-10-13T09:32:07.881Z'};
export const BODY=`영토전 71회차 ‘털’에 적극적으로 참여해 주셔서 감사합니다.\n\n${CUTOFF} 기준, 진행 중인 영토전에서 공격 20회 이상인 참여자에게 격려 지원금 2,000억 코인을 지급합니다.\n\n아래 보상 수령 버튼을 눌러 지원금을 받아 주세요. 앞으로도 좋은 활약을 응원합니다!`;
const q=async(c,s,v=[])=>(await c.query(s,v)).rows;
export const fingerprint=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[r.userId,r.side,r.attacks]))).digest('hex');
const total=()=>String(BigInt(AMOUNT)*BigInt(COUNT));

function checkPlan(plan){
 assert.equal(plan.round.id,ROUND.id);assert.equal(plan.round.status,'ACTIVE');
 assert.equal(plan.round.battle_name,ROUND.battle_name);assert.equal(plan.round.starts_at,ROUND.starts_at);
 assert.equal(plan.time.kst+' KST',CUTOFF);assert.equal(plan.recipients.length,COUNT);
 assert.equal(new Set(plan.recipients.map(r=>r.userId)).size,COUNT);
 assert.equal(fingerprint(plan.recipients),RECIPIENT_HASH,'Inspected recipient snapshot differs');
 assert.ok(plan.recipients.every(r=>r.accountStatus==='ACTIVE'&&r.participantStatus==='ACTIVE'&&['A','B'].includes(r.side)&&r.attacks>=20&&r.storedAttacks===r.attacks&&r.actionAttacks===r.attacks),'Ineligible inspected participant');
}
async function storage(client){
 const required=[['users','coin'],['user_message_rewards','reward_amount'],['user_message_reward_claim_receipts_v1222','reward_amount'],['user_message_reward_claim_receipts_v1222','balance_before'],['user_message_reward_claim_receipts_v1222','balance_after'],['coin_logs','change_amount'],['coin_logs','balance_after']];
 const columns=await q(client,'SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',[[...new Set(required.map(([t])=>t))]]);
 assert.ok(required.every(([t,c])=>columns.some(x=>x.table_name===t&&x.column_name===c&&x.data_type==='bigint')),'COIN storage must be BIGINT end-to-end');
}

export async function verifyTerritoryEncouragement(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');assert.deepEqual(receipt.round,ROUND);
 assert.equal(receipt.count,COUNT);assert.equal(receipt.amount,AMOUNT);assert.equal(receipt.totalAmount,total());assert.equal(receipt.campaign,CAMPAIGN);
 assert.equal(receipt.cutoff,CUTOFF);assert.equal(receipt.minimumAttacks,20);assert.equal(receipt.delivery,'MESSAGE');assert.equal(receipt.noImmediateWalletCredit,true);
 assert.equal(receipt.recipientHash,RECIPIENT_HASH);assert.equal(fingerprint(receipt.recipients),RECIPIENT_HASH);
 assert.equal(new Set(receipt.messageIds).size,COUNT);assert.equal(new Set(receipt.rewardIds).size,COUNT);
 const rows=await q(client,`SELECT m.id::text message_id,m.user_id::text user_id,m.sender_type,m.title,m.body,m.message_type,m.is_read,m.hidden_at,
 r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text reward_amount,r.claimed_at,
 c.reward_id::text claim_id,c.message_id::text claim_message_id,c.user_id::text claim_user_id,c.reward_type claim_type,c.reward_amount::text claim_amount,c.balance_before::text,c.balance_after::text
 FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
 LEFT JOIN user_message_reward_claim_receipts_v1222 c ON c.reward_id=r.id WHERE m.campaign_key=$1 ORDER BY m.user_id`,[CAMPAIGN]);
 assert.equal(rows.length,COUNT,'Partial or duplicate delivery');
 const members=new Set(receipt.recipients.map(r=>r.userId)),seen=new Set();let claimed=0;
 for(const row of rows){
  assert.ok(members.has(row.user_id));assert.ok(!seen.has(row.user_id),'Duplicate recipient');seen.add(row.user_id);
  assert.ok(receipt.messageIds.includes(row.message_id));assert.ok(receipt.rewardIds.includes(row.reward_id));assert.equal(row.reward_user_id,row.user_id);
  assert.equal(row.title,TITLE);assert.equal(row.body,BODY);assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,'COIN_REWARD');assert.equal(row.reward_type,'COIN');assert.equal(row.reward_amount,AMOUNT);
  if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.claim_id,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
  if(row.claimed_at){
   assert.ok(row.claim_id);assert.equal(row.claim_message_id,row.message_id);assert.equal(row.claim_user_id,row.user_id);assert.equal(row.claim_type,'COIN');assert.equal(row.claim_amount,AMOUNT);assert.equal(BigInt(row.balance_after)-BigInt(row.balance_before),BigInt(AMOUNT));claimed++;
  }else assert.equal(row.claim_id,null);
 }
 if(receipt.auditId){const [audit]=await q(client,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);assert.equal(audit?.action_type,'TERRITORY_ENCOURAGEMENT_MESSAGE_SEND');assert.equal(audit.target_id,OPERATION_KEY);const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);}
 return {recipients:COUNT,messages:rows.length,rewards:rows.length,amount:AMOUNT,totalAmount:total(),claimed,pending:COUNT-claimed,missing:0,duplicates:0};
}

// Explicit one-time authorization. The caller owns BEGIN / COMMIT / ROLLBACK.
// Eligibility is frozen at the inspected cutoff; later threshold crossings do
// not expand a replay. No wallet, combat counters or ordinary rewards are edited.
export async function sendTerritoryEncouragement(client,plan){
 checkPlan(plan);
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){const receipt=JSON.parse(saved.value);return {receipt,verification:await verifyTerritoryEncouragement(client,receipt),replayed:true};}
 const [date]=await q(client,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst");assert.equal(date.kst,'2026-10-13','One-time operation expired');
 const [round]=await q(client,'SELECT id::text,status,battle_name,starts_at FROM territory_war_v3_rounds WHERE id=$1 FOR SHARE',[ROUND.id]);
 assert.deepEqual(round,{...ROUND,status:'ACTIVE'},'Inspected live round ended or changed');
 const current=await q(client,`SELECT p.user_id::text "userId",p.side,p.status,p.attacks::int,u.status "accountStatus"
 FROM territory_war_v3_users p JOIN users u ON u.id=p.user_id WHERE p.round_id=$1 AND p.user_id=ANY($2::bigint[]) ORDER BY p.user_id FOR SHARE OF p`,[ROUND.id,plan.recipients.map(r=>r.userId)]);
 assert.equal(current.length,COUNT);
 for(const row of current){const original=plan.recipients.find(r=>r.userId===row.userId);assert.equal(row.side,original.side);assert.equal(row.status,'ACTIVE');assert.equal(row.accountStatus,'ACTIVE');assert.ok(row.attacks>=original.attacks,'Attack counter regressed');}
 await storage(client);
 const [existing]=await q(client,'SELECT COUNT(*)::int n FROM user_messages WHERE campaign_key=$1 OR (title=$2 AND created_at::timestamptz >= $3::timestamptz)',[CAMPAIGN,TITLE,ROUND.starts_at]);assert.equal(existing.n,0,'Existing support messages need reconciliation');
 const [owner]=await q(client,"SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Missing audit owner');
 const messages=await q(client,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
 SELECT user_id,'ADMIN',$2,$3,'COIN_REWARD',$4 FROM unnest($1::bigint[]) a(user_id) ORDER BY user_id RETURNING id::text`,[plan.recipients.map(r=>r.userId),TITLE,BODY,CAMPAIGN]);assert.equal(messages.length,COUNT,'Partial message insert');
 const rewards=await q(client,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
 SELECT id,user_id,'COIN',$2::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id::text`,[CAMPAIGN,AMOUNT]);assert.equal(rewards.length,COUNT,'Partial reward insert');
 const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',round:ROUND,cutoff:CUTOFF,minimumAttacks:20,count:COUNT,amount:AMOUNT,totalAmount:total(),campaign:CAMPAIGN,
 recipientHash:RECIPIENT_HASH,recipients:plan.recipients,delivery:'MESSAGE',noImmediateWalletCredit:true,messageIds:messages.map(r=>r.id),rewardIds:rewards.map(r=>r.id),
 actor:'SYSTEM_OPS',authorization:'현재 영토전 참여자 공격횟수 20회 이상 진행중 사람들에게 영토전 격려 지원금 2천억씩 메세지로 지급해',completedAt:new Date().toISOString()};
 const verification=await verifyTerritoryEncouragement(client,receipt,{unclaimed:true});
 const [audit]=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
 VALUES($1,'TERRITORY_ENCOURAGEMENT_MESSAGE_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id::text`,[owner.id,OPERATION_KEY,JSON.stringify({existingMessages:0,cutoff:CUTOFF,oneTimeException:true}),JSON.stringify(receipt)]);assert.ok(audit?.id);receipt.auditId=audit.id;
 const stored=await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);assert.equal(stored.length,1);
 return {receipt,verification,replayed:false};
}

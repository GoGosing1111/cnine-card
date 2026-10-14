import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(readFileSync(new URL('./team-event-diim-rewards-20261014-plan.json',import.meta.url),'utf8'));
export const PLAN_HASH='8ae5aa4e8f946a3bd8359383cbc169c82bc8b32e8bdbf3cd339682fd4654961f';
export const OPERATION_KEY='ops:team-event-diim-rewards:20261014:v1';
export const ACTION='OPS_TEAM_EVENT_DIIM_REWARD_MESSAGES';
export const TARGETS=[...PLAN.recipients].sort((a,b)=>Number(a.userId)-Number(b.userId));
export const GIFTS=[{type:'COIN',field:'coin',label:'코인',messageType:'COIN_REWARD',campaign:'team-event-diim-20261014-v1-coin'},{type:'MASTER_STAR',field:'masterStar',label:'마별',messageType:'ITEM_REWARD',campaign:'team-event-diim-20261014-v1-star'}];
const ids=TARGETS.map(r=>r.userId),q=async(c,s,v=[])=>(await c.query(s,v)).rows;
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const title=gift=>PLAN.title+' · '+gift.label;
export function messageBody(target,gift){
 const intro=target.winner?'진짜디임팀의 우승을 축하드립니다!\n우승 보상과 참가 보상을 합산하여 지급합니다.':'팀 대항전에 함께해 주셔서 감사합니다!\n'+target.team+' 참가 보상을 지급합니다.';
 const total=target.winner?'총 보상: 13조 코인 + 마스터의 별 7천만 개\n(우승 10조·5천만 개 + 참가 3조·2천만 개)':'총 보상: 3조 코인 + 마스터의 별 2천만 개';
 const attached=gift.type==='COIN'?(target.winner?'13조 코인':'3조 코인'):(target.winner?'마스터의 별 7천만 개':'마스터의 별 2천만 개');
 return intro+'\n\n'+total+'\n\n이 메시지의 첨부 보상: '+attached+'\n코인과 마별은 각각의 보상 메시지에서 수령해 주세요.';
}
function validate(hash){
 assert.equal(hash,PLAN_HASH,'Reviewed plan hash required');assert.equal(createHash('sha256').update(JSON.stringify(PLAN)).digest('hex'),PLAN_HASH,'Plan changed');
 assert.equal(PLAN.operationKey,OPERATION_KEY);assert.equal(PLAN.delivery,'MESSAGE');assert.equal(TARGETS.length,48);assert.equal(new Set(ids).size,48);
 const teams=new Map();for(const t of TARGETS){assert.equal(t.winner,t.team==='진짜디임팀');assert.equal(t.coin,t.winner?'13000000000000':'3000000000000');assert.equal(t.masterStar,t.winner?'70000000':'20000000');teams.set(t.team,(teams.get(t.team)||0)+1);}
 assert.equal(teams.size,6);assert.ok([...teams.values()].every(n=>n===8));
 assert.deepEqual(PLAN.totals,{recipients:48,winners:8,coin:'224000000000000',masterStar:'1360000000'});
 for(const gift of GIFTS)assert.equal(TARGETS.reduce((n,t)=>n+BigInt(t[gift.field]),0n).toString(),PLAN.totals[gift.field]);
}
export async function inspectTeamEventRewards(c,{lock=false}={}){
 validate(PLAN_HASH);
 const users=await q(c,`SELECT id::text,nickname,role,status,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id${lock?' FOR SHARE':''}`,[ids]);
 const verifications=await q(c,`SELECT user_id::text,provider,provider_name,provider_user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id${lock?' FOR SHARE':''}`,[ids]);
 assert.equal(users.length,48,'Recipient missing');
 for(let i=0;i<TARGETS.length;i++){
  const t=TARGETS[i],u=users[i],v=verifications.find(v=>v.user_id===t.userId);
  assert.deepEqual({userId:u.id,nickname:u.nickname,role:u.role,status:u.status},{userId:t.userId,nickname:t.nickname,role:t.role,status:'ACTIVE'},'Recipient identity changed');
  assert.deepEqual({provider:v?.provider??null,name:v?.provider_name??null,id:v?.provider_user_id??null},{provider:t.provider,name:t.providerName,id:t.providerId},'Verified identity changed');
  assert.ok(BigInt(u.coin)>=0n&&BigInt(u.coin)+BigInt(t.coin)<=BigInt(Number.MAX_SAFE_INTEGER),'Coin balance outside supported integer range');
 }
 const [item]=await q(c,'SELECT code,name,is_active FROM inventory_items WHERE code=$1',['MASTER_STAR']);assert.equal(item?.name,'마스터의 별');assert.equal(Number(item.is_active),1);
 const inventory=await q(c,'SELECT user_id::text,quantity::text FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2',[ids,'MASTER_STAR']);
 for(const row of inventory){const t=TARGETS.find(t=>t.userId===row.user_id);assert.ok(BigInt(row.quantity)>=0n&&BigInt(row.quantity)+BigInt(t.masterStar)<=BigInt(Number.MAX_SAFE_INTEGER),'Inventory outside supported integer range');}
 const existing=await q(c,'SELECT id::text,user_id::text,campaign_key FROM user_messages WHERE campaign_key=ANY($1::text[]) OR (user_id=ANY($2::bigint[]) AND title=ANY($3::text[]))',[GIFTS.map(g=>g.campaign),ids,GIFTS.map(title)]);
 return {count:48,planHash:PLAN_HASH,existing,totals:PLAN.totals};
}
export async function verifyTeamEventRewards(c,receipt,{unclaimed=false}={}){
 validate(receipt.planHash);assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.delivery,'MESSAGE');assert.equal(receipt.noImmediateCredit,true);assert.deepEqual(receipt.recipients,TARGETS);assert.deepEqual(receipt.totals,PLAN.totals);assert.equal(receipt.authorization,PLAN.authorization);
 const rows=await q(c,`SELECT m.id::text message_id,m.user_id::text user_id,m.title,m.body,m.campaign_key,m.sender_type,m.message_type,m.is_read,m.hidden_at,
 r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text reward_amount,r.claimed_at,
 cr.reward_id::text claim_id,cr.message_id::text claim_message_id,cr.user_id::text claim_user_id,cr.reward_type claim_type,cr.reward_amount::text claim_amount,cr.balance_before::text,cr.balance_after::text
 FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id
 WHERE m.campaign_key=ANY($1::text[]) ORDER BY m.user_id,m.campaign_key`,[GIFTS.map(g=>g.campaign)]);
 assert.equal(rows.length,96,'Missing or duplicate delivery');
 for(const gift of GIFTS){
  const selected=rows.filter(r=>r.campaign_key===gift.campaign);assert.deepEqual(selected.map(r=>r.user_id),ids);
  for(const row of selected){
   const t=TARGETS.find(t=>t.userId===row.user_id);assert.ok(row.reward_id);assert.equal(row.reward_user_id,row.user_id);assert.equal(row.title,title(gift));assert.equal(row.body,messageBody(t,gift));assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,gift.messageType);assert.equal(row.reward_type,gift.type);assert.equal(row.reward_amount,t[gift.field]);
   if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.claim_id,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
   if(row.claimed_at){assert.ok(row.claim_id);assert.equal(row.claim_message_id,row.message_id);assert.equal(row.claim_user_id,row.user_id);assert.equal(row.claim_type,gift.type);assert.equal(row.claim_amount,t[gift.field]);assert.equal(BigInt(row.balance_after)-BigInt(row.balance_before),BigInt(t[gift.field]));}else assert.equal(row.claim_id,null);
  }
 }
 assert.deepEqual(rows.map(r=>({userId:r.user_id,campaign:r.campaign_key,messageId:r.message_id,rewardId:r.reward_id})),receipt.deliveries);
 if(receipt.auditId){const audits=await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]);assert.equal(audits.length,1);assert.equal(audits[0].id,receipt.auditId);assert.equal(audits[0].admin_id,'1');const {auditId,...audited}=receipt;assert.deepEqual(parse(audits[0].after_data),audited);}
 return {recipients:48,winners:8,participantsOnly:40,messages:96,rewards:96,coin:PLAN.totals.coin,masterStar:PLAN.totals.masterStar,claimed:rows.filter(r=>r.claimed_at).length,missing:0,duplicates:0};
}
// One-time user-authorized inbox rewards; messages, attachments, audit and receipt
// commit together. Wallet and inventory credit stays in the existing claim API.
export async function sendTeamEventRewards(c,{expectedPlanHash,commit=false}={}){
 validate(expectedPlanHash);await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='20s'");
  const reserved=await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.length){const [stored]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);const receipt=parse(stored.value),verification=await verifyTeamEventRewards(c,receipt);await c.query('ROLLBACK');return {receipt,verification,replayed:true,committed:false};}
  const inspected=await inspectTeamEventRewards(c,{lock:true});assert.equal(inspected.existing.length,0,'Matching gift already exists');
  const [owner]=await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Active audit OWNER required');
  const deliveries=[];
  for(const gift of GIFTS){
   const payload=TARGETS.map(t=>({user_id:t.userId,body:messageBody(t,gift),amount:t[gift.field]}));
   const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
    SELECT t.user_id,'ADMIN',$2,t.body,$3,$4 FROM jsonb_to_recordset($1::jsonb) t(user_id bigint,body text,amount bigint) ORDER BY t.user_id RETURNING id::text,user_id::text`,[JSON.stringify(payload),title(gift),gift.messageType,gift.campaign]);assert.equal(messages.length,48,'Partial message insert');
   const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
    SELECT m.id,m.user_id,$3,t.amount FROM user_messages m JOIN jsonb_to_recordset($1::jsonb) t(user_id bigint,amount bigint) ON t.user_id=m.user_id WHERE m.campaign_key=$2 ORDER BY m.user_id RETURNING id::text,message_id::text,user_id::text`,[JSON.stringify(payload),gift.campaign,gift.type]);assert.equal(rewards.length,48,'Partial reward insert');
   for(const r of rewards)deliveries.push({userId:r.user_id,campaign:gift.campaign,messageId:r.message_id,rewardId:r.id});
  }
  deliveries.sort((a,b)=>Number(a.userId)-Number(b.userId)||a.campaign.localeCompare(b.campaign));
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,delivery:'MESSAGE',noImmediateCredit:true,authorization:PLAN.authorization,recipients:TARGETS,totals:PLAN.totals,deliveries,actor:'SYSTEM_OPS',completedAt:new Date().toISOString()};
  await verifyTeamEventRewards(c,receipt,{unclaimed:true});
  const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'USER_MESSAGE',$3,$4,$5) RETURNING id::text",[owner.id,ACTION,OPERATION_KEY,JSON.stringify({existingMessages:0,oneTimeException:true}),JSON.stringify(receipt)]);assert.ok(audit?.id,'Audit missing');receipt.auditId=audit.id;
  assert.equal((await q(c,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)])).length,1,'Completed receipt missing');
  const verification=await verifyTeamEventRewards(c,receipt,{unclaimed:true});
  await c.query(commit?'COMMIT':'ROLLBACK');return {receipt,verification,replayed:false,committed:commit};
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}
}

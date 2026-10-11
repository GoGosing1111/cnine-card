import assert from 'node:assert/strict';
import {CITY_TOP10_EVENT,validateCityTop10Plan,cityTop10Message} from '../../functions/_jokgak_city_top10_event.js';
export {CITY_TOP10_EVENT};
const q=async(c,s,v=[])=>(await c.query(s,v)).rows;

// Uses the existing production connection supplied by the operations runner.
// Activation never reads today's standings as the final recipient list.
export async function scheduleCityTop10(c,{tiePolicy,apply=false}={}){
 const event=CITY_TOP10_EVENT;
 assert.equal(tiePolicy,'INCLUDE_CUTOFF_TIES');
 await c.query('BEGIN');
 try{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[event.operationKey]);
  assert.equal((await q(c,'SELECT current_database() db'))[0].db,'cnine');
  const saved=(await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[event.operationKey]))[0];
  if(saved){const plan=validateCityTop10Plan(JSON.parse(saved.value));assert.equal(plan.tiePolicy,tiePolicy);await c.query('ROLLBACK');return {replayed:true,plan};}
  const now=Number((await q(c,'SELECT (EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint AS now'))[0].now);
  assert.ok(now>=event.startsAt&&now<event.endsAt,'This event must be scheduled during the authorized shift');
  const cursor=(await q(c,"SELECT value FROM app_meta WHERE key='jokgak_city_top_next_epoch_v1' FOR SHARE"))[0];
  assert.equal(Number(cursor?.value),event.epoch,'Round already closed or cursor is unexpected');
  const policy=JSON.parse((await q(c,"SELECT value FROM app_meta WHERE key='jokgak_city_settings_v1' FOR SHARE"))[0]?.value||'{}');
  assert.equal(policy.mode,'ON');
  assert.equal((await q(c,'SELECT COUNT(*)::int n FROM user_messages WHERE campaign_key=$1',[event.campaignKey]))[0].n,0);
  const storage=await q(c,"SELECT data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='user_message_rewards' AND column_name='reward_amount'");assert.equal(storage[0]?.data_type,'bigint');
  const owner=(await q(c,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE"))[0];assert.ok(owner);
  const plan=validateCityTop10Plan({...event,status:'SCHEDULED',tiePolicy,adminId:Number(owner.id),scheduledAt:new Date(now).toISOString(),
   authorization:'족각도시 이번 6시로테이션 12시정산해서 현금보유 TOP10 5천억코인 메세지로 지급 / 1인당 5천억 코인 / 공동 10위까지 모두 지급',
   currentModePreserved:policy.mode,currentRevisionPreserved:policy.revision});
  const value=JSON.stringify(plan);
  assert.equal((await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[event.operationKey,value])).rowCount,1);
  await c.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'JOKGAK_CITY_TOP10_SCHEDULE','APP_META',$2,$3,$4)",[plan.adminId,event.operationKey,JSON.stringify({priorEvent:false}),value]);
  await c.query(apply?'COMMIT':'ROLLBACK');return {replayed:false,dryRun:!apply,plan};
 }catch(e){await c.query('ROLLBACK');throw e;}
}

export async function verifyCityTop10(c){
 const event=CITY_TOP10_EVENT,row=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[event.operationKey]))[0];
 assert.ok(row,'Missing scheduled event');const receipt=validateCityTop10Plan(JSON.parse(row.value));
 const messages=await q(c,`SELECT m.id::text message_id,m.user_id::text user_id,m.title,m.body,m.message_type,m.sender_type,
  r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text reward_amount,r.claimed_at,
  cr.reward_id::text claim_id,cr.reward_amount::text claim_amount,cr.balance_before::text,cr.balance_after::text
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id
  WHERE m.campaign_key=$1 ORDER BY m.user_id`,[event.campaignKey]);
 if(receipt.status==='SCHEDULED'){assert.equal(messages.length,0);return {status:receipt.status,dueAt:new Date(event.endsAt).toISOString(),tiePolicy:receipt.tiePolicy,messages:0};}
 assert.equal(messages.length,receipt.recipientCount);assert.equal(new Set(messages.map(m=>m.user_id)).size,messages.length);
 assert.equal(receipt.recipients.length,messages.length);assert.equal(receipt.totalCoin,String(BigInt(messages.length)*BigInt(event.rewardAmount)));
 let claimed=0;
 for(const message of messages){
  const recipient=receipt.recipients.find(r=>String(r.userId)===message.user_id);assert.ok(recipient);
  assert.equal(message.reward_user_id,message.user_id);assert.equal(message.reward_type,'COIN');assert.equal(message.reward_amount,String(event.rewardAmount));
  assert.equal(message.title,event.title);assert.equal(message.body,cityTop10Message(recipient,receipt));assert.equal(message.message_type,'COIN_REWARD');assert.equal(message.sender_type,'ADMIN');
  if(message.claimed_at){assert.ok(message.claim_id);assert.equal(message.claim_amount,String(event.rewardAmount));assert.equal(BigInt(message.balance_after)-BigInt(message.balance_before),BigInt(event.rewardAmount));claimed++;}
  else assert.equal(message.claim_id,null);
 }
 const audit=await q(c,"SELECT after_data FROM admin_logs WHERE action_type='JOKGAK_CITY_TOP10_MESSAGE_SEND' AND target_id=$1",[event.operationKey]);
 assert.equal(audit.length,1);assert.deepEqual(JSON.parse(audit[0].after_data),receipt);
 return {status:receipt.status,settledFor:receipt.settledFor,completedAt:receipt.completedAt,recipients:messages.length,messages:messages.length,claimed,pending:messages.length-claimed,totalCoin:receipt.totalCoin,missing:0,duplicates:0};
}

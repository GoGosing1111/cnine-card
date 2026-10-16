import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pigCoinRewardWeek} from '../../shared/loot-shop-policy-v1.mjs';

export const OPERATION_KEY='ops:raid-weekly-reset-tickets:20261017:v1';
export const AUTHORIZED_WEEK='2026-10-12';
export const AMOUNT=5;
export const RAIDS=Object.freeze([
 {id:'LICH',name:'이스겐',ticket:'LICH_KING_ENTRY_TICKET',catalogName:'리치왕 정벌 입장권',prefix:'raid_lich_weekly_v1:',rooms:'raid_lich_rooms_v1',settings:'raid_lich_settings_v1',campaign:'raid-weekly-reset-tickets-20261017-lich-v1'},
 {id:'MADARA',name:'바르센',ticket:'MADARA_RAID_ENTRY_TICKET',catalogName:'마다라 레이드 입장권',prefix:'raid_madara_weekly_v1:',rooms:'raid_madara_rooms_v1',settings:'raid_madara_settings_v1',campaign:'raid-weekly-reset-tickets-20261017-madara-v1'}
].map(Object.freeze));
const authorization='이스겐,바르센 레이드 주간보상 초기화 하고 전체유저에 입장권 5장씩 메세지로 지급해';
const title=raid=>`${raid.name} 레이드 주간 보상 초기화 · 입장권 5장`;
const body=raid=>`${raid.name} 레이드의 이번 주 보상 수령 횟수를 초기화했습니다. 입장권 5장을 드립니다. 메시지함에서 보상을 수령해 주세요.`;
const qFor=client=>async(sql,args=[])=>(await client.query(sql,args)).rows;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const prefixes=()=>RAIDS.map(raid=>raid.prefix+AUTHORIZED_WEEK+':');
const settingsKeys=RAIDS.flatMap(raid=>[raid.settings,'reward_reveal_policy_v1:'+raid.id]);
const recipientsSql="SELECT u.id::text,UPPER(TRIM(COALESCE(u.role,'USER'))) role FROM users u WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE' ORDER BY u.id";
async function legacyLich(q,week){
 const [row]=await q("SELECT COUNT(DISTINCT (l.user_id,l.reference_id))::int count FROM inventory_logs l JOIN raid_lich_rooms_v1 r ON r.room_id=l.reference_id WHERE l.item_code='PET_ESSENCE' AND l.reference_type='LICH_RAID_CLEAR' AND l.change_amount>0 AND r.state_json::jsonb->>'clearRewardSettlement' IS NULL AND (r.state_json::jsonb->>'finishedAt')::bigint >=$1 AND (r.state_json::jsonb->>'finishedAt')::bigint <$2",[Date.parse(week.startsAt),Date.parse(week.resetsAt)]);
 return Number(row.count);
}
async function counters(q,lock=false){return q('SELECT key,value FROM app_meta WHERE starts_with(key,$1) OR starts_with(key,$2) ORDER BY key'+(lock?' FOR UPDATE':''),prefixes());}
function summarizeCounters(rows){return Object.fromEntries(RAIDS.map(raid=>{
 const list=rows.filter(row=>row.key.startsWith(raid.prefix)),counts=list.map(row=>JSON.parse(row.value).count);
 return [raid.id,{counters:list.length,affectedUsers:counts.filter(n=>n>0).length,used:counts.reduce((a,b)=>a+b,0)}];
}));}
async function protectedState(q){
 const rooms={};for(const raid of RAIDS)rooms[raid.id]=await q(`SELECT room_id,status,version::text,md5((to_jsonb(r)-'version')::text) state_digest FROM ${raid.rooms} r ORDER BY room_id`);
 return {rooms};
}
export async function inspectRaidResetTickets(client,{at=Date.now()}={}){
 const q=qFor(client),week=pigCoinRewardWeek(at),recipients=await q(recipientsSql);
 const settings=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settingsKeys]);
 const items=await q('SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code',[RAIDS.map(raid=>raid.ticket)]);
 const existing=await q('SELECT campaign_key,COUNT(*)::int count FROM user_messages WHERE campaign_key=ANY($1::text[]) GROUP BY campaign_key ORDER BY campaign_key',[RAIDS.map(raid=>raid.campaign)]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 const records=await counters(q),madara=settings.find(row=>row.key==='raid_madara_settings_v1');
 return {operationKey:OPERATION_KEY,week,count:recipients.length,recipients,recipientHash:digest(recipients),settings,settingsDigest:digest(settings),items,existing,counters:summarizeCounters(records),legacyPaidClears:await legacyLich(q,week),
  limits:{LICH:7,MADARA:madara?JSON.parse(madara.value).weeklyRewardLimit:null},receipt:saved?JSON.parse(saved.value):null};
}
async function verifyMessages(q,record,{unclaimed=false}={}){
 const result={};assert.equal(record.recipientHash,digest(record.recipients));assert.equal(record.count,record.recipients.length);
 for(const raid of RAIDS){
  const rows=await q(`SELECT m.user_id::text,m.title,m.body,m.sender_type,m.message_type,m.is_read,m.hidden_at,r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text,r.claimed_at
   FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.campaign_key=$1 ORDER BY m.user_id`,[raid.campaign]);
  assert.equal(rows.length,record.count,'Message/reward count mismatch');assert.deepEqual(rows.map(row=>row.user_id),record.recipients.map(row=>row.id),'Missing or duplicate recipient');
  for(const row of rows){
   assert.ok(row.reward_id,'Missing reward');assert.equal(row.reward_user_id,row.user_id);assert.equal(row.title,title(raid));assert.equal(row.body,body(raid));assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,'ITEM_REWARD');
   assert.equal(row.reward_type,raid.ticket);assert.equal(row.reward_amount,String(AMOUNT));
   if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
  }
  result[raid.id]={messages:rows.length,rewards:rows.length,totalTickets:rows.length*AMOUNT,claimed:rows.filter(row=>row.claimed_at).length,missing:0,duplicates:0};
 }
 return result;
}
export async function verifyRaidResetTickets(client){
 const q=qFor(client),[saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved,'Operation receipt missing');
 const record=JSON.parse(saved.value);assert.equal(record.status,'COMPLETED');assert.equal(record.operationKey,OPERATION_KEY);assert.equal(record.weekKey,AUTHORIZED_WEEK);
 const [audit]=await q('SELECT action_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1',[record.auditId]);
 assert.equal(audit?.action_type,'OPS_RAID_WEEKLY_RESET_TICKETS');assert.equal(audit.target_id,OPERATION_KEY);
 const {auditId,...audited}=record;assert.deepEqual(JSON.parse(audit.after_data),audited,'Audit differs from receipt');
 const verification=await verifyMessages(q,record);
 return {...record,verification,currentCounters:summarizeCounters(await counters(q)),verified:true};
}
// One authorized transaction: current-week counters, claimable messages and audit.
// Completed room receipts and existing choice offers never become claimable again.
export async function resetRaidAndSendTickets(client,{expectedRecipientHash,expectedSettingsDigest,commit=false,at=Date.now()}={}){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Reviewed recipient hash required');
 assert.match(String(expectedSettingsDigest||''),/^[a-f0-9]{64}$/,'Reviewed settings hash required');
 const q=qFor(client),week=pigCoinRewardWeek(at);
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='30s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
  if(prior){const saved=await verifyRaidResetTickets(client);await q('ROLLBACK');return {...saved,replayed:true,committed:false};}
  assert.equal(week.weekKey,AUTHORIZED_WEEK,'Only the authorized week can be reset');
  // Room writers serialize both quota settlements. Wallets are read, not locked:
  // this operation only changes quotas/messages and must not freeze every player.
  await q('LOCK TABLE raid_lich_rooms_v1,raid_madara_rooms_v1 IN SHARE ROW EXCLUSIVE MODE');
  const [accounts]=await q('SELECT COUNT(*)::int count FROM users');
  const settings=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[settingsKeys]);
  assert.equal(digest(settings),expectedSettingsDigest,'Raid settings changed; inspect again');
  for(const raid of RAIDS)assert.ok(settings.some(row=>row.key===raid.settings),'Raid settings missing');
  const plan=await inspectRaidResetTickets(client,{at});
  assert.equal(plan.recipientHash,expectedRecipientHash,'Recipients changed; inspect again');
  assert.ok(plan.count>0&&plan.count<=10000,'Unexpected recipient count');assert.equal(plan.existing.length,0,'Campaign messages already exist');
  assert.equal(plan.legacyPaidClears,0,'Legacy Lich rewards require separate handling');
  assert.ok(Number.isSafeInteger(plan.limits.MADARA)&&plan.limits.MADARA>0,'Invalid Madara weekly limit');
  const items=await q('SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[RAIDS.map(raid=>raid.ticket)]);
  for(const raid of RAIDS)assert.ok(items.some(item=>item.code===raid.ticket&&item.name===raid.catalogName&&Number(item.is_active)===1),'Ticket catalog changed or inactive');
  const [owner]=await q("SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Active owner required for audit');
  const beforeCounters=await counters(q,true),before=await protectedState(q);
  for(const row of beforeCounters){
   assert.match(row.key,new RegExp('^raid_(lich|madara)_weekly_v1:'+AUTHORIZED_WEEK+':[1-9][0-9]*$'));
   const count=JSON.parse(row.value).count;assert.ok(Number.isSafeInteger(count)&&count>=0,'Invalid weekly counter');
   if(row.key.startsWith(RAIDS[0].prefix))assert.ok(count<=7,'Invalid Lich weekly counter');
  }
  const reset={operationKey:OPERATION_KEY,weekKey:AUTHORIZED_WEEK,resetAt:new Date(at).toISOString()};
  const cleared=await q("UPDATE app_meta SET value=(value::jsonb || jsonb_build_object('count',0,'token',$3::text,'weeklyRewardReset',$4::jsonb))::text,updated_at=CURRENT_TIMESTAMP WHERE starts_with(key,$1) OR starts_with(key,$2) RETURNING key",[...prefixes(),OPERATION_KEY,JSON.stringify(reset)]);
  assert.equal(cleared.length,beforeCounters.length,'Partial quota reset');
  const invalidated={};for(const raid of RAIDS){
   const rows=await q(`UPDATE ${raid.rooms} SET version=version+1 WHERE status='ACTIVE' RETURNING room_id`);invalidated[raid.id]=rows.length;
   assert.equal(rows.length,before.rooms[raid.id].filter(row=>row.status==='ACTIVE').length);
  }
  for(const raid of RAIDS){
   const messages=await q("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) SELECT id,'ADMIN',$2,$3,'ITEM_REWARD',$4 FROM unnest($1::bigint[]) AS id ORDER BY id RETURNING id",[plan.recipients.map(row=>row.id),title(raid),body(raid),raid.campaign]);
   assert.equal(messages.length,plan.count,'Partial message insert');
   const rewards=await q('INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) SELECT id,user_id,$2,$3::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id',[raid.campaign,raid.ticket,AMOUNT]);
   assert.equal(rewards.length,plan.count,'Partial reward insert');
  }
  const afterCounters=await counters(q),after=await protectedState(q);
  assert.equal(afterCounters.length,beforeCounters.length);for(const row of afterCounters){assert.equal(JSON.parse(row.value).count,0);assert.equal(JSON.parse(row.value).weeklyRewardReset.operationKey,OPERATION_KEY);}
  // No write targets balances, inventory or existing choice offers. Checking
  // their live totals here would mistake unrelated gameplay for our mutations.
  // Their preservation is covered by the operation/real-claim regression tests.
  for(const raid of RAIDS)assert.deepEqual(after.rooms[raid.id],before.rooms[raid.id].map(row=>({...row,version:row.status==='ACTIVE'?String(Number(row.version)+1):row.version})),'Historical room state changed');
  assert.deepEqual(await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settingsKeys]),settings,'CMS changed');
  const record={status:'COMPLETED',operationKey:OPERATION_KEY,authorization,weekKey:AUTHORIZED_WEEK,resetAt:reset.resetAt,actor:'SYSTEM_OPS',delivery:'MESSAGE',
   eligibility:'All ACTIVE accounts, all roles, regardless of secondary verification; weekly counters reset for every account',totalAccounts:Number(accounts.count),count:plan.count,recipients:plan.recipients,recipientHash:plan.recipientHash,settingsDigest:plan.settingsDigest,
   raids:RAIDS.map(raid=>({id:raid.id,name:raid.name,campaignKey:raid.campaign,rewardType:raid.ticket,rewardAmount:AMOUNT,title:title(raid),body:body(raid),weeklyRewardLimit:plan.limits[raid.id],before:plan.counters[raid.id],usedAfter:0,remainingAfter:plan.limits[raid.id],invalidatedActivePlans:invalidated[raid.id],messages:plan.count,totalTickets:plan.count*AMOUNT})),
   existingRewardsPreserved:true,completedRoomsPreserved:true,choiceOffersPreserved:true,balancesPreserved:true,inventoryPreserved:true,cmsUnchanged:true};
  await verifyMessages(q,record,{unclaimed:true});
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_RAID_WEEKLY_RESET_TICKETS','ALL_USERS',$2,$3,$4) RETURNING id",[owner.id,OPERATION_KEY,JSON.stringify({authorization,weekKey:AUTHORIZED_WEEK,counters:beforeCounters,rooms:before.rooms,settingsDigest:plan.settingsDigest}),JSON.stringify(record)]);
  assert.ok(audit,'Audit missing');record.auditId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OPERATION_KEY,JSON.stringify(record)])).length,1,'Completed receipt missing');
  await q(commit?'COMMIT':'ROLLBACK');return {...record,replayed:false,committed:commit};
 }catch(error){await q('ROLLBACK').catch(()=>{});throw error;}
}

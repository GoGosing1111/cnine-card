import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './ayoon-recruitment-gift-20261003.targets.json' with {type:'json'};

export const OPERATION_KEY=plan.operationKey,CAMPAIGN_KEY=plan.campaignKey,ITEM_CODE=plan.itemCode,TITLE=plan.title;
export const TARGETS=plan.targets,HELD=plan.held,DUPLICATES=plan.duplicates;
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
export const BODY='아윤방 영입전에 참여해 주셔서 감사합니다.\n영입전 사은품 1개를 지급합니다.\n이번 행사는 계정당 최대 1개만 수령할 수 있습니다.\n메시지 보상을 수령한 뒤 인벤토리에서 상자를 개봉해 주세요.';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
const ids=TARGETS.map(row=>row.id);
export const markerKey=id=>'ops:recruitment-gift-campaign:'+CAMPAIGN_KEY+':user:'+id+':v1';
const markerKeys=ids.map(markerKey);
assert.equal(plan.threshold,100);assert.equal(plan.amount,1);assert.equal(plan.maxPerAccount,1);
assert.equal(plan.duplicatePolicy,'ONE_PER_ACCOUNT_THIS_CAMPAIGN_ONLY');
assert.equal(plan.sourceCount,60);assert.equal(TARGETS.length,56);assert.equal(new Set(ids).size,56);
assert.equal(HELD.length,3);assert.equal(DUPLICATES.length,1);
assert.equal(TARGETS.flatMap(row=>row.sourceRows).length+HELD.length,plan.sourceCount);
for(const target of TARGETS){assert.match(target.id,/^[1-9]\d*$/);assert.equal(target.quantity,1);assert.ok(target.sourceRows.every(row=>row.contribution>=100));}

export async function inspect(client){
 const users=await q(client,'SELECT id::text AS id,nickname,status,role FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
 const links=await q(client,"SELECT user_id::text AS user_id,provider_user_id FROM user_second_verifications WHERE provider='PLAYDK' AND user_id=ANY($1::bigint[]) ORDER BY user_id",[ids]);
 assert.equal(users.length,TARGETS.length,'Missing recipient');assert.equal(links.length,TARGETS.length,'Missing verified account');
 for(const target of TARGETS){const user=users.find(row=>row.id===target.id),link=links.find(row=>row.user_id===target.id);assert.equal(user?.nickname,target.nickname,'Recipient nickname changed');assert.equal(user.status,'ACTIVE','Recipient inactive');assert.equal(user.role,target.role,'Account role changed');assert.equal(link?.provider_user_id,target.playdkId,'Recipient identity changed');}
 const [item]=await q(client,'SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE]);
 assert.equal(item?.name,'영입전 사은품');assert.equal(Number(item.is_active),1,'Gift item inactive');
 // Other rooms and old global-once markers are deliberately outside this campaign.
 const existing=await q(client,'SELECT id::text AS id,user_id::text AS user_id FROM user_messages WHERE campaign_key=$1 ORDER BY user_id',[CAMPAIGN_KEY]);
 const markers=await q(client,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[markerKeys]);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,planHash:PLAN_HASH,count:TARGETS.length,boxes:TARGETS.length,existing,markers,receipt:saved?parse(saved.value):null};
}

export async function verify(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.campaignKey,CAMPAIGN_KEY);assert.equal(receipt.planHash,PLAN_HASH);
 assert.equal(receipt.count,TARGETS.length);assert.equal(receipt.boxes,TARGETS.length);assert.equal(receipt.maxPerAccount,1);assert.deepEqual(receipt.recipients,TARGETS);
 const rows=await q(client,`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,m.sender_type,m.message_type,m.is_read,m.hidden_at,
   r.id::text AS reward_id,r.user_id::text AS reward_user_id,r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at
   FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.campaign_key=$1 ORDER BY m.user_id,m.id`,[CAMPAIGN_KEY]);
 assert.equal(rows.length,TARGETS.length,'Missing or extra campaign messages');assert.deepEqual(rows.map(row=>row.user_id),ids,'Missing or duplicate recipient');
 for(const row of rows){assert.ok(row.reward_id,'Missing reward');assert.equal(row.reward_user_id,row.user_id);assert.equal(row.reward_type,ITEM_CODE);assert.equal(row.reward_amount,'1','Campaign maximum exceeded');assert.equal(row.title,TITLE);assert.equal(row.body,BODY);assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,'ITEM_REWARD');if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}}
 const markers=await q(client,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[markerKeys]);assert.equal(markers.length,TARGETS.length,'Missing campaign markers');
 for(const row of rows){const marker=parse(markers.find(marker=>marker.key===markerKey(row.user_id))?.value);assert.equal(marker.status,'COMPLETED');assert.equal(marker.campaignKey,CAMPAIGN_KEY);assert.equal(marker.itemCode,ITEM_CODE);assert.equal(marker.amount,1);assert.equal(marker.messageId,row.message_id);assert.equal(marker.rewardId,row.reward_id);}
 if(receipt.auditId){const [audit]=await q(client,"SELECT after_data FROM admin_logs WHERE id=$1 AND action_type='AYOON_RECRUITMENT_GIFT_SEND' AND target_id=$2",[receipt.auditId,OPERATION_KEY]);assert.ok(audit,'Missing audit');const {auditId,...audited}=receipt;assert.deepEqual(parse(audit.after_data),audited,'Audit mismatch');}
 return {messages:rows.length,rewards:rows.length,boxes:rows.length,maxPerAccount:1,duplicates:0,missing:0,claimed:rows.filter(row=>row.claimed_at).length,rows};
}

export async function send(client,targets=TARGETS,{expectedPlanHash,dryRun=false}={}){
 assert.deepEqual(targets,TARGETS,'Only reviewed recipients with one box per account are allowed');assert.equal(expectedPlanHash,PLAN_HASH,'Reviewed plan hash required');
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const reserved=await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.length){const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved,'Concurrent operation must be retried');const receipt=parse(saved.value),verification=await verify(client,receipt);await client.query('ROLLBACK');return {receipt,verification,replayed:true,dryRun};}
  const inspected=await inspect(client);assert.equal(inspected.existing.length,0,'Campaign messages already exist without receipt');assert.equal(inspected.markers.length,0,'Campaign maximum already reserved');
  const [owner]=await q(client,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Missing active owner');
  const messages=await q(client,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
    SELECT id,'ADMIN',$2,$3,'ITEM_REWARD',$4 FROM unnest($1::bigint[]) AS t(id) ORDER BY id RETURNING id::text AS id,user_id::text AS user_id`,[ids,TITLE,BODY,CAMPAIGN_KEY]);assert.equal(messages.length,TARGETS.length,'Partial message insert');
  const rewards=await q(client,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
    SELECT id,user_id,$2,1 FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id::text AS id,message_id::text AS message_id,user_id::text AS user_id`,[CAMPAIGN_KEY,ITEM_CODE]);assert.equal(rewards.length,TARGETS.length,'Partial reward insert');
  const now=new Date().toISOString();
  const markerValues=TARGETS.map(target=>JSON.stringify({status:'COMPLETED',operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,userId:target.id,itemCode:ITEM_CODE,amount:1,messageId:messages.find(row=>row.user_id===target.id).id,rewardId:rewards.find(row=>row.user_id===target.id).id,completedAt:now}));
  const markers=await q(client,'INSERT INTO app_meta(key,value,updated_at) SELECT key,value,$3 FROM unnest($1::text[],$2::text[]) AS t(key,value) RETURNING key',[markerKeys,markerValues,now]);assert.equal(markers.length,TARGETS.length,'Partial campaign marker insert');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,planHash:PLAN_HASH,count:TARGETS.length,boxes:TARGETS.length,maxPerAccount:1,title:TITLE,itemCode:ITEM_CODE,delivery:'MESSAGE',authorization:plan.authorization,recipients:TARGETS,held:HELD,duplicates:DUPLICATES,completedAt:now};
  await verify(client,receipt,{unclaimed:true});
  const [audit]=await q(client,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'AYOON_RECRUITMENT_GIFT_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id",[owner.id,OPERATION_KEY,JSON.stringify({campaignMessages:0,threshold:100,maxPerAccount:1}),JSON.stringify(receipt)]);assert.ok(audit,'Missing audit');receipt.auditId=String(audit.id);
  assert.equal((await q(client,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)])).length,1,'Missing completed receipt');
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,replayed:false,dryRun};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

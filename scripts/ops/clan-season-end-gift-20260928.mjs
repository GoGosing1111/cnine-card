import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:clan-season-end-gift:season5:20260928:v1';
export const TITLE='클랜 시즌 종료 기념';
export const SEASON_ID=5;
export const CAMPAIGNS={COIN:'clan-season-end-gift-20260928-season5-v1-coin',MASTER_STAR:'clan-season-end-gift-20260928-season5-v1-master-star'};
export const BASE_COIN='100000000000',LEADER_EXTRA_COIN='500000000000',MASTER_STARS='1000000';
const EXPECTED_MEMBERS=155,EXPECTED_LEADERS=8;
const fingerprint=recipients=>createHash('sha256').update(JSON.stringify(recipients.map(r=>[r.userId,r.clanId,r.isLeader]))).digest('hex');
const query=async(client,sql,values=[])=>(await client.query(sql,values)).rows;

async function audience(client){
 const [season]=await query(client,'SELECT id::int,season_no::int,phase,ends_at FROM clan_seasons WHERE id=$1',[SEASON_ID]);
 assert.equal(season?.season_no,2);assert.equal(season.phase,'COMPLETE','Only the completed season 2 is eligible');
 const teams=await query(client,`SELECT t.clan_id::int AS "clanId",o.name,t.master_user_id::text AS "masterUserId",u.nickname AS "masterNickname",
  (SELECT COUNT(*)::int FROM clan_members m WHERE m.season_id=t.season_id AND m.clan_id=t.clan_id) AS members
  FROM clan_season_teams t JOIN clan_organizations o ON o.id=t.clan_id LEFT JOIN users u ON u.id=t.master_user_id
  WHERE t.season_id=$1 ORDER BY t.clan_id`,[SEASON_ID]);
 const recipients=await query(client,`SELECT m.user_id::text AS "userId",m.clan_id::int AS "clanId",m.member_role AS "memberRole",
  u.nickname,u.status,(m.user_id=t.master_user_id) AS "isLeader"
  FROM clan_members m LEFT JOIN users u ON u.id=m.user_id
  LEFT JOIN clan_season_teams t ON t.season_id=m.season_id AND t.clan_id=m.clan_id
  WHERE m.season_id=$1 ORDER BY m.user_id`,[SEASON_ID]);
 assert.equal(recipients.length,EXPECTED_MEMBERS,'Season membership count changed');
 assert.equal(new Set(recipients.map(r=>r.userId)).size,EXPECTED_MEMBERS);
 assert.equal(teams.length,EXPECTED_LEADERS);assert.equal(new Set(teams.map(t=>t.masterUserId)).size,EXPECTED_LEADERS);
 for(const row of recipients){
  assert.ok(row.nickname,'Missing participant account');assert.equal(typeof row.isLeader,'boolean','Missing season team');
  assert.equal(row.memberRole==='MASTER',row.isLeader,'Leader role and team master disagree');
 }
 for(const team of teams)assert.equal(recipients.filter(r=>r.clanId===team.clanId&&r.isLeader&&r.userId===team.masterUserId).length,1,'Leader missing from participant roster');
 return {season,teams,recipients,recipientHash:fingerprint(recipients)};
}

async function storage(client){
 const required=[['users','coin'],['user_message_rewards','reward_amount'],['user_message_reward_claim_receipts_v1222','reward_amount'],
  ['user_message_reward_claim_receipts_v1222','balance_before'],['user_message_reward_claim_receipts_v1222','balance_after'],
  ['coin_logs','change_amount'],['coin_logs','balance_after'],['cnine_user_inventory','quantity'],['cnine_user_inventory','unseen_quantity'],
  ['inventory_logs','change_amount'],['inventory_logs','balance_after']];
 const columns=await query(client,`SELECT table_name,column_name,data_type FROM information_schema.columns
  WHERE table_schema=current_schema() AND table_name=ANY($1::text[])`,[[...new Set(required.map(([table])=>table))]]);
 return required.map(([table,column])=>({table,column,type:columns.find(c=>c.table_name===table&&c.column_name===column)?.data_type||'MISSING'}));
}

export async function inspectClanSeasonGift(client){
 const snapshot=await audience(client);
 const existing=await query(client,`SELECT m.campaign_key,COUNT(*)::int AS messages FROM user_messages m
  WHERE m.campaign_key=ANY($1::text[]) OR m.title=$2 GROUP BY m.campaign_key`,[Object.values(CAMPAIGNS),TITLE]);
 const [saved]=await query(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {...snapshot,operationKey:OPERATION_KEY,title:TITLE,body:TITLE,campaigns:CAMPAIGNS,count:EXPECTED_MEMBERS,leaderCount:EXPECTED_LEADERS,
  baseCoin:BASE_COIN,leaderExtraCoin:LEADER_EXTRA_COIN,masterStars:MASTER_STARS,
  totalCoin:String(BigInt(BASE_COIN)*BigInt(EXPECTED_MEMBERS)+BigInt(LEADER_EXTRA_COIN)*BigInt(EXPECTED_LEADERS)),
  totalMasterStars:String(BigInt(MASTER_STARS)*BigInt(EXPECTED_MEMBERS)),
  statuses:snapshot.recipients.reduce((out,row)=>(out[row.status]=(out[row.status]||0)+1,out),{}),
  existing,storage:await storage(client),receipt:saved?JSON.parse(saved.value):null};
}

export async function verifyClanSeasonGift(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.season.id,SEASON_ID);
 assert.equal(receipt.title,TITLE);assert.equal(receipt.body,TITLE);assert.deepEqual(receipt.campaigns,CAMPAIGNS);
 assert.equal(receipt.delivery,'MESSAGE');assert.equal(receipt.noImmediateWalletCredit,true);
 assert.equal(receipt.count,EXPECTED_MEMBERS);assert.equal(receipt.leaderCount,EXPECTED_LEADERS);
 assert.equal(receipt.recipientHash,fingerprint(receipt.recipients));
 const recipients=new Map(receipt.recipients.map(r=>[r.userId,r]));
 assert.equal(recipients.size,EXPECTED_MEMBERS);assert.equal(receipt.recipients.filter(r=>r.isLeader).length,EXPECTED_LEADERS);
 const rows=await query(client,`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,m.sender_type,m.message_type,m.campaign_key,m.is_read,m.hidden_at,
  r.id::text AS reward_id,r.user_id::text AS reward_user_id,r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at,
  c.reward_id::text AS claim_id,c.message_id::text AS claim_message_id,c.user_id::text AS claim_user_id,c.reward_type AS claim_type,c.reward_amount::text AS claim_amount,
  c.balance_before::text AS balance_before,c.balance_after::text AS balance_after
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  LEFT JOIN user_message_reward_claim_receipts_v1222 c ON c.reward_id=r.id
  WHERE m.campaign_key=ANY($1::text[]) ORDER BY m.user_id,m.campaign_key`,[Object.values(CAMPAIGNS)]);
 assert.equal(rows.length,EXPECTED_MEMBERS*2,'Partial message or reward delivery');
 const seen=new Set();let totalCoin=0n,totalMasterStars=0n,claimed=0;
 for(const row of rows){
  const recipient=recipients.get(row.user_id);assert.ok(recipient,'Unexpected recipient');
  const type=row.campaign_key===CAMPAIGNS.COIN?'COIN':'MASTER_STAR';
  const amount=type==='COIN'?String(BigInt(BASE_COIN)+(recipient.isLeader?BigInt(LEADER_EXTRA_COIN):0n)):MASTER_STARS;
  const key=type+':'+row.user_id;assert.ok(!seen.has(key),'Duplicate reward');seen.add(key);
  assert.ok(row.reward_id);assert.equal(row.reward_user_id,row.user_id);assert.equal(row.reward_type,type);assert.equal(row.reward_amount,amount);
  assert.equal(row.title,TITLE);assert.equal(row.body,TITLE);assert.equal(row.sender_type,'ADMIN');
  assert.equal(row.message_type,type==='COIN'?'COIN_REWARD':'ITEM_REWARD');
  assert.ok(receipt.messageIds.includes(row.message_id));assert.ok(receipt.rewardIds.includes(row.reward_id));
  if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.claim_id,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
  if(row.claimed_at){
   assert.ok(row.claim_id);assert.equal(row.claim_user_id,row.user_id);assert.equal(row.claim_message_id,row.message_id);
   assert.equal(row.claim_type,type);assert.equal(row.claim_amount,amount);assert.equal(BigInt(row.balance_after)-BigInt(row.balance_before),BigInt(amount));claimed++;
  }else assert.equal(row.claim_id,null,'Receipt exists without reward claim');
  if(type==='COIN')totalCoin+=BigInt(amount);else totalMasterStars+=BigInt(amount);
 }
 assert.equal(String(totalCoin),receipt.totalCoin);assert.equal(String(totalMasterStars),receipt.totalMasterStars);
 if(receipt.auditId){
  const [audit]=await query(client,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
  assert.equal(audit?.action_type,'CLAN_SEASON_END_GIFT_SEND');assert.equal(audit.target_id,OPERATION_KEY);
  assert.equal(JSON.parse(audit.after_data).recipientHash,receipt.recipientHash);
 }
 return {recipients:recipients.size,leaders:EXPECTED_LEADERS,messages:rows.length,rewards:rows.length,duplicates:0,totalCoin:String(totalCoin),totalMasterStars:String(totalMasterStars),claimed,pending:rows.length-claimed};
}

// Owner-authorized one-time operation. Caller owns BEGIN / COMMIT / ROLLBACK.
// All completed-season participants are included, without an account-status filter.
// Wallets, inventory, account restrictions and season settlement remain untouched.
export async function sendClanSeasonGift(client,expectedRecipientHash){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Inspected recipient hash required');
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await query(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){
  const receipt=JSON.parse(saved.value);assert.equal(receipt.recipientHash,expectedRecipientHash);
  return {receipt,verification:await verifyClanSeasonGift(client,receipt),replayed:true};
 }
 const [date]=await query(client,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");
 assert.equal(date.kst,'2026-09-28','One-time operation date expired');
 await client.query('SELECT id FROM clan_seasons WHERE id=$1 FOR SHARE',[SEASON_ID]);
 await client.query('LOCK TABLE clan_members,clan_season_teams IN SHARE MODE');
 const plan=await inspectClanSeasonGift(client);
 assert.equal(plan.recipientHash,expectedRecipientHash,'Season roster changed; inspect again');
 assert.equal(plan.existing.length,0,'Matching messages already exist; reconcile before sending');
 assert.ok(plan.storage.every(c=>c.type==='bigint'),'Reward, inventory or claim storage is not BIGINT');
 const [owner]=await query(client,"SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");
 assert.ok(owner,'Owner audit account missing');
 const userIds=plan.recipients.map(r=>r.userId),messageIds=[],rewardIds=[];
 for(const type of ['COIN','MASTER_STAR']){
  const messages=await query(client,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT user_id,'ADMIN',$2,$2,$3,$4 FROM unnest($1::bigint[]) AS user_id ORDER BY user_id RETURNING id::text`,
   [userIds,TITLE,type==='COIN'?'COIN_REWARD':'ITEM_REWARD',CAMPAIGNS[type]]);
  assert.equal(messages.length,EXPECTED_MEMBERS,'Partial message insert');messageIds.push(...messages.map(r=>r.id));
  const amounts=plan.recipients.map(r=>type==='COIN'?String(BigInt(BASE_COIN)+(r.isLeader?BigInt(LEADER_EXTRA_COIN):0n)):MASTER_STARS);
  const rewards=await query(client,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT m.id,m.user_id,$2,a.amount FROM user_messages m
   JOIN unnest($3::bigint[],$4::bigint[]) AS a(user_id,amount) ON a.user_id=m.user_id
   WHERE m.campaign_key=$1 ORDER BY m.user_id RETURNING id::text`,[CAMPAIGNS[type],type,userIds,amounts]);
  assert.equal(rewards.length,EXPECTED_MEMBERS,'Partial reward insert');rewardIds.push(...rewards.map(r=>r.id));
 }
 const {existing,storage:checkedStorage,receipt:unused,...details}=plan;
 const receipt={...details,status:'COMPLETED',delivery:'MESSAGE',noImmediateWalletCredit:true,messageIds,rewardIds,
  actor:'SYSTEM_OPS',authorization:'전체 클랜 참여 유저 1000억 + 마별 100만개, 각 클랜장 5000억 추가 지급: 총 6000억 + 마별 100만개. 메세지 클랜 시즌 종료 기념',
  completedAt:new Date().toISOString()};
 const verification=await verifyClanSeasonGift(client,receipt,{unclaimed:true});
 const audit=await query(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES($1,'CLAN_SEASON_END_GIFT_SEND','CLAN_SEASON',$2,$3,$4) RETURNING id::text`,
  [owner.id,OPERATION_KEY,JSON.stringify({seasonId:SEASON_ID,existingMessages:0,oneTimeException:true,storage:checkedStorage}),JSON.stringify(receipt)]);
 assert.equal(audit.length,1);receipt.auditId=audit[0].id;
 const stored=await query(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);
 assert.equal(stored.length,1,'Completed receipt missing');
 return {receipt,verification,replayed:false};
}

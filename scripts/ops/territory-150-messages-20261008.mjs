import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:territory:68:attacks150-message:20261008:v1';
export const ROUND={id:'68',status:'FINISHED',battle_name:'국밥',winner_side:'B',settled_at:'2026-10-07 22:13:50',clan_season_id:'6'};
export const RECIPIENT_HASH='077c92f3ab70545c2dd58c5275153408d95a28de0d2376d314c17f2ee8ce82b9';
export const COUNT=117;
export const TITLE='영토전 150회 이상 공격 참여 보상';
export const GIFTS=[
  {rewardType:'COIN',rewardAmount:'300000000000',messageType:'COIN_REWARD',campaignKey:'territory-attacks150-68-20261008-v1-coin',label:'코인 3,000억'},
  {rewardType:'MASTER_STAR',rewardAmount:'10000000',messageType:'ITEM_REWARD',campaignKey:'territory-attacks150-68-20261008-v1-star',label:'마스터의 별 1,000만 개'}
];
const q=async(client,sql,values=[])=>(await client.query(sql,values)).rows;
const fingerprint=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[r.userId,r.side,r.attacks]))).digest('hex');
const bodyFor=gift=>`영토전 68회차 ‘국밥’에서 150회 이상 공격한 모든 참여자에게 승패와 관계없이 지급하는 보상입니다.\n\n이번 메시지 보상: ${gift.label}\n\n1인당 코인 3,000억과 마스터의 별 1,000만 개를 각각의 메시지로 지급합니다. 보상 수령 버튼을 눌러주세요.`;
const totalGifts=()=>GIFTS.map(g=>({...g,totalAmount:String(BigInt(g.rewardAmount)*BigInt(COUNT))}));

async function audience(client){
  const [round]=await q(client,`SELECT r.id::text,r.status,r.battle_name,r.winner_side,r.settled_at,r.clan_season_id::text
    FROM territory_war_v3_rounds r WHERE r.status='FINISHED' AND r.settled_at IS NOT NULL ORDER BY r.id DESC LIMIT 1`);
  assert.deepEqual(round,ROUND,'Latest completed round changed; inspect again');
  const recipients=await q(client,`WITH actions AS (
    SELECT user_id,COUNT(*)::int attacks FROM territory_war_v3_actions
    WHERE round_id=$1 AND status IN ('APPLIED','COMPLETED') GROUP BY user_id
  ) SELECT p.user_id::text AS "userId",u.nickname,p.side,u.status,
    p.attacks::int AS "storedAttacks",COALESCE(a.attacks,0)::int AS "actionAttacks",
    r.attacks::int AS "rewardAttacks",r.result,GREATEST(p.attacks,COALESCE(a.attacks,0))::int attacks
  FROM territory_war_v3_users p LEFT JOIN users u ON u.id=p.user_id
  LEFT JOIN actions a ON a.user_id=p.user_id
  LEFT JOIN territory_war_v3_rewards r ON r.round_id=p.round_id AND r.user_id=p.user_id
  WHERE p.round_id=$1 AND GREATEST(p.attacks,COALESCE(a.attacks,0))>=150 ORDER BY p.user_id`,[ROUND.id]);
  assert.equal(recipients.length,COUNT,'Eligible recipient count changed');
  assert.equal(new Set(recipients.map(r=>r.userId)).size,COUNT,'Duplicate recipient');
  for(const r of recipients){
    assert.ok(r.nickname&&r.status==='ACTIVE','Recipient account changed');
    assert.ok(r.attacks>=150&&['A','B'].includes(r.side),'Ineligible recipient');
    assert.equal(r.storedAttacks,r.actionAttacks,'Stored and successful-action counts differ');
    assert.equal(r.rewardAttacks,r.attacks,'Settlement attack count differs');
  }
  assert.equal(recipients.filter(r=>r.side==='A').length,61);
  assert.equal(recipients.filter(r=>r.side==='B').length,56);
  assert.equal(fingerprint(recipients),RECIPIENT_HASH,'Eligible recipient snapshot changed');
  return recipients;
}

async function storage(client){
  const required=[['users','coin'],['user_message_rewards','reward_amount'],
    ['user_message_reward_claim_receipts_v1222','reward_amount'],['user_message_reward_claim_receipts_v1222','balance_before'],['user_message_reward_claim_receipts_v1222','balance_after'],
    ['coin_logs','change_amount'],['coin_logs','balance_after'],['cnine_user_inventory','quantity'],['cnine_user_inventory','unseen_quantity'],['inventory_logs','change_amount'],['inventory_logs','balance_after']];
  const columns=await q(client,`SELECT table_name,column_name,data_type FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=ANY($1::text[])`,[[...new Set(required.map(([t])=>t))]]);
  assert.ok(required.every(([t,c])=>columns.some(x=>x.table_name===t&&x.column_name===c&&x.data_type==='bigint')),'Reward storage must be BIGINT end-to-end');
  const [item]=await q(client,"SELECT code,name,is_active FROM inventory_items WHERE code='MASTER_STAR'");
  assert.equal(item?.name,'마스터의 별');assert.equal(Number(item?.is_active),1);
}

export async function verifyTerritory150Messages(client,receipt,{unclaimed=false}={}){
  assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');
  assert.deepEqual(receipt.round,ROUND);assert.equal(receipt.count,COUNT);
  assert.equal(receipt.minimumAttacks,150);assert.equal(receipt.regardlessOfOutcome,true);
  assert.equal(receipt.delivery,'MESSAGE');assert.equal(receipt.noImmediateWalletCredit,true);assert.equal(receipt.noImmediateInventoryCredit,true);
  assert.equal(receipt.recipientHash,RECIPIENT_HASH);assert.equal(fingerprint(receipt.recipients),RECIPIENT_HASH);
  assert.deepEqual(receipt.gifts,totalGifts());
  const rows=await q(client,`SELECT m.id::text message_id,m.user_id::text user_id,m.sender_type,m.title,m.body,m.message_type,m.campaign_key,m.is_read,m.hidden_at,
    r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text reward_amount,r.claimed_at,
    c.reward_id::text claim_id,c.message_id::text claim_message_id,c.user_id::text claim_user_id,c.reward_type claim_type,c.reward_amount::text claim_amount,
    c.balance_before::text,c.balance_after::text
    FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
    LEFT JOIN user_message_reward_claim_receipts_v1222 c ON c.reward_id=r.id
    WHERE m.campaign_key=ANY($1::text[]) ORDER BY m.user_id,m.campaign_key`,[GIFTS.map(g=>g.campaignKey)]);
  assert.equal(rows.length,COUNT*GIFTS.length,'Partial delivery');
  assert.equal(new Set(receipt.messageIds).size,COUNT*GIFTS.length);
  assert.equal(new Set(receipt.rewardIds).size,COUNT*GIFTS.length);
  const recipients=new Set(receipt.recipients.map(r=>r.userId)),seen=new Set(),campaigns=[];
  assert.equal(recipients.size,COUNT);
  for(const gift of GIFTS){
    const members=rows.filter(r=>r.campaign_key===gift.campaignKey);assert.equal(members.length,COUNT);
    let claimed=0;
    for(const row of members){
      assert.ok(recipients.has(row.user_id),'Unexpected recipient');
      const key=gift.rewardType+':'+row.user_id;assert.ok(!seen.has(key),'Duplicate reward');seen.add(key);
      assert.ok(row.reward_id);assert.equal(row.reward_user_id,row.user_id);
      assert.equal(row.reward_type,gift.rewardType);assert.equal(row.reward_amount,gift.rewardAmount);
      assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,gift.messageType);
      assert.equal(row.title,`${TITLE} · ${gift.label}`);assert.equal(row.body,bodyFor(gift));
      assert.ok(receipt.messageIds.includes(row.message_id));assert.ok(receipt.rewardIds.includes(row.reward_id));
      if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
      if(row.claimed_at){
        assert.ok(row.claim_id);assert.equal(row.claim_message_id,row.message_id);assert.equal(row.claim_user_id,row.user_id);
        assert.equal(row.claim_type,gift.rewardType);assert.equal(row.claim_amount,gift.rewardAmount);
        assert.equal(BigInt(row.balance_after)-BigInt(row.balance_before),BigInt(gift.rewardAmount));claimed++;
      }else assert.equal(row.claim_id,null,'Claim receipt before claim');
    }
    campaigns.push({rewardType:gift.rewardType,recipients:COUNT,rewardAmount:gift.rewardAmount,totalAmount:String(BigInt(gift.rewardAmount)*BigInt(COUNT)),claimed,pending:COUNT-claimed});
  }
  if(receipt.auditId){
    const [audit]=await q(client,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
    assert.equal(audit?.action_type,'TERRITORY_PARTICIPATION_MESSAGE_SEND');assert.equal(audit.target_id,OPERATION_KEY);
    const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
  }
  return {recipients:COUNT,messages:rows.length,rewards:rows.length,missing:0,duplicates:0,campaigns};
}

// Explicit one-time authorization. Caller must BEGIN and COMMIT/ROLLBACK the whole call.
// Victory, defeat and normal settlement eligibility do not filter this recipient set.
export async function sendTerritory150Messages(client,expectedHash){
  assert.equal(expectedHash,RECIPIENT_HASH,'Inspected recipient hash required');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
  if(saved){const receipt=JSON.parse(saved.value);return {receipt,verification:await verifyTerritory150Messages(client,receipt),replayed:true};}
  const [date]=await q(client,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst");
  assert.equal(date.kst,'2026-10-08','One-time operation date expired');
  await client.query('SELECT id FROM territory_war_v3_rounds WHERE id=$1 FOR SHARE',[ROUND.id]);
  await client.query('SELECT user_id FROM territory_war_v3_users WHERE round_id=$1 ORDER BY user_id FOR SHARE',[ROUND.id]);
  const recipients=await audience(client);await storage(client);
  const [existing]=await q(client,`SELECT COUNT(*)::int n FROM user_messages WHERE campaign_key=ANY($1::text[])
    OR (created_at>=$2 AND title LIKE $3)`,[GIFTS.map(g=>g.campaignKey),ROUND.settled_at,TITLE+'%']);
  assert.equal(existing.n,0,'Matching messages already exist without this receipt; reconcile first');
  const [owner]=await q(client,"SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");
  assert.ok(owner,'Owner audit account missing');
  const messageIds=[],rewardIds=[];
  for(const gift of GIFTS){
    const messages=await q(client,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
      SELECT user_id,'ADMIN',$2,$3,$4,$5 FROM unnest($1::bigint[]) a(user_id) ORDER BY user_id RETURNING id::text`,
      [recipients.map(r=>r.userId),`${TITLE} · ${gift.label}`,bodyFor(gift),gift.messageType,gift.campaignKey]);
    assert.equal(messages.length,COUNT,'Partial message insert');messageIds.push(...messages.map(m=>m.id));
    const rewards=await q(client,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
      SELECT id,user_id,$2,$3::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id::text`,
      [gift.campaignKey,gift.rewardType,gift.rewardAmount]);
    assert.equal(rewards.length,COUNT,'Partial reward insert');rewardIds.push(...rewards.map(r=>r.id));
  }
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',round:ROUND,count:COUNT,minimumAttacks:150,regardlessOfOutcome:true,
    recipientHash:RECIPIENT_HASH,recipients,gifts:totalGifts(),delivery:'MESSAGE',noImmediateWalletCredit:true,noImmediateInventoryCredit:true,
    messageIds,rewardIds,actor:'SYSTEM_OPS',authorization:'영토전 이전 종료회차 150회 이상 공격자 3천억 1000만 마별 메세지 지급해 승패 상관없음',completedAt:new Date().toISOString()};
  const verification=await verifyTerritory150Messages(client,receipt,{unclaimed:true});
  const audit=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
    VALUES($1,'TERRITORY_PARTICIPATION_MESSAGE_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id::text`,
    [owner.id,OPERATION_KEY,JSON.stringify({existingMessages:0,oneTimeException:true}),JSON.stringify(receipt)]);
  assert.equal(audit.length,1);receipt.auditId=audit[0].id;
  const stored=await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);
  assert.equal(stored.length,1,'Audit receipt was not saved');
  return {receipt,verification,replayed:false};
}

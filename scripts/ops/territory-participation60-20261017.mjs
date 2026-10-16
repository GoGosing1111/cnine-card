import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MERCENARY_SSS_SHARD_ITEM as ITEM} from '../../functions/_mercenary_sss_shard.js';
import {PLAN as PRIOR,HASH as PRIOR_HASH,GIFTS as PRIOR_GIFTS,verify as verifyPrior} from './territory-finish-rewards-20261017.mjs';

const raw=fs.readFileSync(new URL('./territory-participation60-20261017.json',import.meta.url),'utf8').replace(/\r\n/g,'\n');
export const HASH='89495aeed52d945e9fc57504cc7a0980c4aebf8d12c9789534c576adb759f491';
assert.equal(createHash('sha256').update(raw).digest('hex'),HASH,'Frozen payout plan changed');
export const PLAN=JSON.parse(raw);
export const KEY=PLAN.operationKey;
export const GIFTS=[
  {key:'coin',type:'COIN',messageType:'COIN_REWARD',label:'코인'},
  {key:'shards',type:ITEM.code,messageType:'ITEM_REWARD',label:ITEM.name}
].map(g=>({...g,campaign:`${KEY}:${g.key}`,title:`영토전 74회차 참여 60회 보상 · ${g.label}`}));
const q=async(c,sql,params=[])=>(await c.query(sql,params)).rows;
const sorted=values=>[...values].sort();
const sum=(rows,key)=>rows.reduce((total,row)=>total+BigInt(row[key]),0n).toString();
const priorCampaigns=PRIOR_GIFTS.map(g=>g.campaign);

function validatePlan(){
  assert.equal(PLAN.round.id,'74');assert.deepEqual(PLAN.round,PRIOR.round);
  assert.equal(PLAN.authorization.previousOperationKey,PRIOR.operationKey);
  assert.equal(PLAN.authorization.previousPlanHash,PRIOR_HASH);
  assert.equal(PLAN.authorization.stackingConfirmation,'두 보상 합산');
  assert.equal(PLAN.authorization.delivery,'MESSAGE');assert.equal(PLAN.authorization.recurring,false);
  assert.equal(PLAN.item.code,ITEM.code);assert.deepEqual(PLAN.rules,{
    minimumAttacks:60,participation:{coin:'300000000000',shards:'1'},winner:{coin:'500000000000',shards:'1'},stack:true
  });
  assert.deepEqual(PLAN.participants,PRIOR.participants);
  const expected=PLAN.participants.filter(p=>p.storedAttacks>=60).map(p=>({userId:p.userId,side:p.side,attacks:p.storedAttacks,winner:p.side==='B',coin:'300000000000',shards:'1'}));
  assert.deepEqual(PLAN.recipients,expected);
  assert.equal(expected.length,67);assert.equal(expected.filter(r=>r.side==='A').length,31);
  assert.equal(expected.filter(r=>r.attacks===60).length,1);
  assert.deepEqual(PLAN.totals,{participants:135,participationQualified:67,winnerOverlap:36,recipients:67,messages:134,totalShards:'67',totalCoin:'20100000000000'});
  assert.equal(sum(expected,'coin'),PLAN.totals.totalCoin);assert.equal(sum(expected,'shards'),PLAN.totals.totalShards);
  assert.deepEqual(PLAN.combinedTotals,{participants:135,participationQualified:67,winners:67,overlap:36,recipients:98,messages:268,totalShards:'134',totalCoin:'53600000000000'});
}
validatePlan();

export function bodyFor(row,gift){
  const attachment=gift.key==='coin'?'코인 3,000억':'SSS 용병 카드 조각 1개';
  const total=row.winner?'SSS 용병 카드 조각 2개 + 코인 8,000억':'SSS 용병 카드 조각 1개 + 코인 3,000억';
  return `영토전 74회차 ‘라면’에 참여해 주셔서 감사합니다.\n\n참여 60회 이상(승패 무관): SSS 용병 카드 조각 1개 + 코인 3,000억\n회원님의 참여 횟수: ${row.attacks}회\n\n승리팀 보상(SSS 용병 카드 조각 1개 + 코인 5,000억)은 별도 지급되며, 두 조건을 모두 충족하면 합산합니다.\n회원님의 회차 총 보상: ${total}\n이 메시지의 첨부 보상: ${attachment}\n\n코인과 조각은 각각의 보상 메시지에서 수령해 주세요.`;
}

async function assertStorage(c){
  const required=[['users','coin'],['user_message_rewards','reward_amount'],['cnine_user_inventory','quantity'],
    ['user_message_reward_claim_receipts_v1222','reward_amount'],['user_message_reward_claim_receipts_v1222','balance_before'],
    ['user_message_reward_claim_receipts_v1222','balance_after'],['coin_logs','change_amount'],['coin_logs','balance_after'],
    ['inventory_logs','change_amount'],['inventory_logs','balance_after']];
  const columns=await q(c,'SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',[[...new Set(required.map(([t])=>t))]]);
  assert.ok(required.every(([table,column])=>columns.some(r=>r.table_name===table&&r.column_name===column&&r.data_type==='bigint')),'Reward storage must be BIGINT end-to-end');
}

async function priorReceipt(c,{lock=false}={}){
  const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1'+(lock?' FOR SHARE':''),[PRIOR.operationKey]);
  assert.ok(saved,'Existing winner payout receipt missing');
  const receipt=JSON.parse(saved.value);assert.equal(receipt.planHash,PRIOR_HASH);
  await verifyPrior(c,receipt);return receipt;
}

export async function verify(c,receipt,{unclaimed=false}={}){
  validatePlan();assert.equal(receipt.operationKey,KEY);assert.equal(receipt.planHash,HASH);assert.equal(receipt.status,'COMPLETED');
  assert.equal(receipt.delivery,'MESSAGE');assert.deepEqual(receipt.round,PLAN.round);assert.deepEqual(receipt.totals,PLAN.totals);
  assert.deepEqual(receipt.combinedTotals,PLAN.combinedTotals);assert.deepEqual(receipt.authorization,PLAN.authorization);
  assert.deepEqual(receipt.recipientIds,PLAN.recipients.map(r=>r.userId));
  assert.equal(new Set(receipt.messageIds).size,134);assert.equal(new Set(receipt.rewardIds).size,134);
  const rows=await q(c,`SELECT m.id::text mid,m.user_id::text uid,m.campaign_key,m.sender_type,m.title,m.body,m.message_type,m.is_read,m.hidden_at,
    r.id::text rid,r.user_id::text ruid,r.reward_type,r.reward_amount::text amount,r.claimed_at,
    cr.reward_id::text claim_id,cr.message_id::text claim_mid,cr.user_id::text claim_uid,cr.reward_type claim_type,
    cr.reward_amount::text claim_amount,cr.balance_before::text,cr.balance_after::text
    FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
    LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id
    WHERE m.campaign_key=ANY($1::text[])`,[GIFTS.map(g=>g.campaign)]);
  assert.equal(rows.length,134,'Partial or duplicate message delivery');
  assert.deepEqual(sorted(rows.map(r=>r.mid)),sorted(receipt.messageIds));assert.deepEqual(sorted(rows.map(r=>r.rid)),sorted(receipt.rewardIds));
  const recipients=new Map(PLAN.recipients.map(r=>[r.userId,r]));let claimed=0;
  for(const gift of GIFTS){
    const attached=rows.filter(r=>r.campaign_key===gift.campaign);
    assert.deepEqual(sorted(attached.map(r=>r.uid)),sorted(receipt.recipientIds));
    assert.equal(sum(attached,'amount'),gift.key==='coin'?PLAN.totals.totalCoin:PLAN.totals.totalShards);
    for(const row of attached){
      const expected=recipients.get(row.uid);
      assert.equal(row.ruid,row.uid);assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,gift.messageType);
      assert.equal(row.title,gift.title);assert.equal(row.body,bodyFor(expected,gift));
      assert.equal(row.reward_type,gift.type);assert.equal(row.amount,expected[gift.key]);
      if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.claim_id,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
      if(row.claimed_at){
        assert.equal(row.claim_id,row.rid);assert.equal(row.claim_mid,row.mid);assert.equal(row.claim_uid,row.uid);
        assert.equal(row.claim_type,gift.type);assert.equal(row.claim_amount,row.amount);
        assert.equal(BigInt(row.balance_after)-BigInt(row.balance_before),BigInt(row.amount));claimed++;
      }else assert.equal(row.claim_id,null);
    }
  }
  if(receipt.auditId){
    const [audit]=await q(c,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
    assert.equal(audit?.action_type,'TERRITORY_PARTICIPATION60_REWARD_MESSAGES');assert.equal(audit.target_id,KEY);
    const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
  }
  await priorReceipt(c);
  const combined=await q(c,`SELECT m.user_id::text "userId",COUNT(*)::int messages,
    SUM(CASE WHEN r.reward_type='COIN' THEN r.reward_amount ELSE 0 END)::text coin,
    SUM(CASE WHEN r.reward_type=$2 THEN r.reward_amount ELSE 0 END)::text shards
    FROM user_messages m JOIN user_message_rewards r ON r.message_id=m.id
    WHERE m.campaign_key=ANY($1::text[]) GROUP BY m.user_id ORDER BY m.user_id`,[[...priorCampaigns,...GIFTS.map(g=>g.campaign)],ITEM.code]);
  const expected=PLAN.participants.filter(p=>p.storedAttacks>=60||p.side==='B').map(p=>({
    userId:p.userId,messages:2*(Number(p.storedAttacks>=60)+Number(p.side==='B')),
    coin:String((p.storedAttacks>=60?300000000000n:0n)+(p.side==='B'?500000000000n:0n)),
    shards:String(Number(p.storedAttacks>=60)+Number(p.side==='B'))
  }));
  assert.deepEqual(combined,expected,'Combined participation and winner rewards mismatch');
  assert.equal(combined.length,98);assert.equal(sum(combined,'coin'),PLAN.combinedTotals.totalCoin);assert.equal(sum(combined,'shards'),PLAN.combinedTotals.totalShards);
  return {...PLAN.totals,rewards:rows.length,claimed,pending:rows.length-claimed,missing:0,duplicates:0,combined:PLAN.combinedTotals};
}

// Adds only the newly authorized participation reward; caller owns the transaction.
export async function send(c,approvedHash){
  assert.equal(approvedHash,HASH,'Explicit frozen plan hash required');validatePlan();
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY]);
  const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[KEY]);
  if(saved){const receipt=JSON.parse(saved.value);return {receipt,replayed:true,verification:await verify(c,receipt)};}
  const [date]=await q(c,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst");assert.equal(date.kst,'2026-10-17','One-time payout authorization expired');
  await priorReceipt(c,{lock:true});
  const [round]=await q(c,'SELECT id::text,status,battle_name,winner_side,starts_at,ends_at,settled_at,clan_season_id::text FROM territory_war_v3_rounds WHERE id=$1 FOR SHARE',[PLAN.round.id]);assert.deepEqual(round,PLAN.round);
  const participants=await q(c,`WITH a AS (
    SELECT user_id,COUNT(*)::int attacks FROM territory_war_v3_actions WHERE round_id=$1 AND status IN ('APPLIED','COMPLETED') GROUP BY user_id
  ) SELECT p.user_id::text "userId",u.status "accountStatus",p.side,p.status "participantStatus",
    p.attacks::int "storedAttacks",COALESCE(a.attacks,0)::int "actionAttacks",r.attacks::int "rewardAttacks",r.result,r.side "rewardSide"
    FROM territory_war_v3_users p JOIN users u ON u.id=p.user_id
    LEFT JOIN a ON a.user_id=p.user_id LEFT JOIN territory_war_v3_rewards r ON r.round_id=p.round_id AND r.user_id=p.user_id
    WHERE p.round_id=$1 ORDER BY p.user_id FOR SHARE OF p`,[PLAN.round.id]);
  assert.deepEqual(participants,PLAN.participants,'Final participant or participation snapshot changed');
  await assertStorage(c);
  const [item]=await q(c,'SELECT code,name,category,rarity,image_url,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM.code]);
  assert.equal(item?.name,ITEM.name);assert.equal(item.category,'MATERIAL');assert.equal(item.rarity,'SSS');assert.equal(item.image_url,ITEM.image);assert.equal(Number(item.is_active),1);
  const unexpectedOps=await q(c,"SELECT key FROM app_meta WHERE key LIKE 'ops:territory:74:%' AND key<>$1",[PRIOR.operationKey]);assert.deepEqual(unexpectedOps,[],'Unexpected round payout requires reconciliation');
  const [existing]=await q(c,`SELECT COUNT(*)::int n FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
    WHERE (m.campaign_key LIKE $1 OR (m.created_at::timestamptz >= $2::timestamptz
      AND (m.title LIKE '%영토전%' OR m.campaign_key LIKE '%territory%') AND r.reward_type=ANY($3::text[])))
      AND (m.campaign_key IS NULL OR NOT(m.campaign_key=ANY($4::text[])))`,
    [`${KEY}%`,PLAN.round.settled_at,GIFTS.map(g=>g.type),priorCampaigns]);
  assert.equal(existing.n,0,'Additional territory rewards require reconciliation');
  const [owner]=await q(c,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
  const messageIds=[],rewardIds=[];
  for(const gift of GIFTS){
    const payload=JSON.stringify(PLAN.recipients.map(row=>({uid:row.userId,amount:row[gift.key],body:bodyFor(row,gift)})));
    const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
      SELECT p.uid,'ADMIN',$2,p.body,$3,$4 FROM jsonb_to_recordset($1::jsonb) p(uid bigint,amount bigint,body text)
      ORDER BY p.uid RETURNING id::text`,[payload,gift.title,gift.messageType,gift.campaign]);
    assert.equal(messages.length,67,'Partial message insert');messageIds.push(...messages.map(r=>r.id));
    const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
      SELECT m.id,m.user_id,$3,p.amount FROM user_messages m
      JOIN jsonb_to_recordset($1::jsonb) p(uid bigint,amount bigint,body text) ON p.uid=m.user_id
      WHERE m.campaign_key=$2 ORDER BY m.user_id RETURNING id::text`,[payload,gift.campaign,gift.type]);
    assert.equal(rewards.length,67,'Partial reward insert');rewardIds.push(...rewards.map(r=>r.id));
  }
  const receipt={operationKey:KEY,planHash:HASH,status:'COMPLETED',round:PLAN.round,totals:PLAN.totals,combinedTotals:PLAN.combinedTotals,
    recipientIds:PLAN.recipients.map(r=>r.userId),messageIds,rewardIds,delivery:'MESSAGE',authorization:PLAN.authorization,completedAt:new Date().toISOString()};
  const verification=await verify(c,receipt,{unclaimed:true});
  const [audit]=await q(c,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
    VALUES($1,'TERRITORY_PARTICIPATION60_REWARD_MESSAGES','USER_MESSAGE',$2,$3,$4) RETURNING id::text`,
    [owner.id,KEY,JSON.stringify({messages:0,oneTime:true,existingWinnerOperationKey:PRIOR.operationKey}),JSON.stringify(receipt)]);
  assert.ok(audit?.id);receipt.auditId=audit.id;
  await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[KEY,JSON.stringify(receipt)]);
  return {receipt,replayed:false,verification};
}

import {mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';
import {SHIRANUI_RANK_CAMPAIGN,SHIRANUI_MESSAGE_REWARD,shiranuiRankRewardKey} from './_account_rank_shiranui.js';

// A fixed, administrator-delivered card attachment. No draw, coupon or equip side effects.
export const claimOmegaMercenaryMessageReward=(env,user,reward,messageId)=>claimFixedMercenaryMessageReward(env,user,reward,messageId,{type:'MERCENARY_OMEGA_X',code:'V-021',label:'오메가-X SSS'});
export const claimShiranuiMercenaryMessageReward=(env,user,reward,messageId)=>claimFixedMercenaryMessageReward(env,user,reward,messageId,{type:SHIRANUI_MESSAGE_REWARD,code:'V-987',label:'시라누이 SSS 리미티드',campaign:SHIRANUI_RANK_CAMPAIGN});
// Rank rewards deliberately bypass draw-policy weights and limited pack stock.
// The enclosing claim locks the account, reserves its receipt and verifies the
// official rank campaign before these two ledger writes can execute.
function shiranuiMessageAcquisitionStatements(DB,{userId,acquisitionId,createdAt}){
 const p=(s,...v)=>DB.prepare(s).bind(...v);
 return [
  p(`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
    SELECT ?,'V-987',1,0,?,? WHERE NOT EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?)
    ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at`,userId,createdAt,createdAt,acquisitionId),
  p(`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at)
    SELECT ?,user_id,mercenary_code,CASE WHEN total_copies>1 THEN 1 ELSE 0 END,total_copies,duplicate_count,?
    FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code='V-987' AND NOT EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?) ON CONFLICT(acquisition_id) DO NOTHING`,acquisitionId,createdAt,userId,acquisitionId)
 ];
}
async function claimFixedMercenaryMessageReward(env,user,reward,messageId,{type,code,label,campaign}){
  const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),userId=Number(user.id),rewardId=Number(reward.id);
  messageId=Number(messageId);
  if([userId,rewardId,messageId].some(id=>!Number.isSafeInteger(id)||id<1))throw Error('용병 보상 정보를 확인하세요.');
  const acquisitionId=`message:mercenary:${rewardId}`;
  const stored=await p(`SELECT r.*${campaign?',m.campaign_key':''} FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id AND m.user_id=r.user_id
    WHERE r.id=? AND r.message_id=? AND r.user_id=? AND r.reward_type=?`,rewardId,messageId,userId,type).first();
  if(!stored||Number(stored.reward_amount)!==1)throw Error(`수령할 ${label} 보상이 없습니다.`);
  if(campaign){
    const grant=await p('SELECT value FROM app_meta WHERE key=?',shiranuiRankRewardKey(userId)).first();
    if(stored.campaign_key!==campaign||!grant||grant.value==='PREVIOUSLY_OWNED')throw Error('중장 달성 보상의 지급 기록을 확인하세요.');
  }
  const receiptFor=()=>p('SELECT * FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=? AND user_id=?',rewardId,userId).first();
  const resultFor=async(receipt,duplicate)=>{
    const [acquisition,owned,updated]=await Promise.all([
      p('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?',acquisitionId).first(),
      p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',userId,code).first(),
      p('SELECT * FROM users WHERE id=?',userId).first()
    ]);
    if(receipt.reward_type!==type||Number(receipt.reward_amount)!==1||Number(receipt.message_id)!==messageId||
      !acquisition||Number(acquisition.user_id)!==userId||acquisition.mercenary_code!==code||
      Number(acquisition.total_copies_after)!==Number(receipt.balance_after)||Number(receipt.balance_after)!==Number(receipt.balance_before)+1)
      throw Error('용병 수령 기록을 확인하세요.');
    return {credited:!duplicate,duplicate,receipt,updated,balanceBefore:Number(receipt.balance_before),balanceAfter:Number(owned?.total_copies||0),rewardLabel:label,mercenaryCode:code};
  };
  const existing=await receiptFor();if(existing)return resultFor(existing,true);
  if(String(stored.claimed_at||'').trim())throw Error('용병 보상의 기존 수령 기록을 확인하세요.');
  const token=crypto.randomUUID(),guardId=crypto.randomUUID(),now=new Date().toISOString();
  const receiptMatch='reward_id=? AND message_id=? AND user_id=? AND reward_type=? AND reward_amount=1';
  const match=[rewardId,messageId,userId,type];
  const tokenExists=`EXISTS(SELECT 1 FROM user_message_reward_claim_receipts_v1222 WHERE ${receiptMatch} AND claim_token=?)`;
  const statements=[
    ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',userId),p('SELECT id FROM user_message_rewards WHERE id=? AND user_id=? FOR UPDATE',rewardId,userId)]:[]),
    p(`INSERT INTO user_message_reward_claim_receipts_v1222(reward_id,message_id,user_id,reward_type,reward_amount,claim_token,balance_before,balance_after,source)
      SELECT r.id,r.message_id,r.user_id,r.reward_type,1,?,COALESCE(c.total_copies,0),COALESCE(c.total_copies,0),'MESSAGE_CLAIM'
      FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id AND m.user_id=r.user_id JOIN users u ON u.id=r.user_id
      LEFT JOIN user_mercenary_cards_v1 c ON c.user_id=r.user_id AND c.mercenary_code=?
      WHERE r.id=? AND r.message_id=? AND r.user_id=? AND r.reward_type=? AND r.reward_amount=1 AND (r.claimed_at IS NULL OR TRIM(r.claimed_at)='')
      AND NOT EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?) ON CONFLICT(reward_id) DO NOTHING`,token,code,...match,acquisitionId),
    // Reject missing/conflicting reservations before composing the shared acquisition.
    // A concurrent completed claim is allowed only with its matching durable acquisition.
    p(`INSERT INTO mercenary_card_atomic_guard_v1(id,verified) SELECT ?,CASE WHEN EXISTS(
      SELECT 1 FROM user_message_reward_claim_receipts_v1222 r WHERE ${receiptMatch} AND (claim_token=? OR EXISTS(
        SELECT 1 FROM mercenary_card_acquisitions_v1 a WHERE a.acquisition_id=? AND a.user_id=r.user_id AND a.mercenary_code=?
        AND a.total_copies_after=r.balance_after AND r.balance_after=r.balance_before+1))) THEN 1 ELSE 0 END`,guardId,...match,token,acquisitionId,code),
    ...(campaign?shiranuiMessageAcquisitionStatements:mercenaryCardAcquisitionStatements)(DB,{userId,mercenaryCode:code,acquisitionId,createdAt:now}),
    p(`UPDATE user_message_reward_claim_receipts_v1222 SET balance_after=(SELECT total_copies_after FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?),credited_at=CURRENT_TIMESTAMP WHERE ${receiptMatch} AND claim_token=?`,acquisitionId,...match,token),
    p(`UPDATE user_message_rewards SET claimed_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND ${tokenExists}`,rewardId,userId,...match,token),
    p(`UPDATE user_messages SET is_read=1,read_at=COALESCE(read_at,CURRENT_TIMESTAMP),hidden_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND ${tokenExists}`,messageId,userId,...match,token),
    p(`UPDATE mercenary_card_atomic_guard_v1 SET verified=CASE WHEN EXISTS(
      SELECT 1 FROM user_message_reward_claim_receipts_v1222 r
      JOIN mercenary_card_acquisitions_v1 a ON a.acquisition_id=? AND a.user_id=r.user_id AND a.mercenary_code=?
      JOIN user_message_rewards w ON w.id=r.reward_id AND w.message_id=r.message_id AND w.user_id=r.user_id
      JOIN user_messages m ON m.id=r.message_id AND m.user_id=r.user_id
      WHERE r.reward_id=? AND r.message_id=? AND r.user_id=? AND r.reward_type=? AND r.reward_amount=1
      AND r.balance_after=a.total_copies_after AND r.balance_after=r.balance_before+1
      AND w.claimed_at IS NOT NULL AND TRIM(w.claimed_at)<>'' AND m.hidden_at IS NOT NULL)
      THEN 1 ELSE 0 END WHERE id=?`,acquisitionId,code,...match,guardId),
    p('DELETE FROM mercenary_card_atomic_guard_v1 WHERE id=?',guardId)
  ];
  await DB.batch(statements);
  const receipt=await receiptFor();if(!receipt)throw Error('용병이 지급되지 않았습니다. 메시지에서 다시 수령하세요.');
  return resultFor(receipt,receipt.claim_token!==token);
}

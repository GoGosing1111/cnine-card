// Message rewards use the real Pig Coin wallet and its ledger. The message,
// claim receipt, wallet and ledger commit together; delivery itself grants nothing.
export async function claimPigCoinMessageReward(env,user,reward,messageId){
  const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),userId=Number(user.id),rewardId=Number(reward.id);
  if(!Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(rewardId)||rewardId<1||!Number.isSafeInteger(Number(messageId)))throw Error('피그코인 보상 정보를 확인하세요.');
  const stored=await p(`SELECT r.* FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id AND m.user_id=r.user_id
    WHERE r.id=? AND r.message_id=? AND r.user_id=? AND r.reward_type='PIG_COIN'`,rewardId,messageId,userId).first();
  const amount=Number(stored?.reward_amount);
  if(!stored||!Number.isSafeInteger(amount)||amount<=0)throw Error('수령할 피그코인 보상이 없습니다.');
  const receiptFor=()=>p('SELECT * FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=? AND user_id=?',rewardId,userId).first();
  const resultFor=async(receipt,duplicate)=>{
    if(receipt.reward_type!=='PIG_COIN'||Number(receipt.reward_amount)!==amount||Number(receipt.message_id)!==Number(messageId))throw Error('피그코인 수령 기록을 확인하세요.');
    const [wallet,updated]=await Promise.all([p('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=?',userId).first(),p('SELECT * FROM users WHERE id=?',userId).first()]);
    return {credited:!duplicate,duplicate,receipt,updated,balanceBefore:Number(receipt.balance_before),balanceAfter:Number(wallet?.balance||0),pigCoinsAfter:Number(wallet?.balance||0),rewardLabel:'피그코인'};
  };
  const existing=await receiptFor();if(existing)return resultFor(existing,true);
  if(stored.claimed_at)throw Error('피그코인 보상의 기존 수령 기록을 확인하세요.');
  const token=crypto.randomUUID(),ledgerId=`message-reward:${rewardId}`,now=new Date().toISOString();
  const available="EXISTS(SELECT 1 FROM user_message_rewards WHERE id=? AND message_id=? AND user_id=? AND reward_type='PIG_COIN' AND reward_amount=? AND (claimed_at IS NULL OR TRIM(claimed_at)=''))";
  const args=[rewardId,messageId,userId,amount];
  const tokenExists='EXISTS(SELECT 1 FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=? AND user_id=? AND claim_token=?)';
  const bound=[rewardId,userId,token];
  const statements=[
    ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',userId)]:[]),
    p(`INSERT INTO pig_coin_wallets_v1(user_id,balance) SELECT id,0 FROM users WHERE id=? AND ${available} ON CONFLICT(user_id) DO NOTHING`,userId,...args),
    ...(DB.dialect==='postgres'?[p('SELECT user_id FROM pig_coin_wallets_v1 WHERE user_id=? FOR UPDATE',userId)]:[]),
    p(`INSERT INTO user_message_reward_claim_receipts_v1222(reward_id,message_id,user_id,reward_type,reward_amount,claim_token,balance_before,balance_after,source)
      SELECT ?,?,user_id,'PIG_COIN',?,?,balance,balance,'MESSAGE_CLAIM' FROM pig_coin_wallets_v1 WHERE user_id=? AND ${available} ON CONFLICT(reward_id) DO NOTHING`,rewardId,messageId,amount,token,userId,...args),
    p(`INSERT INTO pig_coin_ledger_v1(id,user_id,amount,balance_after,source,reference_id,created_at)
      SELECT ?,user_id,?,balance+?,'MESSAGE_REWARD',?,? FROM pig_coin_wallets_v1 WHERE user_id=? AND ${tokenExists}`,ledgerId,amount,amount,String(rewardId),now,userId,...bound),
    p(`UPDATE pig_coin_wallets_v1 SET balance=balance+? WHERE user_id=? AND ${tokenExists}`,amount,userId,...bound),
    p(`UPDATE user_message_reward_claim_receipts_v1222 SET balance_after=(SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=?),credited_at=CURRENT_TIMESTAMP WHERE reward_id=? AND user_id=? AND claim_token=?`,userId,...bound),
    p(`UPDATE user_message_rewards SET claimed_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND ${tokenExists}`,rewardId,userId,...bound),
    p(`UPDATE user_messages SET is_read=1,read_at=COALESCE(read_at,CURRENT_TIMESTAMP),hidden_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND ${tokenExists}`,messageId,userId,...bound)
  ];
  await DB.batch(statements);
  const receipt=await receiptFor();if(!receipt)throw Error('피그코인이 지급되지 않았습니다. 메시지에서 다시 수령하세요.');
  return resultFor(receipt,receipt.claim_token!==token);
}

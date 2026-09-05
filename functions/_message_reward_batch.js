export const MESSAGE_REWARD_BATCH_LIMIT=20;
export function messageRewardBatchIds(value){
  if(!Array.isArray(value)||!value.length||value.length>MESSAGE_REWARD_BATCH_LIMIT||value.some(id=>!Number.isSafeInteger(id)||id<=0))return null;
  return [...new Set(value)];
}

// One authenticated request/user lock and one profile read. Each message keeps
// its existing atomic receipt transaction; retries can safely resume a partial batch.
export async function claimMessageRewardBatch(env,user,messageIds,deps){
  const {specFor,canRecover,claim}=deps,results=[];
  const rows=await env.DB.prepare(`SELECT r.id,r.message_id,r.reward_type,r.reward_amount,r.claimed_at,m.title,m.hidden_at
    FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id
    WHERE r.user_id=? AND m.user_id=? AND r.message_id IN (${messageIds.map(()=>'?').join(',')})`)
    .bind(user.id,user.id,...messageIds).all();
  const rewards=new Map((rows.results||[]).map(row=>[Number(row.message_id),row]));
  for(const messageId of messageIds){
    const reward=rewards.get(messageId);
    if(!reward){results.push({messageId,error:'수령할 보상이 없습니다.'});continue;}
    const rewardType=String(reward.reward_type||'').toUpperCase(),rewardAmount=Math.floor(Number(reward.reward_amount||0));
    if(!specFor(rewardType)||!Number.isSafeInteger(rewardAmount)||rewardAmount<=0){results.push({messageId,error:'지원하지 않는 메시지 보상입니다.'});continue;}
    try{
      let allowClaimedRecovery=false;
      if(String(reward.claimed_at||'').trim()){
        const receipt=await env.DB.prepare('SELECT reward_id FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=? AND user_id=?').bind(reward.id,user.id).first();
        if(receipt){results.push({messageId,alreadyClaimed:true});continue;}
        allowClaimedRecovery=await canRecover(env,user,reward,messageId);
        if(!allowClaimedRecovery){results.push({messageId,error:'이전 수령 기록은 관리자 재확인이 필요합니다.'});continue;}
      }
      const result=await claim(env,user,reward,messageId,{allowClaimedRecovery});
      results.push({messageId,alreadyClaimed:Boolean(result.duplicate),ok:!result.duplicate,rewardType,rewardAmount,recovered:allowClaimedRecovery});
    }catch(error){results.push({messageId,error:String(error.message||'지급 결과 재확인이 필요합니다.'),needsVerification:true});}
  }
  return results;
}

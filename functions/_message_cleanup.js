// Keep the inbox archive reversible and preserve reward/campaign receipts.
const candidateSql = alias => `${alias}.hidden_at IS NULL`;

export const messageCleanupAfterReadSql = alias => `(${candidateSql(alias)}
  AND NOT EXISTS(SELECT 1 FROM user_message_rewards r WHERE r.message_id=${alias}.id))`;

// All notices, including unread system/coupon/purchase messages, can be archived.
// Only an attached reward that still needs payment or recovery prevents cleanup.
export const messageCleanupEligibleSql = alias => `(${candidateSql(alias)}
  AND NOT EXISTS(
    SELECT 1 FROM user_message_rewards r WHERE r.message_id=${alias}.id AND (
      r.user_id<>${alias}.user_id OR r.user_id IS NULL
      OR TRIM(COALESCE(r.claimed_at,''))=''
      OR NOT EXISTS(
        SELECT 1 FROM user_message_reward_claim_receipts_v1222 c
        WHERE c.reward_id=r.id AND c.message_id=${alias}.id AND c.user_id=${alias}.user_id
          AND c.reward_type=UPPER(r.reward_type) AND c.reward_amount=r.reward_amount
          AND TRIM(COALESCE(c.credited_at,''))<>''
      )
    )
  )
)`;

export async function countCompletedMessages(env,userId){
  const row=await env.DB.prepare(`SELECT COUNT(*) AS count FROM user_messages m
    WHERE m.user_id=? AND ${messageCleanupEligibleSql('m')}`).bind(userId).first();
  return Number(row?.count||0);
}

export async function hideCompletedMessages(env,userId){
  // Recheck completion in the UPDATE itself; client counts/IDs are never trusted.
  const result=await env.DB.prepare(`UPDATE user_messages
    SET hidden_at=CURRENT_TIMESTAMP,is_read=1,read_at=COALESCE(read_at,CURRENT_TIMESTAMP)
    WHERE user_id=? AND ${messageCleanupEligibleSql('user_messages')}`).bind(userId).run();
  return {ok:true,deletedCount:Number(result.meta?.changes||0)};
}

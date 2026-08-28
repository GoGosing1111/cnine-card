const CAMPAIGN_DATE = '2026-08-28';
const CAMPAIGN_ID = 'PLAYDK_DAILY_QUEST_2026_08_28_TO_50000000_V1';
const TARGET_REWARD_COIN = 50_000_000;
const ROUTE_PATH = 'ops/daily-quest-20260828-backfill-7c9e1b2a';
const INVOCATION_TOKEN = 'dq50m-20260828-8f64f4b2c7a14c29a6e346dd1f235877';
const RECEIPT_TABLE = 'daily_quest_retroactive_receipts_v1896';
const COIN_LOG_REASON = 'PLAYDK 일일퀘스트 5천만 소급 차액';

const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function receiptSchema(env) {
  const postgres = env.DB?.dialect === 'postgres';
  const integer = postgres ? 'BIGINT' : 'INTEGER';
  const now = postgres
    ? "to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')"
    : 'CURRENT_TIMESTAMP';
  return [`CREATE TABLE IF NOT EXISTS ${RECEIPT_TABLE} (
    campaign_id TEXT NOT NULL,
    user_id ${integer} NOT NULL,
    quest_date TEXT NOT NULL,
    claim_id ${integer} NOT NULL,
    original_reward ${integer} NOT NULL,
    target_reward ${integer} NOT NULL,
    delta_coin ${integer} NOT NULL,
    operation_token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    balance_before ${integer} NOT NULL,
    balance_after ${integer},
    created_at TEXT NOT NULL DEFAULT ${now},
    completed_at TEXT,
    PRIMARY KEY(campaign_id,user_id)
  )`];
}

async function ensureReceiptFoundation(env) {
  const schema = receiptSchema(env);
  if (env.DB?.dialect === 'postgres' && typeof env.DB.execSchema === 'function') {
    await env.DB.execSchema(schema);
    return;
  }
  await env.DB.batch(schema.map(statement => env.DB.prepare(statement)));
}

async function payoutState(env) {
  const [claimState, receiptState, amounts] = await Promise.all([
    env.DB.prepare(`SELECT
      COUNT(*) AS total_claims,
      COALESCE(SUM(CASE WHEN reward_coin>=0 AND reward_coin<? THEN 1 ELSE 0 END),0) AS eligible_count,
      COALESCE(SUM(CASE WHEN reward_coin>=0 AND reward_coin<? THEN ?-reward_coin ELSE 0 END),0) AS eligible_delta,
      COALESCE(SUM(CASE WHEN reward_coin=? THEN 1 ELSE 0 END),0) AS target_count,
      COALESCE(SUM(CASE WHEN reward_coin<0 THEN 1 ELSE 0 END),0) AS invalid_count
      FROM wago_daily_quest_claims WHERE quest_date=?`)
      .bind(TARGET_REWARD_COIN,TARGET_REWARD_COIN,TARGET_REWARD_COIN,TARGET_REWARD_COIN,CAMPAIGN_DATE).first(),
    env.DB.prepare(`SELECT
      COUNT(*) AS receipt_count,
      COALESCE(SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END),0) AS completed_count,
      COALESCE(SUM(CASE WHEN status='COMPLETED' THEN delta_coin ELSE 0 END),0) AS completed_delta,
      COALESCE(SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END),0) AS pending_count
      FROM ${RECEIPT_TABLE} WHERE campaign_id=? AND quest_date=?`)
      .bind(CAMPAIGN_ID,CAMPAIGN_DATE).first(),
    env.DB.prepare(`SELECT reward_coin,COUNT(*) AS claim_count
      FROM wago_daily_quest_claims WHERE quest_date=?
      GROUP BY reward_coin ORDER BY reward_coin`).bind(CAMPAIGN_DATE).all()
  ]);
  return {
    totalClaims:numeric(claimState?.total_claims),
    eligibleCount:numeric(claimState?.eligible_count),
    eligibleDelta:numeric(claimState?.eligible_delta),
    targetCount:numeric(claimState?.target_count),
    invalidCount:numeric(claimState?.invalid_count),
    receiptCount:numeric(receiptState?.receipt_count),
    completedCount:numeric(receiptState?.completed_count),
    completedDelta:numeric(receiptState?.completed_delta),
    pendingCount:numeric(receiptState?.pending_count),
    claimAmounts:(amounts?.results||[]).map(row=>({rewardCoin:numeric(row.reward_coin),claimCount:numeric(row.claim_count)}))
  };
}

async function executePayout(env) {
  const operationToken = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO ${RECEIPT_TABLE}(
      campaign_id,user_id,quest_date,claim_id,original_reward,target_reward,delta_coin,
      operation_token,status,balance_before
    )
    SELECT ?,c.user_id,?,c.id,c.reward_coin,?,?-c.reward_coin,?,'PENDING',u.coin
    FROM wago_daily_quest_claims c
    JOIN users u ON u.id=c.user_id
    WHERE c.quest_date=? AND c.reward_coin>=0 AND c.reward_coin<?`)
      .bind(CAMPAIGN_ID,CAMPAIGN_DATE,TARGET_REWARD_COIN,TARGET_REWARD_COIN,operationToken,CAMPAIGN_DATE,TARGET_REWARD_COIN),
    env.DB.prepare(`UPDATE wago_daily_quest_claims SET reward_coin=?
      WHERE quest_date=? AND reward_coin<? AND id IN (
        SELECT claim_id FROM ${RECEIPT_TABLE}
        WHERE campaign_id=? AND operation_token=? AND status='PENDING'
      )`).bind(TARGET_REWARD_COIN,CAMPAIGN_DATE,TARGET_REWARD_COIN,CAMPAIGN_ID,operationToken),
    env.DB.prepare(`UPDATE users SET coin=coin+(
        SELECT r.delta_coin FROM ${RECEIPT_TABLE} r
        WHERE r.campaign_id=? AND r.operation_token=? AND r.status='PENDING' AND r.user_id=users.id
      )
      WHERE id IN (
        SELECT r.user_id FROM ${RECEIPT_TABLE} r
        JOIN wago_daily_quest_claims c ON c.id=r.claim_id AND c.user_id=r.user_id
        WHERE r.campaign_id=? AND r.operation_token=? AND r.status='PENDING'
          AND c.quest_date=? AND c.reward_coin=?
      )`).bind(CAMPAIGN_ID,operationToken,CAMPAIGN_ID,operationToken,CAMPAIGN_DATE,TARGET_REWARD_COIN),
    env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
      SELECT r.user_id,r.delta_coin,u.coin,?
      FROM ${RECEIPT_TABLE} r
      JOIN users u ON u.id=r.user_id
      JOIN wago_daily_quest_claims c ON c.id=r.claim_id AND c.user_id=r.user_id
      WHERE r.campaign_id=? AND r.operation_token=? AND r.status='PENDING'
        AND r.delta_coin>0 AND c.quest_date=? AND c.reward_coin=?`)
      .bind(COIN_LOG_REASON,CAMPAIGN_ID,operationToken,CAMPAIGN_DATE,TARGET_REWARD_COIN),
    env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET
        status='COMPLETED',
        balance_after=(SELECT coin FROM users WHERE id=${RECEIPT_TABLE}.user_id),
        completed_at=CURRENT_TIMESTAMP
      WHERE campaign_id=? AND operation_token=? AND status='PENDING'
        AND EXISTS (
          SELECT 1 FROM wago_daily_quest_claims c
          WHERE c.id=${RECEIPT_TABLE}.claim_id AND c.user_id=${RECEIPT_TABLE}.user_id
            AND c.quest_date=? AND c.reward_coin=?
        )`).bind(CAMPAIGN_ID,operationToken,CAMPAIGN_DATE,TARGET_REWARD_COIN)
  ]);
  const run = await env.DB.prepare(`SELECT
      COUNT(*) AS paid_count,COALESCE(SUM(delta_coin),0) AS paid_delta
    FROM ${RECEIPT_TABLE}
    WHERE campaign_id=? AND operation_token=? AND status='COMPLETED'`)
    .bind(CAMPAIGN_ID,operationToken).first();
  return {
    paidCount:numeric(run?.paid_count),
    paidDelta:numeric(run?.paid_delta),
    statementChanges:(results||[]).map(result=>numeric(result?.meta?.changes))
  };
}

export async function handleDailyQuestRetroactiveV1896({request,env,path,json,getSettings,kstDate}) {
  if (path !== ROUTE_PATH) return null;
  if (request.headers.get('x-cnine-ops-token') !== INVOCATION_TOKEN) {
    return json({error:'Not found'},404);
  }
  if (!['GET','POST'].includes(request.method)) {
    return json({error:'Method not allowed'},405,{allow:'GET, POST'});
  }

  const today = kstDate();
  if (today !== CAMPAIGN_DATE) {
    return json({error:'소급 지급 허용 날짜가 지났습니다.',campaignDate:CAMPAIGN_DATE,today},410);
  }
  const settings = await getSettings(env);
  const configuredReward = Math.floor(numeric(settings?.postRewardCoin));
  if (configuredReward !== TARGET_REWARD_COIN) {
    return json({
      error:'운영 일일퀘스트 보상이 정확히 50,000,000코인이 아니어서 지급을 중단했습니다.',
      configuredReward,
      expectedReward:TARGET_REWARD_COIN
    },409);
  }

  await ensureReceiptFoundation(env);
  const before = await payoutState(env);
  if (request.method === 'GET') {
    return json({ok:true,mode:'PREVIEW',campaignId:CAMPAIGN_ID,campaignDate:CAMPAIGN_DATE,configuredReward,state:before});
  }
  const body = await request.json().catch(()=>({}));
  if (body?.confirm !== CAMPAIGN_ID) {
    return json({error:'소급 지급 확인값이 일치하지 않습니다.'},400);
  }
  if (before.invalidCount>0) {
    return json({error:'음수 수령액 데이터가 있어 자동 지급을 중단했습니다.',state:before},409);
  }

  const run = await executePayout(env);
  const after = await payoutState(env);
  const consistent = run.paidCount===run.statementChanges[0]
    && run.paidCount===run.statementChanges[1]
    && run.paidCount===run.statementChanges[2]
    && run.paidCount===run.statementChanges[3]
    && run.paidCount===run.statementChanges[4];
  return json({
    ok:consistent&&after.eligibleCount===0&&after.pendingCount===0,
    mode:'EXECUTE',
    campaignId:CAMPAIGN_ID,
    campaignDate:CAMPAIGN_DATE,
    configuredReward,
    run,
    before,
    after,
    consistent
  },consistent&&after.eligibleCount===0&&after.pendingCount===0?200:500);
}

export const __dailyQuestRetroactiveV1896 = {
  CAMPAIGN_DATE,CAMPAIGN_ID,TARGET_REWARD_COIN,ROUTE_PATH
};

export const PREDICTION_TROPHY_GOAL = 300_000_000_000_000;

// Settled stakes, including losing picks, are permanent participation records.
// Never sum payouts or receipt snapshots: additional bets update one event/user row.
export const PREDICTION_STAKE_HONORS_SQL = `WITH settled_stakes AS (
  SELECT datetime(e.settled_at) settled_at,
    SUM(b.amount) OVER (ORDER BY datetime(e.settled_at),e.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) total
  FROM coin_prediction_bets b JOIN coin_prediction_events e ON e.id=b.event_id
  WHERE b.user_id=? AND b.status='SETTLED' AND e.status='SETTLED'
    AND e.settled_at IS NOT NULL AND b.amount>0
)
SELECT CASE WHEN COALESCE(MAX(total),0)>=${PREDICTION_TROPHY_GOAL}
  THEN ${PREDICTION_TROPHY_GOAL} ELSE COALESCE(MAX(total),0) END progress,
  MIN(CASE WHEN total>=${PREDICTION_TROPHY_GOAL} THEN settled_at END) first_at
FROM settled_stakes`;

export async function readPredictionStakeHonors(env, userId) {
  // Prediction tables initialize lazily. Missing history after initialization is
  // an error and must not silently erase an earned trophy.
  const initialized = await env.DB.prepare("SELECT value FROM app_meta WHERE key='coin_prediction_settings_v1'").first();
  const row = initialized ? await env.DB.prepare(PREDICTION_STAKE_HONORS_SQL).bind(userId).first() : null;
  // Cap public progress at the goal; larger lifetime totals need not be exposed
  // or converted beyond JavaScript's safe integer range.
  const progress = Math.min(PREDICTION_TROPHY_GOAL, Math.max(0, Number(row?.progress || 0)));
  return { count: progress >= PREDICTION_TROPHY_GOAL ? 1 : 0, acquiredAt: row?.first_at || null, progress, goal: PREDICTION_TROPHY_GOAL };
}

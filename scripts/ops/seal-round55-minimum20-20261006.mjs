// Explicit adjustment for the requested round only; never run at startup.
import assert from 'node:assert/strict';

export const OPERATION_KEY = 'ops:seal:55:min20:20261006:v1';
export const EVENT_ID = 55;
export const EVENT_KEY = 'seal-1791209642068-252acb2364e2';
export const MINIMUM_ATTEMPTS = 20;

export async function inspectSeal55Minimum(client) {
  const event = (await client.query('SELECT * FROM seal_battle_events WHERE id=$1', [EVENT_ID])).rows[0];
  const settings = (await client.query("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'")).rows[0];
  const participation = (await client.query(`SELECT COUNT(*) participants,
    COUNT(*) FILTER (WHERE total_attempts >= $2) eligible,
    COUNT(*) FILTER (WHERE total_attempts = $2) exactly_minimum,
    MAX(total_attempts) maximum_attempts
    FROM seal_battle_user_progress WHERE event_id=$1 AND total_attempts>0`, [EVENT_ID, MINIMUM_ATTEMPTS])).rows[0];
  const claims = (await client.query(`SELECT 'clear' kind,status,COUNT(*) count FROM seal_battle_clear_claims WHERE event_id=$1 GROUP BY status
    UNION ALL SELECT 'rank',status,COUNT(*) FROM seal_battle_rank_claims WHERE event_id=$1 GROUP BY status
    ORDER BY kind,status`, [EVENT_ID])).rows;
  const star = (await client.query('SELECT master_star FROM seal_battle_clear_rewards_v20260925 WHERE event_id=$1', [EVENT_ID])).rows[0];
  const stored = (await client.query('SELECT value FROM app_meta WHERE key=$1', [OPERATION_KEY])).rows[0];
  return { event, settingsValue: settings?.value, participation, claims, masterStar: star?.master_star ?? '0', receipt: stored ? JSON.parse(stored.value) : null };
}

export async function setSeal55Minimum20(client, { commit = false } = {}) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [OPERATION_KEY]);
    const prior = (await client.query('SELECT value FROM app_meta WHERE key=$1', [OPERATION_KEY])).rows[0];
    if (prior) {
      const receipt = JSON.parse(prior.value);
      assert.equal(receipt.status, 'COMPLETED');
      assert.equal(receipt.eventId, EVENT_ID);
      assert.equal(receipt.eventKey, EVENT_KEY);
      assert.equal(receipt.minimumAttemptsAfter, MINIMUM_ATTEMPTS);
      await client.query('ROLLBACK');
      return { ...receipt, replayed: true };
    }

    const locked = (await client.query('SELECT * FROM seal_battle_events WHERE id=$1 FOR UPDATE', [EVENT_ID])).rows[0];
    assert.equal(locked?.event_key, EVENT_KEY, 'Requested round identity changed');
    assert.equal(locked.status, 'CLEARED', 'Inspect the round status before applying');
    assert.equal(Number(locked.min_reward_attempts), 30, 'Minimum attempts already changed');
    const latest = (await client.query('SELECT MAX(id) id FROM seal_battle_events')).rows[0];
    assert.equal(Number(latest.id), EVENT_ID, 'A newer round exists; inspect before applying');
    const before = await inspectSeal55Minimum(client);
    assert.ok(before.settingsValue, 'Seal settings missing');
    assert.equal(Number(before.participation.participants), 149, 'Participation snapshot changed');
    assert.equal(Number(before.participation.eligible), 19, 'Eligible participation snapshot changed');
    assert.equal(before.claims.length, 0, 'Inspect existing reward claims before applying');

    const changed = await client.query(`UPDATE seal_battle_events SET min_reward_attempts=$1,updated_at=sqlite_now()
      WHERE id=$2 AND event_key=$3 AND status='CLEARED' AND min_reward_attempts=30 RETURNING *`, [MINIMUM_ATTEMPTS, EVENT_ID, EVENT_KEY]);
    assert.equal(changed.rows.length, 1, 'Expected exactly one round update');
    const after = await inspectSeal55Minimum(client);
    assert.equal(Number(after.event.min_reward_attempts), MINIMUM_ATTEMPTS);
    const comparable = event => {
      const { min_reward_attempts, updated_at, ...rest } = event;
      return rest;
    };
    assert.deepEqual(comparable(after.event), comparable(before.event), 'Unrelated event fields changed');
    assert.equal(after.settingsValue, before.settingsValue, 'CMS settings changed');
    assert.equal(after.masterStar, before.masterStar, 'Clear reward changed');
    assert.deepEqual(after.participation, before.participation, 'Participation changed');
    assert.deepEqual(after.claims, before.claims, 'Reward claims changed');

    const owner = (await client.query("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'")).rows[0];
    assert.ok(owner, 'Owner audit identity missing');
    const receipt = {
      status: 'COMPLETED', operationKey: OPERATION_KEY, eventId: EVENT_ID, eventKey: EVENT_KEY,
      minimumAttemptsBefore: 30, minimumAttemptsAfter: MINIMUM_ATTEMPTS,
      eligibleParticipants: Number(after.participation.eligible),
      exactly20Participants: Number(after.participation.exactly_minimum),
      roundStatus: after.event.status, cmsMinimumAttempts: JSON.parse(after.settingsValue).minRewardAttempts,
      directGrants: 0, at: new Date().toISOString()
    };
    const audit = (await client.query(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [owner.id, 'SEAL_REWARD_MINIMUM_UPDATE', 'SEAL_BATTLE', String(EVENT_ID),
      JSON.stringify({ event: before.event, masterStar: before.masterStar }),
      JSON.stringify({ ...receipt, authorization: '봉인전 현재 진행회차 20회넘으면 받게 수정해; 20회 이상부터 수령 (20회 포함)' })])).rows[0];
    assert.ok(audit, 'Audit record missing');
    receipt.adminLogId = String(audit.id);
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())', [OPERATION_KEY, JSON.stringify(receipt)]);
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    return { ...receipt, committed: commit, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

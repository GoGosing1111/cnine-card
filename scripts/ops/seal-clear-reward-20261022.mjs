import assert from 'node:assert/strict';

export const OPERATION_KEY = 'ops:seal-clear-reward:20261022:500b-v1';
export const CLEAR_COIN = 500_000_000_000;

// Explicit OWNER request. Future-round CMS only; never called on deployment.
export async function increaseSealClearReward(client, { commit = false, expectedSettings } = {}) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [OPERATION_KEY]);
    const prior = (await client.query('SELECT value FROM app_meta WHERE key=$1', [OPERATION_KEY])).rows[0];
    if (prior) {
      await client.query('ROLLBACK');
      return { ...JSON.parse(prior.value), replayed: true };
    }
    const stored = (await client.query("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1' FOR UPDATE")).rows[0];
    assert(stored, 'Seal CMS settings missing');
    const before = JSON.parse(stored.value);
    assert(expectedSettings, 'Inspected CMS settings required');
    assert.deepEqual(before, expectedSettings, 'CMS settings changed; inspect before applying');
    assert.equal(before.clearReward?.coin, 100_000_000_000, 'Previous clear reward changed');
    const next = { ...before, clearReward: { ...before.clearReward, coin: CLEAR_COIN } };
    const roundBefore = (await client.query('SELECT * FROM seal_battle_events ORDER BY id DESC LIMIT 1')).rows[0];
    const saved = await client.query("UPDATE app_meta SET value=$1,updated_at=sqlite_now() WHERE key='seal_battle_settings_v1' RETURNING value", [JSON.stringify(next)]);
    assert.equal(saved.rows.length, 1);
    const owner = (await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
    assert(owner, 'Owner audit identity missing');
    const receipt = {
      status: 'COMPLETED', actor: 'CODEX_OPERATIONS', operationKey: OPERATION_KEY,
      scope: 'NEXT_ROUND_ONLY', beforeCoin: before.clearReward.coin, clearReward: next.clearReward,
      otherSettingsPreserved: true, existingRoundsUnchanged: true, roundStarted: false,
      accountGrants: 0, at: new Date().toISOString()
    };
    const audit = (await client.query(
      'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [owner.id, 'SEAL_CLEAR_REWARD_INCREASE', 'SEAL_BATTLE', 'settings', JSON.stringify(before),
        JSON.stringify({ ...receipt, authorization: '공동완료보상 5천억으로 증가' })]
    )).rows[0];
    assert(audit);
    receipt.adminLogId = String(audit.id);
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())', [OPERATION_KEY, JSON.stringify(receipt)]);
    assert.deepEqual((await client.query('SELECT * FROM seal_battle_events ORDER BY id DESC LIMIT 1')).rows[0], roundBefore);
    assert.deepEqual(JSON.parse((await client.query("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'")).rows[0].value), next);
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    return { ...receipt, committed: commit, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

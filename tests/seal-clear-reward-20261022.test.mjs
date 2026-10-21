import test from 'node:test';
import assert from 'node:assert/strict';
import { sealStarFixture } from './helpers/seal-star-fixture.mjs';
import { increaseSealClearReward, OPERATION_KEY, CLEAR_COIN } from '../scripts/ops/seal-clear-reward-20261022.mjs';

test('reward CMS operation rolls back on failure and never overwrites later edits on retry', async () => {
  const f = await sealStarFixture('postgres');
  try {
    await f.client.query("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
    await f.api.saveSettings(f.env, { ...f.settings, clearReward: { coin: 100_000_000_000, shards: 0, masterStar: 1_000_000 } });
    const get = async () => JSON.parse((await f.row("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'")).value);
    const before = await get(), round = await f.row('SELECT * FROM seal_battle_events WHERE id=?', f.event.id);
    assert.equal((await increaseSealClearReward(f.client, { expectedSettings: before })).committed, false);
    assert.deepEqual(await get(), before);
    assert.equal(await f.row('SELECT value FROM app_meta WHERE key=?', OPERATION_KEY), null);
    const failing = { query: (sql, args) => {
      if (sql.startsWith('INSERT INTO admin_logs')) throw Error('AUDIT_FAILURE');
      return f.client.query(sql, args);
    } };
    await assert.rejects(increaseSealClearReward(failing, { commit: true, expectedSettings: before }), /AUDIT_FAILURE/);
    assert.deepEqual(await get(), before);
    await assert.rejects(increaseSealClearReward(f.client, { commit: true, expectedSettings: {} }), /CMS settings changed/);
    const audits = Number((await f.row('SELECT COUNT(*) AS n FROM admin_logs')).n);
    assert.equal((await increaseSealClearReward(f.client, { commit: true, expectedSettings: before })).committed, true);
    assert.deepEqual(await get(), { ...before, clearReward: { ...before.clearReward, coin: CLEAR_COIN } });
    assert.deepEqual(await f.row('SELECT * FROM seal_battle_events WHERE id=?', f.event.id), round);
    await f.api.saveSettings(f.env, { ...before, clearReward: { ...before.clearReward, coin: 600_000_000_000 } });
    assert.equal((await increaseSealClearReward(f.client, { commit: true })).replayed, true);
    assert.equal((await get()).clearReward.coin, 600_000_000_000);
    assert.equal(Number((await f.row('SELECT COUNT(*) AS n FROM admin_logs')).n), audits + 1);
    assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=2')).coin), 1000);
  } finally { await f.close(); }
});

test('new round snapshots 500 billion and grants exactly once with atomic coin and star rewards', async () => {
  const f = await sealStarFixture('postgres');
  try {
    const settings = f.api.cleanSettings({ ...f.settings, format: 'SEALS_BOSS', bossStage: { name: '봉인룡 네르가온', hp: 15_000_000_000, battlePower: 18_000_000 }, clearReward: { coin: CLEAR_COIN, shards: 0, masterStar: 1_000_000 } });
    const event = await f.api.adminStart(f.env, settings, f.owner);
    assert.deepEqual(event.clearReward, settings.clearReward);
    assert.equal(Number((await f.row('SELECT clear_coin FROM seal_battle_events WHERE id=?', f.event.id)).clear_coin), 5_000_000_000);
    await f.run("INSERT INTO seal_battle_user_progress(event_id,user_id,day_key,total_attempts) VALUES(?,2,'2026-10-22',20)", event.id);
    await f.run("UPDATE seal_battle_events SET status='CLEARED' WHERE id=?", event.id);
    await f.run("UPDATE seal_battle_dragon_events_v20261022 SET phase='CLEARED',hp_remaining=0 WHERE event_id=?", event.id);
    const claim = () => f.request('seal-battle/clear-reward', { eventId: event.id }, 'USER');
    f.fail('INSERT INTO inventory_logs');
    assert.equal((await claim()).status, 500);
    f.fail('');
    assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=2')).coin), 1000);
    assert.equal(await f.row("SELECT * FROM cnine_user_inventory WHERE user_id=2 AND item_code='MASTER_STAR'"), null);
    assert.equal((await claim()).status, 200);
    assert.equal((await claim()).status, 409);
    assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=2')).coin), CLEAR_COIN + 1000);
    assert.equal(Number((await f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='MASTER_STAR'")).quantity), 1_000_000);
    assert.equal(Number((await f.row('SELECT COUNT(*) AS n FROM coin_logs')).n), 1);
  } finally { await f.close(); }
});

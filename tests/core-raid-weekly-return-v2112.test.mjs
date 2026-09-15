import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { __postgresCompatTest } from '../functions/_postgres_d1_compat.js';
import { handleRaidCoreProtocol, defaultCoreRaidSettings, cleanCoreRaidSettings,
  coreRaidRewardWeek, coreRaidWeeklyReward } from '../functions/_raid_core_protocol.js';
import {ensureLootShopSchema,LOOT_SHOP_KEY} from '../functions/_loot_shop.js';
import {LOOT_SHOP_DEFAULTS} from '../shared/loot-shop-policy-v1.mjs';

const ROOMS = 'raid_core_rooms_v2024', MEMBERS = 'raid_core_members_v2024';
const RECEIPTS = 'raid_core_reward_receipts_v2024', WEEKLY = 'raid_core_weekly_rewards_v2112';
const baseSchema = `
  CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,coin BIGINT DEFAULT 0,card_shards BIGINT DEFAULT 0);
  CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER DEFAULT 0,PRIMARY KEY(user_id,item_code));
  CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
  CREATE TABLE shard_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
  INSERT INTO users(id,nickname,role) VALUES(1,'대장','OWNER'),(2,'대원','OWNER'),(3,'다른 계정','OWNER');
`;

async function fixture(dialect = 'sqlite',pigRewards=false) {
  let DB, close, failPattern = '', loseCommit = false;
  if (dialect === 'postgres') {
    const pg = new PGlite();
    await pg.exec(`CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;`);
    const compat = fs.readFileSync(new URL('../scripts/postgres-runtime-compat.sql', import.meta.url), 'utf8');
    await pg.exec(compat.match(/CREATE OR REPLACE FUNCTION sqlite_json_extract[\s\S]*?\$\$;/)[0]);
    await pg.exec(baseSchema.replaceAll('DEFAULT CURRENT_TIMESTAMP', 'DEFAULT sqlite_now()'));
    const client = { async query(input) {
      const sql = typeof input === 'string' ? input : input.text;
      if (failPattern && sql.includes(failPattern)) throw new Error('Injected settlement failure');
      const result = await pg.query(sql, typeof input === 'string' ? [] : input.values || []);
      if (loseCommit && sql === 'COMMIT') { loseCommit = false; throw new Error('Lost commit acknowledgement'); }
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    } };
    DB = new __postgresCompatTest.PostgresD1Database(client);
    close = () => pg.close();
  } else {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(baseSchema);
    class Statement {
      constructor(sql, values = []) { this.sql = sql; this.values = values; }
      bind(...values) { return new Statement(this.sql, values); }
      first() { return sqlite.prepare(this.sql).get(...this.values) || null; }
      all() { return { results: sqlite.prepare(this.sql).all(...this.values) }; }
      run() {
        if (failPattern && this.sql.includes(failPattern)) throw new Error('Injected settlement failure');
        const result = sqlite.prepare(this.sql).run(...this.values);
        return { success: true, meta: { changes: Number(result.changes) } };
      }
    }
    DB = { prepare: sql => new Statement(sql), batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map(stmt => stmt.run());
        sqlite.exec('COMMIT');
        if (loseCommit) { loseCommit = false; throw new Error('Lost commit acknowledgement'); }
        return result;
      } catch (error) { try { sqlite.exec('ROLLBACK'); } catch {} throw error; }
    } };
    close = () => sqlite.close();
  }
  const env = { DB };
  const row = (sql, ...values) => DB.prepare(sql).bind(...values).first();
  const run = (sql, ...values) => DB.prepare(sql).bind(...values).run();
  const call = async (path, body = null, userId = 1) => {
    const request = new Request('https://qa.test/api/' + path, { method: body ? 'POST' : 'GET',
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const deps = { authenticate: async () => ({ id: userId, nickname: '검수', role: 'OWNER' }),
      readBody: request => request.json(), json: (body, status = 200) => ({ body, status }),
      profile: async (_env, user) => user, writeAdminLog: async () => {} };
    return handleRaidCoreProtocol({ path: path.split('?')[0], request, env, deps });
  };
  await call('raid/core/feature');
  const configure = async (values = {}) => {
    const result = await call('admin/raid/core/settings', { ...defaultCoreRaidSettings(), mode: 'ON',
      coreCombatPower: 500000, bossCombatPower: 750000, rewardLocked: false, rewardCoin: 100000000, rewardShards: 12, ...values });
    assert.equal(result.status, 200);
  };
  await configure();
  if(pigRewards){await ensureLootShopSchema(env);const policy=structuredClone(LOOT_SHOP_DEFAULTS);policy.rewardsEnabled=true;policy.sources.forEach(s=>s.enabled=true);await run('INSERT INTO app_meta(key,value) VALUES(?,?)',LOOT_SHOP_KEY,JSON.stringify(policy));}
  let sequence = 0;
  const seedRoom = async (status = 'CLEAR', users = [1]) => {
    const id = 'QA-' + ++sequence;
    const created = new Date(Date.now() - 600000 + sequence * 1000).toISOString();
    const ends = new Date(Date.now() + 600000).toISOString();
    await run(`INSERT INTO ${ROOMS}(room_id,room_code,host_user_id,status,party_hp,party_max_hp,core_target,boss_hp,boss_max_hp,lobby_ends_at,ends_at,created_at,failure_reason) VALUES(?,?,?,?,?,1000,100,?,1000,?,?,?,?)`,
      id, id, users[0], status, status === 'FAILED' ? 0 : 1000, status === 'CLEAR' ? 0 : 1000,
      ends, ends, created, status === 'FAILED' ? 'PARTY_WIPE' : '');
    for (const userId of users) await run(`INSERT INTO ${MEMBERS}(room_id,user_id,attempt_count,mechanic_score) VALUES(?,?,2,150)`, id, userId);
    return id;
  };
  const claim = (roomId, requestId = crypto.randomUUID(), userId = 1) => call('raid/core/claim', { roomId, requestId }, userId);
  return { env, DB, row, run, call, configure, seedRoom, claim, close,
    fail: pattern => { failPattern = pattern; }, loseCommit: () => { loseCommit = true; } };
}

test('weekly rewards reset Monday at midnight in Korea, including year boundary', () => {
  assert.equal(cleanCoreRaidSettings({ weeklyRewardLimit: 999 }).weeklyRewardLimit, 3);
  const before = coreRaidRewardWeek(Date.parse('2026-09-13T14:59:59.999Z'));
  const after = coreRaidRewardWeek(Date.parse('2026-09-13T15:00:00Z'));
  assert.equal(before.weekKey, '2026-09-07');
  assert.equal(before.resetsAt, '2026-09-13T15:00:00.000Z');
  assert.equal(after.weekKey, '2026-09-14');
  assert.equal(after.resetsAt, '2026-09-20T15:00:00.000Z');
  assert.equal(coreRaidRewardWeek(Date.parse('2027-01-01T01:00:00Z')).weekKey, '2026-12-28');
});

for (const dialect of ['sqlite', 'postgres']) {
  test(`${dialect}: real core claim atomically grants 30 pig coins, recovers failure and stops at weekly 90`,async()=>{
    const f=await fixture(dialect,true);try{
      const first=await f.seedRoom();f.fail('UPDATE pig_coin_wallets_v1 SET balance=balance+');assert.equal((await f.claim(first)).status,503);
      assert.equal((await f.row('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=1'))?.balance,undefined);f.fail('');
      let paid=await f.claim(first);assert.equal(paid.status,200);assert.equal(paid.body.pigCoins,30);
      assert.equal((await f.claim(first)).body.pigCoins,30);
      for(let n=0;n<2;n++){paid=await f.claim(await f.seedRoom());assert.equal(paid.status,200);assert.equal(paid.body.pigCoins,30);}
      assert.equal((await f.claim(await f.seedRoom())).status,409);assert.equal(Number((await f.row('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=1')).balance),90);
    }finally{await f.close();}
  });
  test(`${dialect}: acknowledged failure stays in the lobby across polls and sessions, only for that member`, async () => {
    const f = await fixture(dialect);
    try {
      await f.seedRoom('FAILED', [1, 2]);
      const roomId = await f.seedRoom('FAILED', [1, 2]);
      assert.equal((await f.call('raid/core/status')).body.current.id, roomId);
      assert.equal((await f.call('raid/core/acknowledge', { roomId }, 3)).status, 409);
      const back = await f.call('raid/core/acknowledge', { roomId });
      assert.equal(back.status, 200);
      assert.equal(back.body.current, null);
      assert.equal(back.body.weeklyReward.remaining, 3);
      for (let i = 0; i < 3; i++) assert.equal((await f.call('raid/core/status')).body.current, null, 'older failures must not resurface');
      assert.equal((await f.call('raid/core/status', null, 2)).body.current.id, roomId);
      assert.equal((await f.row(`SELECT mechanic_score FROM ${MEMBERS} WHERE room_id=? AND user_id=1`, roomId)).mechanic_score, 150);
      assert.equal((await f.claim(roomId)).status, 409);
      const active = await f.seedRoom('LOBBY');
      assert.equal((await f.call('raid/core/acknowledge', { roomId: active })).status, 409);
      assert.equal((await f.call('raid/core/status')).body.current.id, active);
    } finally { await f.close(); }
  });

  test(`${dialect}: three payments per account, no entry cap, replay at cap never pays again`, async () => {
    const f = await fixture(dialect);
    try {
      const ids = [];
      for (let n = 1; n <= 3; n++) {
        ids.push(await f.seedRoom('CLEAR', [1, 2]));
        const paid = await f.claim(ids.at(-1), 'payment-' + n);
        assert.equal(paid.status, 200, JSON.stringify(paid.body));
        assert.equal(paid.body.weeklyReward.used, n);
        assert.equal(paid.body.weeklyReward.remaining, 3 - n);
      }
      const fourth = await f.seedRoom();
      const denied = await f.claim(fourth);
      assert.equal(denied.status, 409);
      assert.equal(denied.body.code, 'CORE_RAID_WEEKLY_LIMIT');
      assert.equal(denied.body.weeklyReward.remaining, 0);
      const replay = await f.claim(ids[0]);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.replayed, true);
      assert.equal(replay.body.weeklyReward.used, 3);
      assert.equal(Number(replay.body.user.coin), 300000000, 'replay returns the current wallet, not the first payment balance');
      assert.equal((await f.claim(ids[0], 'other-account', 2)).status, 200);
      assert.equal((await coreRaidWeeklyReward(f.env, 2)).used, 1);
      assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin), 300000000);
      assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs WHERE user_id=1')).n), 3);
      assert.equal(Number((await f.row('SELECT card_shards FROM users WHERE id=1')).card_shards), 36);
      const lobby = await f.seedRoom('LOBBY', [2]);
      assert.equal((await f.call('raid/core/join', { roomId: lobby })).status, 200, 'reward cap must not prevent joining');
      assert.equal((await f.claim(fourth, 'payment-1')).status, 409, 'request ID cannot migrate to another room');
    } finally { await f.close(); }
  });

  test(`${dialect}: existing paid receipts count; stable week survives later updates; next week starts fresh`, async () => {
    const f = await fixture(dialect);
    try {
      const week = coreRaidRewardWeek(), room = await f.seedRoom();
      await f.run(`INSERT INTO ${RECEIPTS}(room_id,user_id,request_id,status,response_json,updated_at) VALUES(?,1,'legacy','COMPLETED','{}',?)`, room, week.startsAt.replace('T', ' ').slice(0, 19));
      assert.equal((await coreRaidWeeklyReward(f.env, 1)).used, 1);
      const paid = await f.claim(await f.seedRoom());
      assert.equal(paid.status, 200, JSON.stringify(paid.body));
      assert.equal(paid.body.weeklyReward.used, 2);
      const nextWeek = Date.parse(week.resetsAt);
      await f.run(`UPDATE ${RECEIPTS} SET updated_at=? WHERE request_id<>'legacy'`, new Date(nextWeek + 1000).toISOString());
      assert.equal((await coreRaidWeeklyReward(f.env, 1)).used, 2);
      assert.equal((await coreRaidWeeklyReward(f.env, 1, nextWeek)).used, 0);
    } finally { await f.close(); }
  });

  test(`${dialect}: rollback never spends a weekly slot and retry pays once; lost commit reply is recovered`, async () => {
    const f = await fixture(dialect);
    try {
      const room = await f.seedRoom();
      await f.configure({ rewardLocked: true });
      assert.equal((await f.claim(room)).status, 423);
      assert.equal((await coreRaidWeeklyReward(f.env, 1)).used, 0);
      await f.configure();
      for (const pattern of ['INSERT INTO coin_logs', 'INSERT INTO shard_logs', `UPDATE ${RECEIPTS} SET status='COMPLETED'`]) {
        f.fail(pattern);
        assert.equal((await f.claim(room)).status, 503);
        assert.equal((await coreRaidWeeklyReward(f.env, 1)).used, 0);
        assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin), 0);
        assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n), 0);
      }
      f.fail('');
      f.loseCommit();
      const recovered = await f.claim(room);
      assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
      assert.equal(recovered.body.weeklyReward.used, 1);
      assert.equal((await f.claim(room)).status, 200);
      assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin), 100000000);
    } finally { await f.close(); }
  });

  test(`${dialect}: simultaneous claims compete for the last slot; stale pending recovers`, async () => {
    const f = await fixture(dialect);
    try {
      const week = coreRaidRewardWeek();
      await f.run(`INSERT INTO ${WEEKLY}(user_id,week_key,reward_count) VALUES(1,?,2)`, week.weekKey);
      const a = await f.seedRoom(), b = await f.seedRoom();
      await f.run(`INSERT INTO ${RECEIPTS}(room_id,user_id,request_id,status,updated_at) VALUES(?,1,'old-pending','PENDING',?)`, a, new Date(Date.now() - 60000).toISOString());
      const outcomes = await Promise.all([f.claim(a), f.claim(b)]);
      assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409], JSON.stringify(outcomes));
      assert.equal((await coreRaidWeeklyReward(f.env, 1)).used, 3);
      assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin), 100000000);
      assert.equal(Number((await f.row(`SELECT COUNT(*) n FROM ${RECEIPTS} WHERE status='COMPLETED'`)).n), 1);
    } finally { await f.close(); }
  });
}

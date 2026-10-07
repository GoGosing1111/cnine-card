import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { __postgresCompatTest } from '../functions/_postgres_d1_compat.js';
import { readPredictionStakeHonors, PREDICTION_TROPHY_GOAL as GOAL } from '../functions/_prediction_trophy.js';

async function fixture(t, postgres) {
  let DB, pg, sqlite;
  const statements = [];
  if (postgres) {
    pg = new PGlite();
    await pg.exec("SET TIME ZONE 'UTC'; CREATE FUNCTION sqlite_datetime(text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',$1::timestamptz),'YYYY-MM-DD HH24:MI:SS')$$;");
    DB = new __postgresCompatTest.PostgresD1Database({ async query(input) {
      const sql = typeof input === 'string' ? input : input.text;
      statements.push(sql);
      const r = await pg.query(sql, typeof input === 'string' ? [] : input.values || []);
      return { ...r, rowCount: r.affectedRows ?? r.rows.length };
    } });
  } else {
    sqlite = new DatabaseSync(':memory:');
    const prepare = (sql, args = []) => ({ bind(...values) { return prepare(sql, values); },
      async first() { statements.push(sql); return sqlite.prepare(sql).get(...args) || null; },
      async run() { statements.push(sql); return sqlite.prepare(sql).run(...args); }
    });
    DB = { prepare };
  }
  t.after(() => pg ? pg.close() : sqlite.close());
  // Runtime PostgreSQL compatibility deliberately ignores schema mutations.
  // Fixtures create/drop their own temporary tables directly in the test DB.
  const run = (sql, ...args) => /^\s*(CREATE|DROP)\b/.test(sql)
    ? pg ? pg.exec(sql) : sqlite.exec(sql)
    : DB.prepare(sql).bind(...args).run();
  await run('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT)');
  const env = { DB };
  assert.deepEqual(await readPredictionStakeHonors(env, 7), { count: 0, acquiredAt: null, progress: 0, goal: GOAL });
  await run('CREATE TABLE coin_prediction_events(id BIGINT PRIMARY KEY,status TEXT,settled_at TEXT)');
  await run('CREATE TABLE coin_prediction_bets(event_id BIGINT,user_id BIGINT,amount BIGINT,payout BIGINT,status TEXT,PRIMARY KEY(event_id,user_id))');
  await run("INSERT INTO app_meta VALUES('coin_prediction_settings_v1','{}')");
  const bet = async (id, amount, { event = 'SETTLED', status = 'SETTLED', payout = 0, date = '2026-10-08 00:00:00', user = 7 } = {}) => {
    await run('INSERT INTO coin_prediction_events VALUES(?,?,?)', id, event, date);
    await run('INSERT INTO coin_prediction_bets VALUES(?,?,?,?,?)', id, user, amount, payout, status);
  };
  return { run, bet, env, statements };
}

for (const postgres of [false, true]) {
  test(`${postgres ? 'PostgreSQL' : 'SQLite'}: exact 300-trillion settled stake threshold, retrospective first date and read-only repeatability`, async t => {
    const f = await fixture(t, postgres);
    // Losing picks count; payout size, other users and unsettled/invalid events do not.
    await f.bet(1, GOAL - 1, { payout: 900000000000000, date: '2026-08-01 00:00:00' });
    await f.bet(2, GOAL, { event: 'OPEN', status: 'ACTIVE' });
    await f.bet(3, GOAL, { event: 'VOID', status: 'REFUNDED' });
    await f.bet(4, GOAL, { event: 'CLOSED', status: 'SETTLED' });
    await f.bet(5, GOAL, { status: 'ACTIVE' });
    await f.bet(6, GOAL, { status: 'REFUNDED' });
    await f.bet(7, GOAL, { user: 8 });
    await f.bet(8, GOAL, { date: null });
    assert.deepEqual(await readPredictionStakeHonors(f.env, 7), { count: 0, acquiredAt: null, progress: GOAL - 1, goal: GOAL });
    await f.bet(9, 1, { date: '2026-09-01T03:00:00Z' });
    const expected = { count: 1, acquiredAt: '2026-09-01 03:00:00', progress: GOAL, goal: GOAL };
    assert.deepEqual(await readPredictionStakeHonors(f.env, 7), expected);
    await f.bet(10, 1, { date: '2026-10-08 01:00:00' });
    await f.bet(11, Number.MAX_SAFE_INTEGER, { date: '2026-10-08 02:00:00' });
    const before = f.statements.length;
    for (let i = 0; i < 3; i++) assert.deepEqual(await readPredictionStakeHonors(f.env, 7), expected);
    assert.ok(f.statements.slice(before).every(sql => /^\s*(SELECT|WITH)\b/i.test(sql)));
    assert.equal((await readPredictionStakeHonors(f.env, 8)).count, 1);
    assert.equal((await readPredictionStakeHonors(f.env, 99)).count, 0);
  });

  test(`${postgres ? 'PostgreSQL' : 'SQLite'}: incremental bets are summed once after final settlement; initialized history failures propagate`, async t => {
    const f = await fixture(t, postgres);
    await f.bet(1, GOAL - 10, { event: 'OPEN', status: 'ACTIVE' });
    await f.run('UPDATE coin_prediction_bets SET amount=amount+10 WHERE event_id=1');
    assert.equal((await readPredictionStakeHonors(f.env, 7)).count, 0);
    await f.run("UPDATE coin_prediction_bets SET status='SETTLED' WHERE event_id=1");
    assert.equal((await readPredictionStakeHonors(f.env, 7)).count, 0, 'partial settlement is not final');
    await f.run("UPDATE coin_prediction_events SET status='SETTLED' WHERE id=1");
    assert.equal((await readPredictionStakeHonors(f.env, 7)).count, 1);
    await f.run('DROP TABLE coin_prediction_bets');
    await assert.rejects(() => readPredictionStakeHonors(f.env, 7), /coin_prediction_bets/);
  });
}

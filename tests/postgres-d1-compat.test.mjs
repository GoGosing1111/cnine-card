import assert from 'node:assert/strict';
import test from 'node:test';

import { createPostgresD1Compat, __postgresCompatTest } from '../functions/_postgres_d1_compat.js';
import { onRequest } from '../functions/api/[[path]].js';

test('placeholder binding ignores SQL string literals', () => {
  const value = __postgresCompatTest.bindQuestionMarks("SELECT '?' literal, ? value, 'a''?b' escaped");
  assert.equal(value.count, 1);
  assert.match(value.text, /\$1 value/);
  assert.match(value.text, /'\?' literal/);
});

test('SQLite runtime functions and scalar min/max are translated', () => {
  const sql = __postgresCompatTest.translateDialect(
    "SELECT datetime('now','-1 day') stamp,MAX(0,MIN(60,value)) clamped,CURRENT_TIMESTAMP current"
  );
  assert.match(sql, /sqlite_datetime\(/i);
  assert.match(sql, /GREATEST\(0,LEAST\(60,value\)\)/i);
  assert.match(sql, /sqlite_now\(\)/i);
});

test('NOCASE comparisons are translated to ILIKE', () => {
  const sql = __postgresCompatTest.translateNoCase('SELECT 1 WHERE nickname=? COLLATE NOCASE');
  assert.match(sql, /nickname\s+ILIKE\s+\?/i);
  assert.doesNotMatch(sql, /NOCASE/i);
});

test('migration freeze blocks mutable API routes before database access', async () => {
  const response = await onRequest({
    request: new Request('https://cnine-card.test/api/auth/login', { method: 'POST' }),
    env: { DB_MIGRATION_FREEZE: '1' },
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'DATABASE_MIGRATION_MAINTENANCE');
});

test('live PostgreSQL compatibility adapter smoke test', { skip: !process.env.CNINE_NEON_DATABASE_URL }, async () => {
  const runtime = await createPostgresD1Compat(process.env.CNINE_NEON_DATABASE_URL);
  const db = runtime.db;
  try {
    const users = await db.prepare("SELECT COUNT(*) count FROM users WHERE created_at<=datetime('now','+1 day')").first();
    assert.ok(Number(users.count) >= 2890);

    const aliases = await db.prepare('SELECT battle_power AS battlePower,image_url imageUrl FROM battle_monsters ORDER BY id LIMIT 1').first();
    assert.ok(Object.hasOwn(aliases, 'battlePower'));
    assert.ok(Object.hasOwn(aliases, 'imageUrl'));

    const columns = await db.prepare('PRAGMA table_info(users)').all();
    assert.ok(columns.results.some(row => row.name === 'id' && row.pk === 1));

    const table = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind('users').first();
    assert.equal(table.name, 'users');

    const jsonRows = await db.prepare('SELECT value FROM json_each(?)').bind('["a","b"]').all();
    assert.deepEqual(jsonRows.results.map(row => row.value), ['a', 'b']);

    const updatePrivilege = await db.prepare("UPDATE app_meta SET value=value WHERE key='maintenance_mode'").run();
    assert.equal(updatePrivilege.meta.changes, 1);

    await db.prepare('CREATE TEMP TABLE __d1_compat_probe(id integer primary key,value text unique)').run();
    const inserted = await db.prepare('INSERT OR IGNORE INTO __d1_compat_probe(id,value) VALUES(?,?)').bind(1, 'first').run();
    assert.equal(inserted.meta.changes, 1);
    const ignored = await db.prepare('INSERT OR IGNORE INTO __d1_compat_probe(id,value) VALUES(?,?)').bind(1, 'ignored').run();
    assert.equal(ignored.meta.changes, 0);
    const replaced = await db.prepare('INSERT OR REPLACE INTO __d1_compat_probe(id,value) VALUES(?,?)').bind(1, 'second').run();
    assert.equal(replaced.meta.changes, 1);
    assert.equal((await db.prepare('SELECT value FROM __d1_compat_probe WHERE id=?').bind(1).first()).value, 'second');
  } finally {
    await runtime.close();
  }
});

test('real Pages service routes respond through PostgreSQL', { skip: !process.env.CNINE_NEON_DATABASE_URL }, async () => {
  const call = async path => {
    const background = [];
    const response = await onRequest({
      request: new Request(`https://cnine-card.test/api/${path}`),
      env: {
        DB_BACKEND: 'postgres',
        HYPERDRIVE: { connectionString: process.env.CNINE_NEON_DATABASE_URL },
      },
      waitUntil(promise) { background.push(Promise.resolve(promise)); },
    });
    await Promise.allSettled(background);
    return { response, body: await response.json() };
  };

  const status = await call('service/status');
  assert.equal(status.response.status, 200);
  assert.equal(status.body.maintenance.active, true);

  const health = await call('health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.initialized, true);
});

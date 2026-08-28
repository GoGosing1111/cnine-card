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

test('native PostgreSQL NOW remains a timestamp expression', () => {
  const sql = __postgresCompatTest.translateDialect(
    'UPDATE monster_siege_ai_state SET updated_at=NOW() WHERE event_id=?',
  );
  assert.match(sql, /updated_at=NOW\(\)/i);
  assert.doesNotMatch(sql, /sqlite_now\(\)/i);
});

test('NOCASE comparisons are translated to ILIKE', () => {
  const sql = __postgresCompatTest.translateNoCase('SELECT 1 WHERE nickname=? COLLATE NOCASE');
  assert.match(sql, /nickname\s+ILIKE\s+\?/i);
  assert.doesNotMatch(sql, /NOCASE/i);
});

test('V1811 SQLite-only SQL is translated before PostgreSQL execution', () => {
  assert.equal(
    __postgresCompatTest.INSERT_SQL.test('WITH source AS (SELECT 1) INSERT OR IGNORE INTO target(id) SELECT * FROM source'),
    true,
  );
  const sql = __postgresCompatTest.translateDialect(
    "SELECT json_object('ok',true,'stamp',CAST(? AS INTEGER)) FROM draw_logs NOT INDEXED",
  );
  assert.match(sql, /json_build_object\(/i);
  assert.match(sql, /CAST\(\? AS BIGINT\)/i);
  assert.doesNotMatch(sql, /NOT\s+INDEXED/i);
});

test('json builder parameters receive stable PostgreSQL types', () => {
  const bound = __postgresCompatTest.bindQuestionMarks(
    "SELECT json_object('label',?,'count',?,'enabled',?,'empty',?,'nested',(SELECT ?::text))",
  );
  const translated = __postgresCompatTest.translateDialect(bound.text);
  const sql = __postgresCompatTest.typeJsonBuilderParams(translated, ['box', 3, true, null, 'nested']);
  assert.match(sql, /\$1::text/);
  assert.match(sql, /\$2::bigint/);
  assert.match(sql, /\$3::boolean/);
  assert.match(sql, /\$4::text/);
  assert.match(sql, /SELECT \$5::text/);
  assert.doesNotMatch(sql, /\$5::text::text/);
});

test('nested SQLite BLOB casts are translated without touching literals', () => {
  const sql = __postgresCompatTest.translateDialect(
    "SELECT LENGTH(CAST(COALESCE(payload,'a) AS BLOB') AS BLOB)),CAST(CAST(? AS TEXT) AS BLOB)",
  );
  assert.equal((sql.match(/convert_to\(/g) || []).length, 2);
  assert.match(sql, /'a\) AS BLOB'/);
  assert.equal(__postgresCompatTest.translateBlobCasts(sql), sql);
  assert.match(sql, /convert_to\(\(COALESCE\(payload,'a\) AS BLOB'\)\)::text,'UTF8'\)/i);
  assert.match(sql, /convert_to\(\(CAST\(\? AS TEXT\)\)::text,'UTF8'\)/i);
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

    const ignored = await db.prepare("INSERT OR IGNORE INTO app_meta(key,value) VALUES('maintenance_mode','test-must-not-overwrite')").run();
    assert.equal(ignored.meta.changes, 0);

    const cteInsert = await db.prepare(`WITH source(key,value) AS (SELECT ?::text,?::text WHERE FALSE)
      INSERT OR IGNORE INTO app_meta(key,value) SELECT key,value FROM source`).bind('__compat_no_write__', 'cte').run();
    assert.equal(cteInsert.meta.changes, 0);

    const json = await db.prepare("SELECT json_object('label',?,'count',?,'empty',?) payload")
      .bind('box', 3, null).first();
    assert.deepEqual(json.payload, { label: 'box', count: 3, empty: null });

    const blobSample = '{"x":"가\\\\나"}';
    const blob = await db.prepare('SELECT LENGTH(CAST(? AS BLOB)) bytes').bind(blobSample).first();
    assert.equal(Number(blob.bytes), Buffer.byteLength(blobSample));
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
  assert.equal(typeof status.body.maintenance.active, 'boolean');

  const health = await call('health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.initialized, true);
});

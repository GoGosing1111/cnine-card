import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

import { createPostgresD1Compat, __postgresCompatTest } from '../functions/_postgres_d1_compat.js';

// PIPE-0920: batch 를 한 메시지로 보내는 경로의 계약.
//   · 단위 테스트(항상 실행): 리터럴 치환 규칙
//   · 실제 PostgreSQL 테스트: CNINE_TEST_PG_URL 이 있을 때 실행
//     예) CNINE_TEST_PG_URL=postgres://postgres@localhost:55432/postgres npm run test:postgres-pipeline

const { inlineParameters, PIPELINE_TRANSACTION_HEAD } = __postgresCompatTest;
const escape = value => pg.Client.prototype.escapeLiteral.call(null, value);

test('parameters become unknown-typed quoted literals, never bare numbers', () => {
  const text = inlineParameters('SELECT $1,$2,$3,$4,$5 FROM t WHERE a=$10', [5, -2, true, null, 'x', 6, 7, 8, 9, 'ten'], escape);
  assert.equal(text, "SELECT '5','-2','true',NULL,'x' FROM t WHERE a='ten'");
});

test('quotes, backslashes and placeholder-like text inside literals are preserved', () => {
  const text = inlineParameters("SELECT '$1' fixed, $1 v, \"$2\" ident -- $1 comment\n, $2 w", ["it's \\ $2", 'b'], escape);
  assert.match(text, /'\$1' fixed/);
  assert.match(text, /"\$2" ident/);
  assert.match(text, /-- \$1 comment/);
  assert.match(text, / E'it''s \\\\ \$2' v/);
  assert.match(text, /, 'b' w$/);
});

test('values that are not plain scalars fall back to the per-statement path', () => {
  assert.equal(inlineParameters('SELECT $1', [new Uint8Array([1])], escape), null);
  assert.equal(inlineParameters('SELECT $1', [{ a: 1 }], escape), null);
  assert.equal(inlineParameters('SELECT $1', [Number.NaN], escape), null);
  assert.equal(inlineParameters('SELECT $2', [1], escape), null);
});

test('write batches carry the session limits Hyperdrive would otherwise drop', () => {
  assert.equal(PIPELINE_TRANSACTION_HEAD[0], 'BEGIN');
  assert.ok(PIPELINE_TRANSACTION_HEAD.includes("SET LOCAL lock_timeout='4s'"));
  assert.ok(PIPELINE_TRANSACTION_HEAD.includes("SET LOCAL statement_timeout='20s'"));
});

const url = process.env.CNINE_TEST_PG_URL;

test('real PostgreSQL: pipelined batch equals sequential batch, in one round trip', { skip: !url }, async () => {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  try {
    await admin.query(`DROP TABLE IF EXISTS pipe_wallet, pipe_log;
      CREATE TABLE pipe_wallet(id BIGINT PRIMARY KEY, coin BIGINT NOT NULL, memo TEXT);
      CREATE TABLE pipe_log(id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, amount BIGINT NOT NULL, note TEXT NOT NULL);
      INSERT INTO pipe_wallet VALUES (1,100,NULL),(2,100,NULL);`);
    const run = async pipelined => {
      await admin.query('UPDATE pipe_wallet SET coin=100,memo=NULL; TRUNCATE pipe_log RESTART IDENTITY');
      const { db, close } = await createPostgresD1Compat(url);
      if (!pipelined) db.client.escapeLiteral = undefined;
      const sent = [];
      const original = db.client.query.bind(db.client);
      db.client.query = (...args) => { sent.push(typeof args[0] === 'string' ? args[0] : args[0].text); return original(...args); };
      try {
        const results = await db.batch([
          db.prepare('UPDATE pipe_wallet SET coin=coin-?,memo=? WHERE id=? AND coin>=?').bind(30, "o'k \\ 한글", 1, 30),
          db.prepare('INSERT INTO pipe_log(user_id,amount,note) VALUES(?,?,?)').bind(1, -30, 'draw'),
          db.prepare('SELECT coin, memo AS memo_text, ? > ? AS text_compare, -? AS neg FROM pipe_wallet WHERE id=?').bind('10', '9', 7, 1),
          db.prepare("SELECT json_object('n',?,'s',?) AS payload").bind(3, 'x'),
        ]);
        return { results: results.map(r => ({ rows: r.results, changes: r.meta.changes })), sent };
      } finally { await close(); }
    };
    const sequential = await run(false);
    const pipelined = await run(true);
    assert.deepEqual(pipelined.results, sequential.results);
    assert.equal(pipelined.results[2].rows[0].coin, 70);
    assert.equal(pipelined.results[2].rows[0].memo_text, "o'k \\ 한글");
    assert.equal(pipelined.results[2].rows[0].text_compare, false); // '10' > '9' 은 텍스트 비교 — 기존과 동일
    // 한 메시지만 나간다(카탈로그 조회가 캐시돼 있지 않다면 그 조회는 별도).
    const batchMessages = pipelined.sent.filter(text => /UPDATE pipe_wallet/.test(text));
    assert.equal(batchMessages.length, 1);
    assert.match(batchMessages[0], /^BEGIN\n;\nSET LOCAL statement_timeout/);
    assert.equal(sequential.sent.filter(text => /pipe_/.test(text)).length, 3);
    assert.ok(sequential.sent.includes('BEGIN') && sequential.sent.includes('COMMIT'));
  } finally {
    await admin.query('DROP TABLE IF EXISTS pipe_wallet, pipe_log');
    await admin.end();
  }
});

test('real PostgreSQL: a failing statement rolls back the whole pipelined batch', { skip: !url }, async () => {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  try {
    await admin.query(`DROP TABLE IF EXISTS pipe_wallet; CREATE TABLE pipe_wallet(id BIGINT PRIMARY KEY, coin BIGINT NOT NULL); INSERT INTO pipe_wallet VALUES (1,100);`);
    const { db, close } = await createPostgresD1Compat(url);
    try {
      await assert.rejects(db.batch([
        db.prepare('UPDATE pipe_wallet SET coin=coin-? WHERE id=?').bind(40, 1),
        db.prepare('UPDATE pipe_wallet SET coin=NULL WHERE id=?').bind(1),
        db.prepare('UPDATE pipe_wallet SET coin=coin-? WHERE id=?').bind(5, 1),
      ]), /null value/);
      // 같은 연결이 계속 쓸 수 있어야 한다(ROLLBACK 이 보내졌다).
      const after = await db.prepare('SELECT coin FROM pipe_wallet WHERE id=?').bind(1).first();
      assert.equal(after.coin, 100);
    } finally { await close(); }
  } finally {
    await admin.query('DROP TABLE IF EXISTS pipe_wallet');
    await admin.end();
  }
});

test('real PostgreSQL: a pipelined write batch holds row locks only for server time', { skip: !url }, async () => {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  try {
    await admin.query(`DROP TABLE IF EXISTS pipe_round; CREATE TABLE pipe_round(id BIGINT PRIMARY KEY, total BIGINT NOT NULL); INSERT INTO pipe_round VALUES (1,0);`);
    // 가짜 네트워크 지연: 클라이언트가 메시지를 보낼 때마다 60ms 를 기다린다.
    const withLatency = async pipelined => {
      const { db, close } = await createPostgresD1Compat(url);
      if (!pipelined) db.client.escapeLiteral = undefined;
      const original = db.client.query.bind(db.client);
      db.client.query = async (...args) => { await new Promise(r => setTimeout(r, 60)); return original(...args); };
      return { db, close };
    };
    const attack = db => db.batch([
      db.prepare('UPDATE pipe_round SET total=total+? WHERE id=?').bind(1, 1),
      ...Array.from({ length: 10 }, (_, i) => db.prepare('SELECT ? AS step').bind(i)),
      db.prepare('UPDATE pipe_round SET total=total+0 WHERE id=?').bind(1),
    ]);
    const measure = async pipelined => {
      const conns = await Promise.all(Array.from({ length: 5 }, () => withLatency(pipelined)));
      const started = Date.now();
      await Promise.all(conns.map(c => attack(c.db)));
      const elapsed = Date.now() - started;
      await Promise.all(conns.map(c => c.close()));
      return elapsed;
    };
    const sequentialMs = await measure(false);
    const pipelinedMs = await measure(true);
    const total = (await admin.query('SELECT total FROM pipe_round WHERE id=1')).rows[0].total;
    assert.equal(Number(total), 10);
    console.log(`# lock hold: sequential ${sequentialMs}ms, pipelined ${pipelinedMs}ms`);
    // 순차: 5개 batch 가 같은 행 잠금 때문에 줄을 서서 각자 13왕복씩 → 수 초.
    // 파이프라인: 1왕복 + 서버 실행 → 수백 ms.
    assert.ok(pipelinedMs * 4 < sequentialMs, `pipelined ${pipelinedMs}ms vs sequential ${sequentialMs}ms`);
  } finally {
    await admin.query('DROP TABLE IF EXISTS pipe_round');
    await admin.end();
  }
});

test('real PostgreSQL: parallel reads share one message, errors stay per caller, FIFO is kept', { skip: !url }, async () => {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  try {
    await admin.query(`DROP TABLE IF EXISTS pipe_read; CREATE TABLE pipe_read(id BIGINT PRIMARY KEY, v TEXT); INSERT INTO pipe_read VALUES (1,'a'),(2,'b');`);
    const { db, close } = await createPostgresD1Compat(url);
    const sent = [];
    const original = db.client.query.bind(db.client);
    db.client.query = (...args) => { sent.push(typeof args[0] === 'string' ? args[0] : args[0].text); return original(...args); };
    try {
      const [a, b, all] = await Promise.all([
        db.prepare('SELECT v FROM pipe_read WHERE id=?').bind(1).first('v'),
        db.prepare('SELECT v AS "someValue" FROM pipe_read WHERE id=?').bind(2).first(),
        db.prepare('SELECT id FROM pipe_read ORDER BY id').all(),
      ]);
      assert.equal(a, 'a');
      assert.equal(b.someValue, 'b');
      assert.deepEqual(all.results.map(row => row.id), [1, 2]);
      assert.equal(sent.length, 1);

      sent.length = 0;
      const settled = await Promise.allSettled([
        db.prepare('SELECT v FROM pipe_read WHERE id=?').bind(1).first('v'),
        db.prepare('SELECT missing_column FROM pipe_read').all(),
        db.prepare('SELECT v FROM pipe_read WHERE id=?').bind(2).first('v'),
      ]);
      assert.equal(settled[0].value, 'a');
      assert.equal(settled[1].status, 'rejected');
      assert.equal(settled[2].value, 'b');

      // 쓰기 뒤에 같은 틱에 들어온 읽기는 쓰기 결과를 봐야 한다.
      const [, , seen] = await Promise.all([
        db.prepare('SELECT v FROM pipe_read WHERE id=?').bind(1).first('v'),
        db.prepare('UPDATE pipe_read SET v=? WHERE id=?').bind('changed', 1).run(),
        db.prepare('SELECT v FROM pipe_read WHERE id=?').bind(1).first('v'),
      ]);
      assert.equal(seen, 'changed');
    } finally { await close(); }
  } finally {
    await admin.query('DROP TABLE IF EXISTS pipe_read');
    await admin.end();
  }
});

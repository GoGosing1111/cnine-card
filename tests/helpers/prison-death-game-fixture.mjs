import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { __postgresCompatTest } from '../../functions/_postgres_d1_compat.js';
import { ensureDeathGameSchema } from '../../functions/_prison_death_game.js';

export async function deathGameFixture(postgres = false) {
  let sql, DB, failure = '', loseCommit = false, queue = Promise.resolve();
  const schema = [
    'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,coin INTEGER DEFAULT 123456)',
    "CREATE TABLE user_prison_status(user_id INTEGER PRIMARY KEY,active INTEGER DEFAULT 0,reason TEXT DEFAULT '',jailed_by INTEGER,jailed_at TEXT,jailed_until TEXT,released_at TEXT,release_reason TEXT DEFAULT '',updated_at TEXT DEFAULT CURRENT_TIMESTAMP)"
  ];
  if (postgres) {
    sql = new PGlite();
    await sql.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
    await sql.exec(schema.map(s => s.replaceAll('INTEGER', 'BIGINT').replaceAll('CURRENT_TIMESTAMP', 'sqlite_now()')).join(';'));
    DB = new __postgresCompatTest.PostgresD1Database({ async query(input) {
      const source = typeof input === 'string' ? input : input.text;
      if (failure && source.includes(failure)) throw new Error('INJECTED_FAILURE');
      const result = await sql.query(source, typeof input === 'string' ? [] : input.values || []);
      if (loseCommit && source === 'COMMIT') { loseCommit = false; throw new Error('LOST_COMMIT_RESPONSE'); }
      return { ...result, rowCount:result.affectedRows ?? result.rows.length };
    }});
  } else {
    sql = new DatabaseSync(':memory:'); sql.exec(schema.join(';'));
    DB = { prepare(source) { return { source, values:[], bind(...values) { this.values = values; return this; },
      async first() { return sql.prepare(source).get(...this.values) || null; },
      async all() { return { results:sql.prepare(source).all(...this.values) }; },
      async run() { if (failure && source.includes(failure)) throw new Error('INJECTED_FAILURE'); const result = sql.prepare(source).run(...this.values); return { meta:{ changes:Number(result.changes) } }; }
    }; }, batch(statements) { const job = queue.then(async () => {
      sql.exec('BEGIN'); let committed = false;
      try { const results = []; for (const s of statements) results.push(await s.run()); sql.exec('COMMIT'); committed = true;
        if (loseCommit) { loseCommit = false; throw new Error('LOST_COMMIT_RESPONSE'); } return results;
      } catch (error) { if (!committed) sql.exec('ROLLBACK'); throw error; }
    }); queue = job.catch(() => {}); return job; } };
  }
  const env = { DB }, p = (source, ...values) => DB.prepare(source).bind(...values);
  // Simulate a live DB whose old global foundation is already complete.
  await p("INSERT INTO app_meta(key,value) VALUES('safe_runtime_upgrade_v2121_foundation','1')").run();
  await ensureDeathGameSchema(env);
  for (const [id, nickname, role] of [[101,'참가자 하나','USER'],[102,'참가자 둘','USER'],[103,'<img src=x onerror=alert(1)>','USER'],[999,'운영자','OWNER']]) await p('INSERT INTO users(id,nickname,role) VALUES(?,?,?)', id, nickname, role).run();
  return { env, p, now:Date.now(), close:() => sql.close(), fail(value) { failure = value; }, loseCommit() { loseCommit = true; } };
}

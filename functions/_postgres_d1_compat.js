import { Client, types } from 'pg';

// D1 returns INTEGER values as JavaScript numbers. Match that behavior for the
// PostgreSQL bigint/numeric types used by the converted schema.
types.setTypeParser(20, value => Number(value));
types.setTypeParser(1700, value => Number(value));

const SCHEMA_SQL = /^(?:CREATE\s+(?:TABLE|INDEX|UNIQUE\s+INDEX|TRIGGER|VIEW)|DROP\s+(?:TRIGGER|VIEW|INDEX|TABLE)|ALTER\s+TABLE|PRAGMA\s+(?:foreign_keys|journal_mode|synchronous|optimize)|VACUUM\b|REINDEX\b)/i;
const INSERT_SQL = /^INSERT\b/i;

function emptyResult() {
  return {
    success: true,
    results: [],
    meta: { changes: 0, last_row_id: 0, duration: 0, rows_read: 0, rows_written: 0 },
  };
}

function stripIdentifier(value) {
  const text = String(value || '').trim();
  if (text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1).replace(/""/g, '"');
  return text;
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function stripTrailingSemicolon(value) {
  return String(value || '').trim().replace(/;\s*$/, '');
}

function rewriteOutsideLiterals(source, rewrite) {
  let output = '';
  let code = '';
  const flush = () => {
    if (code) output += rewrite(code);
    code = '';
  };
  for (let i = 0; i < source.length;) {
    const ch = source[i];
    if (ch === "'" || ch === '"') {
      flush();
      const quote = ch;
      let literal = ch;
      i += 1;
      while (i < source.length) {
        literal += source[i];
        if (source[i] === quote) {
          if (source[i + 1] === quote) {
            literal += source[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      output += literal;
      continue;
    }
    if (ch === '-' && source[i + 1] === '-') {
      flush();
      const end = source.indexOf('\n', i + 2);
      if (end < 0) return output + source.slice(i);
      output += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      flush();
      const end = source.indexOf('*/', i + 2);
      if (end < 0) return output + source.slice(i);
      output += source.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    code += ch;
    i += 1;
  }
  flush();
  return output;
}

function bindQuestionMarks(source) {
  let ordinal = 0;
  const text = rewriteOutsideLiterals(source, code => code.replace(/\?/g, () => `$${++ordinal}`));
  return { text, count: ordinal };
}

function translateScalarMinMax(source) {
  const replacements = [];
  const frames = [];
  let depth = 0;
  let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) {
        if (source[i + 1] === quote) i += 1;
        else quote = '';
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    const match = source.slice(i).match(/^(MIN|MAX)\s*\(/i);
    if (match && (i === 0 || !/[A-Za-z0-9_]/.test(source[i - 1]))) {
      const openOffset = match[0].lastIndexOf('(');
      frames.push({ start: i, name: match[1].toUpperCase(), openDepth: depth, comma: false });
      depth += 1;
      i += openOffset;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ',') {
      const frame = frames.at(-1);
      if (frame && depth === frame.openDepth + 1) frame.comma = true;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
      const frame = frames.at(-1);
      if (frame && depth === frame.openDepth) {
        frames.pop();
        if (frame.comma) replacements.push(frame);
      }
    }
  }
  let output = source;
  for (const item of replacements.sort((a, b) => b.start - a.start)) {
    const replacement = item.name === 'MIN' ? 'LEAST' : 'GREATEST';
    output = output.slice(0, item.start) + replacement + output.slice(item.start + item.name.length);
  }
  return output;
}

function translateNoCase(source) {
  let sql = source;
  sql = sql.replace(
    /\bLIKE\s+(\?|\$\d+|'(?:''|[^'])*')(\s+ESCAPE\s+'(?:''|[^'])*')?\s+COLLATE\s+NOCASE/gi,
    (_, value, escape) => `ILIKE ${value}${escape || ''}`,
  );
  sql = sql.replace(
    /=\s*(\?|\$\d+|'(?:''|[^'])*')\s+COLLATE\s+NOCASE/gi,
    (_, value) => ` ILIKE ${value}`,
  );
  return sql.replace(/\s+COLLATE\s+NOCASE/gi, '');
}

function translateSqliteMaster(source) {
  if (!/\bFROM\s+sqlite_master\b/i.test(source)) return source;
  const catalog = `(SELECT 'table'::text AS type, tablename AS name FROM pg_catalog.pg_tables WHERE schemaname='public'
    UNION ALL SELECT 'index'::text AS type, indexname AS name FROM pg_catalog.pg_indexes WHERE schemaname='public'
    UNION ALL SELECT 'view'::text AS type, viewname AS name FROM pg_catalog.pg_views WHERE schemaname='public') AS sqlite_master`;
  return source.replace(/\bFROM\s+sqlite_master\b/i, `FROM ${catalog}`);
}

function translateDialect(source) {
  let sql = stripTrailingSemicolon(source);
  sql = translateNoCase(sql);
  sql = rewriteOutsideLiterals(sql, code => code
    .replace(/\bCURRENT_TIMESTAMP\b/gi, 'sqlite_now()')
    .replace(/\bdatetime\s*\(/gi, 'sqlite_datetime(')
    .replace(/\bjulianday\s*\(/gi, 'sqlite_julianday(')
    .replace(/\bjson_each\s*\(/gi, 'sqlite_json_each(')
    .replace(/\bjson_valid\s*\(/gi, 'sqlite_json_valid(')
    .replace(/\bjson_array_length\s*\(/gi, 'sqlite_json_array_length(')
    .replace(/\bjson_extract\s*\(/gi, 'sqlite_json_extract(')
    .replace(/\bjson_group_array\s*\(([^()]*)\)/gi, '(jsonb_agg($1)::text)')
    .replace(/\bdate\s*\(/gi, 'sqlite_date(')
    .replace(/\btime\s*\(/gi, 'sqlite_time(')
    .replace(/\binstr\s*\(/gi, 'strpos(')
    .replace(/\bchar\s*\(/gi, 'chr(')
    .replace(/\bINDEXED\s+BY\s+[A-Za-z_][A-Za-z0-9_]*/gi, '')
    .replace(/\browid\b/gi, 'ctid')
    .replace(/==/g, '='));
  sql = translateSqliteMaster(sql);
  return translateScalarMinMax(sql);
}

function camelAliases(source) {
  const aliases = new Map();
  const codeOnly = rewriteOutsideLiterals(source, code => code);
  for (const match of codeOnly.matchAll(/\b(?=[A-Za-z0-9_]*[a-z])(?=[A-Za-z0-9_]*[A-Z])[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    aliases.set(match[0].toLowerCase(), match[0]);
  }
  return aliases;
}

function restoreAliases(rows, aliases) {
  if (!aliases.size) return rows;
  return rows.map(row => {
    const output = {};
    for (const [key, value] of Object.entries(row)) output[aliases.get(key) || key] = value;
    return output;
  });
}

function pragmaTableName(source) {
  const match = String(source).trim().match(/^PRAGMA\s+table_info\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*;?$/i);
  return match ? match[1] : '';
}

class PostgresD1Statement {
  constructor(database, source, values = []) {
    this.database = database;
    this.source = String(source || '');
    this.values = values;
  }

  bind(...values) {
    return new PostgresD1Statement(this.database, this.source, values);
  }

  async first(column) {
    const result = await this.database.execute(this);
    const row = result.results[0] ?? null;
    return column && row ? row[column] : row;
  }

  async all() {
    return this.database.execute(this);
  }

  async run() {
    return this.database.execute(this);
  }

  async raw(options = {}) {
    const result = await this.database.execute(this);
    const rows = result.results || [];
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const values = rows.map(row => columns.map(column => row[column]));
    return options?.columnNames ? [columns, ...values] : values;
  }
}

class PostgresD1Database {
  constructor(client) {
    this.client = client;
    this.dialect = 'postgres';
    this.uniqueTargets = new Map();
    // node-postgres Client는 한 연결에서 동시에 여러 query()를 실행하지
    // 않는다. 기존 D1 코드의 Promise.all 패턴을 그대로 허용하되 실제
    // PostgreSQL 작업은 요청 단위 FIFO로 직렬화한다.
    this.operationTail = Promise.resolve();
    this.closed = false;
  }

  enqueue(operation) {
    if (this.closed) return Promise.reject(new Error('PostgreSQL 연결이 이미 종료되었습니다.'));
    const result = this.operationTail.then(operation);
    // 한 작업의 실패가 뒤 작업까지 영구적으로 막지 않도록 tail만 복구한다.
    this.operationTail = result.catch(() => undefined);
    return result;
  }

  prepare(source) {
    return new PostgresD1Statement(this, source);
  }

  async tableUniqueTarget(table, insertedColumns) {
    const cacheKey = table;
    let indexes = this.uniqueTargets.get(cacheKey);
    if (!indexes) {
      const result = await this.client.query({
        text: `SELECT i.indisprimary,
          array_agg(a.attname::text ORDER BY keys.ordinality) AS columns
        FROM pg_catalog.pg_index i
        CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS keys(attnum, ordinality)
        JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=keys.attnum
        WHERE i.indrelid=to_regclass($1) AND i.indisunique
          AND i.indpred IS NULL AND i.indexprs IS NULL
        GROUP BY i.indexrelid,i.indisprimary
        ORDER BY i.indisprimary DESC,cardinality(array_agg(a.attname::text ORDER BY keys.ordinality)) ASC`,
        values: [table],
      });
      indexes = result.rows.map(row => ({ primary: row.indisprimary, columns: row.columns }));
      this.uniqueTargets.set(cacheKey, indexes);
    }
    const inserted = new Set(insertedColumns);
    return indexes.find(index => index.columns.every(column => inserted.has(column)))?.columns || [];
  }

  async translateInsert(source) {
    let sql = stripTrailingSemicolon(source);
    const replaceMatch = sql.match(/^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+([^\s(]+)\s*\(([^)]+)\)/i);
    if (replaceMatch) {
      const table = stripIdentifier(replaceMatch[1].split('.').at(-1));
      const columns = replaceMatch[2].split(',').map(stripIdentifier);
      const target = await this.tableUniqueTarget(table, columns);
      sql = sql.replace(/^\s*INSERT\s+OR\s+REPLACE\s+/i, 'INSERT ');
      if (target.length) {
        const targetSet = new Set(target);
        const updates = columns
          .filter(column => !targetSet.has(column))
          .map(column => `${quoteIdentifier(column)}=EXCLUDED.${quoteIdentifier(column)}`);
        sql += ` ON CONFLICT (${target.map(quoteIdentifier).join(',')}) ${updates.length ? `DO UPDATE SET ${updates.join(',')}` : 'DO NOTHING'}`;
      }
    } else if (/^\s*INSERT\s+OR\s+IGNORE\b/i.test(sql)) {
      sql = sql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+/i, 'INSERT ');
      if (!/\bON\s+CONFLICT\b/i.test(sql)) sql += ' ON CONFLICT DO NOTHING';
    }
    return sql;
  }

  async pragmaResult(source) {
    const table = pragmaTableName(source);
    if (table) {
      const result = await this.client.query({
        text: `SELECT (a.attnum-1)::integer AS cid,a.attname AS name,
          pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
          CASE WHEN a.attnotnull THEN 1 ELSE 0 END AS notnull,
          pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS dflt_value,
          CASE WHEN EXISTS(
            SELECT 1 FROM pg_catalog.pg_index i
            WHERE i.indrelid=a.attrelid AND i.indisprimary AND a.attnum=ANY(i.indkey)
          ) THEN 1 ELSE 0 END AS pk
        FROM pg_catalog.pg_attribute a
        LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
        values: [table],
      });
      return this.result(result.rows, result.rowCount, 0);
    }
    if (/^\s*PRAGMA\s+(?:page_size|freelist_count|page_count)\s*;?\s*$/i.test(source)) {
      const key = source.match(/PRAGMA\s+([A-Za-z_]+)/i)?.[1]?.toLowerCase() || 'pragma';
      return this.result([{ [key]: 0 }], 1, 0);
    }
    return null;
  }

  result(rows, rowCount, duration, aliases = new Map()) {
    const mapped = restoreAliases(rows || [], aliases);
    const last = mapped.at(-1) || {};
    return {
      success: true,
      results: mapped,
      meta: {
        changes: Number(rowCount || 0),
        last_row_id: Number(last.id || 0),
        duration,
        rows_read: mapped.length,
        rows_written: Number(rowCount || 0),
      },
    };
  }

  execute(statement) {
    return this.enqueue(() => this.executeDirect(statement));
  }

  async executeDirect(statement) {
    if (!(statement instanceof PostgresD1Statement)) throw new TypeError('Postgres D1 statement가 아닙니다.');
    const source = stripTrailingSemicolon(statement.source);
    if (!source) return emptyResult();
    const pragma = await this.pragmaResult(source);
    if (pragma) return pragma;
    if (SCHEMA_SQL.test(source)) return emptyResult();

    const startedAt = Date.now();
    let sql = INSERT_SQL.test(source.replace(/^\s+/, '')) ? await this.translateInsert(source) : source;
    sql = translateDialect(sql);
    const bound = bindQuestionMarks(sql);
    const values = statement.values.map(value => value === undefined ? null : value);
    if (bound.count !== values.length) {
      throw new Error(`PostgreSQL 바인딩 개수 불일치: SQL ${bound.count}개 / 값 ${values.length}개`);
    }
    let queryText = bound.text;
    if (/^\s*INSERT\b/i.test(queryText) && !/\bRETURNING\b/i.test(queryText)) queryText += ' RETURNING *';
    const aliases = camelAliases(source);
    const result = await this.client.query({ text: queryText, values });
    return this.result(result.rows, result.rowCount, Date.now() - startedAt, aliases);
  }

  batch(statements) {
    const list = Array.isArray(statements) ? statements : [];
    return this.enqueue(async () => {
      await this.client.query('BEGIN');
      try {
        const results = [];
        for (const statement of list) results.push(await this.executeDirect(statement));
        await this.client.query('COMMIT');
        return results;
      } catch (error) {
        try { await this.client.query('ROLLBACK'); } catch {}
        throw error;
      }
    });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.operationTail.catch(() => undefined);
    await this.client.end();
  }
}

export async function createPostgresD1Compat(connectionString) {
  if (!connectionString) throw new Error('Hyperdrive PostgreSQL 연결 문자열이 없습니다.');
  const client = new Client({ connectionString, application_name: 'cnine-card-pages' });
  await client.connect();
  // V1809: 세션 설정 3개를 각각 보내면 요청마다 왕복이 3번 더 생긴다.
  //   이 런타임은 요청 1건당 새로 연결하므로 그 비용이 매 요청에 그대로 붙는다.
  //   실측(2026-08-23 새벽, 유저 없음): /api/health 는 쿼리가 0개인데도 250ms.
  //   세미콜론으로 이어 붙이면 simple query 한 번으로 끝나 왕복 2회가 사라진다.
  //   ※ 더 좋은 방법은 Neon 쪽에 기본값으로 박아 두고 이 줄을 아예 지우는 것이다.
  //        ALTER DATABASE <db> SET statement_timeout='20s';
  //        ALTER DATABASE <db> SET lock_timeout='4s';
  //        ALTER DATABASE <db> SET idle_in_transaction_session_timeout='20s';
  //      그러면 왕복이 3회 전부 사라진다.
  await client.query(
    "SET statement_timeout='20s'; " +
    "SET lock_timeout='4s'; " +
    "SET idle_in_transaction_session_timeout='20s'");
  const db = new PostgresD1Database(client);
  return { db, close: () => db.close() };
}

export const __postgresCompatTest = {
  bindQuestionMarks,
  translateDialect,
  translateScalarMinMax,
  translateNoCase,
};

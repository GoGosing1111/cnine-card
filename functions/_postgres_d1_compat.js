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
  let text = rewriteOutsideLiterals(source, code => code.replace(/\?/g, () => `$${++ordinal}`));
  text = anchorUnaryMinusParams(text);
  return { text, count: ordinal };
}

// V1810: 단항 마이너스 뒤에 바인딩 파라미터가 오면 Postgres 가 타입을 못 정한다.
//   ERROR: operator is not unique: - unknown
//   실제 장애: 장비 보급상자 개방 (SELECT ?,?,-?,quantity,... FROM ...)
//   SQLite 는 그냥 통과시켰다. 0 을 앞에 두면 정수로 앵커가 잡혀 해소된다.
//   이항 마이너스(a - $1)는 이미 좌변이 타입을 정해주므로 건드리지 않는다.
function anchorUnaryMinusParams(source) {
  return rewriteOutsideLiterals(source, code => {
    let out = '';
    let i = 0;
    while (i < code.length) {
      const ch = code[i];
      if (ch !== '-') { out += ch; i += 1; continue; }
      const rest = code.slice(i + 1);
      const param = /^\s*\$(\d+)/.exec(rest);
      if (!param) { out += ch; i += 1; continue; }
      // 앞의 마지막 의미 있는 글자로 단항/이항을 가른다
      const before = out.replace(/\s+$/, '');
      const last = before.slice(-1);
      const prevWord = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(before)?.[1]?.toUpperCase() || '';
      const binaryLead = /[A-Za-z0-9_)\]"]/.test(last)
        && !['SELECT','WHEN','THEN','ELSE','AND','OR','NOT','BY','VALUES','RETURNING','SET','CASE'].includes(prevWord);
      if (binaryLead) { out += ch; i += 1; continue; }
      out += `(0-$${param[1]})`;
      i += 1 + param[0].length;
    }
    return out;
  });
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
    this.tableColumnCache = new Map();
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

  // V1810: ON CONFLICT ... DO UPDATE SET 안에서 컬럼을 한정 없이 쓰면
  //   Postgres 가 "column reference X is ambiguous" 로 거부한다. 대상 테이블과
  //   EXCLUDED 양쪽에 같은 이름이 있어서다. SQLite 는 그냥 통과시켰다.
  //   실제 장애: 프리미엄 큐브(quantity), 마법카드(user_id), 장비 보급상자.
  //   코드에 71곳이 있고 그중 18곳이 한정되어 있지 않았다. 한 곳씩 고치면
  //   또 빠뜨리므로 여기서 일괄 처리한다.
  //   ⚠ 대입 대상(좌변)은 한정하면 안 된다. Postgres 가 거부한다.
  async tableColumns(table) {
    let columns = this.tableColumnCache.get(table);
    if (!columns) {
      const result = await this.client.query({
        text: `SELECT a.attname::text AS name FROM pg_catalog.pg_attribute a
          WHERE a.attrelid=to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped`,
        values: [table],
      });
      columns = new Set(result.rows.map(row => String(row.name).toLowerCase()));
      this.tableColumnCache.set(table, columns);
    }
    return columns;
  }

  async qualifyConflictUpdate(sql) {
    const head = sql.match(/^\s*INSERT\s+INTO\s+([^\s(]+)/i);
    if (!head) return sql;
    const table = stripIdentifier(head[1].split('.').at(-1));
    const doUpdate = /\bDO\s+UPDATE\s+SET\b/i.exec(sql);
    if (!doUpdate) return sql;

    let columns;
    try { columns = await this.tableColumns(table); }
    catch { return sql; }               // 카탈로그 조회 실패 시 원문 유지
    if (!columns || !columns.size) return sql;

    const start = doUpdate.index + doUpdate[0].length;
    const body = sql.slice(start);
    const KEYWORDS = new Set(['CURRENT_TIMESTAMP','CURRENT_DATE','CURRENT_TIME','NULL',
      'TRUE','FALSE','CASE','WHEN','THEN','ELSE','END','AND','OR','NOT','IS','IN',
      'EXCLUDED','DEFAULT','WHERE','RETURNING','ON','CONFLICT','DO','UPDATE','SET',
      'BETWEEN','LIKE','ILIKE','INTERVAL','CAST','AS','DISTINCT','FROM']);

    let out = '', i = 0, depth = 0, expectTarget = true, stop = -1;
    while (i < body.length) {
      const ch = body[i];
      if (ch === "'") {                       // 문자열 리터럴 통째로 보존
        let j = i + 1;
        while (j < body.length) {
          if (body[j] === "'") { if (body[j + 1] === "'") { j += 2; continue; } j += 1; break; }
          j += 1;
        }
        out += body.slice(i, j); i = j; continue;
      }
      if (ch === '"') {                       // 이미 따옴표로 감싼 식별자
        const j = body.indexOf('"', i + 1) + 1;
        out += body.slice(i, j > 0 ? j : body.length); i = j > 0 ? j : body.length; continue;
      }
      if (ch === '(') { depth += 1; out += ch; i += 1; continue; }
      if (ch === ')') {
        if (depth === 0) { stop = i; break; } // INSERT 를 감싼 괄호 밖으로 나감
        depth -= 1; out += ch; i += 1; continue;
      }
      if (ch === ',' && depth === 0) { expectTarget = true; out += ch; i += 1; continue; }
      if (ch === '=' && depth === 0 && expectTarget) { expectTarget = false; out += ch; i += 1; continue; }

      const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(body.slice(i));
      if (word) {
        const name = word[0];
        const upper = name.toUpperCase();
        const qualified = out.endsWith('.');
        const after = body.slice(i + name.length);
        const isCall = /^\s*\(/.test(after);
        if (upper === 'WHERE') expectTarget = false;   // WHERE 뒤는 전부 식(expression)
        if (!expectTarget && !qualified && !isCall
            && !KEYWORDS.has(upper) && columns.has(name.toLowerCase())) {
          out += `${quoteIdentifier(table)}.${quoteIdentifier(name)}`;
        } else {
          out += name;
        }
        i += name.length;
        continue;
      }
      out += ch; i += 1;
    }
    const tail = stop >= 0 ? body.slice(stop) : '';
    return sql.slice(0, start) + out + tail;
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
    if (/\bDO\s+UPDATE\s+SET\b/i.test(sql)) sql = await this.qualifyConflictUpdate(sql);
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
  // V1809: 세션 설정을 각각 보내면 요청마다 왕복이 3번 더 생긴다.
  //   이 런타임은 요청 1건당 새로 연결하므로 그 비용이 매 요청에 그대로 붙는다.
  //   실측: /api/health 는 쿼리가 0개인데도 264ms (정적 파일은 29ms).
  //   ※ 더 좋은 건 Neon 쪽 기본값으로 박고 이 줄을 지우는 것이다.
  //        ALTER DATABASE <db> SET statement_timeout='20s'; (외 2개)
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

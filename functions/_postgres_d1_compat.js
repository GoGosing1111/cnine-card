import { Client, types } from 'pg';

// D1 returns INTEGER values as JavaScript numbers. Match that behavior for the
// PostgreSQL bigint/numeric types used by the converted schema.
types.setTypeParser(20, value => Number(value));
types.setTypeParser(1700, value => Number(value));

const SCHEMA_SQL = /^(?:CREATE\s+(?:TABLE|INDEX|UNIQUE\s+INDEX|TRIGGER|VIEW)|DROP\s+(?:TRIGGER|VIEW|INDEX|TABLE)|ALTER\s+TABLE|PRAGMA\s+(?:foreign_keys|journal_mode|synchronous|optimize)|VACUUM\b|REINDEX\b)/i;
const INSERT_SQL = /^(?:INSERT\b|WITH\b[\s\S]*\bINSERT\s+(?:OR\s+\w+\s+)?INTO\b)/i;

// PERF-0919: 카탈로그(유니크 키·컬럼 목록) 조회 결과를 isolate 단위로 재사용한다.
//   이 어댑터는 요청마다 새 연결(PostgresD1Database)을 만든다. 캐시가 인스턴스에
//   붙어 있으면 요청마다 upsert 대상 테이블 수만큼 pg_catalog 조회가 추가로 나간다
//   (카드뽑기 커밋 1회에 약 5~8회). 스키마는 배포 마이그레이션이나 execSchema()로만
//   바뀌므로 execSchema() 에서 비우고, 혹시 모를 수동 변경에 대비해 10분 뒤 만료한다.
//   값은 완료된 순수 데이터(배열/Set)만 저장한다. 연결·promise 는 보관하지 않는다.
const CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;
const CATALOG_CACHE_MAX = 512;
const sharedUniqueTargets = new Map();
const sharedTableColumns = new Map();
function catalogCacheGet(store, key, now = Date.now()) {
  const row = store.get(key);
  if (!row) return undefined;
  if (row.expiresAt <= now) { store.delete(key); return undefined; }
  return row.value;
}
function catalogCacheSet(store, key, value, now = Date.now()) {
  if (store.size >= CATALOG_CACHE_MAX && !store.has(key)) store.delete(store.keys().next().value);
  store.set(key, { value, expiresAt: now + CATALOG_CACHE_TTL_MS });
  return value;
}
export function clearPostgresCatalogCache() {
  sharedUniqueTargets.clear();
  sharedTableColumns.clear();
}

// PERF-0919: 읽기 전용 batch 판정. READ COMMITTED 에서는 트랜잭션 안에서도 문장마다
//   새 스냅샷을 보므로, 잠금 없는 SELECT 만 모인 batch 를 BEGIN/COMMIT 으로 감싸도
//   일관성 이득이 없고 왕복만 2회 늘어난다. 잠금(FOR UPDATE/SHARE)·시퀀스·
//   advisory lock 처럼 부수효과가 있는 SELECT 는 기존대로 트랜잭션을 유지한다.
const READ_ONLY_SELECT = /^\s*(?:\(\s*)*SELECT\b/i;
const SIDE_EFFECT_SELECT = /\bFOR\s+(?:UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b|\bpg_advisory|\bnextval\s*\(|\bsetval\s*\(|\bpg_sleep|\bINTO\s+(?:TEMP|TEMPORARY|UNLOGGED|TABLE)\b|\bset_config\s*\(/i;
function isReadOnlyStatement(statement) {
  const source = String(statement?.source || '').replace(/^\s*(?:--[^\n]*\n\s*)*/, '');
  return READ_ONLY_SELECT.test(source) && !SIDE_EFFECT_SELECT.test(source);
}
function batchNeedsTransaction(list) {
  if (list.length <= 1) return false;          // 단일 문장은 autocommit 자체가 원자적이다.
  return !list.every(isReadOnlyStatement);
}

// PIPE-0920: batch 를 한 메시지로 보낼 때 트랜잭션 머리. Hyperdrive 는 연결 단위 SET 을
//   유지하지 않으므로(트랜잭션 풀링) 기존 연결 시 SET 과 같은 값을 SET LOCAL 로 싣는다.
const PIPELINE_TRANSACTION_HEAD = Object.freeze([
  'BEGIN',
  "SET LOCAL statement_timeout='20s'",
  "SET LOCAL lock_timeout='4s'",
  "SET LOCAL idle_in_transaction_session_timeout='20s'",
]);

// PIPE-0920: node-postgres 가 파라미터를 텍스트로 바꾸는 규칙과 같은 값만 리터럴로 옮긴다.
//   옮길 수 없는 값이면 null 을 돌려 호출부가 기존 경로로 실행하게 한다.
function parameterLiteral(value, escapeLiteral) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') return escapeLiteral(value);
  if (typeof value === 'number') return Number.isFinite(value) ? `'${String(value)}'` : null;
  if (typeof value === 'bigint') return `'${value.toString()}'`;
  if (typeof value === 'boolean') return value ? "'true'" : "'false'";
  return null;
}

function inlineParameters(text, values, escapeLiteral) {
  const literals = [];
  for (const value of values) {
    const literal = parameterLiteral(value, escapeLiteral);
    if (literal === null) return null;
    literals.push(literal);
  }
  let missing = false;
  const inlined = rewriteOutsideLiterals(text, code => code.replace(/(?<![0-9A-Za-z_$])\$(\d+)(?![0-9A-Za-z_$])/g, (match, ordinal) => {
    const literal = literals[Number(ordinal) - 1];
    if (literal === undefined) { missing = true; return match; }
    return literal;
  }));
  return missing ? null : inlined;
}

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

function sqlQuotedTokenEnd(source, start) {
  const quote = source[start];
  if (quote === "'" || quote === '"') {
    let i = start + 1;
    while (i < source.length) {
      if (source[i] === quote) {
        if (source[i + 1] === quote) { i += 2; continue; }
        return i + 1;
      }
      i += 1;
    }
    return source.length;
  }
  if (source[start] === '-' && source[start + 1] === '-') {
    const end = source.indexOf('\n', start + 2);
    return end < 0 ? source.length : end + 1;
  }
  if (source[start] === '/' && source[start + 1] === '*') {
    const end = source.indexOf('*/', start + 2);
    return end < 0 ? source.length : end + 2;
  }
  return start;
}

function matchingParen(source, openIndex) {
  let depth = 1;
  for (let i = openIndex + 1; i < source.length;) {
    const quotedEnd = sqlQuotedTokenEnd(source, i);
    if (quotedEnd !== i) { i = quotedEnd; continue; }
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')' && --depth === 0) return i;
    i += 1;
  }
  return -1;
}

function topLevelBlobAs(body) {
  let depth = 0;
  for (let i = 0; i < body.length;) {
    const quotedEnd = sqlQuotedTokenEnd(body, i);
    if (quotedEnd !== i) { i = quotedEnd; continue; }
    if (body[i] === '(') { depth += 1; i += 1; continue; }
    if (body[i] === ')') { depth = Math.max(0, depth - 1); i += 1; continue; }
    if (depth === 0 && (i === 0 || !/[A-Za-z0-9_$]/.test(body[i - 1]))) {
      const match = /^AS\s+BLOB\b/i.exec(body.slice(i));
      if (match && !body.slice(i + match[0].length).trim()) return i;
    }
    i += 1;
  }
  return -1;
}

// SQLite CAST(x AS BLOB) means the UTF-8 bytes of x. PostgreSQL has no BLOB
// type, and a flat regex is unsafe for nested COALESCE()/CASE expressions.
function translateBlobCasts(source) {
  let output = '';
  for (let i = 0; i < source.length;) {
    const quotedEnd = sqlQuotedTokenEnd(source, i);
    if (quotedEnd !== i) {
      output += source.slice(i, quotedEnd);
      i = quotedEnd;
      continue;
    }
    const keywordBoundary = i === 0 || !/[A-Za-z0-9_$]/.test(source[i - 1]);
    const cast = keywordBoundary ? /^CAST\s*\(/i.exec(source.slice(i)) : null;
    if (!cast) { output += source[i]; i += 1; continue; }
    const openIndex = i + cast[0].lastIndexOf('(');
    const closeIndex = matchingParen(source, openIndex);
    if (closeIndex < 0) { output += source.slice(i); break; }
    const body = source.slice(openIndex + 1, closeIndex);
    const asIndex = topLevelBlobAs(body);
    if (asIndex >= 0) {
      const expression = translateBlobCasts(body.slice(0, asIndex).trim());
      output += `convert_to((${expression})::text,'UTF8')`;
    } else {
      output += source.slice(i, openIndex + 1);
      output += translateBlobCasts(body);
      output += ')';
    }
    i = closeIndex + 1;
  }
  return output;
}

// V1811 ⑥ json_build_object 안의 무타입 파라미터
//   Postgres 의 json_build_object 는 인자가 "any" 라서 $1 만 오면 타입을 못 정한다.
//     ERROR: could not determine data type of parameter $1
//   실제 장애: 장비 보급상자 구매 영수증 확정.
//   컬럼 비교와 달리 여기엔 타입을 추론할 문맥이 아예 없다. 다행히 호환 계층은
//   바인딩 값을 이미 들고 있으므로, JS 값의 실제 타입을 그대로 붙여 준다.
//   (문맥이 있는 다른 파라미터는 건드리지 않는다 — 잘못 붙이면 오히려 깨진다.)
function paramCastFor(value) {
  // PostgreSQL cannot infer an untyped NULL passed to json_build_object().
  // text is neutral here: a null text value still becomes JSON null.
  if (value === null || value === undefined) return 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'bigint' : 'double precision';
  if (typeof value === 'bigint') return 'bigint';
  return 'text';
}

function typeJsonBuilderParams(source, values) {
  if (!/\bjsonb?_build_object\s*\(/i.test(source)) return source;
  // ⚠ rewriteOutsideLiterals 를 쓰면 안 된다. 'ok','itemCode' 같은 문자열 리터럴에서
  //   조각이 끊겨 괄호 깊이 추적이 매번 초기화된다. 리터럴을 직접 건너뛰며 한 번에 훑는다.
  let out = '';
  let i = 0;
  let depth = 0;
  const builders = [];
  while (i < source.length) {
    const ch = source[i];
    if (ch === "'") {                                   // 문자열 리터럴 통째로 보존
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "'") { if (source[j + 1] === "'") { j += 2; continue; } j += 1; break; }
        j += 1;
      }
      out += source.slice(i, j); i = j; continue;
    }
    if (ch === '"') {                                   // 따옴표 식별자
      const j = source.indexOf('"', i + 1);
      const stop = j >= 0 ? j + 1 : source.length;
      out += source.slice(i, stop); i = stop; continue;
    }
    const builder = /^jsonb?_build_object\s*\(/i.exec(source.slice(i));
    if (builder) {
      out += builder[0];
      i += builder[0].length;
      depth += 1;
      builders.push(depth);
      continue;
    }
    if (ch === '(') { depth += 1; out += ch; i += 1; continue; }
    if (ch === ')') {
      if (builders.length && builders.at(-1) === depth) builders.pop();
      depth = Math.max(0, depth - 1);
      out += ch; i += 1; continue;
    }
    const param = /^\$(\d+)/.exec(source.slice(i));
    // 빌더의 '직접 인자'만 타입을 붙인다. 안쪽 서브쿼리의 파라미터는
    //   비교 대상 컬럼이 타입을 정해 주므로 손대면 오히려 위험하다.
    if (param && builders.length && depth === builders.at(-1)) {
      const cast = paramCastFor(values[Number(param[1]) - 1]);
      const alreadyCast = /^\s*::/.test(source.slice(i + param[0].length));
      out += cast && !alreadyCast ? `${param[0]}::${cast}` : param[0];
      i += param[0].length;
      continue;
    }
    out += ch; i += 1;
  }
  return out;
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
//   NUMERIC으로 명시해 큰 정수와 소수 모두 보존한다. 0-$n은 int4로 추론되어
//   BIGINT 컬럼에 넣더라도 솔라리스 50억·배틀슈트 100억 차감 기록이 실패한다.
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
      out += `(-CAST($${param[1]} AS NUMERIC))`;
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
    // V1811 ② NOT INDEXED — SQLite 전용 힌트. Postgres 는 구문 자체를 거부한다.
    //   실측: SELECT ... FROM draw_logs d NOT INDEXED JOIN users u ...
    //         → syntax error at or near "NOT"
    .replace(/\bNOT\s+INDEXED\b/gi, '')
    // V1811 ③ json_object() — SQLite 는 (키,값,키,값…) 가변 인자인데
    //   Postgres 의 동명 함수는 시그니처가 완전히 다르다.
    //     → function pg_catalog.json_object(unknown, integer, …) does not exist
    //   json_build_object 가 SQLite 와 같은 의미다. (출력에 공백이 들어가지만
    //   둘 다 올바른 JSON 이라 JSON.parse 결과는 같다.)
    .replace(/\bjson_object\s*\(/gi, 'json_build_object(')
    // V1811 ④ CAST(x AS INTEGER) — SQLite INTEGER 는 64비트, Postgres 는 32비트다.
    //   실제 장애: 승부예측 잠금이 Date.now() 밀리초를 INTEGER 로 캐스팅해서
    //     value "1787423370180" is out of range for type integer
    //   로 죽었다. 상한이 2,147,483,647 이라 코인·타임스탬프가 그냥 넘는다.
    .replace(/\bAS\s+INTEGER\s*\)/gi, 'AS BIGINT)')
    .replace(/\bAS\s+INT\s*\)/gi, 'AS BIGINT)')
    .replace(/\browid\b/gi, 'ctid')
    .replace(/==/g, '='));
  sql = translateBlobCasts(sql);
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
    this.readGroup = null;
    this.closed = false;
  }

  enqueue(operation) {
    if (this.closed) return Promise.reject(new Error('PostgreSQL 연결이 이미 종료되었습니다.'));
    // PIPE-0920: 쓰기·batch 가 줄에 서면 열린 읽기 묶음을 닫는다. 그 뒤에 온 읽기는
    //   새 묶음으로 이 작업 "뒤"에 실행되므로 FIFO 순서가 기존과 같다.
    this.readGroup = null;
    return this.enqueueRaw(operation);
  }

  enqueueRaw(operation) {
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
    let indexes = this.uniqueTargets.get(cacheKey) || catalogCacheGet(sharedUniqueTargets, cacheKey);
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
      // 아직 없는 relation(빈 결과)은 공유하지 않는다. 뒤이은 execSchema 로 생길 수 있다.
      if (indexes.length) catalogCacheSet(sharedUniqueTargets, cacheKey, indexes);
    }
    this.uniqueTargets.set(cacheKey, indexes);
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
    let columns = this.tableColumnCache.get(table) || catalogCacheGet(sharedTableColumns, table);
    if (!columns) {
      const result = await this.client.query({
        text: `SELECT a.attname::text AS name FROM pg_catalog.pg_attribute a
          WHERE a.attrelid=to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped`,
        values: [table],
      });
      columns = new Set(result.rows.map(row => String(row.name).toLowerCase()));
      if (columns.size) catalogCacheSet(sharedTableColumns, table, columns);
    }
    this.tableColumnCache.set(table, columns);
    return columns;
  }

  async qualifyConflictUpdate(sql) {
    const head = sql.match(/\bINSERT\s+INTO\s+([^\s(]+)/i);
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
    const replaceMatch = sql.match(/(^|\)\s*)INSERT\s+OR\s+REPLACE\s+INTO\s+([^\s(]+)\s*\(([^)]+)\)/i);
    if (replaceMatch) {
      const table = stripIdentifier(replaceMatch[2].split('.').at(-1));
      const columns = replaceMatch[3].split(',').map(stripIdentifier);
      const target = await this.tableUniqueTarget(table, columns);
      sql = sql.replace(/\bINSERT\s+OR\s+REPLACE\s+/i, 'INSERT ');
      if (target.length) {
        const targetSet = new Set(target);
        const updates = columns
          .filter(column => !targetSet.has(column))
          .map(column => `${quoteIdentifier(column)}=EXCLUDED.${quoteIdentifier(column)}`);
        sql += ` ON CONFLICT (${target.map(quoteIdentifier).join(',')}) ${updates.length ? `DO UPDATE SET ${updates.join(',')}` : 'DO NOTHING'}`;
      }
    } else if (/\bINSERT\s+OR\s+IGNORE\b/i.test(sql)) {
      sql = sql.replace(/\bINSERT\s+OR\s+IGNORE\s+/i, 'INSERT ');
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
    if (this.closed) return Promise.reject(new Error('PostgreSQL 연결이 이미 종료되었습니다.'));
    if (typeof this.client.escapeLiteral !== 'function' || !isReadOnlyStatement(statement)) {
      return this.enqueue(() => this.executeDirect(statement));
    }
    // PIPE-0920: 같은 틱에 연달아 들어온 읽기(Promise.all 패턴)를 한 메시지로 묶는다.
    //   이 연결은 원래 FIFO 로 한 줄씩 보냈다. 예) /api/me 의 profile() 은 읽기 12개를
    //   Promise.all 로 던지지만 실제로는 12왕복(HKG↔싱가포르 50~70ms 씩)이었다.
    let group = this.readGroup;
    if (!group) {
      group = { items: [] };
      this.readGroup = group;
      this.enqueueRaw(() => this.flushReadGroup(group));
    }
    return new Promise((resolve, reject) => group.items.push({ statement, resolve, reject }));
  }

  async flushReadGroup(group) {
    if (this.readGroup === group) this.readGroup = null;
    const items = group.items;
    const runEach = async list => {
      for (const item of list) {
        try { item.resolve(await this.executeDirect(item.statement)); } catch (error) { item.reject(error); }
      }
    };
    if (items.length < 2) return runEach(items);
    let prepared;
    try {
      prepared = [];
      for (const item of items) prepared.push(await this.prepareForExecution(item.statement));
    } catch {
      return runEach(items);
    }
    const remote = [];
    for (let index = 0; index < items.length; index += 1) {
      const entry = prepared[index];
      if (entry.local) { items[index].resolve(entry.local); continue; }
      const text = inlineParameters(entry.text, entry.values, value => this.client.escapeLiteral(value));
      if (text === null) { remote.push({ item: items[index], text: null, entry }); continue; }
      remote.push({ item: items[index], text, entry });
    }
    const inlined = remote.filter(row => row.text !== null);
    const leftovers = remote.filter(row => row.text === null).map(row => row.item);
    if (inlined.length < 2) {
      await runEach([...inlined.map(row => row.item), ...leftovers]);
      return;
    }
    const startedAt = Date.now();
    let raw;
    try {
      raw = await this.client.query(inlined.map(row => row.text).join('\n;\n'));
    } catch {
      // 한 문장이 실패하면 서버가 나머지를 건너뛴다. 읽기뿐이므로 하나씩 다시 실행해
      // 각 호출자가 자기 결과·자기 오류를 기존과 똑같이 받게 한다.
      await runEach([...inlined.map(row => row.item), ...leftovers]);
      return;
    }
    const duration = Date.now() - startedAt;
    const results = Array.isArray(raw) ? raw : [raw];
    if (results.length !== inlined.length) {
      await runEach([...inlined.map(row => row.item), ...leftovers]);
      return;
    }
    inlined.forEach((row, index) => {
      const result = results[index];
      row.item.resolve(this.result(result.rows, result.rowCount, duration, row.entry.aliases));
    });
    await runEach(leftovers);
  }

  // PIPE-0920: 번역된 SQL 에 바인딩 값·별칭을 붙여 PostgreSQL 로 보낼 형태를 만든다(동기).
  bindPrepared(source, sql, statement) {
    const translated = translateDialect(sql);
    const bound = bindQuestionMarks(translated);
    const values = statement.values.map(value => value === undefined ? null : value);
    if (bound.count !== values.length) {
      throw new Error(`PostgreSQL 바인딩 개수 불일치: SQL ${bound.count}개 / 값 ${values.length}개`);
    }
    let queryText = typeJsonBuilderParams(bound.text, values);
    if (/^\s*INSERT\b/i.test(queryText) && !/\bRETURNING\b/i.test(queryText)) queryText += ' RETURNING *';
    return { text: queryText, values, aliases: camelAliases(source) };
  }

  // PIPE-0920: 서버로 보내지 않는 문장(PRAGMA·스키마)은 { local } 로 돌려준다.
  async prepareForExecution(statement) {
    if (!(statement instanceof PostgresD1Statement)) throw new TypeError('Postgres D1 statement가 아닙니다.');
    const source = stripTrailingSemicolon(statement.source);
    if (!source) return { local: emptyResult() };
    const pragma = await this.pragmaResult(source);
    if (pragma) return { local: pragma };
    if (SCHEMA_SQL.test(source)) return { local: emptyResult() };
    const sql = INSERT_SQL.test(source.replace(/^\s+/, '')) ? await this.translateInsert(source) : source;
    return this.bindPrepared(source, sql, statement);
  }

  // 단일 문장 경로. await 횟수를 기존과 같게 유지한다(호출 순서·타이밍 보존).
  async executeDirect(statement) {
    if (!(statement instanceof PostgresD1Statement)) throw new TypeError('Postgres D1 statement가 아닙니다.');
    const source = stripTrailingSemicolon(statement.source);
    if (!source) return emptyResult();
    const pragma = await this.pragmaResult(source);
    if (pragma) return pragma;
    if (SCHEMA_SQL.test(source)) return emptyResult();

    const startedAt = Date.now();
    const sql = INSERT_SQL.test(source.replace(/^\s+/, '')) ? await this.translateInsert(source) : source;
    const prepared = this.bindPrepared(source, sql, statement);
    const result = await this.client.query({ text: prepared.text, values: prepared.values });
    return this.result(result.rows, result.rowCount, Date.now() - startedAt, prepared.aliases);
  }

  // PIPE-0920: batch 전체를 "한 번의 왕복"으로 보낸다.
  //
  //   기존: BEGIN → 문장 n개 → COMMIT 을 하나씩 보냈다(n+2 왕복).
  //   Pages 가 HKG 에, Neon 이 싱가포르에 있어 왕복 1회가 50~70ms 다. 그래서
  //     · 문장 15개짜리 batch 는 네트워크 대기만 1초가 넘었고,
  //     · 그 1초 내내 앞에서 UPDATE 한 행의 잠금을 쥐고 있었다.
  //   영토전 공격은 모두 같은 라운드 행(territory_war_v3_rounds)을, 상점 구매는 모두
  //   재정금고 행(id=1)을 갱신한다. 잠금을 1초씩 쥐면 전 유저가 한 줄로 서게 된다.
  //   Neon pg_stat_statements 실측: 라운드 UPDATE 평균 171ms·최대 81초,
  //   재정금고 UPDATE 평균 210ms(1,730만 회).
  //
  //   이제 문장을 값까지 리터럴로 채워 한 메시지(simple query)로 보낸다.
  //   서버가 연속으로 실행하므로 잠금은 "서버 실행 시간"만큼만 잡힌다.
  //
  //   의미가 같은 이유
  //     · node-postgres 는 파라미터를 전부 타입 미지정(unknown) 텍스트로 보낸다.
  //       따옴표 리터럴 '123' 도 unknown 이므로 타입 추론 결과가 같다(숫자도 반드시 따옴표).
  //     · 문자열은 client.escapeLiteral 로 이스케이프한다(드라이버 공식 함수).
  //     · 쓰기 batch 는 BEGIN ... COMMIT 으로 감싸 원자성이 그대로다. 중간 문장이 실패하면
  //       서버가 나머지를 건너뛰고, 여기서 ROLLBACK 을 보낸 뒤 같은 예외를 던진다.
  //     · Hyperdrive 는 트랜잭션 단위 풀링이라 연결 시점의 SET 은 다음 쿼리에 남지 않는다
  //       (Cloudflare 문서). 그래서 쓰기 batch 에는 SET LOCAL 로 같은 메시지 안에 싣는다.
  //   바이너리·배열·객체 값처럼 텍스트 리터럴로 옮기기 애매한 값이 하나라도 있으면
  //   기존 방식(문장별 왕복)으로 실행한다. 결과 형식은 두 경로가 같다.
  async batchPipelined(list, transactional) {
    if (typeof this.client.escapeLiteral !== 'function') return null;
    const prepared = [];
    for (const statement of list) prepared.push(await this.prepareForExecution(statement));
    const remote = prepared.filter(item => !item.local);
    if (!remote.length) return prepared.map(item => item.local);
    const texts = [];
    for (const item of remote) {
      const text = inlineParameters(item.text, item.values, value => this.client.escapeLiteral(value));
      if (text === null) return null;
      texts.push(text);
    }
    const head = transactional ? PIPELINE_TRANSACTION_HEAD : [];
    const tail = transactional ? ['COMMIT'] : [];
    const message = [...head, ...texts, ...tail].join('\n;\n');
    const startedAt = Date.now();
    let raw;
    try {
      raw = await this.client.query(message);
    } catch (error) {
      if (transactional) { try { await this.client.query('ROLLBACK'); } catch {} }
      throw error;
    }
    const duration = Date.now() - startedAt;
    const results = Array.isArray(raw) ? raw : [raw];
    if (results.length !== head.length + texts.length + tail.length) {
      throw new Error(`PostgreSQL batch 결과 개수 불일치: 기대 ${head.length + texts.length + tail.length}개 / 실제 ${results.length}개`);
    }
    let cursor = head.length;
    return prepared.map(item => {
      if (item.local) return item.local;
      const result = results[cursor++];
      return this.result(result.rows, result.rowCount, duration, item.aliases);
    });
  }

  batch(statements) {
    const list = Array.isArray(statements) ? statements : [];
    const transactional = batchNeedsTransaction(list);
    if (list.length > 1) {
      return this.enqueue(async () => {
        const pipelined = await this.batchPipelined(list, transactional);
        if (pipelined) return pipelined;
        return this.batchSequential(list, transactional);
      });
    }
    return this.enqueue(() => this.batchSequential(list, transactional));
  }

  async batchSequential(list, transactional) {
    if (!transactional) {
      // 결과 형식(문장별 결과 배열)과 실패 시 예외 전파는 트랜잭션 경로와 같다.
      const results = [];
      for (const statement of list) results.push(await this.executeDirect(statement));
      return results;
    }
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
  }

  // 이관 후 누락된 relation을 복구하는 제한된 런타임 스키마 경로다.
  // 호출부는 사용자 입력이 없는 고정 PostgreSQL DDL만 전달해야 한다.
  execSchema(statements) {
    const list = (Array.isArray(statements) ? statements : [statements])
      .map(statement => String(statement || '').trim())
      .filter(Boolean);
    return this.enqueue(async () => {
      await this.client.query('BEGIN');
      try {
        for (const statement of list) await this.client.query(statement);
        await this.client.query('COMMIT');
        this.tableColumnCache.clear();
        this.uniqueTargets.clear();
        clearPostgresCatalogCache();
        return emptyResult();
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
  // PIPE-0920: 연결 직후 보내던 SET statement_timeout/lock_timeout/idle... 을 뺐다.
  //   Hyperdrive 는 트랜잭션 단위 풀링이라, 트랜잭션이 끝나면 풀 연결을 RESET 한다
  //   (Cloudflare 문서 "Hyperdrive supports SET statements for the duration of a
  //   transaction or a query"). 즉 이 SET 은 바로 다음 쿼리에도 적용되지 않으면서
  //   모든 API 요청에 왕복 1회(50~70ms)를 더하고 있었다.
  //   · 쓰기 batch 는 batchPipelined() 가 같은 값을 SET LOCAL 로 함께 보낸다.
  //   · 단일 문장까지 적용하려면 Neon 에서 역할 기본값으로 설정한다(운영 작업):
  //       ALTER ROLE cnine_migrator SET statement_timeout='20s';
  //       ALTER ROLE cnine_migrator SET lock_timeout='4s';
  //       ALTER ROLE cnine_migrator SET idle_in_transaction_session_timeout='20s';
  const db = new PostgresD1Database(client);
  return { db, close: () => db.close() };
}

export const __postgresCompatTest = {
  PostgresD1Database,
  isReadOnlyStatement,
  batchNeedsTransaction,
  clearPostgresCatalogCache,
  INSERT_SQL,
  inlineParameters,
  PIPELINE_TRANSACTION_HEAD,
  bindQuestionMarks,
  typeJsonBuilderParams,
  translateBlobCasts,
  translateDialect,
  translateScalarMinMax,
  translateNoCase,
};

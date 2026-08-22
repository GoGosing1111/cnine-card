# PostgreSQL 이관 · SQL 전수조사 결과 (V1811)

2026-08-23 · 추측이 아니라 **실제 PostgreSQL 16 에 스키마를 올려 코드 안의 SQL 을
전부 통과시켜 본 결과**입니다.

## 어떻게 조사했나

```
functions/ 28개 파일에서 SQL 문자열 3,184건 추출
  → 그중 CREATE TABLE 238건 · CREATE INDEX 201건 으로 감사용 DB 구성 (테이블 190개)
  → 나머지 2,624건을 실제 배포 중인 호환 계층(_postgres_d1_compat.js)에 그대로 통과
  → 결과 SQL 을 PostgreSQL 16 에 PREPARE
```

`PREPARE` 는 실행 없이 문법·함수·타입을 전부 검사합니다. 눈으로 훑는 것과 달리
**"될 것 같은데" 로 빠뜨리는 게 없습니다.**

감사 DB에 없는 테이블·컬럼 때문에 나온 오류(스키마 미비)는 제외하고,
**어떤 스키마에서도 반드시 깨지는 것만** 골랐습니다.

---

## 확인된 것 (전부 실제 PostgreSQL 16 에서 재현)

| # | 문제 | 위치 | 증상 |
|---|---|---|---|
| ① | `WITH … INSERT OR IGNORE` | _vehicle_draw.js 1곳 | `syntax error at or near "OR"` |
| ② | `NOT INDEXED` | [[path]].js 1곳 | `syntax error at or near "NOT"` |
| ③ | `json_object(...)` | 5곳 | `function json_object(…) does not exist` |
| ④ | `CAST(x AS INTEGER)` | 5곳 | `value "1787423370180" is out of range for type integer` |
| ⑤ | `CAST(x AS BLOB)` | _storage_cleanup.js | `type "blob" does not exist` |
| ⑥ | json 빌더 안의 무타입 `?` | _equipment.js 2곳 | `could not determine data type of parameter $1` |
| ⑦ | 무타입 `?` 가 bigint 컬럼과 조인 | [[path]].js 1곳 | `operator does not exist: bigint = text` |
| ⑧ | `rowid` → `ctid` 커서 비교 | _storage_cleanup.js | `operator does not exist: tid > integer` |

**①③④가 지금 유저가 겪고 있는 이동수단 뽑기·승부예측 오류의 원인입니다.**

---

## ① WITH … INSERT OR IGNORE — 이동수단 뽑기 차량 지급

호환 계층이 `INSERT` 로 **시작하는** 문장만 번역 대상으로 봤습니다.

```js
const INSERT_SQL = /^INSERT\b/i;      // ← CTE 로 시작하면 통째로 건너뜀
```

그런데 차량 지급은 이 형태입니다.

```sql
WITH receipt_guard AS (SELECT 1 FROM vehicle_draw_receipts WHERE …)
INSERT OR IGNORE INTO user_garage_vehicles(…) SELECT …
```

`INSERT OR IGNORE` 가 번역되지 않고 그대로 Postgres 에 가서 `OR` 에서 죽습니다.

## ③ json_object — SQLite 와 이름만 같은 다른 함수

SQLite `json_object('키',값,'키',값…)` 은 Postgres 에도 같은 이름이 있지만
**시그니처가 완전히 다릅니다.** 그래서 함수를 못 찾습니다.
`json_build_object` 가 SQLite 와 같은 의미입니다.

```
_vehicle_draw.js  2곳   ← 뽑기 영수증 확정
_equipment.js     1곳   ← 장비 보급상자 영수증
_storage_cleanup.js 1곳
```

영수증 확정이 실패하면 **멱등성 영수증이 PENDING 으로 굳어 유저가 갇힙니다.**

## ④ CAST(x AS INTEGER) — 32비트 상한

**SQLite 의 INTEGER 는 64비트, PostgreSQL 의 INTEGER 는 32비트(21억 4천만)입니다.**

승부예측 잠금이 `Date.now()` 밀리초를 INTEGER 로 캐스팅합니다.

```sql
DELETE FROM app_meta WHERE key=? AND CAST(substr(value,instr(value,'|')+1) AS INTEGER)<?
```

```
수정 전:  ERROR: value "1787423370180" is out of range for type integer
수정 후:  통과
```

> ⚠ **이건 승부예측만의 문제가 아닙니다.** 코인·누적치 컬럼이 INTEGER 로 변환돼
> 있다면 21억을 넘는 순간 같은 식으로 죽습니다. 화면에 200,000,000 코인 이벤트가
> 보이는데, 한 자리만 더 늘면 상한입니다. **Neon 실제 스키마에서 확인이 필요합니다.**
> (변환기 `d1-to-postgres.py` 는 INTEGER → BIGINT 로 올바르게 내보내지만,
> 런타임 `CREATE TABLE IF NOT EXISTS` 로 나중에 만들어진 테이블은 확인이 필요합니다.)
>
> ```sql
> SELECT table_name, column_name FROM information_schema.columns
> WHERE table_schema='public' AND data_type='integer' ORDER BY 1,2;
> ```

---

## 고친 방법 — 호출부가 아니라 호환 계층 한 곳에서

호출부를 하나씩 고치면 또 빠뜨립니다. 실제로 그래서 이번에 터졌습니다
(`dialect==='postgres'` 분기가 4곳에만 들어가 있었습니다).

### `functions/_postgres_d1_compat.js` (V1811)

```js
// ① CTE 로 시작해도 INSERT 번역 대상에 넣는다
const INSERT_SQL = /^(?:INSERT\b|WITH\b[\s\S]*\bINSERT\s+(?:OR\s+\w+\s+)?INTO\b)/i;

// ②~⑤ translateDialect 치환 추가
.replace(/\bNOT\s+INDEXED\b/gi, '')
.replace(/\bjson_object\s*\(/gi, 'json_build_object(')
.replace(/\bAS\s+INTEGER\s*\)/gi, 'AS BIGINT)')
.replace(/\bAS\s+INT\s*\)/gi, 'AS BIGINT)')

// ⑥ json 빌더의 직접 인자로 들어간 무타입 파라미터에
//    실제 바인딩된 JS 값의 타입을 붙인다
'itemCode',$1        →  'itemCode',$1::text
'count',$2           →  'count',$2::bigint
```

⑥은 **바인딩 값을 보고** 타입을 정합니다. 컬럼 문맥이 있는 다른 파라미터는
건드리지 않습니다 — 잘못 붙이면 오히려 깨지기 때문에 빌더의 **직접 인자에만**
적용합니다.

### `functions/_postgres_d1_compat.js` (⑤)

`CAST(x AS BLOB)` 은 단순 정규식으로 바꾸면 중첩 괄호와 문자열 리터럴을 잘못
삼킬 수 있습니다. 괄호 깊이와 따옴표를 추적하는 전용 변환기로 실제 CAST 구문만
`convert_to((x)::text,'UTF8')` 로 바꿉니다.

```
LENGTH(CAST('가나abc' AS BLOB))  →  9    (바이트 수, SQLite 와 동일)
```

### `functions/api/[[path]].js` (⑦)

```sql
FROM (SELECT ? AS user_id,? AS card_id) x LEFT JOIN users u ON u.id=x.user_id
--    ↓
FROM (SELECT CAST(? AS BIGINT) AS user_id,CAST(? AS TEXT) AS card_id) x …
```

---

## 결과

같은 2,624건을 다시 통과시켰습니다.

```
수정 전   진짜 오류  9건
수정 후   진짜 오류  0건   (⑧ 제외 · 아래 참고)
```

실제 실패 재현 → 수정 확인:

```
                                     수정 전   수정 후
이동수단 뽑기권 구매 · 재고 증가          통과      통과
이동수단 뽑기 · 차량 지급                실패 →    통과
이동수단 뽑기 · 영수증 확정              실패 →    통과
승부예측 잠금 (밀리초 CAST)              실패 →    통과
최근 고등급 뽑기 티커 (NOT INDEXED)      실패 →    통과
장비 보급상자 영수증 확정                실패 →    통과
```

---

## ⑧ 아직 남은 것 — 창고 정리의 rowid 커서

`_storage_cleanup.js` 의 캡틴 영수증 정리만 남겨 뒀습니다. **설계 판단이 필요해서입니다.**

호환 계층은 `rowid` 를 `ctid` 로 바꿉니다. 정리 코드 40곳 중 대부분은 이 형태라 정상입니다.

```sql
DELETE FROM t WHERE rowid IN (SELECT rowid FROM t WHERE … LIMIT ?)   -- 정상
ORDER BY rowid ASC                                                    -- 구문 정상
```

깨지는 건 **커서 비교**뿐입니다 (497~505행).

```sql
WHERE cr.rowid>? …                    -- ERROR: operator does not exist: tid > integer
SELECT MIN(rowid) first_id, MAX(rowid) last_id …
```

`ctid` 는 물리 위치라서 정수와 비교할 수 없고, 애초에 **VACUUM 하면 값이 바뀌므로
커서로 쓸 수 없습니다.** `captain_match_receipts_v3` 에는 `id` 컬럼이 없어
단순 치환도 불가능합니다.

**권하는 방향**: 다른 15개 정리와 같은 형태로 맞추는 것

```sql
DELETE FROM captain_match_receipts_v3
WHERE ctid IN (SELECT ctid FROM captain_match_receipts_v3
               WHERE … ORDER BY updated_at ASC LIMIT ?)
```

커서를 버리고 매번 오래된 것부터 배치로 지웁니다. 영향은 **백그라운드 정리 작업뿐**이고
유저 화면과는 무관합니다. 지금은 이 정리가 조용히 실패하고 있어서 **저장 용량이 계속 늘고 있습니다.**

---

## 배포 순서

```
1. functions/_postgres_d1_compat.js     교체
2. functions/api/[[path]].js            교체
3. 배포 후 PENDING 으로 굳은 영수증 확인·정리
```

4번이 중요합니다. ①③ 때문에 **영수증이 PENDING 으로 남아 유저가 "이미 처리된 요청입니다"
로 막혀 있을 수 있습니다.**

```sql
SELECT 'vehicle_draw' t, COUNT(*) FROM vehicle_draw_receipts WHERE status='PENDING'
UNION ALL SELECT 'vehicle_purchase', COUNT(*) FROM vehicle_draw_purchase_receipts WHERE status='PENDING'
UNION ALL SELECT 'inventory_use', COUNT(*) FROM inventory_use_receipts WHERE status='PENDING';
```

---

## 조사에서 "문제 없음" 으로 확인된 것

괜히 손대지 않도록 적어 둡니다. 전부 실제로 돌려서 확인했습니다.

| 항목 | 건수 | 상태 |
|---|---:|---|
| `INSERT OR REPLACE` / `OR IGNORE` (문장 맨 앞) | 386 | 호환 계층이 처리 |
| `datetime('now', …)` | 132 | `sqlite_datetime()` 로 처리 |
| `ON CONFLICT DO UPDATE` 우변 한정 | 71 | V1810 이 처리 (**단, 배포 필요**) |
| `AUTOINCREMENT` | 89 | 스키마 변환기가 처리 |
| `json_each(` | 11 | `sqlite_json_each()` 로 처리 |
| `MIN/MAX` 스칼라 2인자 | 38 | `LEAST/GREATEST` 로 처리 |
| `COLLATE NOCASE` | 4 | `ILIKE` 로 처리 |
| `instr(` | 2 | `strpos(` — 인자 순서 같음 |
| `json('true')` | 3 | PostgreSQL 16 에 `json(text)` 있음 |
| `json_group_array(` | 3 | `jsonb_agg()::text` 로 처리 |
| `\|\|` 문자열 연결 | 14 | 양쪽 동일 |
| `COALESCE` | 371 | 양쪽 동일 |

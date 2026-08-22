# D1(SQLite) → PostgreSQL 코드 변환표

스키마는 `d1-to-postgres.py` 가 자동으로 바꿉니다. **코드는 손으로 바꿔야 합니다.**
실제 `functions/` 안에서 센 건수입니다.

| 패턴 | 건수 | 조치 |
|---|---:|---|
| `CURRENT_TIMESTAMP` | 666 | 대부분 그대로 OK (아래 ① 참고) |
| `COALESCE(` | 371 | **그대로 동작** |
| `INSERT OR REPLACE` | 137 | 반드시 변환 ② |
| `datetime('now'…)` | 98 | 반드시 변환 ① |
| `INSERT OR IGNORE` | 98 | 반드시 변환 ② |
| `ON CONFLICT` | 62 | **그대로 동작** |
| `LIMIT ?` | 57 | **그대로 동작** |
| `AUTOINCREMENT` | 43 | 스키마 변환기가 처리 |
| `json_each(` | 5 | 반드시 변환 ③ |
| `RANDOM()` | 1 | `random()` (0~1 실수) — 용도 확인 ④ |

**671건이 손댈 대상입니다** (137 + 98 + 98 + 98 + 5 + 43 + 1, 중복 제외).

---

## ① 시각 — 가장 많고 가장 중요합니다

숲켓몬은 시각을 **TEXT** 로 저장합니다.

```sql
created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP   -- '2026-08-22 13:05:00'
```

**타입은 TEXT 그대로 두는 걸 권합니다.** timestamptz 로 바꾸면 문자열 비교하는 코드
수백 곳을 동시에 고쳐야 합니다. `'YYYY-MM-DD HH:MM:SS'` 는 사전순 = 시간순이라
부등호 비교가 Postgres 에서도 그대로 맞습니다.

바꿀 건 `datetime()` 뿐입니다.

```sql
-- 지금
WHERE created_at < datetime('now','-30 days')
WHERE expires_at > datetime('now')

-- 바꾼 뒤
WHERE created_at < to_char(now() AT TIME ZONE 'UTC' - interval '30 days','YYYY-MM-DD HH24:MI:SS')
WHERE expires_at > to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
```

매번 쓰기 길어서 **헬퍼 하나 만드는 걸 권합니다.**

```sql
CREATE FUNCTION sqlite_now(shift interval DEFAULT '0')
RETURNS text LANGUAGE sql STABLE AS
$$ SELECT to_char(now() AT TIME ZONE 'UTC' + shift,'YYYY-MM-DD HH24:MI:SS') $$;
```

그러면 치환이 기계적으로 끝납니다.

```
datetime('now')              →  sqlite_now()
datetime('now','-30 days')   →  sqlite_now(interval '-30 days')
datetime('now','-1 day')     →  sqlite_now(interval '-1 day')
datetime('now','-5 seconds') →  sqlite_now(interval '-5 seconds')
```

`INSERT ... VALUES(…, CURRENT_TIMESTAMP)` 는 컬럼이 TEXT 면 Postgres 가
timestamptz 를 넣으려 해서 타입이 안 맞습니다. `sqlite_now()` 로 바꾸세요.
**컬럼 DEFAULT 는 변환기가 이미 처리했으니 건드릴 필요 없습니다.**

## ② INSERT OR IGNORE / OR REPLACE — 235건

```sql
-- INSERT OR IGNORE
INSERT INTO t(a,b) VALUES(?,?)
  ON CONFLICT DO NOTHING;

-- INSERT OR REPLACE  (충돌 컬럼을 반드시 명시해야 합니다)
INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,sqlite_now())
  ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;
```

⚠ **`OR REPLACE` 는 SQLite 에선 행을 지우고 다시 넣습니다.** 명시 안 한 컬럼이
기본값으로 초기화됩니다. Postgres `DO UPDATE` 는 명시한 컬럼만 바꿉니다.
**의도가 다를 수 있으니 137건은 하나씩 봐야 합니다.** 대부분은 `DO UPDATE` 가
오히려 원하던 동작일 겁니다.

## ③ json_each — 5건

```sql
-- 지금
WHERE card_id IN (SELECT value FROM json_each(?))

-- 바꾼 뒤
WHERE card_id IN (SELECT jsonb_array_elements_text($1::jsonb))
```

## ④ RANDOM() — 1건

SQLite `RANDOM()` 은 **64비트 정수**, Postgres `random()` 은 **0~1 실수**입니다.

```sql
ORDER BY RANDOM()   →  ORDER BY random()          -- 정렬 용도면 그대로 OK
abs(RANDOM() % 100) →  floor(random()*100)::int   -- 값을 쓰는 용도면 반드시 변환
```

## ⑤ 드라이버 API — 전면 교체

이게 사실 제일 큰 작업입니다.

```js
// 지금 (D1)
const row  = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
const rows = (await env.DB.prepare(sql).bind(a,b).all()).results;
const res  = await env.DB.prepare(sql).bind(x).run();   // res.meta.changes
await env.DB.batch([stmt1, stmt2]);                      // 한 트랜잭션

// Postgres (postgres.js)
const [row] = await sql`SELECT * FROM users WHERE id=${id}`;
const rows  =  await sql`...`;
const res   =  await sql`...`;   // res.count
await sql.begin(tx => [ tx`...`, tx`...` ]);
```

**`?` 순번 바인딩 → `${}` 태그드 템플릿** 으로 바뀝니다. 기계적 치환이 안 되는
부분이라 여기가 제일 오래 걸립니다.

`env.DB.batch()` 는 **한 트랜잭션**이라는 게 핵심입니다. `sql.begin()` 으로
같은 보장을 유지해야 합니다. 코인 차감·카드 지급처럼 원자성이 필요한 곳이
깨지면 안 됩니다.

---

## 권하는 순서

1. **스키마만 먼저** 옮기고 데이터는 안 넣은 채로, 무거운 읽기 쿼리 3~4개만
   손으로 변환해서 **속도를 잽니다.** D1 이 유저 몰릴 때 쿼리당 1,100ms 였으니
   그 대비 숫자가 나와야 이 고생을 할 이유가 생깁니다.
2. 숫자가 좋으면 그때 ①~③ 을 일괄 치환합니다 (기계적이라 빠릅니다).
3. ⑤ 드라이버 교체는 마지막에, 엔드포인트 단위로 하나씩.
4. 그동안 **이중 쓰기** 로 양쪽 데이터를 맞춰 둡니다.

한 번에 다 바꾸려 하지 마세요. 지금 상태로도 서비스는 돌아갑니다.

## 실제 운영 덤프(2026-08-23)에서 추가로 확인된 사항

- 전체 SQL은 약 4.01GB, INSERT는 9,858,581건이다.
- 테이블은 총 211개지만 `d1_migrations` 1개는 Cloudflare 내부 이력이다. 실제
  애플리케이션 이관 대상은 210개다.
- 기존 `--data pg-data.sql` 방식은 전체 파일을 메모리에 올리고 개별 INSERT를
  단일 트랜잭션으로 실행하므로 운영 이전에는 사용하지 않는다.
- 데이터는 `d1-copy-export.py`로 테이블별 PostgreSQL COPY text 파일과 manifest를
  생성한다. 지원하지 않는 리터럴, 컬럼 수 불일치, 테이블 비연속 재등장은 즉시
  오류로 중단하며 조용히 건너뛰지 않는다.
- 스키마 변환 시 `--defer-foreign-keys-post-data`를 사용해 FK를 데이터 적재 후
  `NOT VALID`로 추가하고, `--fk-validate` 출력 파일을 별도로 실행해 고아 참조를
  정확히 확인한다.
- SQLite 트리거 12개와 뷰 1개는 원문을 넣지 않는다. 검증된 PostgreSQL 구현인
  `postgres-business-objects.sql`을 **COPY 뒤에** 실행한다. 코인 지급, 뽑기 락,
  2차 인증 공급자 충돌, 경매 BGM 등 실제 업무 규칙이 들어 있으므로 생략하면 안 된다.

```bash
python scripts/d1-to-postgres.py d1-export.sql \
  -o pg-schema.sql \
  --post-data pg-post-data.sql \
  --fk-validate pg-fk-validate.sql \
  --defer-foreign-keys-post-data

python scripts/d1-copy-export.py d1-export.sql \
  --copy-dir pg-copy \
  --manifest pg-copy-manifest.json
```

운영 적재기는 테이블마다 독립 트랜잭션과 완료 기록을 남겨 중단 후 재개할 수 있다.
대상에 기존 행이 있는데 완료 기록이 없으면 자동으로 중단하며 덮어쓰지 않는다.
일회성 대용량 적재에는 Neon의 **Direct connection(풀링 OFF)** 문자열을 사용한다.

```powershell
python -m pip install "psycopg[binary]"
$env:CNINE_NEON_DATABASE_URL = Read-Host "Neon direct URL" -MaskInput

python scripts/postgres-load.py `
  --schema pg-schema.sql `
  --copy-dir pg-copy `
  --manifest pg-copy-manifest.json `
  --post-data pg-post-data.sql `
  --business-objects scripts/postgres-business-objects.sql `
  --fk-validate pg-fk-validate.sql `
  --yes-production

$env:CNINE_NEON_DATABASE_URL = $null
```

실행 순서는 다음과 같이 고정한다.

1. 테이블·기본 제약조건 생성
2. 185개 테이블 COPY (총 9,858,581행)
3. identity 번호, 보조 인덱스 207개, FK 7개 추가
4. PostgreSQL 업무 트리거 12개·뷰 1개 생성
5. FK 7개 `VALIDATE CONSTRAINT`
6. `ANALYZE`

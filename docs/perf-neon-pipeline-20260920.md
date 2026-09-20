# 코덱스 지시서 — Cloudflare 계정 이전 후속 조치 (영토전·전 기능 지연)

- 기준 커밋: `main` **9bce048** (2026-09-20 22:38 KST, 원격 HEAD 와 동일 확인)
- 태그: 코드 주석 `PIPE-0920`, 그리고 아직 커밋되지 않았던 `PERF-0919` 분량을 함께 포함한다
- 파일: `pipe-20260920.patch` (9bce048 에 그대로 적용) 또는 같은 폴더의 완성 파일 14개
- 회귀: tests/ 전체를 9bce048 기준 트리와 비교 실행 — **신규 실패 0건** (TEST-REPORT 참고)
- **2차분(09-21 새벽) 포함**: 아래 8~11절. 파일 목록은 문서 끝.

---

## 0. 지금 상태 (2026-09-20 23:00~2026-09-21 00:20 KST 실측)

| 항목 | 상태 |
|---|---|
| Hyperdrive 쿼리 캐시 | **이미 OFF** (`caching.disabled=true`, 09-20 21:51 KST 적용 확인) |
| 배치 위치 | 여전히 `remote-HKG`. Neon 은 싱가포르 → 쿼리 1회당 **50~75ms** |
| `/api/me` | 17~20쿼리에 **7~27초** |
| 영토전 `state-lite` / `state` | 20쿼리 1.1초 / 34쿼리 2.3초 |
| `raid/status` | 27쿼리 1.2~7.4초 |

원인은 두 층이다.
1. **쿼리 1건이 오래 걸린다** — `/api/me` 의 뽑기 기록 조회 하나가 6.3초였다(1절).
2. **왕복 수가 그대로 지연이 된다** — HKG↔싱가포르 왕복이 50~75ms 인데, batch 는 문장 수만큼 왕복하고
   그 시간 내내 잠금을 쥔다. 그래서 같은 행(영토전 라운드, 재정금고 id=1)을 건드리는 요청이 전부 줄을 선다(2절).

측정 근거는 Neon 콘솔에서 직접 확인했다. 진단용으로 `pg_stat_statements` 확장을 켰다(읽기 전용 통계, `CREATE EXTENSION`).

---

## 1. `/api/me` 7~27초 — 뽑기 기록 조회 (코드 수정 완료)

`profile()` 의 최근 뽑기 30건 조회가 `ORDER BY d.id DESC` 였다. PostgreSQL 은 `draw_logs`(906만 행, 2.8GB)
PK 를 뒤에서부터 훑으며 `user_id` 를 거른다. 최근에 뽑지 않은 계정일수록 더 많이 읽는다.

Neon `EXPLAIN (ANALYZE)` 실측 (user 1):
- 기존 `ORDER BY d.id DESC` → **6,358ms** (Index Scan Backward on `draw_logs_pkey`)
- 수정 `ORDER BY d.created_at DESC,d.id DESC` → **1.89ms** (Index Scan Backward on `idx_draw_logs_user`)

`created_at` 은 INSERT 시각이라 id 순서와 같고, 같은 초 안에서는 `id` 로 이어 정렬하므로 결과 순서가 바뀌지 않는다.
인덱스를 새로 만들 필요가 없다(`idx_draw_logs_user(user_id,created_at)` 는 이미 있다).

## 2. batch 1회 = 왕복 1회 (`functions/_postgres_d1_compat.js`, 이번 작업의 핵심)

기존 batch 는 `BEGIN` → 문장 n개 → `COMMIT` 을 **하나씩** 보냈다(n+2 왕복). 왕복 1회가 60ms 이므로
문장 15개짜리 batch 는 네트워크 대기만 1초가 넘고, **그 1초 내내 앞에서 UPDATE 한 행의 잠금을 쥔다.**

Neon `pg_stat_statements` 누적 실측이 그대로 보여준다.

| 문장 | 호출 수 | 평균 | 최대 |
|---|---:|---:|---:|
| `UPDATE administration_treasury_v2030 ... WHERE id=$6` (구매마다) | 1,730만 | **210ms** | 35.9초 |
| `UPDATE territory_war_v3_rounds SET a_total_damage...` (공격마다) | 16.1만 | **171ms** | **81.7초** |
| `UPDATE territory_war_v3_users SET defenses...` (방어자 행) | 16.5만 | 97ms | 76.5초 |

행 하나당 실제 작업은 1ms 도 안 된다. 나머지는 전부 "앞 사람의 트랜잭션이 네트워크를 기다리는 동안" 줄 선 시간이다.
영토전이 느린 진짜 이유가 이것이다. 공격은 모두 같은 라운드 행을 갱신하므로 전 서버가 한 줄로 직렬화된다.

**바꾼 것**: batch 를 **한 메시지(simple query)** 로 보낸다. 값은 드라이버 공식 함수 `client.escapeLiteral` 로
리터럴에 채운다. 잠금은 이제 "서버 실행 시간"만큼만 잡힌다.

의미가 같은 근거
- node-postgres 는 파라미터를 전부 **타입 미지정(unknown) 텍스트**로 보낸다. 따옴표 리터럴도 unknown 이므로
  타입 추론 결과가 같다. 그래서 숫자도 반드시 따옴표로 넣는다(`'123'`). 실제 PostgreSQL 16 에서 기존 경로와
  결과를 비교하는 테스트가 있다(`'10' > '9'` 같은 텍스트 비교까지 동일).
- 쓰기 batch 는 `BEGIN ... COMMIT` 을 같은 메시지에 넣어 원자성이 그대로다. 중간 문장이 실패하면 서버가 나머지를
  건너뛰고, 어댑터가 `ROLLBACK` 을 보낸 뒤 같은 예외를 던진다(기존과 동일).
- 바이너리·배열·객체 값이 하나라도 있으면 **기존 방식(문장별 왕복)으로 자동 폴백**한다. 결과 형식은 두 경로가 같다.

지연 60ms 를 흉내 낸 로컬 PostgreSQL 실측(같은 행을 동시에 5명이 갱신, 문장 12개 batch):
**순차 3,785ms → 파이프라인 69ms.**

### 2-1. 같은 틱의 읽기도 한 메시지로
`Promise.all([...12개 조회])` 는 D1 에서는 병렬이지만 이 어댑터에서는 한 연결 FIFO 라 12왕복이었다.
같은 틱에 들어온 **읽기 전용 SELECT** 를 한 메시지로 묶는다. 쓰기·batch 가 줄에 서면 묶음을 닫으므로 FIFO 순서는 그대로다.
묶음 중 하나가 실패하면 하나씩 다시 실행해 각 호출자가 자기 오류를 그대로 받는다(테스트 포함).
`/api/me` 의 profile() 은 이 경로에서 12왕복 → 1왕복이 된다.

### 2-2. 연결 직후 `SET` 3줄 제거
Hyperdrive 는 **트랜잭션 단위 풀링**이라 트랜잭션이 끝나면 연결을 `RESET` 한다(Cloudflare 문서).
즉 연결 직후 보내던 `SET statement_timeout/lock_timeout/idle_in_transaction_session_timeout` 은
**다음 쿼리에 적용되지도 않으면서** 모든 API 요청에 왕복 1회(50~70ms)를 더하고 있었다.
- 쓰기 batch 에는 같은 값을 `SET LOCAL` 로 같은 메시지 안에 실어 보낸다(추가 왕복 0).
- 단일 문장까지 적용하려면 Neon 에서 역할 기본값으로 박아야 한다 → 4절 운영 작업.

## 3. 영토전 상대 매칭 조회 (`functions/_territory_war.js`)

공격마다 도는 후보 조회(누적 22만 회, 평균 114ms)의 덱 보유 확인이 후보마다 그 유저의 카드 전체를 해시로 올리고 있었다.
덱에 든 5장만 PK 로 조회하도록 바꿨다. 판정은 같다(서로 다른 카드 5장 모두 보유).
Neon `EXPLAIN (ANALYZE)`: **144ms → 43ms**.
`tests/gamst-territory-deck-repair-v2005.test.mjs` 가 고정한 `COUNT(DISTINCT uc.card_id) ... COALESCE(uc.quantity,0)>0)=5`
형태는 그대로 유지했다.

## 4. 함께 들어간 PERF-0919 분량 (2026-09-19 작업, 아직 커밋 안 돼 있었음)

`PERF-AUDIT-draw-territory-20260919.md` 의 13개 파일 수정이 원격에 없다. 이번 패치에 3-way 로 얹었다(충돌은 index.html
캐시 태그 한 줄뿐이었고, 현재 HEAD 의 태그를 유지하고 `drawPerf=20260919` 만 덧붙였다). 주요 내용:
- **재화 정합성 버그 수정**(PostgreSQL 에서 실제 재현됨): 뽑기 코인 차감이 0행이어도 카드가 지급되던 경로,
  레거시 장비 보급상자·이동수단 뽑기권 중복 지급, 프라임 하이퍼드라이브 개봉·프라임 상품 구매 가드 누락.
- 영토전 `state-lite`/`state` 공용 조회 캐시, 실시간 피드 캐시 키에서 `round.version` 제거,
  숨겨진 탭 폴링 중단, 구버전 보상 테이블 조회 생략.
- 자동뽑기 부수 요청 제거(`draw/ack`, `account-rank/status`, 돼지코인 재조회), 프라임 풀 조회 4문장 → `UNION ALL` 1문장,
  완료 UPDATE 에 `RETURNING` 을 붙여 재조회 제거, USER_LOCK 고아 락 해제.
자세한 배경은 원본 문서(`Claude outputs/perf-20260919/`)에 있다.

---

## 5. 운영에서 해야 하는 것 (코드로 불가)

1. **배치 위치** — 아직 `remote-HKG` 다. `region="aws:ap-southeast-1"` 도, `host` 힌트도 HKG 로 떨어졌고 현재는 `smart` 로 돌아와 있다.
   쿼리당 50~75ms 는 여기서 온다. 위 수정으로 "왕복 수"는 크게 줄었지만 왕복 1회 비용 자체는 남는다.
   Cloudflare 지원에 문의할 거리다(싱가포르 배치가 왜 선택되지 않는지). 코드로 더 할 수 있는 건 없다.
2. **Neon 역할 기본 타임아웃** (2-2 와 짝) — 적용하면 단일 문장에도 타임아웃이 걸린다.
   ```sql
   ALTER ROLE cnine_migrator SET statement_timeout = '20s';
   ALTER ROLE cnine_migrator SET lock_timeout = '4s';
   ALTER ROLE cnine_migrator SET idle_in_transaction_session_timeout = '20s';
   ```
   적용 후 새 연결에서 `SHOW statement_timeout;` 으로 확인한다. (쓰기 batch 는 코드가 이미 `SET LOCAL` 로 건다.)
3. **`pg_stat_statements`** 를 켜 뒀다. 배포 후 다시 상위 쿼리를 뽑아 이 문서의 수치와 비교할 것.
   초기화는 `SELECT pg_stat_statements_reset();`.
4. **데이터 적체(별건)** — `user_equipment_instances` 가 **3억 3천만 행**, 스토리지 276GB 다.
   장비 목록/연금술 조회(평균 497ms, 누적 1,551,427초)가 여기서 나온다. 정리 정책이 따로 필요하다. 이번 범위 밖.

## 6. 배포 후 검증

1. 로그인한 브라우저 콘솔에서 `me`, `raid/status`, `pvp/config`, `packs`, `territory-war/state`, `territory-war/state-lite` 의
   `x-cnine-response-ms` / `x-cnine-d1-queries` / `cf-placement` 를 다시 잰다.
   - 기대: `me` 는 쿼리 17~20개에 **1초 미만**(현재 7~27초).
2. 영토전 공격 5~10회를 연속으로 해 본다. 응답 시간과 `SLOW_API_REQUEST` 로그가 줄어야 한다.
3. Neon `pg_stat_statements` 에서 `territory_war_v3_rounds` UPDATE 의 평균이 171ms 보다 크게 낮아졌는지 확인.
4. 카드팩 개봉·레이드 참가·장비 개봉으로 재화 정합성(4절 가드) 회귀가 없는지 확인.

## 7. 테스트

```
npm run test:postgres-compat        # 파이프라인 단위 테스트 포함(실 DB 없으면 해당 항목 skip)
npm run test:performance            # PERF-0919 하네스 포함
CNINE_TEST_PG_URL=postgres://... npm run test:postgres-pipeline   # 실제 PostgreSQL 대조(권장)
```
`tests/postgres-batch-pipeline-20260920.test.mjs` 가 계약을 고정한다: 리터럴 치환 규칙, 폴백 조건,
기존 경로와 결과 동일, 실패 시 전체 롤백, 병렬 읽기 1메시지·오류 격리, 쓰기 뒤 읽기의 FIFO.

---

## 8. [2차] 진짜 병목은 Hyperdrive 풀 대기였다

Cloudflare 대시보드(Hyperdrive → cnine-card-neon-production → Metrics, 24시간):
- 풀 상한 **60**, 열린 연결 평균 **53**, **대기 중인 클라이언트 평균 620 · 최대 1,500**.
- Neon `pg_stat_activity`(09-21 01:10, 한산한 시간): Hyperdrive 연결 65개 중 **28개가 idle in transaction**.
  → batch 가 `BEGIN` 을 보낸 뒤 문장마다 왕복하는 동안 풀 자리를 잡고 있던 것. 2절 파이프라인이 그대로 해법이다.
- 풀은 **SIN(싱가포르)** 에 있다(위치 선택기에 SIN 만 표시). 워커만 HKG 다.
- Neon `max_connections`=901 인데 Hyperdrive 상한이 60 이다. → 운영 작업(12절 1번).

`/api/me` 23초 같은 값은 쿼리 시간이 아니라 **풀 자리를 기다린 시간**이었다.

## 9. [2차] `user_equipment_instances` 고래 계정 — 집계 테이블 도입

`pg_stats` 로 확인: 인스턴스를 가진 계정은 **268개**뿐인데 총 3억 2,700만 행. 상위 계정 1명이 **약 870만 개**(2.66%), 2위 550만 개.
"이 계정이 장비별로 몇 개"를 인스턴스에서 세는 조회는 그 계정에서 수십 초다 — 인덱스만 훑어도(Parallel Index Only Scan) **48.7초** 실측.

| 조회 | 30일 누적 | 호출 | 평균 |
|---|---:|---:|---:|
| 연금술 장비 목록 (`_alchemy.js` userState) | **1,551,427초 (전체 DB 시간의 23%)** | 312만 | 497ms |
| 장비 강화 준비 목록 (`_equipment_forge_preparation.js`) | 144,197초 | 1,261 | **114초** |
| 장비창 grouped CTE (`_equipment.js` characterPayload) | 40,132초 | 13,533 | 2.97초 |

적용:
- **집계 테이블 `user_equipment_counts_v1`** — PostgreSQL 트리거(문장 단위, 전이 테이블)가 INSERT/DELETE/UPDATE 마다 (user_id, equipment_id) 수량을 유지한다. `scripts/ops/equipment-counts-v1-20260921.sql`(표·트리거·백필·검증·되돌리기).
- 코드(`functions/_equipment_counts_v1.js`)는 `app_meta` 마커 `equipment_counts_v1_ready='1'` 이 있을 때만 집계 표를 읽는다. 마커가 없으면(SQLite/D1·테스트·백필 전) 예전 쿼리 그대로. 결과 형식은 같다.
  - 연금술 userState 장비 목록, 장비창 수량(`character/equipment/quantities` — 한 번에 전부 반환), 장비창 grouped CTE.
- **강화 준비 목록**: `ORDER BY x.id DESC` 가 PK 를 뒤에서부터 훑던 문제(1절과 같은 원인). `idx_user_equipment_instances_user(user_id, acquired_at DESC, id DESC)` 순서로 정렬하고 커서(beforeId)는 그 행의 (acquired_at,id) 행 비교로 이어 읽는다. **80초+ → 8.7ms** (Neon EXPLAIN, 계정 1). API 계약(beforeId/nextCursor) 그대로.
- **보급상자 개봉의 보유 확인** `SELECT DISTINCT equipment_id ...` → 풀 항목별 EXISTS. 인스턴스 수와 무관해진다.

검증: `tests/equipment-counts-v1-20260921.test.mjs` — 실제 PostgreSQL 16 에서 500행 일괄 INSERT·id 지정 DELETE·키 변경 UPDATE 뒤 집계 표가 GROUP BY 와 같음, 마커 OFF/ON 두 경로의 `equipmentQuantities` 결과 동일.

## 10. [2차] V3 전투 진입 (`battle/fight`)

느린 이유는 서버 쪽 순차 왕복이다(리소스 로딩은 정적 파일이라 무관). 손댄 것:
- 버닝 설정·전투 설정·요청 본문을 한 번에, 몬스터·보유 카드 조회를 등급 검증과 같은 틱에 던진다(어댑터가 한 메시지로 묶음). `await validateDeckGradeLimits(env,ids,` 문자열은 테스트 계약이라 그대로 두었다.
- **행동력 차감은 모든 검증 뒤로**: 예전에는 "보유하지 않은 카드" 400 에도 행동력이 빠졌다. 이제 빠지지 않는다(정합성 개선, 성공 경로는 동일).
- 뒤에서 순차로 기다리던 용병 스냅샷·계정 랭크 혜택(2번 호출)을 앞의 Promise.all 에 합쳐 1번만 읽는다.
- 경량 프로필과 소 포탈 판정을 동시에 기다린다. 소 포탈 INSERT+확인 SELECT 는 batch 1회로.
- 영토전 매칭·프로필·재화 batch 는 1~3절 그대로 적용된다.

## 11. [2차] 인덱스 (Neon 에서 직접) — `scripts/ops/neon-indexes-20260921.sql`
- `idx_draw_logs_created_at` — CMS 대시보드 24시간 뽑기 수, 평균 15.7초 × 1,770회(풀 자리 15초씩 점유).
- `idx_pvp_ranked_ticket_expires` — 랭크전 티켓 만료 정리, 평균 240ms × 49만 회.

## 12. [2차] 운영 작업 (우선순위순)
1. **Hyperdrive 연결 상한 60 → 300 — 09-21 01:35 KST 적용 완료** (대시보드에서 변경, API 로 `origin_connection_limit: 300` 확인). 참고 명령:
   `npx wrangler hyperdrive update 12ed48b0fb374f82a610cc1daba92e95 --origin-connection-limit 300`. Neon max_connections 901 이라 여유 있다. 재배포 불필요, 즉시 적용.
2. 이 패치 배포(2절 파이프라인이 idle-in-transaction 연결을 없앤다).
3. 11절 인덱스 2개.
4. 9절 집계 표: 1절 트리거 → 3절 백필(30~60분, 한산한 시간) → 4절 검증 → 5절 마커 ON. 마커를 켜기 전까지 코드는 예전 경로다.
5. 5절 2번(Neon 역할 타임아웃), `pg_stat_statements_reset()` 후 재측정.
6. 배치 위치(HKG): 코드·설정으로 불가. Cloudflare 문서상 힌트는 "Cloudflare 가 측정한 최저 지연 DC" 로 매핑되고 Smart 는 "이전에 실행된 위치만" 고려한다. 지원 문의 시 "Pages Functions placement region aws:ap-southeast-1 resolves to HKG, Hyperdrive pool is in SIN" 으로.

## 파일 (2차 추가분)
- `functions/_equipment_counts_v1.js` (신규), `functions/_equipment_forge_preparation.js`, `functions/_equipment_inventory.js`, `functions/_alchemy.js`, `functions/_cow_room_portal.js`
- `functions/_equipment.js`, `functions/api/[[path]].js` (1차분 위에 추가)
- `scripts/ops/equipment-counts-v1-20260921.sql`, `scripts/ops/neon-indexes-20260921.sql` (신규)
- `tests/equipment-counts-v1-20260921.test.mjs` (신규), `package.json`

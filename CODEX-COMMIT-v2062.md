# v2062 검토 완료 기록 — 재정금고·뽑기·연금술 조회 최적화

## 후속 운영 배포 승인 — 2026-09-08

사용자의 후속 **“푸시 배포 해라”** 지시로 아래 사전 검토 당시의 푸시·배포 금지를 해제한다.
배포 대상은 최적화 커밋 `3471d868`, 희야 아바타 리소스 커밋 `aca84ee0`과 이 승인 기록이다.
희야 아바타의 라이브 카탈로그·판매·지급·장착 활성화는 여전히 포함하지 않는다.

검증 전 Git 자동 배포를 막기 위해 이 승인 기록 커밋에 `[CF-Pages-Skip]` 접두사를 쓴다.
이는 [Cloudflare 공식 GitHub 연동 규칙](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message)에 따른 단일 푸시의 자동 배포 생략이며, 프로젝트 설정은 변경하지 않는다.
별도 깨끗한 배포 작업 트리에서 `npm run release:gate`를 통과시키고,
운영 배포는 전체 게이트가 포함된 `npm run deploy:production`만 사용한다.
테스트 의존성·캐시·로그는 배포 디렉터리 밖에 둔다. dirty 배포 예외는 사용하지 않는다.

아래 내용과 `TEST-REPORT-v2062.txt`는 후속 배포 승인 이전의 검토 기록으로 보존한다.

---

검토일: 2026-09-08
사용자 원본: `Claude outputs/CODEX-COMMIT-v2062.md` (원본은 수정하지 않음)

## 작업 범위와 배포 제한

사용자 요청은 최적화 패치 검토·커밋과 희야 아바타 동시 정리다.
원본 지시의 **배포 금지**를 유지한다. 로컬 커밋만 만들고 push·운영 배포·운영 DB 변경은 하지 않는다.
Git 연동 배포를 유발할 수 있으므로 push도 별도 지시 전까지 하지 않는다.

직전 운영 기준은 `4e5afa75`, 로컬 선행 커밋은 `aca84ee0`
(`art: prepare Hi Heeya avatar review assets`)다.
희야 아바타 13개 파일은 그 선행 커밋으로 보존하고, 서버 최적화와는 분리한다.
희야의 라이브 카탈로그·상점·가격·지급·장착 기능은 이번 범위가 아니다.

## 원안에서 바로잡은 회귀 위험

### 1. 슈퍼스타팩 요청 충돌

원안의 조건부 만료 청소는 현재 requestId의 PENDING만 확인했다.
사용자당 PENDING 1개를 강제하는 부분 유니크 인덱스 때문에
다른 requestId의 오래된 PENDING이 남으면 새 개봉은 계속 409가 될 수 있었다.

- 정상 새 요청에서는 불필요한 청소 UPDATE를 생략한다.
- claim 충돌 시 해당 사용자의 실제 만료 행을 정리한다.
- 만료 행을 정리한 경우에만 claim을 한 번 재시도한다.
- 아직 진행 중인 요청은 보호한다.
- 완료 영수증 재생과 한 번만 차감하는 원자 지급 경로는 유지한다.
- SQLite와 로컬 PostgreSQL(PGlite + 실제 호환 계층)에서 두 충돌 경로를 검사했다.

### 2. Workers 요청 간 Promise 공유

원안의 모듈 전역 릴리스 Promise는 DB 범위가 분리되지 않았고,
미완료 요청의 DB 작업을 다음 요청과 공유했다.

기존 `_runtime_data_cache.js`를 이용해 DB 범위별 **완료된 true 값만 60초 캐시**한다.
실패는 캐시하지 않으며, 진행 중인 Promise·DB 핸들은 저장하지 않는다.
공개 마커가 이후 CMS 수동 OFF를 되돌리지 않는 기존 CAS 로직은 유지한다.

Cloudflare Workers best-practices 검토 기준에 따라 완료 데이터와 요청 소유 I/O를 구분했다.
참고: [Workers 오류 문서](https://developers.cloudflare.com/workers/observability/errors/#cannot-perform-io-on-behalf-of-a-different-request)

### 3. 읽기 화면과 재화 판정의 캐시 분리

CMS 저장 후의 로컬 캐시 무효화는 다른 Workers 인스턴스까지 전달되지 않는다.
따라서 새 캐시는 표시용 조회에 한정하고, 실제 구매·개봉·연성의 관련 설정과 풀은 새로 조회한다.

- 연금술: 화면 bounds/보상 풀 120초. 실제 연성 스냅샷은 fresh.
- 마법카드: status 설정만 30초. 구매·개봉·강화·전투·CMS 설정은 기존처럼 fresh 기본값.
  실제 마법카드 뽑기 풀은 캐시하지 않는다.
- 프라임: 공개 config 설정/풀 120초. 구매·개봉·관리자 조회는 fresh.
- 블랙미라클: CMS 미리보기의 MYTHIC 원시 카탈로그 120초.
  실제 개봉과 저장 직후 응답은 fresh.
- 차량: 공개 config 카탈로그 120초. 설정·실제 뽑기 풀·보유 차량은 fresh.
- 재정금고: champion/events/sources 표시 60초.
  TOP_CLAN_DIVIDEND 예산안 상신은 최신 우승 클랜을 다시 읽어 지급 대상을 고정한다.

관련 CMS 쓰기가 성공한 뒤 캐시를 무효화한다.
읽기 화면은 TTL 범위 내 표시 지연이 가능하다.
기존 다른 설정 캐시 전체를 개편하거나 모든 동시 편집 경합을 해결한 패치는 아니다.

## 유지한 최적화

- 연금술 bounds를 한 번 구해 rewardPool에 주입하여 중복 집계를 제거한다.
- 장비 재료 종류별 LIMIT은 유지한 채 조회를 하나의 DB.batch 호출로 묶는다.
- 지급 가드 SELECT와 DELETE를 지급 batch 끝에 포함하고 SELECT 반환값으로 판정한다.
- 재정금고 클라이언트가 쓰지 않는 ledger 조회와 응답 필드를 제거한다.
  원장 INSERT와 다른 응답 필드는 유지한다.
- 세금 영수증 집계용 인덱스
  `(status, source_type, gross_coin, tax_coin)`를 추가한다.
  실제 인덱스 선택과 성능은 DB 실행 계획에 따라 달라진다.
- SQLite/D1 foundation의 schema/seed batch를 병합한다.
  PostgreSQL의 기존 execSchema + seed batch 분기는 유지한다.
- 차량의 독립 읽기를 Promise.all로 묶는다.
  PostgreSQL 호환 계층은 SQL을 직렬 실행하므로 이를 PG 왕복 3회→1회로 해석하지 않는다.

확률·가격·보상량·밸런스 상수·기능 출시 플래그·유저 잠금 정책은 변경하지 않았다.
클라이언트 JS/CSS/HTML/service worker는 변경하지 않았으므로 캐시 태그도 올리지 않는다.

## 검증

상세 결과와 한계는 `TEST-REPORT-v2062.txt`에 기록했다.

- 성능 테스트: 27/27 통과 (기존 10 + v2062 17).
- 최적화·슈퍼스타팩·PG 호환·희야 자산 통합 검사: 53개 중 51 통과, 실패 0, 라이브 검사 2개 생략.
- v2062 목 DB 워밍 후 호출: 연금술 state 4회, 재정금고 state 3회.
  운영 응답 시간이나 실제 PostgreSQL 네트워크 왕복의 실측값은 아니다.
- 전체 release:gate의 기능 검사 후 최종 운영 배포 안전 검사는
  dirty 작업 트리·배포 폴더의 무시 파일·원격과 다른 로컬 HEAD 때문에 차단된다.
  전체 release:gate 통과로 기록하지 않으며 우회하지 않는다.

## 최적화 커밋 대상 — 14개 파일

```text
functions/_administration_treasury.js
functions/_alchemy.js
functions/_black_miracle_pack.js
functions/_magic.js
functions/_prime_draw.js
functions/_superstar_pack.js
functions/_vehicle_draw.js
package.json
tests/treasury-draw-alchemy-perf-v2062.test.mjs
tests/superstar-pack-batch-v2047.test.mjs
tests/superstar-pack-postgres-v2048.test.mjs
CODEX-COMMIT-v2062.md
PATCH-NOTES-v2062.txt
TEST-REPORT-v2062.txt
```

원안 11개에 기존 슈퍼스타팩 회귀 테스트 2개 파일과
신규 테스트를 release:gate에 영구 포함시키는 package.json 변경을 추가했다.

관련 없는 원본 문서, 폐기 이미지, 후보 이미지 및 다른 프리뷰 파일은 포함하지 않는다.
원본 문서의 후속 과제인 대량 개봉, 연금술 잠금 제거, 세금 비정규화,
영수증·원장 삭제/보존 정책 변경은 수행하지 않는다.

권장 커밋 메시지:
`perf(server): reduce treasury and draw reads safely (v2062)`

이 작업으로 배포하지 않는다.

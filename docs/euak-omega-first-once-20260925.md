# 으악 하이퍼팩 첫 번째 칸 SSS 오메가-X 1회 지정

- 사용자 지시: 으악 계정의 다음 하이퍼팩 **10회 뽑기 첫 번째 칸**에 **SSS 오메가-X(V-021) 1장, 1회** 지정.
- 닉네임 정확 일치 활성 계정 `5010`. 운영 CMS revision `57`에서 V-021 오메가-X·SSS, 하이퍼팩 ON·준비 완료 확인.
- 기존 `euak-nereia-ss-third-20260917-v1` 보장은 2026-09-17 사용 완료(CONSUMED). 진행 중 개봉 없음, 기존 값 비교 후 새 보장을 등록했다. 기존 상태는 감사 로그 before_data에 보존했다.
- 기존 `_mercenary_ss_once.js`의 상태 생성·준비 함수를 사용했다. `rank:SSS`, `mercenaryCode:V-021`, `slotIndex:0`, `batchCount:10`, `status:ARMED`. 지연 회차 없음. 1회 뽑기는 적용·소모하지 않으며 다음 성공한 새 10회 뽑기에 한 번 적용한다. 나머지 9칸·이후 개봉 확률은 기존대로다.
- 계정 DO 잠금·DB mutation 잠금·계정 행 잠금, 기존 상태 비교, 대기 개봉 검사, 감사 로그와 완료 영수증을 단일 트랜잭션으로 사용했다. 코인·보유 용병·CMS·전체 확률·가격·출시 플래그 불변 확인. 실제 뽑기는 실행하지 않았다.
- 관련 검사: `node --test --test-concurrency=1 --test-name-pattern='targeted|failed payment|stale competing' tests/mercenary-ss-once-v2104.test.mjs` **13개 통과**, 실패 0. SQLite/PostgreSQL 지정 칸·SSS·계정 격리, 지급/차감 실패 롤백, 재시도·경합 중복 방지.

## 운영 결과

- 등록: **2026-09-25 04:00:15 KST**.
- 작업 ID: `euak-omega-first-5010-once-20260925`.
- 완료 영수증: `ops:euak-omega-first-once-20260925:v1`.
- 감사 로그: `35724`, `MERCENARY_SS_ONCE_ARMED`, 대상 `5010`.
- 저장 직후 및 별도 읽기 전용 연결에서 ARMED·첫 번째 칸을 재확인했다. 기존 준비 함수 결과 `index:0 / rank:SSS / mercenaryCode:V-021`, 1회 뽑기 준비 결과 null 및 감사 로그 일치 확인.
- 임시 실행 파일과 결과: `C:/Users/User/.codex/tmp/euak-omega-first-20260925/`. 토큰은 매 실행 새로 생성해 5분 만료·지정 액션으로 제한했다. 원격 임시 세션과 계정 잠금은 매 실행 종료 시 정리한다.
- 런타임 변경 없는 기존 운영 설정 등록이다. 이 기록만 범위 커밋하고 게임 전체 검사나 운영 재배포는 하지 않는다.

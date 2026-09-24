# 비쥬얼깡패 하이퍼팩 5번째 칸 SSS 라그니엘 1회 지정

- 사용자 지시: 비쥬얼깡패의 다음 하이퍼팩 **10회 개봉 5번째 칸**에 **SSS 라그니엘(V-046) 1장, 1회** 지정.
- 운영 닉네임 정확 일치 계정 `81`, ACTIVE. 용병 CMS revision `57`에서 V-046 이름 라그니엘·SSS, 하이퍼팩 ON·준비 완료 확인.
- 기존 `visualgangster-vespera-ss-second-20260918-v1` 보장은 2026-09-18 사용 완료(CON­SUMED) 상태였다. 진행 중인 개봉 없음 확인 후 기존 값을 비교하여 새 보장을 등록했다. 사용 완료된 이전 상태는 감사 로그의 before_data에 보존했다.
- 기존 `_mercenary_ss_once.js` 상태 생성·준비 함수를 사용: `rank:SSS`, `mercenaryCode:V-046`, `slotIndex:4`, `batchCount:10`, `status:ARMED`. 1회 개봉에는 적용·소모되지 않고, 성공한 새 10회 개봉에 한 번 적용한다. 나머지 칸과 이후 개봉은 기존 확률이다.
- 계정 DO 잠금·DB mutation 잠금·계정 행 잠금, 기존 상태 값 비교, 대기 개봉 검사, 감사 로그·완료 영수증을 사용했다. 코인·보유 용병·CMS·전체 개봉 확률·가격·출시 설정 불변 확인. 실제 개봉은 실행하지 않았다.
- 관련 검사: `node --test --test-concurrency=1 --test-name-pattern='targeted|failed payment|stale competing' tests/mercenary-ss-once-v2104.test.mjs` **13개 통과**. SQLite/PostgreSQL 지정 칸·SSS·계정 격리, 정상 확률·결과 순서, 차감/지급 실패 롤백, 재시도·경합 중복 방지.

## 운영 결과

- 등록: **2026-09-25 02:20:14 KST**.
- 작업 ID: `visual-ragniel-fifth-81-once-20260925`.
- 완료 영수증: `ops:visual-ragniel-fifth-once-20260925:v1`.
- 감사 로그: `35706`, `MERCENARY_SS_ONCE_ARMED`, 대상 `81`.
- 별도 읽기 전용 연결에서 ARMED·SSS·V-046·5번째 칸 확인. 실제 준비 결과 `index:4 / rank:SSS / mercenaryCode:V-046`, 1회 개봉 준비 결과 null. 감사 로그 일치.
- 원격 임시 실행 파일과 결과: `C:/Users/User/.codex/tmp/visual-ragniel-fifth-20260925/`. 짧은 만료 토큰과 액션 제한을 사용하고 매 실행 후 세션·계정 잠금을 해제했다.
- 런타임 변경 없는 기존 운영 설정 등록으로 완료했다. 이 기록만 범위 커밋하며 사이트 재배포나 전체 게임 검사는 하지 않는다.

# 폐인·우승청부사 칭호

## 확정 내용

- 폐인: 활성 공개 카드 도감 100%와 차량 도감 90% 이상, 장착 시 전체 전투력 +50,000.
- 우승청부사: 서로 다른 공식 트로피 4종 수집, 장착 시 전체 전투력 +75,000.
- 전용 투명 문장과 색상을 칭호 화면·공용 닉네임 배지·명함·CMS에 적용한다.
- 기존 칭호의 PVE/PVP 보너스 경로를 사용한다. 두 칭호를 소유해도 장착한 하나의 보너스만 적용한다.
- 기존 0 전투력 등록값은 별도 일회성 marker로 갱신한다. 두 수치와 완료 marker를 같은 배치로 저장하며 소유·장착 기록은 변경하지 않는다. 이후 CMS 수정값을 재배포로 덮어쓰지 않는다.

## 검증과 범위

- 신규 칭호 구현: 업적·명함·장비 로딩·챌린저 관련 39개 검사 통과, CMS 조건 변경 중 지급 방지 회귀 추가 확인.
- 후속 전투력 지정: `tests/achievement-titles-20260927.test.mjs`, `tests/equipment-loading.test.mjs` 17개 통과. SQLite/PostgreSQL 기존 설치 갱신, 두 번째 쓰기 실패 시 롤백, 응답 유실 후 재시도, CMS 값 보존 및 장착·교체·해제 시 PVE/PVP 보너스를 확인했다.
- 공통 출시 검사에서 발견된 두 슈트 테스트의 고정 카탈로그 fixture도 새 power marker를 포함하도록 맞췄다. 기존 슈트와 무기 보너스·PVP 제외 검증은 유지한다.
- PC 1280×900, 모바일 391×844에서 실제 게임 칭호 렌더러의 +50,000/+75,000 표시와 장착 전환을 확인했다. 스크린샷은 `C:/Users/User/.codex/worktrees/qa-achievement-titles-20260927/desktop-power.png`, `mobile-power.png`에 보존한다.
- 전투력 지정은 두 칭호의 카탈로그 값과 기존 등록값 보정에 한정된다. DB 스키마·인증·공통 전투 계산은 변경하지 않는다. 해당 변경의 배포는 관련 검사와 Worker 컴파일을 포함한 `npm run deploy:production -- --scoped`를 사용한다.

## 운영 반영 기록

- 사용자 후속 지시에 따라 무관한 전체 검사 반복을 중단하고, 완료한 관련 검사를 바탕으로 공동 변경을 `npm run deploy:production -- --scoped`로 운영 반영했다.
- 직전 운영 기준: `06b82dd4c0e07fafeb0773d730513caa2367a75b` / 배포 `e24ab388-c4af-4c99-b50f-f15169acee5f`.
- 운영 배포 SHA: `2bcb7bf82198ec636af58a4cb028306aa6d07fc3`. 칭호 전투력 변경과 fixture 보정 커밋 `01a62e61d8fb79fa7cec2e929adc993bccbeeeb3`을 포함한다.
- 배포 ID: `2f9d4113-6c98-4a33-bff9-d0874bd92b6d`, URL: `https://2f9d4113.cnine-card.pages.dev`.
- 2026-09-27 23:53 KST 운영 확인: 프리뷰 JS·공용 칭호 CSS·두 로고가 HTTP 200이며 로컬 SHA-256과 일치했다. 실제 운영 CMS에서도 폐인 50,000, 우승청부사 75,000을 확인했다.
- 검증 기록: `C:/Users/User/.codex/worktrees/qa-achievement-titles-20260927/production-power-verification.json`. 배포 후 기록만 추가한 문서 커밋은 재배포하지 않는다.

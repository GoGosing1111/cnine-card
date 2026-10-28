# 제너럴 족 용병 레벨 성장 복구 — 2026-10-28

사용자 요청: “제너럴족 용병레벨 강화 되나안되나 봐봐” → “용병레벨 올라가게 풀어”.

운영 성장 정책은 ON·r1이나 서버 levelCatalog에서 V-974가 누락되어 보유 카드가 성장 목록에 나타나지 않고 강화·돌파 요청이 MERCENARY_LEVEL_RANK로 거절됐다. 제너럴 족의 기존 배포 스냅샷을 성장 목록에 추가했다. 공통 리미티드 성장/경험치/돌파 정책, 보유 조건, 원본 1장 보호와 거래 처리는 그대로 적용된다. 운영 계정 직접 수정은 없다.

검수 범위: 제너럴 족의 SQLite·PostgreSQL 강화/돌파/전투 성장 반영, 중복 요청과 실패 원복, 보유·등급·원본 보호, 경험치 이전 양방향 및 인접 프라임/은설 회귀. 관련 서버 검사 15개(제너럴 족 5개·프라임 5개·은설 5개)를 scoped 배포에서 실행해 모두 통과했다. PC 1440px·모바일 390px 실제 성장 UI에 격리 API를 연결해 SSS 재료 강화 Lv.1→2, 원화·이름·리미티드 요구 경험치×5·새로고침 유지·오류/넘침 없음을 확인했다. 브라우저는 음소거했다.

배포: npm run deploy:production -- --scoped. 실제 직전 배포 SHA·검사 선정·배포 결과·운영 Worker 확인은 completion.json과 아래 증거에 기록한다. 소스만 수정하며 운영 성장·보유·재화·CMS 설정을 직접 쓰지 않는다.

증거: C:/Users/User/Downloads/upload/cnine-card/operations/general-jok-level-20261028/
수정 전 진단: C:/Users/User/Downloads/upload/cnine-card/operations/general-jok-level-check-20261028/
기존 체크아웃 재사용. 별도 저장공간 유지관리·예약·이전 지급 재실행 없음.

## 운영 반영 완료

- 소스 5ce6a5bc4c06c1c80cd87521a3d85d46654ac8e0 · Pages 845f2cf7-0328-4a47-ab41-8e92e1213776 · 완료 2026-10-28T14:57:04.538Z.
- api-runtime의 실제 배포된 levelCatalog에 GENERAL_JOK_CODE가 포함된 것을 확인했다. API/클랜 두 Worker 모두 새 버전 100% 반영.
- 독립 READ ONLY 확인: 성장 정책 r1 ON·CMS r61·기존 두 계정의 제너럴 족 보유/성장 값 보존 여부는 completion.json의 comparison에 기록했다. 운영 계정/재화/설정 직접 쓰기 0건.
- 기존 리미티드 경험치 ×5, 같은 등급 재료, 원본 1장 보호, 돌파·이전 물약 규칙을 유지한다. 사용자 실제 강화는 재접속한 성장 화면에서 정상 이용한다.

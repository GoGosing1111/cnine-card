# 제너럴 족 용병 레벨 성장 복구 — 2026-10-28

사용자 요청: “제너럴족 용병레벨 강화 되나안되나 봐봐” → “용병레벨 올라가게 풀어”.

운영 성장 정책은 ON·r1이나 서버 levelCatalog에서 V-974가 누락되어 보유 카드가 성장 목록에 나타나지 않고 강화·돌파 요청이 MERCENARY_LEVEL_RANK로 거절됐다. 제너럴 족의 기존 배포 스냅샷을 성장 목록에 추가했다. 공통 리미티드 성장/경험치/돌파 정책, 보유 조건, 원본 1장 보호와 거래 처리는 그대로 적용된다. 운영 계정 직접 수정은 없다.

검수 범위: 제너럴 족의 SQLite·PostgreSQL 강화/돌파/전투 성장 반영, 중복 요청과 실패 원복, 보유·등급·원본 보호, 경험치 이전 양방향 및 인접 프라임/은설 회귀. 최종 관련 서버 검사는 scoped 배포에서 실행한다. PC 1440px·모바일 390px 실제 성장 UI에 격리 API를 연결해 SSS 재료 강화 Lv.1→2, 원화·이름·리미티드 요구 경험치×5·새로고침 유지·오류/넘침 없음을 확인했다. 브라우저는 음소거했다.

배포: npm run deploy:production -- --scoped. 실제 직전 배포 SHA·검사 선정·배포 결과·운영 Worker 확인은 completion.json과 아래 증거에 기록한다. 소스만 수정하며 운영 성장·보유·재화·CMS 설정을 직접 쓰지 않는다.

증거: C:/Users/User/Downloads/upload/cnine-card/operations/general-jok-level-20261028/
수정 전 진단: C:/Users/User/Downloads/upload/cnine-card/operations/general-jok-level-check-20261028/
기존 체크아웃 재사용. 별도 저장공간 유지관리·예약·이전 지급 재실행 없음.

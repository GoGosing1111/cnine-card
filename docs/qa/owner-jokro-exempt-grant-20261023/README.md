# OWNER 족로 수량 미차감 지급 — 2026-10-23

사용자 후속 요청 “족로도 지급해 차감없이”를 직전 진무 지급 대상인 비숑 및 Inception OWNER 계정에 적용했다.

2026-10-23 07:23:10 KST에 운영 DB 지급 완료 및 별도 연결 재검증.

| 계정 | ID | 확인 권한 | 지급 | 보유 전 → 후 |
| --- | --- | --- | --- | --- |
| Inception | 2 | ACTIVE / OWNER | 족로(V-979) 1장 | 0 → 1장 |
| 비숑 | 5663 | ACTIVE / OWNER | 족로(V-979) 1장 | 0 → 1장 |

소문자 inception(ID 4779, USER)은 제외했다. 족로 한정 수량 2장, 발행 수량 1장, 잔여 수량 1장을 유지했다. 한정 발행 기록·제작 횟수·재화·다른 카드·인벤토리·레벨·성장·편성·팩 설정은 보존했다. 앞선 진무 지급은 재실행하지 않았다.

작업 키: `ops:owner-jokro-exempt-grant:20261023:v1`. 감사 로그 **50376**. 카드 획득 기록 2건 및 완료 영수증을 동일 거래에 저장했다. USER_LOCK과 DB 임대/행 잠금 아래 실패 주입 전체 롤백, 정상 지급 롤백, 재실행 무쓰기 및 별도 연결 재검증을 통과했다.

운영 사용 허용 목록에 두 계정이 빠져 있어 `shared/mercenary-jokro-v1.mjs`에 ID 2·5663만 추가했다. 실보유 검증과 다른 계정 차단을 유지한다. 기존 관련 회귀에 두 OWNER와 동명 USER를 포함해 도감·편성·PVE/PVP·랭킹·성장·한정 수량 보존을 확인한다. 운영 반영 결과는 완료 후 production.json에 기록한다.

지급 원본은 `scripts/ops/owner-jokro-exempt-grant-20261023.mjs` 및 같은 이름의 JSON이다. 지급 영수증은 receipt.json, 검증 기록은 dry-run.json 및 verification.json, 이전 운영 접근 조건은 access-before.json에 보존한다.

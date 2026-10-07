# 리페어 복구 장비 장착 오류 수정 — 2026-10-08

리페어 사용 후 장비 목록에는 +8 장비가 있지만, 장착하면 `장착할 장비를 찾을 수 없습니다.`가 표시되는 사용자 제보를 수정한다.

## 원인과 수정

- 장착 API가 인스턴스 번호를 `cleanInt(..., 1, 2147483647)`로 강제 보정했다. 실제 운영 DB의 최신 장비 번호는 읽기 전용 PK 조회 당시 `2150549336`으로 이미 그 한도를 넘었다. 복구나 신규 지급으로 생성된 장비를 다른 번호로 조회하던 오류다.
- 숫자 또는 10진수 문자열의 양의 안전 정수를 그대로 조회한다. 소수·음수·배열·불리언·부정확한 큰 정수는 400으로 거부한다. 소유권·활성 장비 확인과 기존 슬롯 저장은 유지한다.
- 기존 복구 장비·강화 단계·재화·쿠폰·영수증을 변경할 필요가 없다. 이미 복구한 장비를 다시 장착하면 된다. 복구 거래와 UI 파일은 변경하지 않는다.

## 검증과 배포 범위

- 수정 전 격리 SQLite의 실제 강화 파괴 → 리페어 복구 → 장착 경로에서 404를 재현했다.
- `tests/equipment-repair-equip-20261008.test.mjs`: SQLite/PostgreSQL에서 +8 방어구 복구 후 큰 번호 장착, 강화 전투력, 중복 복구 방지와 단 한 번의 비용 차감, 일반/경계 번호, 타인 소유·미보유·비활성·비로그인 차단, 잘못된 번호 거부를 확인한다.
- `tests/equipment-enhanced-inventory-20260923.test.mjs`: 강화된 개별 장비의 목록·장착 표시·수량 회귀.
- 서버의 장비 번호 파싱에 한정된 작은 수정으로 `npm run deploy:production -- --scoped`를 사용한다. Worker 컴파일·기존 출시 게이트·캐시·Hyperdrive 보호 검사는 유지한다.
- 직전 실제 운영 커밋: `2897e15a3bb05e224caf0c7e91a5d6ccf74af72e`, Pages `325131ea-4d8d-40df-a35a-9b6b34d88e73`.
- 운영 조회는 `BEGIN READ ONLY`와 5초 제한을 적용한 최신 PK 1건이다. 실계정의 쿠폰 소모·장착 변경은 하지 않았다.
- 외부 검수 증거: 작업 트리 상위 `equipment-repair-repro.log`, `equipment-repair-equip-test.log`, `qa-equipment-repair-equip/production-baseline.json`. 최종 검사는 지정 배포 과정에서 기록한다.

## 운영 반영 완료

- 배포 커밋: `adc0b9f9baf0c69723f385a7ed680c96d97c9520`. 관련 회귀 10개와 Worker 컴파일, 출시·Hyperdrive 검사를 통과하고 지정 scoped 명령으로 1회 배포했다.
- Pages: `24cfb234-bfc5-49ae-a171-2e3626725425` / `https://24cfb234.cnine-card.pages.dev`.
- API Worker: `721256cc-a8bc-40d0-b9c3-f3dfe841e996`.
- 2026-10-08 03:36 KST: 운영 canonical 커밋 일치, 배포된 Worker의 수정된 번호 처리 함수와 장착 경로 연결, 기존 32비트 강제 보정 제거, `/api/health` 200을 확인했다. 배포 코드의 함수 자체도 큰 번호·문자열 번호·잘못된 입력으로 확인했다.
- 배포 로그: 작업 트리 상위 `equipment-repair-equip-deploy.log`. 운영 증거: `qa-equipment-repair-equip/production-proof.json`, `equipment-repair-equip-production.log`.
- 유저 안내: 새로고침 후 이미 복구된 장비를 다시 장착한다. 리페어 쿠폰을 다시 사용할 필요가 없다.

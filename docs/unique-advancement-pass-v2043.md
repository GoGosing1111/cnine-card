# 전직 패스권

- 코드: `UNIQUE_ADVANCEMENT_PASS`, 이름: 전직 패스권.
- 보유 시 카드 상세 → 고유효과 전직에서 1개 자동 사용, 100% 성공.
- 기본 조건은 그대로: FUR / ZENITH / SUPERSTAR, +13 이상, 보유·활성 고유효과, 미전직 카드. 마스터의 별 3,000개 별도 소모.
- 패스권 미보유 시 기존 성공률 10%와 실패 시 재료 소모 규칙 유지.
- 인벤토리 단독 개봉은 불가. CMS 유저관리 → 인벤토리 아이템 지급에서 운영자가 지급 가능. 이 변경으로 계정 지급·상점 판매·드랍풀 추가는 하지 않음.

## 안전 계약

- 상태 API의 `config.successChancePercent`는 기본 확률 10%를 유지하고, `advancementPass.quantity`와 `effectiveSuccessChancePercent`로 패스권 수량 및 적용 확률을 전달한다.
- POST의 `expectedPassUse`는 확인 화면의 사용 여부다. 서버가 현재 보유 수량으로 다시 검증하며 사용 여부를 임의로 고르는 옵션이 아니다.
- 패스권 보유 상태가 확인 시점과 달라지면 409 `ADVANCEMENT_PASS_STATE_CHANGED`로 차감 없이 재확인. 구버전 클라이언트도 패스권 보유 시 먼저 새로고침 필요.
- 전직·마별·패스권·영수증·두 종류의 재료 로그를 하나의 트랜잭션으로 확정한다. 조건부 지급/차감 0행도 검증 실패로 전체 취소한다.
- 패스권 감사 로그: `reference_type=UNIQUE_ADVANCEMENT_PASS`, `reference_id=cardId:requestId`, `change_amount=-1`. 마별 로그는 기존 `UNIQUE_ADVANCEMENT` 유지.
- 완료 요청 재전송은 저장된 영수증 응답을 반환하며 추가 소모하지 않는다.

## 검증

`npm run test:unique-advancement`에 기본 전직·패스권·UI·전투 전달 회귀를 포함하고 운영 `release:gate`에서도 실행한다. 실제 PostgreSQL 검증은 임시 테이블만 사용하고 전부 롤백한다.

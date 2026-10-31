# 오승환이다 레오넬 한도 예외 지급 — 2026-10-31

**운영 완료: 2026-10-31 22:37:14 KST · 감사 53426**.

사용자 “오승환이다 계정에 레오넬 한도차감없이 지급해”에 따라 **오승환이다 ID16에 레오넬 V-978 / SSS LIMITED 1장**을 영구 직접 지급했다. 보유 **0→1**, 기본1레벨이다.

- 팩 한도12/발행12/잔여0, 큐브 한도5/발행5/잔여0 그대로 유지. 새 한정 시리얼0, 제작 집계 차감0.
- 기존 코인/재화·다른 카드·인벤토리·성장·PVE/PVP 편성·정책 보존, collection 동기화 버전 증가.
- 별도 READ ONLY 연결에서 실계정 보유/원장/감사/한도 확인. 실제 mercenaryAccountState·rankedOwnedMercenaries·성장 목록·PVE/PVP 선택 함수에서 레오넬 접근 확인.
- 관련4검사: 정확한1장/자산·한도 보존, 최종 실패 전체 롤백, 기보유 가산 시 성장/첫획득 보존, 계획/신원/잠금 보호. 실제 두 잠금에서 실패/정상 예행연습 원복 후 단일 거래 확정, SELECT 전용 재실행 추가쓰기0, 잠금 반환.
- 자동 편성·메시지·게임 재배포·예약·저장공간 유지관리 없음. 기존 작업 폴더/의존성 재사용·Git 자동정리 OFF.

완료 키: `ops:ohseunghwan-leonel-exempt-grant:20261031:v1`. 같은 요청을 새 키로 반복 지급하거나 이후 정상 성장을 덮지 않는다.
획득 ID: `ops:ohseunghwan-leonel-exempt-grant:20261031:v1:16:V-978:1`.
계획 SHA-256: `b6600b7459ccbaa8095edc1f03fd8bbfe4e7312c7c107f320cc3e65dffc509e3`. 실행 파일 집합 SHA-256: `080379df014c59bf8352edd6a0ad0f7e79dc4eac893172934dce3b710a7221e1`.
계획 plan.json, 완료 completion.json, 독립조회 independent.json, 전후 스냅샷/검증 evidence/ 보존.

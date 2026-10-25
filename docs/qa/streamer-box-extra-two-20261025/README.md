# 추가 명단 Mild7·심심이 스트리머 박스 — 2026-10-25

사용자 `Mild7 심심이 추가명단 2개씩 지급`에 따라 정확히 일치하는 ACTIVE 게임 계정 **Mild7 ID290, 심심이 ID4933**을 인증 지문으로 확인했다.

**18:51:01 KST, 두 계정에 각 2개씩 총 4개 지급 완료.** 기존 `REVERSECALL_STREAMER_GIFT_BOX` / 리버스콜 스트리머 선물을 미개봉 상태로 각 인벤토리에 가산했다. 감사 ID `51262`, 일회 키 `ops:streamer-box-two-extra:20261025:mild7-simsimi:v1`이다.

- 앞서 완료한 37명·74개 지급은 재실행하지 않았다. 다방커피 제외도 유지한다. 이번 추가 명단까지 해당 요청의 누적 지급은 39명·78개다.
- 자동 개봉·직접 코인 지급·메시지 발송 없이 기존 지갑·다른 아이템·상품 구성·기존 보유를 보존했다. 내부 감사는 `actor: CODEX_OPERATIONS`, `OPS_STREAMER_BOX_EXTRA_TWO_GRANT`로 남겼다.
- 고정 계획 SHA-256: `c0f54dbbae308ac43dd70d115678b2e01cae6c00a246aa9f555cfa2d66da8a19`. 실제 USER_LOCK과 PostgreSQL 보조 잠금을 두 계정에만 확보하고 원장 2건·감사·완료 영수증과 인벤토리 가산을 한 거래로 처리했다. COMMIT 직전 잠금 확인과 완료 후 해제도 확인했다.
- PostgreSQL 호환 검사 4개 통과: 정확한 수량·다른 계정/재화 보존·기존 수량 가산, 쓰기 실패 시 전체 원복, 계정/인증/아이템/계획/잠금 오류 차단, 위험 수량·고아 원장 방지. 완료 후와 유저 개봉 후의 재실행은 추가 쓰기 없이 영수증만 확인한다.
- 운영 실패 주입·정상 dry-run 모두 원복했다. 실제 지급 후 독립 READ ONLY 연결에서 2명·4개·누락/중복 0 및 SELECT 전용 재실행을 확인했다. 웹/워커 실행 파일 재배포는 없다.

고정 명단·코드는 `scripts/ops/streamer-box-extra-two-20261025.*`, 집계 증빙은 `verification.json`이다. 계정별 전후 수량/원장 ID는 내부 영수증과 `C:/Users/User/.codex/visualizations/2026/10/25/01a170fb-166f-7250-a2e6-d351c185e8ee/streamer-box-extra-two-20261025/operation/`에 보존한다. 같은 지급 요청에 새로운 키를 만들어 재지급하지 않는다.

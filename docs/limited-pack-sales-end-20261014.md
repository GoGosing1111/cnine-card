# 용병 리미티드팩 판매 종료 — 2026-10-14

사용자 요청 `리미티드 하이퍼팩 판매 종료 관련 API 차단`, 대상 확인 최종 답변 **`용병 리미티드팩만`**.

- 2026-10-14 22:51:29 KST 운영 `mercenary_limited_pack_v1`을 ON(r17) → OFF(r18)로 저장했다. 하이퍼팩(`hyper`) ON(r1)과 멤버 카드 리미티드팩(`pickup`) 활성 상태는 유지했다.
- 기존 `POST /api/mercenary-limited-pack/open` 서버 검증을 사용한다. 1회·10회·자동 개봉이 같은 경로를 호출하며, 신규 요청은 `409 MERCENARY_LIMITED_DISABLED`로 거절한다. USER와 OWNER 모두 적용된다. 차감 전 PENDING 요청은 설정 변경으로 취소하며 이미 결제 완료된 영수증 조회·동일 요청 재생은 보존한다.
- 구매가 차감 전에 공유 잠금을 잡는 동일 설정 행에 배타 잠금을 사용했다. 설정 변경·감사 로그·일회 영수증을 한 거래로 저장하고 가격·확률·발행량·다른 팩 설정을 변경하지 않았다. 운영 dry-run 원복, 실제 한 번 반영, 재호출 무변경과 별도 DB 연결 확인을 완료했다.
- 영수증 `ops:limited-pack-sales-end:20261014:v1`, 감사 로그 `46159`. 영구 운영 기록은 `docs/limited-pack-sales-end-20261014.json`이다.
- 관련 검사 `node --test tests/limited-pack-sales-end-20261014.test.mjs` 통과: dry-run/감사 저장 실패 롤백, 반복 실행, USER/OWNER 직접 개봉 차단, 미결제 재시도 차단, 확정 영수증 복구, 잔액·발행량 보존, 하이퍼팩 ON 유지.
- 운영 공개 API 확인: limited config는 OFF(r18)·`userOpeningEnabled=false`, 상점 목록은 limited의 `drawEnabled=false`·`ownerDrawEnabled=false`, hyper feature와 상점은 개봉 가능, pickup은 활성 유지. 실계정 구매 요청을 발생시키지 않고 실제 경로의 차단은 관련 회귀 검사로 확인했다.
- 게임 실행 코드·스키마 변경 없이 기존 CMS 스위치가 즉시 반영되는 운영 설정 작업이다. 관련 검사와 범위 커밋·원격 반영으로 종료하고 사이트 재배포·전체 검사는 실행하지 않는다.

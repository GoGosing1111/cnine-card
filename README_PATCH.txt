CNINE draw_request_receipts 테이블 누락 수정 v9.66

정확한 원인:
- draw_request_receipts 생성 SQL이 기존 safe_runtime_upgrade_v848 블록 안에 들어감
- 운영 DB에는 이미 safe_runtime_upgrade_v848=1이 저장되어 있음
- ensureUpgrades()가 해당 지점에서 즉시 return
- 신규 테이블 생성 없이 카드 개봉 API가 SELECT를 실행하여
  D1_ERROR: no such table: draw_request_receipts 발생

수정:
- 신규 안전 마커 safe_runtime_upgrade_v964_draw_receipts 추가
- 기존 v848 완료 여부와 무관하게 CREATE TABLE IF NOT EXISTS 실행
- 인덱스도 CREATE INDEX IF NOT EXISTS로 안전 생성
- 카드 개봉 요청 직전에도 테이블 존재를 방어적으로 보장
- 기존 데이터, 카드, 유저, API 구조 삭제/변경 없음

적용:
프로젝트 루트에 functions 폴더만 덮어쓴 뒤 재배포하세요.
첫 API 요청 시 테이블이 자동 생성됩니다.

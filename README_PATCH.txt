CNINE 유저 개방형 레이드 v9.78

기준: v9.76 세션 유지 버전

주요 기능
- CMS 레이드 설정 저장 버튼 오류 수정: admin/raid에서 body를 실제로 읽도록 수정
- 저장 후 GET 재조회 검증
- 보스별 유저 개방 허용/차단
- 보스별 개방 코인 비용
- 유저가 개방하면 자동 참가
- 전체 서버 동시 레이드 1개
- 모든 유저 KST 기준 하루 입장 1회
- 성공/실패/중도 종료와 관계없이 당일 재입장 불가
- 실패 시 코인 환불 없음
- CMS 허용 보스만 유저 화면 노출
- OWNER 수동 시작 기능 유지

D1 안전
- CREATE TABLE IF NOT EXISTS만 사용
- raid_daily_entries 신규
- raid_open_requests 신규
- DROP/RENAME/기존 데이터 삭제 없음
- 카드점수 랭킹/PvP/보유 카드 변경 없음

적용
functions/, admin/, js/, index.html 덮어쓰기

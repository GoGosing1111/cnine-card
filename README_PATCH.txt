CNINE PvP 시즌 자동 종료/정산 안정화 패치

포함 파일
- functions/api/[[path]].js

적용 내용
- endsAt 도달 즉시 상대 검색과 PvP 전투 차단
- startsAt 이전 전투 차단
- config/ranking 응답에 실제 시즌 상태 ACTIVE/SCHEDULED/ENDED 반영
- 시즌 종료 첫 요청에서 최종 랭킹 스냅샷 생성
- 종료 후 랭킹 화면과 랭킹 보상은 고정 스냅샷 기준
- OWNER/ADMIN은 랭킹 및 랭킹 보상 대상 제외 유지
- 종료 후에도 전적/랭킹/보상 수령 가능
- 티어 보상 중복 수령 방지 유지
- 기존 테이블 삭제/변경 없음
- 신규 pvp_season_rank_snapshots 테이블은 CREATE TABLE IF NOT EXISTS로만 생성

적용 방법
프로젝트 루트에 functions 폴더를 덮어쓴 뒤 Cloudflare Pages 재배포.

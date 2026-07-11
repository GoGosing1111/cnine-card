# v9.0.7.1 Attendance / PvP Hotfix

- 운영 D1에서 `streak_day` 컬럼이 누락된 원인 수정
- 이미 사용된 v874 마이그레이션 마커 재사용 문제 해결
- 실제 스키마를 검사하는 신규 안전 마이그레이션 추가
- 티어 관리 CMS의 누락된 `pvpWinCoin`, `pvpLoseCoin` 입력 필드 추가
- 구버전 HTML 캐시와 신버전 JS가 섞여도 null 오류가 나지 않도록 방어 처리
- 신규 DB 출석 기본 보상 1000 및 `streak_day` 스키마 반영
- DROP / RENAME / 기존 데이터 삭제 없음

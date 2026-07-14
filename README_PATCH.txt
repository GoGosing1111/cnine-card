CNINE PvP 정산 Cloudflare 빌드 수정 v9.69

원인:
- 정산 POST 로직이 한 줄로 과도하게 압축된 중첩 try/for 구조라 Cloudflare esbuild에서 구문 분석 실패
- last_insert_rowid()를 D1 batch 안에서 연결하던 방식도 불안정

수정:
- 정산 POST 블록 전체를 명확한 다중 행 구조로 재작성
- 보상 메시지 INSERT 결과의 meta.last_row_id를 직접 사용
- 메시지와 보상 연결 후 건수 재검증
- 보상 메시지 전부 준비된 뒤에만 pvp_profiles 시즌 기록 초기화
- 카드점수 랭킹/보유 카드/카드 데이터 쿼리 없음
- DROP/RENAME/DELETE 없음

검증:
- node --check 통과
- esbuild 구문 분석 통과
- ZIP 무결성 검사 통과

적용:
프로젝트 루트에 functions 폴더만 덮어쓴 뒤 재배포하세요.

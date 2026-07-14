CNINE PvP 수동 시즌 정산 v9.68

안전 원칙
- 카드점수 랭킹, cards, user_cards, 보유 카드, 돌파 데이터 미수정
- DROP/RENAME/기존 테이블 재생성 없음
- 신규 CREATE TABLE IF NOT EXISTS만 사용
- PvP OFF 상태에서만 정산 가능
- 시즌명 재입력 확인
- 스냅샷/메시지 검증 완료 후에만 pvp_profiles 초기화
- 동일 시즌 중복 정산 및 중복 메시지 차단
- 기존에 직접 수령한 보상은 정산 메시지에서 제외

정산 순서
1. 최종 PvP 순위 스냅샷 저장
2. 스냅샷 건수 검증
3. 코인/카드조각 보상 메시지 생성
4. 메시지 수 검증
5. pvp_profiles 시즌 점수/최고점수/승패만 초기화
6. 초기화 결과 검증
7. 정산 완료 기록

추가 CMS 항목
- 시즌 영문 타이틀
- 시즌명
- 시즌 설명
- 상태 문구
- 정산 미리보기
- 시즌 정산 실행

적용 파일
- functions/api/[[path]].js
- admin/index.html
- admin/admin-v968.js
- admin/admin-v945.css
- js/app.js
- index.html

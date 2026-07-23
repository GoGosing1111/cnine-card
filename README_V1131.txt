CNINE CARD V1131 - D1 STORAGE GROWTH FIX

적용 기준
- cnine-card(33).zip 최신본 기준
- 기존 DB 테이블/컬럼/데이터 DROP, RENAME, 재생성 없음
- 수정 파일만 포함

수정 내용
1. draw_logs 기록 제한
- 일반/고급/프리미엄 팩의 C~FUR 결과는 draw_logs에 저장하지 않음
- 큐브 개봉도 LIMITED 획득 시에만 draw_logs 저장
- 관리자 리미티드 지급/복구 기록은 유지
- 카드 진화 MA 결과의 draw_logs 기록 제거
- 실제 카드 보유/수량/돌파는 user_cards에서 계속 정상 저장

2. draw_request_receipts 용량 폭증 수정
- response_json에 전체 유저 도감/보유량/돌파/설정 스냅샷 저장 금지
- 영수증에는 카드 결과/지급 증명/무결성 정보만 저장
- 정상 최초 응답은 기존과 동일하게 전체 user profile 반환
- 동일 request_id 재호출 시 최신 user profile을 DB에서 다시 붙여 반환
- APPLIED 복구 및 지급 검증 구조 유지

3. 자동 경량 정리
- 카드뽑기 완료 요청 중 일부에서 확률적으로 1시간 지난 COMPLETED 영수증 response_json을 최대 50건 NULL 처리
- request_id, user_id, status, cost, created_at 등 중복 지급 방지 핵심 정보는 유지

검사
- functions/api/[[path]].js JavaScript 문법 검사 완료
- functions/_evolution.js JavaScript 문법 검사 완료

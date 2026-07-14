CNINE 자동 개봉·랜덤 크리티컬·안전 처리 통합본 v9.67

포함 기능
- 카드팩 자동 개봉
- 크리티컬 서버 랜덤 판정
- CMS 크리티컬 사용 여부/확률/보너스/이펙트 설정 사용
- 연타 입력 및 최소 연타 조건 제거
- 카드 뽑기 requestId 중복 결제 방지
- 카드 지급 실패 시 코인 환불
- 실패한 LIMITED 예약 수량 복구
- 카드 개봉 중복 클릭 방지
- 일일퀘스트 카드조각 표시 보존
- draw_logs 코인 사용량 중복 기록 수정
- draw_request_receipts 테이블 자동 생성
- 신규 안전 업그레이드 마커:
  safe_runtime_upgrade_v964_draw_receipts

적용
프로젝트 루트에 아래를 그대로 덮어쓰세요.
- functions/
- js/
- index.html

검증
- functions/api/[[path]].js node --check 통과
- js/app.js node --check 통과
- ZIP 무결성 검사 통과

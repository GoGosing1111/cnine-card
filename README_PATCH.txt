CNINE 최신 통합본 v9.72

이 파일을 이후 작업의 단일 기준본으로 사용하세요.

통합 기능
- 자동 카드 개봉
- CMS 설정 확률 기반 랜덤 크리티컬
- 유저 문구: 크리티컬은 일정 확률로 발동됩니다.
- 카드 뽑기 requestId 중복 결제 방지
- draw_request_receipts 안전 자동 생성
- 카드 지급 실패 시 코인 복구
- 실패한 LIMITED 예약 수량 복구
- 일일퀘스트 카드조각 표시 보존
- PvP 시즌 점수 전용 매칭 및 점수표
- PvP 상대 카드 NaN 수정
- PvP 수동 시즌 정산 CMS 및 서버 처리
- PVE 최근 몬스터 자동 선택/스크롤/커서 유지

적용 파일
- functions/
- admin/
- js/
- index.html

보호 사항
- 카드점수 랭킹 수정 없음
- 보유 카드 및 카드 돌파 데이터 삭제 없음
- DROP TABLE / RENAME TABLE 없음
- 기존 테이블 재생성 없음

검증
- 모든 JavaScript node --check 통과
- Functions esbuild 파싱 통과
- 통합 기능 검사 통과
- ZIP 무결성 검사 통과

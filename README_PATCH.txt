CNINE 코인·카드조각 안전 패치 v9.64

확인된 문제
1. 일일퀘스트 보상 API는 card_shards를 반환했지만 화면은 cardShards만 읽어
   로컬 카드조각 표시가 0으로 덮일 수 있었습니다. 실제 D1 값은 남아 있어도
   유저 화면에서는 사라진 것처럼 보일 수 있었습니다.
2. 카드 뽑기는 요청 고유번호와 전체 중복 잠금이 없어 지연 중 재클릭 시
   두 요청이 각각 결제될 수 있었습니다.
3. 코인 차감 뒤 카드 지급 배치가 실패하면 자동 복구가 없었습니다.
4. draw_logs의 coin_used가 뽑힌 카드 모든 행에 전체 비용으로 기록됐습니다.

수정
- 일일퀘스트 수령 후 profile() 전체 응답
- 프런트가 cardShards / card_shards 모두 안전하게 인식
- 카드 뽑기 requestId 중복 처리 방지
- 완료 요청 재전송 시 기존 결과 반환
- 발급 실패 시 차감 코인 자동 환불
- 실패한 LIMITED 예약 issued_count 자동 복구
- 카드 개봉 중복 클릭 전역 잠금
- draw_logs coin_used는 뽑기 그룹 첫 행에만 전체 비용 기록
- coin_logs를 카드 지급 D1 batch에 포함
- D1 파괴 변경 없음

포함 파일
- functions/api/[[path]].js
- js/app.js
- index.html

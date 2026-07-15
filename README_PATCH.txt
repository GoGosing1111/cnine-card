CNINE 레이드 서버 확정 보상 표시 v9.80

해결 대상:
- 실제 보상에 5,000코인이 없는데 결과 화면에 +5,000이 잠깐 표시되는 문제
- 레이드 개방 비용과 보상 설정값이 화면 계산에 섞일 가능성
- 설정 캐시값으로 보상을 미리 계산하는 구조

수정:
- raid/status 서버가 참가자별 claimableReward를 계산하여 반환
- 결과 화면은 claimableReward만 표시
- 프런트에서 participationCoin / clearCoin / rewardShards 직접 계산 제거
- 서버 확정값이 없으면 보상 숫자를 표시하지 않고 '확인 중' 처리
- 보상 수령 버튼도 서버 확정값이 있을 때만 활성화
- 개방 비용 openCost는 레이드 개방 화면에서만 사용
- 보상 수령 전 유저 코인 잔액을 임시 증가시키는 코드 없음
- 보상 수령 후에는 v9.79 방식대로 /me 재조회 및 실제 잔액 검증

포함:
- v9.79 보상 원자성/중복 방지
- v9.79 광폭화 중앙 빨간 원판 제거
- functions/api/[[path]].js
- js/app.js
- css/style.css
- index.html

D1:
- 신규 파괴 변경 없음
- DROP/RENAME/기존 데이터 삭제 없음

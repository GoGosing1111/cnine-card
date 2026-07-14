CNINE PvP 상대 카드 NaN 표시 수정 v9.56

원인:
서버는 시즌 매칭 개편 후 scoreDiff / expectedWin / expectedLoss를 반환하지만,
프런트가 삭제된 cardScore / diffPercent 필드를 계속 표시하여 NaN이 출력됨.

수정:
- 카드 NaN 표시 제거
- 시즌 점수 표시
- 내 점수와의 점수 차이 표시
- 승리 예상 획득 점수 / 패배 예상 차감 점수 표시
- app.js 캐시 버전 갱신

적용:
프로젝트 루트에 js 폴더와 index.html을 덮어쓴 뒤 배포하세요.

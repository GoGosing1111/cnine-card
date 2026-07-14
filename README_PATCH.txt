CNINE PvP NaN 회귀 수정 v9.70

원인:
시즌 정산 패치의 프런트 파일에 예전 카드 총점 기반 표시 코드가 다시 포함됨.
현재 서버는 cardScore / diffPercent 대신 scoreDiff / expectedWin / expectedLoss를 반환하므로 NaN 출력.

수정:
- 상대 카드의 '카드 NaN' 제거
- 점수 차이 표시
- 예상 승리 획득 / 패배 차감 점수 표시
- 내 PvP 요약에서 카드 총점 제거
- 시즌 점수만 표시
- 정산 서버 기능과 카드점수 랭킹은 변경하지 않음
- app.js 캐시 버전 갱신

적용:
프로젝트 루트에 js 폴더와 index.html만 덮어쓰세요.

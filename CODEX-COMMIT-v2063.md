# 속도형 B4 검토 기록

- 최신 main c64e3f47에서 해당 함수만 패치. 원본 지시서와 다른 작업 보존.
- speedUniqueSuppressed=true 대입 제거, 이벤트 label 변경, 설명 주석 추가.
- 필드 기본값과 3개 판정, 속도 감산, 시작 게이지 초기화 유지.
- 서버 코드 변경은 functions/_battle_v2_preview.js 한 파일. 추가 파일은 테스트와 기록.
- 상세 측정은 TEST-REPORT-v2063.txt. 과거 승률은 원본 데이터 부재로 재현 미확인.
- 사용자의 이번 요청은 커밋 및 라이브 배포를 명시함.
- 기존 미추적 원화 등을 포함하지 않는 깨끗한 릴리스 작업 트리에서 npm run deploy:production 사용.
- 정식 명령 내 npm run release:gate 실패 시 배포 중단. CMS·PVE·릴리스 플래그 변경 없음.

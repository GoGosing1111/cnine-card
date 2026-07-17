CNINE CARD v1028 LIMITED 궁극기 설정 추가 패치

v1027 자동사냥 패치를 포함한 누적 추가 패치입니다.

추가 수정
- CMS 궁극기 관리의 대상 등급 목록에 LIMITED 추가
- 저장된 LIMITED 궁극기 규칙 재조회 시 선택 상태 유지
- CMS 스크립트 캐시 버전 갱신

서버 전투 판정의 LIMITED 등급 및 우선순위 처리는 기존부터 지원되며 그대로 유지됩니다.

Cloudflare Pages 배포 오류 조치
- assets/effects/effects.zip은 실행 코드에서 참조되지 않는 원본 묶음 파일입니다.
- 파일당 25MiB 제한을 넘으므로 Git 저장소에서 제거해야 합니다.
- 명령: git rm assets/effects/effects.zip
- 이후 커밋·푸시하면 배포 검증을 통과합니다.
- .gitignore만 추가하면 이미 추적 중인 파일은 제거되지 않습니다.

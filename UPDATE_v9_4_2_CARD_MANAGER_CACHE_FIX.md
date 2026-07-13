# v9.4.2 카드관리 UI 캐시 핫픽스

- v9.4.1에서 카드관리 UI 파일은 실제로 변경됐으나 admin/index.html의 admin.css 캐시 버전이 v9.3.6, admin.js 캐시 버전이 v9.4.0으로 남아 있던 문제 수정
- admin/index.html에 no-cache 메타 추가
- admin.css / admin.js 캐시 키를 v9.4.2로 갱신
- 카드관리 제목에 v9.4.2 배지 추가하여 실제 반영 여부를 즉시 확인 가능
- DB/API 변경 없음

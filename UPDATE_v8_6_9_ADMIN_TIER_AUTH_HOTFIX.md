# v8.6.9 관리자 티어 권한 오류 수정

- `/api/admin/tiers`에서 정의되지 않은 `requireAdmin()` 호출 제거
- 기존 공통 권한 함수 `requirePermission(request, env, "SETTINGS")`로 통일
- 권한 부족 시 403 JSON 응답 처리
- D1 스키마 및 기존 데이터 변경 없음

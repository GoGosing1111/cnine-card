# v9.1.4 레이드 OWNER 테스트 잠금

- 레이드 CMS 메뉴는 OWNER 계정에만 표시됩니다.
- `/api/admin/raid` 전체 요청은 서버에서 OWNER 역할을 다시 검증합니다.
- ADMIN 및 기타 관리자 역할은 URL/API 직접 호출 시에도 403 처리됩니다.
- `raid_settings_v1.ownerOnlyTest` 기본값을 true로 추가했습니다.
- CMS 접근 모드는 `OWNER 테스트 전용`으로 고정 표시됩니다.
- 서비스가 정상 운영 중이어도 OWNER만 레이드 기능을 시험할 수 있도록 준비했습니다.
- D1 구조 변경 없음. 기존 데이터 삭제/테이블 재생성/DROP/RENAME 없음.

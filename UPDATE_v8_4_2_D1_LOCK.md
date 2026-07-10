# v8.4.2 D1 cards_legacy 동시 실행 오류 수정

- 여러 사용자가 동시에 접속할 때 `ensureUpgrades()`가 중복 실행되며 `cards_legacy` 이름 충돌이 발생하던 문제 수정
- `app_meta` 기반 마이그레이션 잠금 추가
- 잠금 소유 요청만 카드 테이블 재구성 수행
- 다른 요청은 마이그레이션 완료를 잠시 대기
- 이전에 남은 `cards_legacy` 자동 복구/정리 유지

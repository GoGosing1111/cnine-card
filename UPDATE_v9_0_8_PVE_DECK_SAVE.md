# v9.0.8 PvE 덱 저장

- PvE 전용 `덱 저장` / `덱 리셋` 버튼 추가
- 저장 덱은 D1 `pve_decks` 테이블에 사용자별 저장
- 전투 종료, 승리/패배, 새로고침 후에도 저장 덱 유지
- 리셋 버튼을 눌렀을 때만 현재 편성과 서버 저장 덱 삭제
- PvP 덱 및 기존 전투 보상 로직 변경 없음
- Safe migration marker: `safe_runtime_upgrade_v908_pve_deck`

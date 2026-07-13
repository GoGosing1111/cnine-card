# v9.4.17 궁극기 발동확률 + PVE 실제 연출 수정

- CMS 우선순위 제거
- CMS 발동 확률(0~100%) 추가
- 조건이 여러 개면 등급 → 최소 돌파 → 필요 장수 순으로 강한 조건부터 확률 판정
- 기본 미디어 경로 `/assets/effects/SKILL.gif`
- Windows 경로 `assets\effects\SKILL.gif` 입력 시 자동 `/assets/effects/SKILL.gif` 정규화
- PVE battle/fight 서버 결과의 activatedUltimate를 실제 전투 오버레이와 연결
- 궁극기 추가 데미지는 서버 승패 및 로그 player_power에 반영
- 기존 전투 카드/보스 크기와 레이아웃은 변경하지 않음

# CNINE CARD v9.0.5 — 등급별 3D 판타지 배경 연결

## 실제 적용 파일
- SSR: `assets/effects/reveal/ssr_bg.jpg`
- MA: `assets/effects/reveal/ma_bg.jpg`
- FUR: `assets/effects/reveal/fur_bg.jpg`

## 적용 내용
- SSR/MA/FUR 특별 공개 연출에서 각 등급별 이미지가 자동 선택됩니다.
- 최종 카드 공개 단계에서도 해당 등급 배경이 밝게 유지됩니다.
- 기존 실사 신전 공통 배경 강제 적용을 최종 CSS 오버라이드로 해제했습니다.
- 이미지 사전 로드를 추가해 첫 공개 시 배경 지연을 줄였습니다.
- PvE/PvP/D1/API 로직은 변경하지 않았습니다.

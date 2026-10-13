# 영토전 모집신청 화면

`index.html`에서 실제 UI 모듈을 사용하는 모집신청 미리보기를 연다. 참가·취소 버튼은 이 미리보기 안에서만 상태를 바꾸며 운영 API를 호출하지 않는다.

- 최종 스타일: 현 로비·용병도감·장비강화의 Noto Sans KR / Barlow Condensed, 차콜·라임.
- 로고: 사용자 첨부 원본을 그대로 사용하며 런타임 manifest에 해시 기록.
- 현재 버튼: `assets/button-*-v2-source.png`, `prompts-v2.json`의 내장 ImageGen 원본 4종.
- 배경: `assets/command-sanctum-source.png`, `prompts.json`의 내장 ImageGen 원본.
- `manifest-replaced-v1.json`와 초기 버튼 원본은 과거 시안이며 현재 UI에서 사용하지 않는다.
- 런타임 색인: `assets/ui/territory-war/formation-v1/manifest.json`.
- 구현·배포 기록: `docs/territory-formation-ui-20261013.md`.

# 스트리머 라운지 씨나인 로고 — 2026-10-25

사용자 요청: 나무늘봉순·디임에 남수댕과 같은 씨나인 로고 표시.

- 나무늘봉순 `yjk011599`, 디임 `qpqpro`를 표시 대상에 추가했다. 기존 남수댕 `mew030709`·조은 `zalalz`도 유지한다.
- 기존 승인 이미지 `preview/mercenary-jokro-iaido-20261017-v1/references/user-c9.png`와 PC 38px·모바일 28px, 핸들 아래·이름 위 위치를 그대로 재사용했다. 사진·프로필·방송국 링크·목록 순서는 변경하지 않았다.
- 라운지 모듈 버전 `20261025-cnine-four`, 메인 JS/SW 캐시 접두어 `streamer-cnine-four-20261025-v1`로 갱신했다.
- 실제 메인 페이지 PC 1440px·모바일 390px에서 기존 커뮤니티 메뉴의 라운지 입구 → 로고 4개·이미지 로딩·크기/위치·9명 링크·두 대상 이름 검색·Escape 닫기·가로 넘침 없음 확인. `browser.json`과 화면 기록 참고.
- 관련 기존 회귀 `tests/streamer-lounge-v2036.test.mjs`만 공식 scoped 배포에서 실행한다. 계정·운영 설정 쓰기 0건.
- 현재 운영 배포 커밋은 Cloudflare canonical deployment에서 읽어 사용하며 배포 후 공개 파일과 라운지 화면을 확인한다.

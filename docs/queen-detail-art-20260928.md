# 여왕 재위 안내창 이미지 교체 — 2026-09-28

사용자 첨부 화면의 `여왕 선출 대기 · 공석` 안내창에 남아 있던 남성 지휘관 그림을 기존 여왕 대관식 원화로 교체한다.

- `js/soopketmon-v21-exact-shell-adapter.js`: 재위 상세는 공석·재위 상태 모두 `assets/ui/chief/queen-coronation-v1-1536.webp`를 표시한다. 캐릭터 원본이나 별도 이미지 생성은 변경하지 않았다.
- `css/soopketmon-v21-production-integration.css`: 여왕 그림을 2:3 세로 영역에 중앙 상단 기준으로 표시해 왕관·얼굴을 유지한다.
- `index.html`의 해당 어댑터와 동적 로딩되는 해당 CSS에 `queen=20260928-detail` 캐시 키를 적용한다.
- 로비 장착 아바타, 재위 데이터, 여왕 권한·즉위식 버튼 조건 및 서버 코드는 유지한다.

## 관련 검수

- 실제 `index.html`·라이브 로더에서 API만 로컬 격리하고 음소거하여 확인했다.
- PC 1440×1000, 모바일 390×844에서 공석·재위 상태 각각 확인: 35개 항목 통과, JavaScript 오류 0.
- 전용 그림 로딩·세로 비율·가로 넘침·권한 버튼 노출·활성 재위의 즉위식 재생·닫기·로비 아바타 유지 확인. 계정 변경 요청 0.
- PC·모바일 스크린샷을 직접 확인했다. 증빙: `C:/Users/User/.codex/tmp/queen-detail-art-20260928/`.

## 배포 범위

- 국소 이미지/UI 수정이므로 `npm run deploy:production -- --scoped`를 사용한다.
- 직전 실제 운영 배포: Pages `91954f6a-d8c1-4235-af92-84e0b35877d3`, 소스 `cc2e7ca04864649887a19df7d5ea12e7f218345d`. Wrangler의 production 배포 목록과 전체 Git SHA를 확인했다.
- 기준 이후 기존 변경은 직전 여왕 배포의 완료 문서다. 이번 게임 실행 변경은 위 어댑터·CSS·로더뿐이다.
- 배포 검사: `tests/queen-coronation-v1.test.mjs`만 선택해 인접한 즉위식 상태·재조회·닫기 회귀를 확인한다. 전체 게임 검사를 반복하지 않는다.
- 깨끗한 범위 커밋·origin/main 일치·출시 플래그·캐시 호환·운영 Hyperdrive query cache OFF는 지정 배포 도구로 확인한다.

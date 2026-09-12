# 붕괴 코어 화면 기믹 검수 V1

2026-09-12 요청: 키보드 외 화면 기믹 1~3종, 스타포스처럼 중앙 맞추기, 모바일 방향 입력 누락 개선.

`/preview/core-raid-mechanics-v1/`에서 세 기믹과 기존 방향 입력을 직접 체험한다. 시작 버튼을 누른 뒤부터 제한시간이 흐른다. 체험은 기존 V3 전장 위에서 실행하지만 계정·입장권·보상 API를 호출하지 않는다.

| 기믹 | 조작 | 시연 판정 |
|---|---|---|
| 코어 동조 | 왕복하는 빛을 중앙에서 탭/클릭으로 정지 | 3회 중 2회 성공. 흰 영역 PERFECT. 라운드마다 이동 속도 증가 |
| 회로 복원 | 같은 로마 숫자 단자를 드래그 연결. 출력→입력 두 번 터치도 가능 | 14초 안에 세 회로 연결. 틀린 기호는 연결되지 않음 |
| 차폐 구역 이동 | 폭발 예고 중 파란 방패 구역을 선택 | 3번 모두 회피. 매 폭발 후 안전 구역 변경 |

2026-09-12 후속 승인으로 세 기믹을 서버 판정과 연결했다. 신규 공략은 기존 방향 신호·구속 파쇄를 포함한 총 5종에서 서로 다른 2종을 선택한다. 이 페이지는 계속 독립 검수용이며 계정 데이터를 변경하지 않는다. 운영에서는 각 화면 기믹이 1.6초 안내 후 시작되고, 검수 페이지에서는 시작 버튼을 사용한다. 기존 피해·보상·공개 설정은 유지한다. 상세 기록은 `../../docs/core-raid-random-two-v2086.md`다.

## 렌더링과 자산

- `app.mjs`는 `ProjectVBattleV3Live.prepareLoading/createRenderer`를 호출한다. V3 진형·카드 도크·공용 프레임을 복제하거나 덮어쓰지 않는다.
- `../core-protocol-raid-v1/preview.js`의 `createMechanicFixture()`가 기존 검수 덱 5장의 실제 ID, 원화와 별도 전투 SD를 제공한다.
- 기존 일반/등급/몬스터/미배정 아트 어댑터 네 개를 라이브와 같은 순서로 로드한다.
- V3 실제 렌더러는 `../project-v-v3/project-v-pixi-battle.bundle.js?v=101-nonblocking-fx`, 제어 브리지는 `../../js/battle-v3-live.js?v=3.32.0-core-random-two`다. 잠금 버전은 PixiJS 8.20.0 / GSAP 3.13.0이다. 번들을 새로 만들거나 라이브러리를 중복 로드하지 않았다.
- 이번 신규 제작 범위는 **QTE 입력 HUD**다. 단자·중앙 게이지·차폐 구역은 DOM/SVG로 표시한다. 판정/카운트다운/라운드 전환은 하나의 `performance.now()` 경과 시간과 rAF 루프를 공유한다. 전투 스킬 연속 프레임 이펙트를 제작했다고 간주하지 않는다.
- 장식 회전/충돌 강조만 CSS 애니메이션을 쓴다. 입력 취소는 리스너·포인터 캡처·rAF·결과 타이머를 해제한다. 빠른 닫기/재실행은 공용 Pixi 마운트를 직렬화한다.
- 신규 이미지·전투 음원은 만들지 않았다. 글꼴은 Google Fonts의 Noto Sans KR / Barlow Condensed이며 OFL 1.1을 확인했다. 라이선스: [Noto Sans KR](https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/OFL.txt), [Barlow Condensed](https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt).

## 검수 재현

`npm run test:core-raid`

브라우저 검수는 설치된 Playwright 모듈 경로를 `PLAYWRIGHT_MODULE` 환경변수에 지정한 뒤 실행한다.

```text
node scripts/qa-core-mechanics-browser.mjs http://127.0.0.1:8896 ../qa-core-mechanics
```

정적 HTTP 서버는 저장소 루트를 제공해야 한다. QA 결과는 배포 폴더 밖에 저장한다. Chrome 터치 에뮬레이션 360×740, 390×844, 가로 844×390과 데스크톱 크기 1440×1000을 검수한다. 물리 iOS/Android 기기 검증은 별도다.

운영 방향 입력 수정 및 검수 범위는 `../../docs/core-raid-mechanics-mobile-v2085.md`를 참고한다.

# 배틀슈트 스킬칩 · 독립 V3 검수

상태: **TECH_QA_COMPLETE_USER_REVIEW_PENDING**. 운영 연결·CMS 변경·아이템 지급·서버 피해 판정 없음.

## 보는 방법

프로젝트 루트에서 `node preview/battle-suit-skill-chip-v1/serve.mjs`를 실행한 뒤 [로컬 프리뷰](http://127.0.0.1:8791/preview/battle-suit-skill-chip-v1/)를 연다. 서버는 127.0.0.1 전용이며 GET/HEAD만 허용하고 `/api/`를 차단한다.

- 헬기 폭격: 기체·회전 날개의 지면 그림자 → 0.61 / 0.83 / 1.05 / 1.27초 4연속 폭발 → 연기 소멸. 전체 3.60초.
- 고폭탄: 0.12초 총구 발사 → 탄체/배기/연기 이동 → 0.36초 충돌 → 잔불·연기. 전체 2.25초. 원본 GIF의 짧은 후반부보다 잔향을 길게 조정했다.
- 재생, 일시정지, 처음부터, 충돌 확인, 시간 이동, 0.25/0.5/1/2배속.
- 승인 배틀슈트 3종 × 황금용 AR/저격총 2종. 일반 사격 병행 검수와 효과음/흔들림 개별 설정.
- 효과음은 첫 재생 조작 후에만 시작한다. 새로고침·페이지 이탈·백그라운드 전환·일시정지 때 재생을 정리한다.

## 구현 경계

`project-v-v3/source/project-v-pixi-battle.src.js`를 그대로 import하여 번들에 PixiJS 8.20.0/GSAP 3.13.0 각각 한 벌만 포함한다. 운영 V3 소스·번들에는 변경이 없다. 원본 `ProjectVBattleV3Live.prepareLoading/createRenderer`가 진형과 카드 도크를 만든다. 네 아트 어댑터와 공용 카드/등급 CSS를 원래 순서로 로드한다.

실제 V3 전장은 별도 iframe의 전체 뷰포트에서 동작한다. 부모 페이지에만 검수 조작부가 있으므로 모바일 `100dvh` 규칙과 하단 카드 마크업·크기·프레임을 덮어쓰지 않는다. 덱은 승인 로스터 매니페스트의 실제 카드 ID 5장이다. `sourceArt`와 `battleSprite`를 구분하며, 검수 HP 100은 화면 구성용 값일 뿐 실제 계정 데이터가 아니다. 배틀슈트는 별도 지원 액터다.

스킬은 전용 GSAP 시간축과 한정된 Pixi 스프라이트 풀을 소유한다. 일반 사격의 `fireTimeline`을 사용하지 않아 다음 사격의 `cancelFire()`가 스킬을 끊지 않는다. 시간 이동은 상태를 재계산하고 부작용 콜백을 재실행하지 않는다. 피해·쿨다운·칩 장착/보유·확률·보상·DB/API는 구현하지 않았다. 장비의 아바타 오른쪽 스킬칩 탭도 아직 운영에 추가하지 않았다.

## 자산·사운드

시각 자산은 내장 ImageGen 생성물이다. 원본 PNG는 보존하고 런타임은 무손실 WebP를 사용한다. 생성 프롬프트, 폐기 사유와 해시는 [PROMPTS.md](./PROMPTS.md), 사운드 출처·라이선스·가공은 [manifest.json](./manifest.json)에 있다. GIF의 게임 리소스나 워터마크를 복사·제거해 쓰지 않았다.

오디오 3계층은 접근/발사, 충돌, 잔향이다. 실제 녹음된 CC0 원음만 사용하며 오실레이터·절차적 노이즈를 만들지 않는다. 폭발 원음 첫 주 피크 0.5826875초를 측정하여 충돌 시각에 맞추고 Web Audio `getOutputTimestamp()`로 장치 출력 지연을 보정한다. 소프트웨어 예약 오차 검증과 별개로, 블루투스·외부 스피커에서 실제 물리적 ±20ms 동기는 사용자 장치 청음/루프백 검수가 필요하다. 승인 완료로 간주하지 않는다.

## 재빌드·검증

```sh
node preview/battle-suit-skill-chip-v1/build.mjs
node --test tests/battle-suit-skill-chip-preview-v1.test.mjs
npm run test:battle-suit
npm run test:core-raid
```

빌드는 원본 생성 이미지를 다시 그리지 않는다. 4×2 소품 아틀라스 분할·투명 여백 제거·무손실 인코딩, 6×4 폭발 아틀라스 지면 기준점 측정과 가장자리 알파 검사를 수행한다. 별도 프레임 사이에 alpha >4가 있으면 빌드를 중단한다.

검수 결과와 제한은 [QA.md](./QA.md). 사용자의 연결 지시 전에는 라이브 장비 화면이나 전투 API로 연결하지 않는다.

## 참고 문서

- [GSAP Timeline](https://gsap.com/docs/v3/GSAP/Timeline/) — 독립 재생·정지·시킹 시간축.
- [Web Audio output timestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp) — 오디오 출력과 화면의 시간 매핑.

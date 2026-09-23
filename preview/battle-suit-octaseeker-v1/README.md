# 배틀슈트 스킬칩 · 8방향 유도탄

상태: **USER_REVIEW_PENDING / 독립 연출 프리뷰**. 운영 스킬칩 카탈로그·장비 탭·서버 피해·획득에 연결하지 않았다. 피해 배율, 발동 주기, 등급과 획득 방식은 미정이다.

## 확인

- 프리뷰: `/preview/battle-suit-octaseeker-v1/`
- 로컬: 저장소 루트에서 `node preview/battle-suit-skill-chip-v1/serve.mjs` 실행 후 `http://127.0.0.1:8791/preview/battle-suit-octaseeker-v1/`.
- `재생` 또는 `처음부터`. 01/02/03 버튼은 방출·선회·집중 폭발 구간을 정지 화면으로 보여준다.
- 시간 이동, 일시정지/재개, 중지, 0.25/0.5/1/2배속, 녹음 효과음, 일반 사격 병행, 충돌 흔들림을 제공한다.

## 동작

사용자가 지정한 [참고 영상 8초 이후](https://www.youtube.com/watch?v=HBJg05Gz_Ds&t=8s)의 방사 발사→유도 선회→한 대상 집중 폭발을 참고했다. 영상은 브라우저에서 프레임 단위로 확인했고, 원본 게임 픽셀을 추출하거나 복사하지 않았다.

0.12초부터 8발이 45도 간격의 서로 다른 방향으로 출발한다. 각 발은 0.26초간 바깥으로 나간 뒤 접선이 연결된 곡선을 타고 같은 적 한 명에게 들어간다. 1.02~1.44초에 0.06초 간격으로 8번 시각 충돌하며, 잔불·연기는 3.20초까지 소멸한다. 이 수치는 **연출 시간**이며 실전 피해/쿨다운 정책이 아니다.

발사점은 원본 `AccountBattleUnit.muzzlePoint()`, 투사체 도착점은 적 발끝 Y−62, 폭발 바닥은 원본 `SOLE_CENTER`다. 발사 출처는 캐스트 동안 고정하고, 명중한 폭발의 위치는 각각 동결한다. 원래 대상이 사망/재바인딩되면 미명중 로켓은 중단하고 다른 적으로 옮기지 않는다.

## 구현과 자산

- `source/OctaSeekerFX.js`: PixiJS의 기존 V3 `combatLayer`·`effectLayer`. 로켓 8발, 고정 개수 연기 풀, 8개 폭발 풀.
- `source/sequence.mjs`: 결정적인 궤적·프레임·타이밍과 OFF 초안. 피해 계산 없음.
- GSAP 단일 시간축이 탄체 위치·각도·연속 아틀라스·충돌·소멸을 함께 제어한다. 별도 Ticker/AnimatedSprite 시계 없음.
- PixiJS **8.20.0**, GSAP **3.13.0**, 한 번들에 각 한 벌. 기존 V3 엔진·5장 카드 진형·등급 프레임·도크·아트 어댑터를 그대로 재사용한다. H-BODY 및 총기 승인 원본은 무변경이다.
- 내장 ImageGen으로 전용 **추진 24프레임 + 폭발 24프레임 + 칩 아이콘**을 제작했다. 정지 이미지 이동만으로 만든 연출이 아니다. 원본 PNG, 무손실 WebP, 프롬프트, 해시는 [PROMPTS.md](./PROMPTS.md), [build-report.json](./build-report.json)에 보존한다.
- `assets/textures/frame-origins.json`: 매 프레임의 탄두 끝/폭발 바닥·투명 경계 측정값. 모든 아틀라스 셀 경계 알파 ≤4.
- `source/OctaSeekerAudio.js`: 기존 승인 CC0 실제 녹음 스케줄러 재사용. 발사 1층 + 8개 충돌 피크 + 공유 잔향 1층. 원음 바이트/라이선스/가공은 [manifest.json](./manifest.json)에 기록했다. 합성 비프/노이즈/오실레이터 없음.
- 충돌 예약은 원음 첫 주 피크 0.5826875초와 출력 타임스탬프 보정을 사용한다. 소프트웨어 오차 <1ms 확인. **실제 장치 출력 ±20ms는 청음/루프백 검수 전이며 보장하지 않는다.**

## 검증과 출시 경계

`node preview/battle-suit-octaseeker-v1/build.mjs`

`node --test tests/battle-suit-octaseeker-preview-v1.test.mjs`

검수 내역: [QA.md](./QA.md). 프리뷰 정적 파일 공개는 실전 기능 활성화가 아니다. 시각·음원 승인 및 별도 연결 지시, 실전 정책 확정 전에는 라이브 연결/자동 지급/마이그레이션을 추가하지 않는다.

최상위 기준: `docs/project-v-skill-effects-standard.md`, `docs/battle-suit-skill-chip-v2046.md`.

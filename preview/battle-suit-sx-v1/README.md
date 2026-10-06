# SX슈트 · 푸른 사신

2026-10-07 제작한 SX슈트 연결 작화·전용 연출 검수판이다. 대시, 이동/복귀 잔상, 주변 오라·광원, 기본 공격, 검무, 궁극기와 전용 칭호를 기존 X슈트와 같은 공용 V3 전장 위에서 재생한다.

현재 상태는 **기술 검수 완료 / 전체 재생의 사용자 최종 시각 검수 대기**다. 운영 활성화, CMS 등록, 제작식, 능력치, 계정 지급은 하지 않았으며 `manifest.json.runtimeEnabled=false`다.

## 바로 보기

- `node preview/battle-suit-sx-v1/serve.mjs`
- [전투 재생](http://127.0.0.1:8975/preview/battle-suit-sx-v1/)
- [원본·자세 비율 비교](http://127.0.0.1:8975/preview/battle-suit-sx-v1/comparison.html)
- [PC 실제 재생 영상](review-desktop.webm), [모바일 실제 재생 영상](review-mobile.webm)
- [최신 칭호](qa/title-open-v2.png), [모바일 칭호/몸](qa/mobile-idle-1.2.png), [세운 검과 칭호](qa/mobile-ultimate-2.97.png)
- [PC 영상 프레임](qa/filmstrip-desktop.png), [모바일 영상 프레임](qa/filmstrip-mobile.png)

공용 V3/PixiJS/GSAP, 실제 카드 도크·진형·지원 유닛·대상 모델을 사용한다. `preview/z-body-live-v1/fixture.json`을 읽는 격리된 미리보기다. API 호출이나 실계정 변경은 없다.

## 최신 사용자 기준

- 이름 **SX슈트**, 칭호 **푸른 사신**.
- 최신 첨부 `codex-clipboard-82a19111-ee87-4a91-bc56-51c7f3278827.png`는 정지 승인본과 바이트가 같다. 코발트·은백색·금색 장식, 아이보리/금색 대검을 유지한다. 일시적인 파란 칼 시안은 현재 기준이 아니다.
- **머리/목/무기 절취 합성은 반려됐다.** “그 목 때고 하는 방식 실패임 내가볼때”, “그려야함”에 따라 완전한 머리·목·어깨·몸·손·대검을 각 자세에서 함께 그린다. 이 SX 직접 지시가 과거 단일 머리/무기 합성 공정보다 우선한다.
- “칼좀 안휘게 잘 만들어봐”: 손잡이 끝부터 검끝까지 곧은 중심축, 대검 폭·길이·파지 연결을 확인한다. 짧거나 휘어진 칼을 시트 공간이나 손 위치 때문에 허용하지 않는다.
- “그래 그리고 색감 변하지 않게 주의해라”: 짙은 코발트·은백색과 원본 비중의 금색을 유지한다. 본체의 색 변환·틴트는 0회다. 푸른 빛은 별도 효과/잔상 스프라이트다.
- “다리 짧게 만들지 말고 몸 비율 항상 유지해라 검수할때”: 승인 원본의 성인 비율과 골반→무릎→발목 길이를 매번 비교한다. 웅크림·도약도 다리 길이를 줄이지 않는다. 낮은 자세를 키에 맞춰 늘리거나 다리만 비균일 변형하지 않는다.
- “오버로드 칭호처럼 … 직사각형 프레임 없애고 고급스러운 폰트로”: 사각 이름판을 제거하고 열린 은빛 검 날개·코발트 잔광·Noto Serif KR 900 한글을 사용한다. “글자 조금 더 올려도 될듯”에 따라 **글자와 광택 마스크만 위로 12 디자인 픽셀** 옮겼다.

## 01 — 승인 기준과 원본 보존

원본은 [sx-standing-approved-20261007.png](assets/sources/sx-standing-approved-20261007.png), SHA-256 `0ecc36640e457a5ef33f5d5d34dfaac4c548504375f732dea0d456609a5bb73b`다. 재생성/재압축하지 않았으며 대기와 동작 끝에는 이 정확한 원본을 사용한다.

[identity-lock-20261007.json](identity-lock-20261007.json)은 연결 작화로 수정된 최신 규정이다. 이전 머리/무기 절취 방식의 실패는 [rejection-20261007.json](rejection-20261007.json)에 남긴다.

사용자의 “좋네 지금”은 당시 표시한 V8 `dash-a.png`와 `attack-a.png` 및 색감 방향에 대한 승인이다. [connected-pose-approval-20261007.json](connected-pose-approval-20261007.json)의 해시를 고정하며 나머지 자세·이펙트·운영 승인으로 확대하지 않는다.

## 02 — 동작과 접점 설계

[motion.mjs](motion.mjs)가 한 개의 시계에서 모든 단계·좌표·적중·효과·잔상을 정의한다.

| 동작 | 길이 | 구성 |
|---|---:|---|
| 대기 | 4.8초 반복 | 정확한 승인 원본, 푸른 오라·지면 광원·칭호 광택 |
| 잔영 대시 | 1.75초 | 압축·발진·가속·제동·복귀 |
| 청령 일섬 | 1.60초 | 체중 이동·횡베기·후속 동작·복귀 |
| 청령 검무 | 3.90초 | 교차 연격 4회·올려베기·도약·낙하 마무리·복귀 |
| 창천사신검 | 5.70초 | 검영 전개·사방 검무 4회·양손 응축·도약·일격·지면 파열·복귀 |

스킬 적중은 0.43/0.72/1.01/1.30/1.58/2.39초, 궁극기 적중은 0.94/1.23/1.52/1.81/3.53초다. 지면 접점과 명시적 도약 곡선을 분리했다. 타격 대상의 시각 반동만 재생하고 피해/HP/승패/보상을 계산하지 않는다.

## 03 — 완전 연결 몸 동작 작화

내장 `image_gen`으로 새로 그린 2×2 시트 8장, 동작 32장이다. [assets/connected](assets/connected/)의 `dash-a/b`, `attack-a/b`, `skill-a/b`, `ultimate-a/b`를 사용한다.

실제 프롬프트는 [prompts-connected-v8.json](prompts-connected-v8.json), 후속 변경된 최종 호출은 [prompts-connected-final-20261007.json](prompts-connected-final-20261007.json), 생성 출처는 [connected-generated-inputs.json](connected-generated-inputs.json)에 보존한다. 원본·완전 연결 횡베기 파일·원본 머리 확대를 함께 참조했으며 머리 확대 참조는 작화 설명용이다. 머리를 따로 합성하지 않는다.

`attack-b`는 이웃 자세끼리 겹친 초안을 다시 그린 최종 분리 시트다. `skill-a`의 4번째 자세는 짧아진 세로 검을 수정하기 위해 **전신 전체를 다시 그린** [skill-takeoff-repair.png](assets/connected/skill-takeoff-repair.png)로 교체했다. [교체 명세](connected-pose-repairs.json), [실제 프롬프트](prompt-takeoff-repair-v9.json)에 이유와 좌표를 기록했다.

## 04 — 머리·대검·비율 검수

원본과 완전 연결 자세를 [comparison.html](comparison.html)에서 동일한 기준 신체 크기로 비교한다. 곧은 손잡이/검신 축, 자연스러운 목/어깨 연결, 손과 가드의 접점, 원본 성인 비율·장거리 허벅지/종아리를 확인한다.

[대시 비교](qa/proportion-dash.png), [횡베기 비교](qa/proportion-slash.png), [도약 비교](qa/proportion-takeoff.png), [궁극기 비교](qa/proportion-ultimate.png)를 보존한다. 시각 확인과 균일 패킹 검사는 별개이며, 해시가 다르다는 이유만으로 동작/비율 품질이 보증되었다고 취급하지 않는다.

이 작업에서는 사용자 반려에 따라 무기/머리 단독 합성을 사용하지 않는다. 반려된 `pack-assets.mjs`, `extract-locked-parts.mjs`는 증거 보존용이며 실행 시 중단한다.

## 05 — 독립 효과와 칭호

[assets/sources/fx-*.png](assets/sources/)의 4×3 시트 8종, 총 96개 서로 다른 작화 프레임을 사용한다.

- `aura`: 주변 푸른 오라
- `light`: 발밑 광원
- `dash`: 모든 이동/복귀의 공기 흔적
- `cut`, `cross`: 단일 베기와 교차 검격
- `execution`: 강한 낙하 검격
- `ground`: 지면 충격과 잔향
- `bladestorm`: 다중 검영 전개

기존 [prompts.json](prompts.json)의 효과 명세는 활성이다. 같은 파일의 머리 없는 몸 시트 명세는 명시적으로 반려 이력으로 표시했다.

실제 과거 0.028/0.055/0.09/0.13/0.18/0.24초의 완전한 자세·위치·방향을 샘플링하는 6개 잔상이 **대시, 접근, 교차 이동, 점프, 복귀**에 공통 적용된다. 효과와 잔상이 주 액터의 색을 변경하지 않는다.

칭호는 [SXTitle.js](source/SXTitle.js), [열린 장식](assets/connected/title-open-v2.png), [변경 기록](title-revision-20261007.json), [생성 프롬프트](prompt-title-open-v2.json)로 구성한다. 글자는 실제 한글 텍스트이며 [폰트와 OFL](assets/fonts/README.md)을 자체 호스팅한다. 사각 프레임 `assets/connected/title.png`는 활성 목록에서 제외했다.

## 06 — 알파·좌표·패킹

[pack-connected.mjs](pack-connected.mjs)가 실제 알파의 **완전한 인물**을 추출하고 원래 RGBA를 유지하며 기술적으로 패킹한다. 별도 머리·무기 합성/재색칠은 없다.

- 몸: 768×768 투명 셀, 4×2 아틀라스, 총 4개.
- 효과: 512×512 셀, 4×3 아틀라스. 셀 사이 투명 여백을 두어 인접 프레임이 섞이지 않도록 했다.
- 몸의 각 원본 시트 전체에는 한 개의 균일 배율을 적용한다. 웅크린 개별 자세를 서 있는 높이에 맞춰 키우지 않는다.
- 발·손·검끝·머리 기준점과 원본 신체 크기는 [pose-registration-connected.json](pose-registration-connected.json)에 기록한다.
- 결과, 출처 해시, 선택 영역, 균일 배율, 부품 합성 0회/색 변환 0회는 [manifest.json](manifest.json)에 보존한다.

## 07 — 적중과 접지 검증

초기 [browser-report.json](qa/browser-report.json)에서 궁극기 첫 적중의 자세가 이전 횡베기 프레임을 사용한 문제 1건을 찾았다. 0.90초 자세를 `attack[4]`로 바꿨으며 최종 [contact-title-recheck.json](qa/contact-title-recheck.json)에서 PC·모바일 각각 **12회 모두 칼날 구간과 대상 몸통 교차**, 의도하지 않은 공중 적중 0건을 확인했다. 지면 기준 오차 0이다.

검을 휘거나 액터를 임의로 띄워 접점을 맞추지 않는다. [이펙트 없는 PC 몸/검](qa/desktop-body-only.png), [모바일 몸/검](qa/mobile-body-only.png)을 별도 확인했다.

## 08 — 공용 V3 실제 재생

[source/preview.js](source/preview.js), [SXBodyFX.js](source/SXBodyFX.js)가 기존 `BattleEngine`, 지원 액터, 카메라 기본 위치, 진형/깊이 레이어, 카드 도크를 재사용한다. [build-report.json](build-report.json)은 PixiJS 1개와 GSAP 1개를 확인한다.

한 개의 등록된 GSAP 타임라인이 몸·이동·오라·잔상·빛·타격·칭호 광택을 함께 제어한다. 독립 interval, 오디오 또는 CSS 시계는 없다. 본체는 `tint=0xffffff`, 일반 알파 합성, x/y 동일 배율을 유지한다. 칭호는 방향 반전에 따라 뒤집히지 않는다.

카메라는 원본 인물의 실제 검끝·전신과 칭호 범위를 포함한다. 원래 카메라의 base 위치를 유지하고 pivot으로 초점을 옮겨 배경의 패럴랙스가 갈라지지 않게 한다.

## 09 — PC·모바일 시각·제어 검수

1440×1000 PC, 390×844 모바일 브라우저에서 실제 V3 전장을 검수했다.

- 0.25/0.5/1/2배속의 시간 진행과 일시정지, 대기 반복, 취소/이탈 정리를 확인했다.
- 이동·복귀 모두 실제 과거 자세 잔상이 있으며 효과 OFF에서는 효과/잔상 0개다.
- 원본/최종 자세의 머리·목 연결과 검 직선, 비율·색감, 효과를 끈 몸/검, 최대 도약의 칼끝과 칭호를 직접 비교했다.
- 콘솔/리소스 오류 0건, 가로 넘침 0건. 수정된 칭호와 몸의 화면 밖 잘림 0건이다.
- 실제 1배속 전체 동작과 끝의 0.5배속 무효과 공격을 [record-review.mjs](record-review.mjs)로 녹화했다. [recording-report.json](qa/recording-report.json)은 재생 중 시계·프레임·잔상의 표본을 기록한다.
- [qa-video.mjs](qa-video.mjs)가 녹화된 영상을 브라우저에서 Blob으로 읽어 요청한 시간의 디코딩 프레임을 확인했다. [video-decode-report.json](qa/video-decode-report.json), PC/모바일 각각 15개 실제 프레임을 보존했다. 최초 HTTP seek의 0초 프레임 재사용 문제는 검수 도구에서 해결했다.
- 최종 글자 위치는 장식/글꼴 크기를 유지하고 y=32→20으로만 수정했다. PC·모바일의 대기/높은 도약 위치를 재확인했다.
- 작업 중 합류한 원격 `10a4a7ad`의 피해 숫자 폰트 변경을 공용 번들에 반영했다. SX 연출 코드/프레임은 바뀌지 않았으며 [integration-smoke.json](qa/integration-smoke.json)에서 PC·모바일 로드와 수정한 첫 접점을 짧게 재검증했다.

## 10 — 재현과 검증 보존

프로젝트 루트에서 실행한다.

```powershell
node preview/battle-suit-sx-v1/pack-connected.mjs
node preview/battle-suit-sx-v1/build.mjs
node --test preview/battle-suit-sx-v1/qa.test.mjs
node preview/battle-suit-sx-v1/serve.mjs
# 별도 터미널, 필요한 변경 범위만
node preview/battle-suit-sx-v1/qa-browser.mjs
node preview/battle-suit-sx-v1/qa-recheck.mjs
node preview/battle-suit-sx-v1/record-review.mjs
node preview/battle-suit-sx-v1/qa-video.mjs
```

관련 테스트 **5/5 통과**: 승인 해시, 완전 연결 32프레임/알파/출처/균일 배율, 효과 96프레임/여백, 접지/복귀/소멸, 단일 공용 런타임과 운영 OFF. 원본 이미지·실제 프롬프트·메타데이터·좌표·자산·스크립트·영상·검수 결과는 모두 이 디렉터리에 보존한다.

미리보기 한정 범위이므로 게임 전체 게이트나 운영 배포를 실행하지 않는다. `[CF-Pages-Skip]` 범위 커밋/원격 반영으로 보존하고 사용자 최종 시각 확인 후 별도 운영 연결을 진행한다.

## 11 — 승인 상태와 이력

정지 전신은 전체 승인, V8 dash-a/attack-a 및 색감 방향은 승인이다. 후속 스킬·궁극기·최종 칭호와 전체 재생은 이번 결과를 사용자에게 제시하는 단계다. 기술 검수 통과를 사용자 승인으로 기록하지 않는다.

옛 `assets/frames`, `assets/atlases`, `assets/locked`, `assets/thumbs`, 머리 없는 `assets/sources/body-*.png`, `part-lock.json`, `pose-registration.json`, `qa/rejected-manifest-v1.json`은 반려 제작 이력이다. 현재 실행 경로는 `assets/connected` / `assets/runtime` / `pose-registration-connected.json` / `pack-connected.mjs`다. 옛 작업을 현재 원본이나 품질 기준으로 사용하지 않는다.

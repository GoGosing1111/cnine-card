# 붕괴 코어 · 봉인된 전리품 V2

2026-09-25. 상태: **USER_APPROVED**. 사용자 `승인, 이것도 주간 3회보상 초과해서 받을수 없음 커밋해 내용물은 cms에 반영해뒀다`로 V2 연결이 승인됐다. V1의 도형·밝기 변화 위주 연출은 계속 반려 상태다. 현재 이 프리뷰와 본게임·CMS는 같은 V2 렌더러를 사용한다. 사용자가 설정한 보상 정책·확률·최소 지급량은 보존한다. 출시·전체 유저 이번 주 횟수 초기화 기록은 `docs/core-raid-reward-v2-release-20260925.md`를 따른다.

## 재생

저장소 루트에서 `node preview/core-raid-rewards-v2/serve.mjs` 실행 후 `http://127.0.0.1:8973/`를 연다. `PORT`로 로컬 포트를 바꿀 수 있다. 서버는 루프백에만 열리며 게임 API가 없다.

보관함 3개 중 하나를 누르면 선택 → 잠금 해제 → 외장 개방 → 보상 등장 순서로 재생한다. 결과의 다시 보기 버튼이나 닫기 버튼으로 시연 설정에 돌아와 용병·별·코인·재료와 기본/0.5배 속도를 바꿀 수 있다. 시연 별 100개·코인 1억은 프리뷰 샘플이며 CMS 기본값 또는 운영 최소 지급량이 아니다. 기본 클리어 100억 코인은 기존 정책을 표시한다.

## 구성과 구현

- 관측소 전용 배경, 실제 재질의 8프레임 보관함, 접지 그림자, 먼지·광원·금속 개방음, 큰 보상 원화. 모바일에서는 보관함을 삼각 구도로 배치한다.
- `reliquary-stage.mjs`는 `/js/core-raid-reward-stage-v2.mjs`를 재사용한다. 기존 `/js/ui-fx-vendor-v2045.bundle.js`의 **PixiJS 8.20.0 / GSAP 3.13.0**을 사용하며 별도 라이브러리·CDN·엔진 의존성을 추가하지 않는다. 전투 장면을 복제하지 않는 단일 UI 캔버스다.
- `picker.mjs`는 `/js/core-raid-reward-picker-v2.mjs`를 `preview:true`로 호출한다. 접근 가능한 선택 버튼, 결과 표시, 동일 선택 재시도, 12초 자산 로딩/15초 결과 응답 제한, 창 닫기·화면 비활성화 정리를 제공한다. 보상은 주입된 `claim` 반환값만 표시한다. 프리뷰에서는 고정 샘플만 반환한다.
- `reward-preview.css`는 `/css/core-raid-reward-picker-v2.css`와 프리뷰 홈 스타일을 로드한다. 게임 CSS는 `.reliquary` 내부에 한정한다. 기존 Noto Sans KR·Barlow Condensed와 라임 확인 버튼을 계승하며, 금속·청록 광원은 전리품 원화의 재질을 따른다. 320×568까지 화면 겹침을 확인했다.
- GSAP 공용 틱당 캔버스를 한 번 그린다. 시퀀스 타임라인이 별도 중복 렌더를 하지 않는다. 창을 닫으면 틱 콜백·타임라인·음원·ResizeObserver·표시 객체를 해제하고 공유 원본 텍스처는 보존한다. 모션 축소 설정에서는 연속 입자/광원 루프와 음원을 재생하지 않는다.

## 타임라인

시간 단위는 초다. 선택 이동은 0.70초이며 개방 시퀀스의 0초는 이동과 결과 확인이 끝난 시점이다. 프레임은 별도 Pixi 자동 재생이 아닌 같은 GSAP 시퀀스에서 교체한다.

| 시각 | 동작 |
| --- | --- |
| 0.00 / 0.30 | 닫힌 보관함 / 두 잠금 장치 해제 |
| 0.48 / 0.67 / 0.89 | 빛 틈 생성 / 뚜껑 1차 개방 / 뚜껑 상승 |
| 1.12 / 1.33 / 1.47 | 개방 광원·파편 방출 / 완전 개방 / 정착 |
| 1.53 | 확정 결과 원화와 보상 정보 등장 시작 |
| 1.60–2.70 | 보관함이 내려가며 소멸, 결과 글자와 겹치지 않게 정리 |
| 3.12 | 개방 시퀀스 종료 |

텍스처는 `assets/reliquary-frames.json`의 프레임별 알파 경계와 발밑 앵커를 사용한다. 생성 원본의 픽셀을 재가공하지 않고 런타임 Texture frame으로 분할한다. 0.5배 검수에서는 시각 재생만 느리게 하며 음향은 음소거한다. 화면 비활성화 시 GSAP 연출을 정지하고 재활성화 시 이어서 재생한다.

## 원화·음원 출처

두 신규 비트맵은 **built-in image_gen**으로 생성했다. 원본을 그대로 복사했으며 CLI/API 폴백·원본 재압축·배경 제거는 사용하지 않았다. 아래 제작 프롬프트 요약과 해시로 최종 선택 원본을 식별한다.

| 파일 | 규격 / SHA-256 |
| --- | --- |
| `assets/reliquary-opening-v2.png` | 1448×1086 RGBA, 실제 투명 알파, 4열×2행 / `078527e397c4ac12da8ae7c350c2e48f0ae29997526b228a87d083c437a9a4b3` |
| `assets/observatory-vault-v2.png` | 1536×1024 / `534d37909a181b5e6d36d7e28519b804a8c3e82605b07e14810db6975676df22` |

보관함 제작 브리프: premium Korean fantasy RPG sprite sheet, consistent front three-quarter camera; charcoal gunmetal and antique gold chest, thick articulated lid, twin claw locks, circular cyan reactor seal; eight physically changing opening poses, four columns by two rows, actual transparent alpha; no UI, text, people, particles or background. Closed → unlock claws → crack lid → progressive lid lift → fully open → settle. Maintain chest silhouette, perspective, materials and scale.

배경 제작 브리프: cinematic ruined cosmic observatory sanctuary after victory; monumental basalt pillars, antique gold inlays, distant astronomical ring mechanism, restrained cyan residual energy, gold/cyan volumetric light, reflective physical dark stone floor; empty foreground for three interactive coffers; no people, chests, UI, text or logos.

기존 용병 원화 `assets/ui/project-v/mercenaries/mercenary-v021-omega-x-source-art-v1.jpg`와 승인 프레임 `assets/ui/card-frames/mercenary-contract-frame-premium-v2.png`를 사용한다. 별 아이콘은 기존 코인 SVG와 같은 코드 기반 보상 아이콘 계열이며 용병 원화·보관함 비트맵의 대체물로 쓰지 않는다.

음원은 기존 `assets/sfx/v3-advancement-awakening-v1/`의 실제 녹음·폴리 편집본을 미리보기에서 재사용한다. 합성 오실레이터·절차적 노이즈를 추가하지 않았다. 원천 ID·URL·가공 이력: `preview/project-v-advancement-fx-v1/assets/audio/PROVENANCE.md`, `manifest.json`. 라이선스: [Mixkit Sound Effects Free License](https://mixkit.co/license/#sfxFree).

| 음원 | 사용 / SHA-256 |
| --- | --- |
| `afterimage-advancement-v1.mp3` | 선택 이동, 볼륨 0.10 / `28b9a99971ad0564aa0da74fc8a9627cc2758ebd835db63da722e291f242aef6` |
| `riposte-advancement-v1.mp3` | 개방 0.00초 시작, 기존 300ms 피크를 잠금 해제 0.30초에 정렬 / `e649a410e874bdfef29f88981170a5faaa683b4e34550ae459148e538831078f` |
| `immortal-advancement-v1.mp3` | 개방 0.797초 시작, 기존 333ms 피크를 주 방출 1.12초와 10ms 이내로 논리 정렬 / `d86b5f69e20c5d7f0527683d4f7c5980438c9dc912f75ebd006768f78b785691` |

위 음향 시각은 GSAP 호출과 기존 음원 매니페스트 기준이다. 실제 장치 출력 지연을 계측한 결과는 아니다. 볼륨 토글·화면 숨김·닫기 시 재생 중인 Audio를 정리한다.

## 검수 기록

`node --check` 및 `qa.mjs` 브라우저 검사 통과. Playwright를 설치한 환경 또는 `PLAYWRIGHT_MODULE_URL`로 지정한 기존 런타임에서 실행할 수 있다. `PREVIEW_URL`·`QA_OUTPUT`으로 검수 주소·결과 위치를 바꿀 수 있다.

- 실제 Chrome 재생·동영상 및 스크린샷: PC 1440×900, 모바일 390×844, 작은 모바일 320×568, 짧은 PC 1100×600.
- 각 화면에서 보관함 선택 → 중간 개방 → 용병 결과 → 닫기 검수. PC·모바일의 별·코인·재료 결과 확인.
- 요청 실패 후 선택/요청 ID 보존 재시도, 응답 대기 중 닫기, 반복 열기/닫기, 모션 축소 검사. 게임 `/api/` 요청 0회.
- 중복 캔버스 렌더 제거 뒤 일반/모션 축소 모드에서 자산 503 응답 → 재시도 → 개방 → 닫기를 추가 확인했다. 반복 열기 후 닫아도 캔버스와 활성 GSAP 타임라인이 남지 않았다. 브라우저 스크립트 오류 0건.
- 열린 보관함이 결과 글자와 겹친 1차 구성은 수정했고 최종 결과에서 소멸시킨다. 초기 닫기 버튼의 불필요한 자동 포커스 테두리를 제거했다.
- 위 검수 후 사용자 V2 시각 승인을 받았다. `tests/qa-core-reward-v2-live.mjs`로 PC 1440×900·모바일 390×844의 실제 코어 모듈 → 서버 핸들러 → V2 결과 연결, 주간 횟수 표시, 동일 보상 재확인, 실패 후 선택 복원·재시도, CMS 미리보기 무지급, 닫기 정리를 추가 확인했다. 운영 재화는 쓰지 않았다.

원래 독립 프리뷰의 검사 결과·스크린샷·WebM은 저장소 바깥 `../qa-core-rewards-v2/`, 게임 연결 증빙은 `../qa-core-reward-v2-live/`에 보관한다. 런타임 비트맵은 위 원본 해시 그대로 `assets/ui/core-raid-rewards-v2/`에 복사했다. 배포 범위와 관련 검사는 최신 출시 기록에 명시한다.

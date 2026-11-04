# 용병 전직 16종 전용 이펙트 · 연속 작화 제작본

2026-11-05. 현재 정본은 **painted-v2/**다. 사용자 “용병 스킬 만들듯이 이펙트 만들어라”에 따라 기존 용병 `skills-v4`와 같은 **ImageGen 연속 작화 → Effekseer 편집본 → 공식 WebGL 오프라인 출력 → 현재 V3 Pixi/GSAP 합성**으로 다시 제작했다.

최초의 선·문양 중심 시안은 **사용자 반려**다. [REJECTION.json](REJECTION.json)에 남겼으며 루트의 native/frames/runtime는 게임용 정본이 아니다. 새 재생기는 painted-v2/runtime만 로드한다. 기존 원화/프롬프트/반려 기록은 삭제하지 않았다.

검수 전장: **http://127.0.0.1:18804/**. 현재 V3 배경·진형·HUD·카드 도크·발테르/족로를 그대로 사용한다. 기본 선택·재생·배속·중단·구간 컨트롤만 제공한다. 별도 장식 프리뷰나 캐릭터/전장을 만들지 않았다.

## 이번 산출물

- **16종 × 8장 = 128장 고유 작화**, 내장 ImageGen 18회 중 16개 시트 채택. 파괴자 최초 시트의 가장자리 5픽셀과 두 번째 시트의 재질 변화를 반려하고 세 번째를 채택했다. [원본·해시](painted-v2/generation.json), [정확한 기본 프롬프트](painted-v2/prompts.json).
- 네이티브 **.efkefc 16개**, 편집용 XML·상대 경로 Texture·작성 스크립트. 저장/재열기/재내보내기 16종 모두 바이너리 일치. [native 검증](painted-v2/qa/native.json).
- 원본을 단순 셀 분리하고 동일 배율/투명 패딩으로 정렬했다. 도색·색 변경·마스킹·가짜 중간 작화는 없다. 채택한 **128셀 경계 잘림 0**, 원본 RGBA 보존. [셀 검사](painted-v2/qa/crop-audit.json).
- 60fps native에서 2프레임 간격으로 출력한 **304 PNG**, 빈 앞뒤를 제외한 **272 재생 프레임 참조 / 128 고유 패킹 프레임**. 16 PNG atlas **8.17MiB**, 모두 로드했을 때 디코딩 픽셀 **32.25MiB**. 이는 GPU 실측치가 아니다. [전달 명세](painted-v2/runtime/fx-manifest.json).
- 짧은 8장 작화가 약 **0.57초**에 재생된다. 고속 파열/붕괴에 맞춘 키 프레임 애니메이션이며 30fps 모두를 새로 그렸다고 표현하지 않는다. 정상/0.5/0.25/2배 재생 가능.
- [정상 속도 16종](painted-v2/qa/16-effects-normal.webm), [0.5배속 16종](painted-v2/qa/16-effects-half-speed.webm), [원화 요약](painted-v2/qa/16-painted-effects-overview.png), [현재 전장 16종](painted-v2/qa/16-effects-battle-overview.png).

## 16종의 다른 동작

| 전직 | 제작한 주 효과 |
| --- | --- |
| 선봉장 | 주황색 창끝 충격파가 전방으로 터지고 긴 잔광으로 갈라짐 |
| 결투가 | 두 청색 검기 곡선이 조여들어 충돌·분리 |
| 처형자 | 검보라색 무거운 검격이 교차하며 파열 |
| 광전사 | 몸을 둘러싼 붉은 불꽃이 솟고 찢어져 소멸 |
| 파괴자 | 황금 결정 보호막에 균열이 번지고 두꺼운 파편으로 분해 |
| 연격자 | 방향이 다른 청백색 검격 세 번이 이어지고 잘려 나감 |
| 흡혈귀 | 붉은 구슬·나선이 적에서 시전자에게 돌아와 흡수 |
| 복수자 | 응축된 붉은 흉터가 가시형 파열로 폭발 |
| 방패기사 | 입체 은색 방패가 충격을 받아 갈라지고 파편으로 흩어짐 |
| 결계사 | 청록색 결정 면이 올라와 빈 중심을 두른 결계로 결합 |
| 불사자 | 흩어진 금빛 조각이 다시 모여 생명 불꽃으로 펼쳐짐 |
| 재생자 | 녹색 생명 줄기·잎이 솟아오른 뒤 가느다란 잔광으로 소멸 |
| 치유사 | 백금빛 흐름과 깃털형 빛이 아군을 감쌈 |
| 수호자 | 날개 달린 청백색 방패가 지정 아군에게 이동·도착 |
| 정화사 | 흰 파도가 검보라색 조각을 찢어 없앰 |
| 지휘관 | 입체 금빛 지휘 깃발이 펴지고 긴 빛의 띠로 분해 |

## V3 연결과 검수

V3 source ref는 [v3-source-ref.txt](v3-source-ref.txt)의 `f19256b96e823d132bd0ba0e0cf92459e6c8df15`로 고정했다. Git 객체에서 동일 커밋의 엔진/로더를 읽고, 기존 의존성과 자산을 재사용한다. 공유 출시 체크아웃과 운영 코드는 수정하지 않았다.

[AdvancementEffects.mjs](AdvancementEffects.mjs)는 기존 effectLayer와 engine.timeline에 등록한다. 단일 Pixi, 단일 전투 canvas, 별도 ticker/실시간 Effekseer 컨텍스트/피해 계산 없음. 시전자·대상은 호출자가 명시하며 HP/보호막/추가타·발동 조건을 자체 계산하지 않는다. 로딩 중 취소, eventId 중복, 비활성 전장, 종료 정리를 처리한다. 텍스처는 동시 소비 참조 수로 보호하며 사용하지 않는 캐시만 32MiB 예산 아래로 회수한다. 주 작화는 normal/straight alpha로 색과 어두운 내부를 보존한다.

- **284개** PC1440/모바일390/적 방향 검사 통과: 16종 프레임 변화·정지·정방향/역방향 탐색·효과 OFF/ON·취소·숨김·로드 중 취소·중복 억제·동시 4종·정리·단일 canvas·가로 넘침 없음. 실제 normalAttack OFF/ON 각각 피해 콜백1회. [검사](painted-v2/qa/verification.json).
- 첫 진입의 글꼴/컨트롤 레이아웃에 따른 좌표 변화로 탐색 동일성 2건이 실패했다. 기존 renderer의 초기 레이아웃 완료 뒤 ready를 노출하도록 수정 후 같은 검사에서 모두 통과했다. 이펙트는 전장 크기 변경 뒤 현재 액터 좌표를 따른다.
- 이후 흡혈/수호의 도착 시점과 지원형의 검수용 공격 대상 선택을 수정했다. **9개 최종 검사**로 도착 후 잔향·지원 효과를 선택해도 실제 공격은 적에게 적용·공유 텍스처 생존·16종 캡처·두 영상 디코딩/탐색을 확인했다. [최종 검사](painted-v2/qa/final.json).
- 정상/0.5배속 16종씩 **32회 실제 재생 녹화**, 각 완료 true/잔여 효과0/페이지 오류0. 녹화 제목은 오프라인 기록용이며 게임 화면을 바꾸지 않는다. [녹화 관측](painted-v2/qa/recording.json).
- 시각 확인 범위: 생성 원화16종, 수정 원화, 전장 PC/모바일 캡처, 영상에서 추출한 시점별 프레임. 연속 동영상 전체를 사람이 시청하거나 물리 모바일 FPS를 검증했다고 표현하지 않는다.

## 현재 범위

**이펙트 리소스와 로컬 V3 재생 제작본**이다. 사용자 최종 시각 승인·DNF급 품질 달성·전직 서버 이벤트 등록·운영 배포·실기기 검수는 아직 없다. 자동 발동은 서버 규칙 구현 단계에서 연결한다. 복수자 충전 지속 상태, 방패 3/2/1잔여 표시, 지휘관 상시 아군 표식도 해당 상태 연동 단계에 남아 있다. 이번 16종의 주 발동 작화에 이전 반려 문양을 섞지 않는다.

기존 전직 기획의 **SS급 이상·용병16레벨 이상·첫 전직과 변경 각각 코인10조+마스터의 별5,000만·확률 없이 즉시**는 유지한다. 이번 이펙트 작업으로 그 비용 소모나 전직 기능이 출시된 것은 아니다. 계정/운영DB/공지발송/예약/유지관리 작업은 실행하지 않았다.

## 재현

저장소 루트에서 실행한다. 포터블 Effekseer 1.70e와 공식 WebGL 1.70e를 기존 위치에서 사용하며 새 도구 설치/의존성 복사는 없다.

```powershell
node preview/v35-advancement-fx-20261104/painted-v2/author.mjs
node preview/v35-advancement-fx-20261104/bake.mjs preview/v35-advancement-fx-20261104/painted-v2
node preview/v35-advancement-fx-20261104/pack.mjs preview/v35-advancement-fx-20261104/painted-v2
node preview/v35-advancement-fx-20261104/build.mjs
node preview/v35-advancement-fx-20261104/serve.mjs
node preview/v35-advancement-fx-20261104/painted-v2/qa/verify.mjs
node preview/v35-advancement-fx-20261104/painted-v2/qa/record.mjs
node preview/v35-advancement-fx-20261104/painted-v2/qa/final.mjs
```

사용자가 native/art를 직접 수정하면 기존 파일을 덮어쓰지 않고 다음 버전으로 진행한다. 원본은 [generation.json](painted-v2/generation.json)에 기록한 내장 ImageGen 산출물이며 제3자 게임/샘플 작화를 사용하지 않았다. Effekseer는 실제 오프라인 출력에 사용했고, 이번 범위에서 Blender·Spine 새 모션 제작이나 편집기 화면 조작은 하지 않았다.

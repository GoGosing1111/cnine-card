# 은백·금색 대검 기사 — V13 모션 승인·프레임 크기 보정

2026-10-01 사용자 **“모션 승인,단 스프라이트 별로 캐릭터 크기가 일정하지 않던것을 확인함 다시 검수할것”**를 기록했다. 모션 승인은 유지하며, 추가 지시인 프레임별 크기 검수를 진행했다. 승인 기록은 `motion-approval-20261001-v13.json`이다.

**최신 전체 프리뷰:** http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/?showcase=1&v=13#battle

- 실제 사용 중인 **27프레임**을 승인 시작 자세와 같은 표시 배율·발 기준선에서 비교했다. 준비·들기·타격·복귀에 같은 원본 기준 높이 714를 넣어, 원본에서 달라진 크기가 그대로 노출되는 문제를 확인했다.
- 네 모션의 **17참조 프레임을 재패킹**했다. 목·골반·무릎·발목의 연결 길이로 자세와 크기를 구분하고, 똑바로 서는 복귀 2·3번은 실제 투구부터 발까지의 높이도 사용했다. 15개 프레임의 몸 배율이 바뀌었고 두 기준 프레임의 배율은 유지했다. 신규 작화는 0개다.
- 별도 검증에서는 계산식만 비교하지 않고 **패킹된 PNG의 실제 투구 픽셀**을 읽었다. 대기·중립 준비·서 있는 복귀 6개 기준 프레임의 크기 편차는 **7.56% → 1.09%**다. 이는 서 있는 기준 프레임에 대한 수치이며, 모든 자세가 같은 높이라는 의미가 아니다. 웅크림·기울기·무릎 굽힘은 유지했다.
- 원본 시트, 갑옷·망토·투구 작화, 검 PNG, 한손 대기, 파지 축·손 접점·발 접점은 보존했다. 몸 전체를 균일 배율로 보정하고 원본 대검을 같은 최종 길이로 다시 합성했다. 전체 이미지를 확대해 검까지 커지는 처리를 하지 않았다. 부위별 변형·리깅·카메라 변경은 없다.
- 대시·피격·쓰러짐도 같은 기준선에서 확인했다. 돌진의 기울기와 무릎을 꿇는 높이 변화를 크기 오류로 간주하지 않으며 해당 승인 시트는 유지했다. 크라이베른에 맞췄던 전역 표시 크기도 그대로다.
- PC·모바일에서 27개 실제 Pixi 텍스처, 모든 공격·스킬의 수정 아틀라스, 고정 검 길이, 검끝 여백, 아우라 추종과 방패 상체 부착을 확인했다. 오류는 0개다. 직접 관련 회귀 6개와 독립 크기 검증을 통과했다.

보정 전후 고정 카메라 비교는 [size-comparison.webp](qa/v13/size-comparison.webp), 적용된 실제 V3 내려찍기는 [overhead-size-v13.webp](qa/overhead-size-v13.webp), 모든 스킬은 [all-skills-size-v13.webp](qa/all-skills-size-v13.webp)다. 세부 좌표·판정은 `size-landmarks-v13.json`, `qa/v13/scale-estimates.json`, `qa/v13/size-report.json`에 남겼다. 랜드마크는 수동으로 검토한 2D 측정값이며 3D 관절의 완전 일치를 뜻하지 않는다.

PixiJS **8.20.0**, GSAP **3.13.0**, 기존 V3 렌더러·타임라인을 그대로 사용한다. 모든 공격의 타격 **1.98초**, 승인 대기 복귀 **3.15초**, 96개 이펙트 프레임도 유지한다. 독립 프리뷰만 반영했으며 등급·스킬 배정·운영 활성화는 변경하지 않았다.

재현 순서: `audit-size-v13.mjs --before` → `build-size-v13.mjs` → `audit-size-v13.mjs` → `verify-size-v13.mjs` → `qa-size-v13.mjs`. 기존 `qa/v13/before-motion.json`은 최초 V12 스냅샷이며 재실행으로 덮어쓰지 않는다. `build-size-v13.mjs`는 V13 파생 파일만 작성한다. 최종 메타데이터는 `finalize-size-v13.mjs`로 갱신한다.

## V12 내려찍기 공통 채택·방패 좌표 수정

2026-10-01 사용자 지시 **“내려찍기 모션을 모든 스킬,공격모션으로 채택해”**를 적용했다. 기본 공격·홍련 강격·전장 심판·루비 반격벽·종결 집행과 기준 모션 모두 기존 V10 두손 파지 → 들어 올리기 → 내려찍기 → 한손 복귀 프레임을 사용한다. 기록은 `motion-adoption-20261001.json`이며 선택된 4개 아틀라스의 해시를 고정했다. 캐릭터·검 이미지를 새로 만들지 않았다.

**최신 전체 프리뷰:** http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/?showcase=1#battle

- 모든 공격·스킬의 준비와 복귀는 같은 프레임·같은 속도이며, 공통 타격 시점은 **1.98초**, 승인 한손 대기 복귀는 **3.15초**다. 일반 공격의 참격, 스킬 결정 파열, 방벽, 궁극기 광역 폭쇄는 각각의 기존 효과를 유지한다.
- 방패 아틀라스가 중심 앵커인데 발 위치에 배치돼 아래로 내려간 문제를 수정했다. 효과 중심과 충돌광을 **발에서 몸 높이의 54% 위, 상체 앞쪽**에 붙인다. 크기도 착용 캐릭터 몸 높이에 맞춰 따라가며 적의 위치·크기에 의존하지 않는다.
- 방벽 시전도 같은 전진·내려찍기 자세를 사용해 들어 올린 검이 상단에서 잘리지 않게 했다. 방벽에서 적 밀림·피격 색 변경은 발생하지 않는다.
- 올려베기·회전 베기 시트는 제작 이력으로 보존하고 현재 동작 선택과 로딩에서는 제외한다. 현재 사용하는 모션 참조는 **27프레임**, 보존 전체는 64참조·54개 고유 자세다. 이펙트는 기존 **96프레임**이다.
- `qa/all-skills-overhead-v12.webp`는 모든 효과·아우라를 켠 실제 V3 재생 캡처다. 전체 시연은 **27.6초**다. `모션만`으로 파지·무기·체형을 별도 확인할 수 있다.

PixiJS **8.20.0**, GSAP **3.13.0**, 기존 V3 렌더러·단일 타임라인을 사용한다. 실제 변경은 `skill.mjs`, `source/KnightFX.js`, `source/preview.js`, `index.html`이며 원본 PNG·아틀라스는 그대로다. 모션 채택과 운영 연결은 별개로, 서버 피해·능력치·등급·스킬 배정·라이브 활성화는 변경하지 않았다.

관련 검사 **10개 통과** 후 방벽 위치·검 상단 여백 수정에 직접 관련된 **5개만 재검사해 통과**했다. PC·모바일 전체 시연, 타격·복귀·배속·중단·효과 정리와 방패의 상체 부착을 확인했다. 방벽 후속 검수에서 검끝 잘림과 콘솔 오류는 없었다. `qa/v12/browser-report.json`, `qa/v12/guard-report.json`, `qa-report.json`에 기록했다.

```powershell
node preview/mercenary-crimson-silver-knight-battle-v1/apply-adoption-v12.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/build.mjs
node --test preview/mercenary-crimson-silver-knight-battle-v1/qa.test.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/qa-browser.mjs v12
node preview/mercenary-crimson-silver-knight-battle-v1/qa-guard-v12.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/record-demo.mjs all all-skills-overhead-v12.webp
node preview/mercenary-crimson-silver-knight-battle-v1/finalize-adoption-v12.mjs
```

## V11 효과 제작 이력

2026-10-01 후속 요청으로 라그니엘 참고 두손 모션에 **마력 상승 → 검신 발광 → 참격 잔상 → 충돌 파편·지면 잔광**을 추가했다. 기존 캐릭터 54개 자세, 대검 PNG와 모든 모션 아틀라스는 그대로다. 기존에 그린 96프레임 효과를 사용하고, 검의 실제 위치에 맞춘 광원·궤적·입자를 보조 계층으로 더했다. 새 작화 프레임으로 세지 않는다.

**전체 스킬 프리뷰:** http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/?showcase=1#battle

`전체 스킬 재생`은 아우라·효과를 켜고 대시 → 올려베기 → 연속 베기 → 두손 강격 → 심판 → 방벽 → 궁극기를 **24.85초** 동안 이어 재생한다. 기존 GSAP 타임라인이 끝날 때 다음 모드로 넘어가며 별도 타이머·Ticker를 만들지 않는다. 일시정지·배속은 현재 타임라인에 적용되고, 중단·화면 이탈 시 연속 재생도 해제된다. 마지막에는 승인된 대기 자세로 정착한다.

- `qa/all-skills-fx-v11.webp`: 모든 효과와 아우라를 적용한 실제 V3 전체 재생 캡처.
- `qa/overhead-fx-v11.webp`: 강화된 두손 강격의 실제 V3 재생 캡처.
- `모션만`을 켜면 광원·파편·궤적·카메라 진동이 사라져 원래 작화와 파지를 따로 볼 수 있다.

V11 효과 구현은 `source/KnightFX.js`, `skill.mjs`, 전체 재생은 `showcase.mjs`, `source/preview.js`다. **PixiJS 8.20.0 / GSAP 3.13.0**과 기존 V3 효과 레이어를 재사용한다. 마력 상승 0.56~2.17초, 참격 1.70~2.63초, 충돌 1.98초, 결정 충돌의 잔향은 3.28초까지 이어진다. 검광은 원본 검의 파지점·칼끝 좌표에 맞추며 무기나 신체를 변형하지 않는다. 잔상은 동일 시계의 과거 10개 자세 위치에서 계산해 되감기·시킹 결과가 같다. 풀은 최대 128개이며 사용하지 않는 입자는 숨긴다.

V11 관련 검사 **9개 통과**. PC 1440×1000·모바일 390×844에서 전체 7개 연출 완주, 효과 ON 복원, 0.25×/0.5×/1×/2×·일시정지·시킹·중단·대상 소멸·종료를 확인했다. 콘솔·자산 오류, 가로 넘침, 종료 후 남은 타임라인·일회성 효과는 없었다. 원본 해시·검 길이·고정 복귀점 검사도 통과했다. 사용자 시각 검수 대기이며 운영 연결은 하지 않았다.

```powershell
node preview/mercenary-crimson-silver-knight-battle-v1/build.mjs
node --test preview/mercenary-crimson-silver-knight-battle-v1/qa.test.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/qa-browser.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/record-demo.mjs all
node preview/mercenary-crimson-silver-knight-battle-v1/record-demo.mjs overhead overhead-fx-v11.webp
node preview/mercenary-crimson-silver-knight-battle-v1/finalize-fx-v11.mjs
```

## V10 모션 제작 이력

2026-10-01. 기존 제작 방식인 **내장 ImageGen 연속 포즈 + 원본 대검 합성**으로 작업했다. GIF를 참고한 대각·회전 연속 베기와 승인 자세 복귀를 마무리하고, 후속 요청으로 라그니엘을 참고한 **두손 들어 올리기·내려찍기**를 별도로 추가했다.

독립 V3 프리뷰에 반영했으며 **사용자 시각 검수 대기**다. 원화·기존 파지 승인을 새 모션 승인으로 확대하지 않는다. 이름·등급·성능·스킬 배정·운영 활성화는 변경하지 않았다.

## 확인

```powershell
node preview/mercenary-crimson-silver-knight-battle-v1/serve.mjs
```

http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/

- `홍련 연속 베기` / `종결 집행`: 기존 작업을 이어 만든 대각 올려베기 → 몸통 회전 → 넓은 베기 → 승인 자세 복귀.
- `두손 내려찍기`: 승인 한손 대기 → 두손 파지 → 머리 위로 들어 올리기 → 내려찍기 → 충격 제동 → 한손 대기 복귀.
- `모션만`은 효과·아우라·카메라 진동을 숨긴다. 0.25×/0.5× 재생과 프레임 탐색으로 손과 검 연결을 확인할 수 있다.

| 검수 파일 | 내용 |
|---|---|
| `qa/motion-v9-preview.webp` | 연속 베기, 고정 크기 확대·정상 속도 |
| `qa/motion-v9-slow.webp` | 연속 베기 개별 자세 저속 확인 |
| `qa/motion-v10-twohand-preview.webp` | 추가 두손 모션, 정상 속도 |
| `qa/motion-v10-twohand-slow.webp` | 추가 두손 모션 개별 자세 확인 |
| `qa/ultimate-preview.webp` | 실제 V3 전장 궁극기 재생 기록 |
| `qa/overhead-preview.webp` | 실제 V3 전장 두손 내려찍기 재생 기록 |
| `qa/v10-twohand-poses.png` / `qa/v10-twohand-grips.png` | 두손 자세·파지 확대 |

## 고정한 기준

대기 원본은 `assets/knight-sd-v14-original-blade-approved-grip.png`이며 SHA-256은 `D2CAB7DDE716CF9A0554AF44A03A448A7BCCD9E402928D87620C72C73879A6CC`다. 기존 승인 이미지와 V12 손의 불투명 픽셀 7,352개는 보존했다. V8 원화와 승인 파일은 덮어쓰지 않았다.

최신 사용자 첨부는 `assets/user-approved/return-pose-reference-20261001.png`로 바이트 그대로 보존했다. 해당 자세는 기존 `assets/motion-v5/ready-a-source.png` 첫 포즈와 시각적으로 대응한다. 두 입력은 알파·인코딩이 달라 동일 해시라고 주장하지 않는다.

복귀 구간의 마지막 작화는 이 승인 첫 포즈를 재사용한다. 이후 모든 생존 모드의 시작·종료·중단은 **동일한 idle 0 텍스처**를 사용한다. 비슷하게 새로 그린 대기 포즈를 최종 복귀점으로 쓰지 않는다. 몸 높이와 발 기준점을 통일하고, 원화와 나란히 자연 성인 비율·시점을 검수했다. 자동 검사는 골격이나 작화의 완전한 동일성을 증명하지 않으며 새 프레임은 사용자 검수 대상이다.

대검 원본은 `assets/weapon/sword-original.png`, SHA-256 `A31B35AAD0800C06516BC7EF1BE9F0243ACCA5782D8C70F53C4041A8304661E7`이다. 원본에서 추출한 RGB 158,452픽셀과 검신·가드·칼끝·보석 디자인을 보존한다. 몸 대비 균일 배율, 검 전체의 회전·이동만 사용한다.

두손 포즈에서는 원래 손에 가려져 투명했던 손잡이 부분이 드러났다. 원본 손잡이의 같은 재질 구간을 복사해 기존 검 뒤에만 놓고 양쪽 원본 장갑을 전경으로 복원했다. 마스터 PNG와 불투명 원본 픽셀, 검신·칼끝 형태는 그대로다. 위치·출처는 `weapon.hiltOcclusionUnderlay`, 각 프레임의 `weapon.hiltUnderlay`, `compose-weapon.mjs`에 기록했다. 손잡이를 휘거나 늘리는 보정은 하지 않았다.

## 제작과 실제 프레임 수

4개 포즈씩 큰 원본 시트를 만들었다. 기존 녹색 손잡이·청록 끝·자홍 가드 등록 방식으로 실제 손잡이 축과 주먹의 가림 범위를 검출한다. 원본 대검을 합성하고 같은 작화의 닫힌 장갑을 전경으로 복원하며 표식은 제거한다. 두손 포즈는 두 가림 구간을 함께 처리한다.

| 시퀀스 | 프레임 참조 |
|---|---:|
| 승인 정지 대기 | 1 |
| 대시 / 시전 / 피격 / 착지 | 4 / 4 / 2 / 3 |
| 한손 준비 / 올려베기 / 몸통 전환 / 회전 베기 | 2 / 6 / 3 / 5 |
| 한손 회수 / 연속 베기 복귀 / 방어 | 10 / 5 / 2 |
| 두손 파지 / 들어 올리기 / 내려찍기 / 한손 복귀 | 4 / 4 / 4 / 5 |

**고유 자세 54개, 런타임 참조 64프레임**이다. 추가 두손 모션은 신규 원본 16포즈와 승인 복귀 포즈 1회 참조로 구성한다. 공통 복귀·방어·피격 시작 자세의 중복 10개는 새 작화로 세지 않는다. 별도 아우라·대시·참격·방벽·집중·집행·궁극기 효과는 기존 **96프레임**을 재사용한다. 재생 캡처·역재생·잔상·검 회전은 신규 작화 수에 포함하지 않는다.

사용 중인 원본은 `assets/motion-v5/`, `motion-v7/`, `motion-v8/`, `motion-v9/`, `motion-v10/`에 있다. 프롬프트는 해당 버전의 `prompts/motion-v*-*.txt`다. V6 역수 파지, V8 마지막 대기 포즈와 새 두손 제작 중 제외한 초안은 `rejections.json`에 구분했다. 제외한 프레임은 현재 재생에 연결하지 않는다.

GIF는 134프레임·8.970초이며 `qa/reference/metadata.json`과 `first-cycle.png`에 분석 자료가 있다. 자세의 흐름만 참고하고 GIF의 카메라를 캐릭터 기준으로 사용하지 않는다. 라그니엘의 `assets/ragniel-sd-v1.png`와 `assets/source/slash-v1.png`는 두손 파지·준비·타격·회수 순서만 참고했다. 라그니엘의 머리 비율·날개·의상·칼은 복제하지 않았다. 원본 참조 해시는 `manifest.generation.references`에 있다.

## V3 연결과 검수

기존 V3 렌더러, **PixiJS 8.20.0 / GSAP 3.13.0**을 사용한다. 실제 구현은 `source/KnightFX.js`, `source/preview.js`, `skill.mjs`이며 GSAP 한 시계가 모션·효과·이동·충돌·배속을 제어한다. 서버 피해나 승패를 계산하지 않는다. 일반 카드 5장과 별도 용병 슬롯, 기존 도감 원화·카드 프레임을 유지한다.

- 표시 몸 높이: 기사 312.39, 크라이베른 312.12. 투명 여백을 제외한 몸 기준이며 머리를 따로 키우지 않는다.
- 타격 중 발은 상대와 같은 지면 높이에 고정한다. 검끝을 맞추려고 캐릭터를 수직 이동시키지 않는다.
- 충돌 시각: 한손 공격 0.78초, 연속 베기 0.75·1.48초, 심판 1.48초, 궁극기 1.23·1.96초, 추가 두손 내려찍기 1.98초.
- 원본 대검 선분이 대상 몸을 통과하는지 확인하고 참격·충돌 효과와 기존 라이선스 녹음음을 같은 충돌 시계에 맞췄다.
- 주변 광원은 현재 캐릭터·검 실루엣을 감싸는 진한 붉은 외곽과 얇은 금빛 테두리다. 전용 아우라 12프레임을 함께 사용한다.

```powershell
node preview/mercenary-crimson-silver-knight-battle-v1/build-motion-v7.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/build-motion-v8.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/build-motion-v9.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/build-motion-v10.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/build.mjs
node --test preview/mercenary-crimson-silver-knight-battle-v1/qa.test.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/qa-browser.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/finalize-motion-v10.mjs
```

변경 범위 검사 **8개 통과**. PC·모바일 10개 모드, 추가 두손 준비·타격·복귀, 배속·일시정지·중단·대상 소멸·종료를 확인했고 콘솔/자산 오류와 가로 넘침은 없었다. 기록은 `qa-report.json`, `qa/browser-report.json`이다. 독립 프리뷰 자산·코드만 반영하며 게임 전체 검사나 운영 배포는 하지 않는다.

# 은백·금색 대검 기사 — V10 전투 모션 검수판

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

# FM 딤우스 아바타 원화

2026-09-17 제작. 내장 `image_gen`으로 생성·수정한 원본 PNG 2종이다.

## 반영한 요청

- 기존 딤우스(A-11, DIMWOOS_ESPORTS_ACE)의 얼굴·긴 흑발·앞머리와 일러스트 화풍을 기준으로 제작했다.
- 키 큰 슬렌더 체형, 짧은 밀착 스커트, 상의 단추를 살짝 푼 FM 유니폼을 적용했다.
- FM의 검정·에메랄드·금색과 공식 문장을 반영했다.
- 사용자 최종 피드백에 따라 로비 V3를 현대적인 FM 라운지에서 콘솔에 한 손을 가볍게 짚고 서는 구도로 다시 제작했다.
- 신발은 검정 슬링백 힐에 에메랄드 스트랩·금색 버클을 조합했다.
- 장비창용은 손을 앞에 모은 별도 자세로 제작했으며, 사용자 승인 후 원본과 해시를 고정했다.

## 최종 원본

| 용도 | 파일 | 크기 | 형식 |
| --- | --- | --- | --- |
| 로비 | [로비 원화 V3](assets/avatar-fm-dimwoos-lobby-source-art-v3.png) | 1024×1536 | RGB PNG |
| 장비창 | [장비창 전신 V1](assets/avatar-fm-dimwoos-equipment-source-art-v1.png) | 1024×1536 | RGBA PNG, 실제 투명 채널 |

내장 생성 도구의 원본을 무가공 복사했다. 장비창 원본은 전체 1,572,864픽셀 중 1,200,855픽셀이 완전 투명하며, 알파 범위는 0–254다. 해시는 [manifest.json](manifest.json)에 기록했다.

[최신 로비 V3 프롬프트](prompt-lobby-v3.md) · [이전 제작 프롬프트](prompts.md)

## 승인 및 보존

- 사용자가 장비창 이미지와 얼굴·의상·유니폼을 승인했다. 장비창 V1은 수정하지 않았다.
- 장비창 고정 SHA-256: `53ae25adf9bc0d76936a2697d70ad3a70b43ef029d8345363b7a604868528e16`
- 로비 V2는 어색한 자세로 재작업 지시를 받았으며 이력으로만 보존한다. 최신 로비 후보는 V3다.
- V3는 손과 콘솔의 접점, 지지 다리와 발 위치, 얼굴·의상 일관성, 1024×1536 크기를 확인했다.

## 적용 상태

2026-09-17 후속 지시로 A-21 / `FM_DIMWOOS` 운영 등록 및 FM 클랜 11일 지급이 승인됐다. T1 조은과 동일한 코인 획득량 +75%·레이드 입장 +10회, 사용·공개 ON, 판매 OFF, 이벤트 지급이다. 진짜디임 편입 후 FM 22명에게 지급한다.

운영 이미지 생성은 `node preview/avatar-fm-dimwoos-v1/build-assets.mjs`를 사용한다. 원본 해시를 먼저 확인하고 비율 유지 크기 조정·투명 여백·WebP 압축만 수행한다. 운영 파일은 [runtime-manifest.json](runtime-manifest.json), 등록 정보는 [catalog.json](catalog.json), 편입·정원·지급 원자 처리와 검증은 [운영 문서](../../docs/fm-dimwoos-admission-avatar-20260917.md)에 기록했다.

## 참조

- 딤우스: `assets/ui/avatars-v1/lobby-source-drafts/avatar-f08-ember-esports-ace-lobby-v1.png`
- FM 유니폼: `preview/avatar-fm-orikkung-v1/assets/avatar-fm-orikkung-lobby-source-art-v1.png` — 유니폼의 색·문장만 참조
- FM 문장: `assets/ui/clan/marks/source/fm-clan-mark-source-v1.png`
- T1 조은: 포즈·신발의 중복 여부 비교에만 사용

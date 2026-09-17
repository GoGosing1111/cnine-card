# FM 딤우스 아바타 원화

2026-09-17 제작. 내장 `image_gen`으로 생성·수정한 원본 PNG 2종이다.

## 반영한 요청

- 기존 딤우스(A-11, DIMWOOS_ESPORTS_ACE)의 얼굴·긴 흑발·앞머리와 일러스트 화풍을 기준으로 제작했다.
- 키 큰 슬렌더 체형, 짧은 밀착 스커트, 상의 단추를 살짝 푼 FM 유니폼을 적용했다.
- FM의 검정·에메랄드·금색과 공식 문장을 반영했다.
- 사용자 피드백에 따라 로비 포즈를 두 손을 뒤로 모은 사선 자세로 수정했다.
- 신발은 검정 슬링백 힐에 에메랄드 스트랩·금색 버클을 조합했다.
- 장비창용은 손을 앞에 모은 별도 자세로 제작했다.

## 최종 원본

| 용도 | 파일 | 크기 | 형식 |
| --- | --- | --- | --- |
| 로비 | [로비 원화 V2](assets/avatar-fm-dimwoos-lobby-source-art-v2.png) | 1024×1536 | RGB PNG |
| 장비창 | [장비창 전신 V1](assets/avatar-fm-dimwoos-equipment-source-art-v1.png) | 1024×1536 | RGBA PNG, 실제 투명 채널 |

내장 생성 도구의 원본을 무가공 복사했다. 장비창 원본은 전체 1,572,864픽셀 중 1,200,855픽셀이 완전 투명하며, 알파 범위는 0–254다. 해시는 [manifest.json](manifest.json)에 기록했다.

[생성·수정 프롬프트](prompts.md)

## 적용 상태

아트 검토용 원본 준비 상태다. 기존 아바타 자산 계약에 따라 로비와 장비창 원본을 분리했다. 운영 아바타 ID·효과·가격·획득 정책과 계정 지급 연결은 이 작업에 포함하지 않는다.

## 참조

- 딤우스: `assets/ui/avatars-v1/lobby-source-drafts/avatar-f08-ember-esports-ace-lobby-v1.png`
- FM 유니폼: `preview/avatar-fm-orikkung-v1/assets/avatar-fm-orikkung-lobby-source-art-v1.png` — 유니폼의 색·문장만 참조
- FM 문장: `assets/ui/clan/marks/source/fm-clan-mark-source-v1.png`
- T1 조은: 포즈·신발의 중복 여부 비교에만 사용

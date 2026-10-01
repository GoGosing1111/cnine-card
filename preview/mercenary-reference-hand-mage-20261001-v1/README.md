# 사진 참조 손 마력 마법사 — 최신 V7 손 구조 재작화

최신 검수본은 `assets/hand-mage-source-art-v7-natural-hand.png`다. 사용자가 V4의 손 구조를 반려하여, 손가락을 과하게 벌린 기존 모양 대신 손바닥을 살짝 오므린 자세로 손 전체를 다시 그렸다. 엄지 뿌리와 손바닥 볼륨, 네 손가락의 마디·길이 차이, 짧은 새끼손가락과 둥근 손톱을 확대 확인했다. 얼굴·머리·의상 등 손 수정 영역 밖의 변경 픽셀은 저장본 재검사에서 **0개**다.

- 원본: 사용자가 재첨부한 `sources/user-hand-fix-reference.png`.
- 실제 제작: 내장 image_gen, `prompt-v5-anatomy-redraw.txt` 및 `prompt-v6-pinky-anatomy.txt`.
- 손 부분 생성본: `assets/hand-crop-v6-natural-five-digits.png`.
- 기록: `manifest-v7-natural-hand.json`; 손 확대: `qa/v7-hand-detail.png`.
- 재현: `compose-natural-hand-v7.ps1`. V5의 네 손가락 중간 결과는 반려 이력으로 남긴다.
- V7은 사용자 검수 대기다. V4는 손 구조 반려본으로 보존한다.

## V4 국소 수정 이력 — 사용자 반려

V4 `assets/hand-mage-source-art-v4-hand-only.png`는 개수만 교정했으나 손의 자연스러움을 충족하지 못해 사용자에게 반려됐다. 해당 버전은 이력으로만 보존한다. 당시 손 수정 마스크 밖의 변경 픽셀은 0개였으나, 이 수치는 해부학적 완성도를 뜻하지 않는다.

- 최신 기록: `manifest-v4-hand-only.json`; 손 확대 검수: `qa/v4-hand-detail.png`.
- 실제 생성 프롬프트: `prompt-v2-hand-fix.txt`, `prompt-v3-hand-fix.txt`.
- 국소 반영 및 픽셀 검증 재현: `compose-hand-only.ps1`.
- V1은 왼쪽 손 네 손가락 오류, V2는 여섯 손가락 오류로 대체됐다. V3는 다섯 손가락 수정 중간본이며, 이번 재첨부 원본의 다른 영역을 보존한 결과는 V4다.
- 모든 버전은 사용자 최종 시각 승인 대기다.

## 최초 V1 제작 기록

사용자 첨부 캐릭터를 참고한 용병 원화 검수 대기본이다. 얼굴·검은 장발·귀 장식과 흰색 비대칭 상의, 검정/붉은색 치마·벨트 특징을 반영하고, 원본의 정면 걷기 자세를 새로운 양손 주문 시전 자세로 바꿨다. 지팡이 없이 한 손의 응축 마력구와 다른 손의 흐르는 마력 이펙트를 표현했다.

- 원화: `assets/hand-mage-source-art-v1.png` — 생성 원본 바이트 그대로, 1024×1536 RGB PNG.
- 참조 원본: `sources/user-character-reference.png` — 첨부 원본 바이트 그대로 보존.
- 실제 전체 생성 프롬프트: `prompt-v1.txt`. 도구: 내장 `image_gen`.
- 검수 파생본: `qa/thumbnail-160.png`, `qa/frame-composite-review.png`. 프레임은 별도 QA 계층이며 원화에 합치지 않았다.
- 최초 검수에서 놓친 왼쪽 손 네 손가락 오류가 사용자에게 지적됐으며 V4로 수정했다. 귀 끝이 상단에 닿으며 프레임 적용 시 상단과 겹치는 점은 최종 프레이밍 검수 사항으로 남겼다.
- 사용자 얼굴 닮음·시각 최종 승인 대기. 이름·등급·코드·SD·도감·전투·운영 연결은 미정이다.

해시와 참조 역할, 규격·검수 결과는 `manifest.json`에 보존한다. 신규 원화 후보 보존 작업이므로 게임 테스트와 운영 배포는 수행하지 않는다.

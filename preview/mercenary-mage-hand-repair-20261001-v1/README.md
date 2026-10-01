# 첨부 원화 손 국소 교정 — 2026-10-01

사용자가 재첨부한 원본의 화면 왼쪽 손만 교정한 별도 작업이다. 이전 폐기된 정면 마법사 작업을 재개하거나 승인한 것이 아니다.

- 최종 검수본: `assets/hand-corrected-v1.png` — 1024×1536 RGB PNG.
- 첨부 원본: `sources/user-original.png`, SHA-256 `E89EC6B09E10DFCDD8B16322E2E241367A018A74CE4E01D70FD8D2BD2B330361`.
- 내장 image_gen 실제 최종 프롬프트: `prompt-v2-anatomy-reference.txt`.
- 생성 결과: `assets/hand-corrected-generation.png`. 첫 네 손가락 결과는 `assets/four-digit-attempt-rejected.png`로 구분한다.
- 손목과 손등에서 이어지는 엄지 1개·네 손가락의 연결, 길이 차이, 손톱과 관절을 `qa/hand-detail.png`에서 확대 확인했다. 사용자 최종 시각 승인 대기다.
- `compose-hand-only.ps1`로 생성 손 영역을 첨부 원본에 국소 적용했다. 저장 PNG를 재검사한 결과 손 수정 마스크 밖의 변경 픽셀은 **0개**다. 얼굴·표정·머리·의상·다른 손·원경 배경은 원본 픽셀을 유지한다.
- 픽셀 검증과 최종 해시: `manifest.json`.

손 해부학 참고는 [Actesso의 손 사진](https://actesso.co.uk/blog/what-is-de-quervains-tenosynovitis/)을 사용했다. 피부나 사진 픽셀을 합성하지 않고 정상적인 다섯 손가락 구조 참고로만 생성기에 제공했다. 저장 파일 `sources/hand-anatomy-reference.jpg`는 원격 원본 응답 바이트를 보존하며 실제 인코딩은 확장자와 다를 수 있다.

원화 승인·등급·로스터·도감·전투·운영 연결은 포함하지 않는다. 현재 상태는 `USER_REVIEW_PENDING`이다.

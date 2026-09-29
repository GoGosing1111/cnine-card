# LG 하이희야 — 제복 아바타 리소스

2026-09-30 사용자가 첨부 이미지와 함께 **“이정도가 적당해”**라고 선택한 V2 원화를 기준으로 제작했다. 승인 대상은 전체 체형을 슬림하게 조정한 긴 머리·다리를 교차한 자세·한 손으로 재킷 깃을 잡은 LG 제복 원화다. 추가로 생성됐던 다리를 벌린 V3 자세는 사용하지 않는다.

## 최종 파일

- 아바타 원화: `assets/avatar-lg-hi-heeya-lobby-source-art-v2.png` — 1024×1536 RGB PNG, 생성 원본 무가공 보존.
- 장비창 전신: `assets/avatar-lg-hi-heeya-equipment-source-art-v2.png` — 1024×1536 RGBA PNG, 내장 image_gen으로 같은 디자인·체형·포즈를 바탕으로 배경 제거.
- 런타임 일러스트: `assets/avatar-lg-hi-heeya-lobby-v2-1024.webp`, `assets/avatar-lg-hi-heeya-lobby-v2-640.webp`.
- 런타임 장비창 전신: `assets/avatar-lg-hi-heeya-equipment-v2-640.webp` — 640×1088, 실제 알파 유지.
- 사용자 선택 이미지: `assets/user-approved-lobby-reference.png`. 원화 V2와 파일 인코딩은 다르지만 해독한 RGBA 픽셀 SHA-256이 `47f388c7134a57d69281540d5dfb7912840c449b5c250900acdc91ea03dff708`로 동일하다.

제작 도구는 **내장 image_gen**이다. 버전별 프롬프트·선택 기록은 `prompts.json`, 파일 SHA-256·규격·알파 수치는 `runtime-manifest.json`에 있다. V1은 사용자 반려 이력으로 보존하고 화면에서는 V2만 사용한다. 간호사 하이희야 참조 원본도 수정하지 않았다.

## 내보내기와 검수

`node preview/avatar-lg-hi-heeya-uniform-v1/build-assets.mjs`는 원본을 변경하지 않고 균일 크기 조정·투명 여백·WebP 인코딩만 수행한다. 배경 제거와 체형 수정을 코드로 처리하지 않았다. 장비창 원본은 완전 투명 픽셀 1,248,939개, 불투명에 가까운 픽셀 283,420개, 가장자리 최대 알파 0이다.

음소거한 로컬 Chrome에서 PC 1440×1000·모바일 390×844의 이미지 로딩, 갤러리/장비창 탭, 밝은/어두운 배경, 가로 넘침과 머리·양쪽 발끝 표시를 확인했다. 콘솔·페이지·리소스 오류 0건이다. 실제 공용 `SoopketmonCharacterLoadoutV2`를 재사용하며, 이 독립 미리보기의 인물 배치와 하단 그라데이션만 조정해 발끝이 안내판에 가려지지 않게 했다. 공용 장비창 코드는 변경하지 않는다.

원화는 사용자가 선택했으며, 장비창 파생본은 해당 원화 기준의 제작 완료·검수용 리소스다. 아이템 코드 확정, 시리얼, 옵션, 판매, 지급이나 라이브 아바타 목록 등록은 이 자산 제작에 포함하지 않는다.

## 자산 배포 범위

- 직전 운영 소스: `5ef8e001fc04dfbca989e787e7cc7f31c8d825b4` (Pages `6850d5c4-08fd-445d-8d1c-4331bbf96f3f`).
- 변경 범위: 이 독립 프리뷰와 원본/파생 이미지·제작 기록.
- 관련 검증: 원본 해시·알파·규격 검사, 프리뷰 JS 구문 검사, 위 PC·모바일 시각 검수.
- 배포 방식: `ASSET_DEPLOY_BASE`를 직전 운영 소스로 지정한 `npm run deploy:production -- --assets-only`.
- 선정 이유: 게임 실행 코드·인증·경제·DB·전투 연결 변경이 없는 이미지 및 독립 프리뷰 작업이다. 전체 게임 검사를 반복하지 않는다.

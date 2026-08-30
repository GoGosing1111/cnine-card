# 리소스 출처 및 가공 기록

## 시각 리소스

- 생성 방식: OpenAI 내장 ImageGen
- 생성일: 2026-08-30
- 참고 리소스: 라이브 V3의 공격·방어·속도 역할 이펙트 아틀라스. 캐릭터, 카드 프레임, UI는 생성 입력에 포함하지 않았다.
- 원출력: `assets/source-imagegen-rgb/`에 1536×1024 RGB PNG를 수정 없이 보존했다.
- 투명화: `scripts/convert-imagegen-checker-to-alpha.mjs`가 생성 배경을 분석해 RGBA로 변환하고 가장자리 색 번짐을 정리한다.
- 아틀라스화: `scripts/build-v3-live-style-event-fx-v2.mjs`가 중앙 1536×1023 영역을 4×3으로 나누고 512×455 12프레임, 2048×1365 RGBA PixiJS 아틀라스로 만든다.
- 금지 요소: 문자, 로고, 카드 프레임, 캐릭터, UI, 원형 룬, 마름모, 별, 불투명 배경.
- 모든 원출력·가공 시트·아틀라스 해시는 `manifest.json`에 기록한다.

ImageGen의 앱 원본 보존 위치:

- `critical`: `C:\Users\User\.codex\generated_images\01a02ccc-3379-7880-9a1e-641917502c8a\exec-38ad94f5-e8d5-4afa-aa7a-635b9a21dff5.png`
- `counter`: `C:\Users\User\.codex\generated_images\01a02ccc-3379-7880-9a1e-641917502c8a\exec-5430c84d-1299-4d3f-9e61-945028cba156.png`
- `dodge`: `C:\Users\User\.codex\generated_images\01a02ccc-3379-7880-9a1e-641917502c8a\exec-ce50020f-56c0-4f7a-90f6-c3e026905c7d.png`
- `ultimate`: `C:\Users\User\.codex\generated_images\01a02ccc-3379-7880-9a1e-641917502c8a\exec-e599a6dd-b1c3-4966-a3c9-8ef789d163b2.png`
- `boss-ultimate`: `C:\Users\User\.codex\generated_images\01a02ccc-3379-7880-9a1e-641917502c8a\exec-4a95ef07-425a-4632-9a95-ee3f3d97bb9c.png`
- `revive`: `C:\Users\User\.codex\generated_images\01a02ccc-3379-7880-9a1e-641917502c8a\exec-a3f9a874-560f-427b-83d8-7b5e7bdbb9fd.png`

## 사운드 리소스

- 형식: 48 kHz 스테레오 MP3 256 kbps
- 출처: Mixkit의 실제 녹음·폴리 원음
- 라이선스: [Mixkit Free License](https://mixkit.co/license/#sfxFree)
- 합성 여부: 절차적 합성 없음, 런타임 합성 없음, 오실레이터·테스트톤·UI 삑음 없음
- 재사용 방식: 승인된 V4/V2 MP3를 재인코딩하지 않고 바이트 단위로 복사했다.
- 원음 자산 ID, 원음 URL, 원음 SHA-256, 레이어 구성의 단일 출처: `../project-v-v3-event-fx-v1/assets/audio/manifest.json`
- 현재 프리뷰 MP3의 SHA-256과 충돌 동기점은 `manifest.json`에 다시 고정했다.

## 연결 정책

이 문서는 리소스의 출처와 무결성만 증명한다. 파일명이나 임시 라벨은 사용처를 뜻하지 않으며, 사용자 결정 전에는 고유특성·스킬·등급·카드·콘텐츠에 연결하지 않는다.


# PROJECT V V3 Live-Style Event FX V2

현재 라이브 V3의 렌더링·타임라인·사운드 동기 문법으로 6종 연출 리소스를 비교하는 독립 프리뷰다.

## 고정 상태

- 6종의 이름은 찾기 쉬운 **임시 비교 라벨**이다.
- 고유특성, 스킬, 등급, 카드, 레이드, 보스 등 실제 활용처는 전부 미지정이다.
- 활용처 결정 권한은 사용자에게 있으며 이 프리뷰는 어떤 게임 데이터에도 연결하지 않는다.
- `previewOnly: true`, `runtimeConnected: false`, `deployAllowed: false`를 유지한다.
- 라이브 V3 캐릭터·카드 원본·프레임·전투 판정 파일은 수정하지 않는다.

## 리소스 구조

- `assets/source-imagegen-rgb/`: ImageGen 원출력 보존본
- `assets/source-sheets/`: 투명 RGBA 정리 시트
- `assets/atlases/`: PixiJS용 12프레임 PNG/JSON 아틀라스
- `assets/audio/`: 승인된 녹음 기반 48 kHz 전투 사운드와 파형
- `source/`: PixiJS v8, GSAP, WebAudio 독립 프리뷰 소스
- `manifest.json`: 경로·해시·동기·미배정 상태의 단일 기계 판독 목록
- `RESOURCE-CATALOG.md`: 사람이 검수하기 위한 목록
- `PROVENANCE.md`: 이미지·사운드 출처와 가공 기록

## 실행과 재생성

```powershell
node scripts/convert-imagegen-checker-to-alpha.mjs
node scripts/build-v3-live-style-event-fx-v2.mjs
node preview/project-v-v3-live-style-event-fx-v2/build.mjs
```

로컬 정적 서버에서 `/preview/project-v-v3-live-style-event-fx-v2/`를 열어 검수한다. 위 작업은 프리뷰 파일만 생성하며 라이브 연결이나 배포를 수행하지 않는다.


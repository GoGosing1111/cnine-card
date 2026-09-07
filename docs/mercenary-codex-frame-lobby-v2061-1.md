# 용병도감 새 프레임·로비 복귀 수정

- 요청일: 2026-09-07
- 사용자 요청: 새 용병 프레임 연결, 명시적인 로비 복귀 버튼 추가.
- 투명 배경 처리 방법: 사용자 선택에 따라 내장 이미지 생성 도구만 사용. 코드 배경 제거, 마스크, 알파 보정, 재압축 없음.
- 적용 범위: 읽기 전용 용병도감과 동일 준비 로스터를 사용하는 시스템 프리뷰. 카드 원화·SD·등급·계정·전투 API 변경 없음.

## 최종 프레임

- 파일: `assets/ui/card-frames/mercenary-contract-frame-slim-v3.png`
- 규격: 1024×1536, 2:3, RGBA PNG.
- SHA-256: `0486312ABD46D90680FEA968E552CB4A234ECE7110BEBE31072053BB477A065A`.
- 생성 원본: `exec-cc167905-4912-447f-8adb-3f5250b39182.png` (Codex 생성 이미지 디렉터리).
- 생성본을 바이트 그대로 복사했다. 기존 프레임과 승인 원화는 보존했다.
- 실제 알파 0인 픽셀: 1,329,315 / 1,572,864 (84.52%). 중앙 투명. 금속 영역의 알파는 대부분 240~254이며, 255로 재가공하지 않았다.
- 불투명 체크무늬 초안과 첫 배경 추출 재시도는 운영에 연결하지 않았다. 기존 RGBA 프레임에 새 디자인을 적용하는 재시도에서 정상 투명 결과를 얻었다.
- 현재 준비 로스터의 `cardComposition.frame`을 단일 참조로 사용한다. 2026-08-24 승인 당시의 별도 역사 로스터·프리뷰는 보존한다.

## 최종 생성 프롬프트

방식: built-in `image_gen` / style-transfer.

입력 1 (편집 대상): `assets/ui/card-frames/mercenary-contract-frame-premium-v2.png`.

입력 2 (금속 디자인 참고): `output/imagegen/mercenary-frame-slim-v3/mercenary-contract-frame-slim-v3-source.png`.

```text
Use case: style-transfer. Asset type: transparent PNG card-frame overlay. Image 1 is the edit target: an existing RGBA overlay whose central opening and exterior already contain transparent pixels. Preserve that transparent background. Image 2 is ONLY the new metal-frame design reference, not its background. Replace Image 1's old ornate metalwork with Image 2's exact thin platinum-silver rails, tiny champagne-gold edge lines, four compact engraved laurel corners, angular V-shaped top seal and narrow blank black-enamel bottom nameplate. Keep the upright 1024x1536, 2:3 canvas and clear interior. Background: TRANSPARENT. Deliver the isolated frame as a transparent-background PNG, not a rendered picture of a transparent frame. The opening and all space beyond the frame must remain empty/transparent so a character portrait is visible beneath. No visible backdrop, checker pattern, paper, shadow plane, fog or gradients; no text or characters. Only metal rails, corner pieces, top seal and bottom plate are visible.
```

## 화면 수정

- 공개 도감 상단에 `로비로 돌아가기` 링크를 상시 표시한다. 44px 이상 터치 영역, 동일 탭 `/?screen=home` 이동, 스크롤 중 고정.
- PC·모바일 공통이며 독립 검수 템플릿에서는 로비 링크를 숨긴다.
- 얇은 프레임의 작은 명판에 이름을 억지로 넣지 않는다. 목록 이름은 프레임 아래 17px로 표시하고, 상세는 기존 큰 제목을 유지한다.
- 카드 원화와 프레임은 별도 계층이다. 새 프레임 안쪽에 맞춰 원화 표시 여백만 조정했다.
- 공유 CSS `1.4`, 공개/프리뷰 클라이언트 `2061.1-slim-frame`, 시스템 프리뷰 `4-slim-frame`으로 캐시 참조를 갱신했다.

## 검증

- `npm run test:mercenary-codex`: 31개 통과. RGBA·해시·실제 투명 픽셀·금속 가시성·로스터 연결·이름 가독성 회귀 검사 추가.
- 기존 브라우저 탭에서 PC 1440×1000, 모바일 390×844 각 24개 시나리오 확인. 로비 버튼은 320px에서도 44px 높이와 가로 넘침 없음 확인.
- 브라우저 스크린샷 API는 시간 초과되어 캡처 검수로 기재하지 않는다. 실제 DOM 배치·이미지 디코딩·상호작용 검사와 생성 원본 시각 확인을 수행했다.
- 배포는 관련 파일만 커밋한 깨끗한 릴리스 트리에서 `npm run deploy:production`이 실행하는 `npm run release:gate`를 통과한 뒤 진행한다.

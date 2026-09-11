# 제니스 오리꿍 아바타

제니스 오리꿍 카드 `CN-B5718BF375CA42C8`의 원본 `assets/cards/1412312312312.jpg`를 바탕으로 제작했다. 하늘색·백색 머리, 크게 말린 머리 장식, 꽃과 리본, 얼굴 인상과 흰색·짙은 청록색 의상을 계승한다. 원본 카드와 기존 아바타는 수정하지 않았다.

- 로비: `assets/avatar-orikkung-lobby-source-art-v1.png` — 1024×1536 RGB PNG. 내장 이미지 생성 원본을 그대로 보존했다.
- 장비창: `assets/avatar-orikkung-equipment-source-art-v1.png` — 1024×1536 RGBA PNG. 로비와 동일한 캐릭터를 별도의 선 자세로 제작하고 배경만 제거했다.
- 모바일: 로비 1024/640px, 장비창 640px WebP를 별도 제공한다.
- `index.html`: 로비·장비창 비교와 어두운/밝은 배경 전환.
- `prompt.md`: 내장 image_gen의 실제 프롬프트와 전체 생성 이력.
- `manifest.json`, `alpha-qa.json`, `segmentation-qa.json`: 파일 해시·규격·알파 검증·배경 제거 기준.

이미지 생성 도구의 전신 출력은 실제 알파가 없는 RGB 체크무늬였다. 사용자가 **“배경만 코드로 제거 (권장)”**를 명시적으로 승인한 뒤, 확인한 배경 영역을 분리하고 외곽 알파를 정리했다. 얼굴·의상·포즈를 재생성하거나 변형하지 않았고, 최종 불투명 픽셀의 RGB 변경은 0이다. 반투명 경계의 배경색 번짐만 매팅했다.

흰 머리와 흰 의상을 함께 지우는 전역 색상 제거는 사용하지 않는다. 이 이미지에 맞춘 GrabCut 분리와 머리 장식·팔·손가락·다리 사이 배경 영역을 기록했다. `equipment-draft-v1.png`와 `equipment-background-mask-v1.png`는 처리 원본·마스크이며 화면에는 최종 RGBA/WebP만 연결한다.

2026-09-11 사용자 **“라이브에 반영해”** 지시로 **A-15 오리꿍 (`ORIKKUNG_ZENITH`)**을 기존 아바타 런타임·CMS 카탈로그에 연결한다. 로비 1024/640px와 장비창 투명 WebP를 사용한다. 기존 아바타 등록과 동일하게 활성·공개·판매는 OFF, 획득 방식은 UNSET, 가격은 NULL, 효과는 미설정으로 시작하며 계정 지급은 하지 않는다. 이후 운영자가 CMS에서 저장한 설정은 재등록 시에도 보존한다. 용병 카드나 전투 SD 등록 작업이 아니다.

등록 검증: `tests/avatar-orikkung-cms.test.mjs`에서 실제 PostgreSQL 호환 실행으로 CMS 조회·수정, 기존 카탈로그/설정 보존, 미공개 구매·장착 차단, 등록 마커 실패 시 원자적 롤백과 재시도를 확인한다. 운영 배포는 `npm run release:gate` 통과 후 `npm run deploy:production`으로 진행한다.

## 재현

Node.js + Sharp를 사용한다. 배경 마스크 재생성은 Python + NumPy 2.3.5 + opencv-python-headless 5.0.0을 사용한다. 이 작업에서는 추가 OpenCV 패키지를 프로젝트의 무시되는 `tmp/avatar-background-python`에만 설치했다.

```sh
python -m pip install --no-deps --target tmp/avatar-background-python opencv-python-headless==5.0.0.93
python preview/avatar-orikkung-v1/segment-equipment-background.py
node preview/avatar-orikkung-v1/remove-equipment-background.cjs
node preview/avatar-orikkung-v1/serve.mjs
```

마스크와 원본을 이미 보유한 경우에는 Node 배경 매팅 단계만 실행해도 된다. 스크립트는 원본 해시를 검사하며 다른 이미지에 이 좌표와 색상 기준을 그대로 적용하지 않는다. 로컬 검수 주소는 `http://127.0.0.1:8894/preview/avatar-orikkung-v1/`이다.

검증: 원본 카드 해시 불변, 로비 생성 원본 무가공, 2:3 규격, 실제 알파·사방 투명 여백·팔/손가락/다리 사이 제거, 최종 불투명 RGB 변경 0을 확인했다. 브라우저에서 로비·전신 로딩, 가로 넘침 없음과 밝은/어두운 배경 전환을 검수했다.

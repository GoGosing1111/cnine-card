# 동방무기상 무기설계도 아이템 리소스 V1

- 제작일: 2026-09-23
- 요청 범위: 동방무기상 무기설계도 아이템 이미지 제작.
- 파일: `assets/items/eastern-arms-weapon-blueprint-v1.png`
- 상태: 후속 사용자 지시로 2026-09-23 재료 아이템 `EASTERN_ARMS_WEAPON_BLUEPRINT` 등록 완료. 분류 `MATERIAL`, 직접 사용 불가. [등록 기록](blueprint-material-registration-20260923.md)을 따른다.
- 제작 도구: Codex 내장 `image_gen`. CLI/API 대체 경로 미사용.
- 원본: `exec-31234270-aa58-47de-80c2-be7a531e33a9.png`; 생성 PNG를 변환·재압축하지 않고 복사했다.
- 실제 규격: 1254 × 1254 PNG, RGBA. 요청 프롬프트는 1024 × 1024였으나 생성 도구의 원본 크기를 보존했다.
- 디자인: 네이비 도면 두루마리, 금색 판타지 총기·금룡 문양, 붉은 끈과 용 봉인.
- 초기 상세 총기 도면 프롬프트는 생성 안전 검사에서 차단되어 사용하지 않았다. 최종 이미지는 치수·내부 구조·조립 정보가 없는 장식 문양이다.
- 기존 금룡 돌격소총·금룡 대물저격총 이미지와 배틀슈트 자산은 수정하지 않았다.

## 생성 프롬프트

```text
Use case: stylized-concept.
Make a premium hand-painted fantasy RPG inventory icon, a collectible sealed scroll called "동방무기상 무기설계도" (Eastern Arms Merchant weapon scroll). This is fictional game item art.
One broad partially unrolled dark midnight-blue vellum scroll, curling ivory paper edges, elegantly polished antique gold end caps, restrained crimson silk binding. On its open face is a large flat decorative PALE GOLD EMBLEM of a fantastical dragon-shaped long rifle in side profile, made of simple bold ornamental shapes like a heraldic pictogram. The emblem is printed on the paper, not a physical object. Surround the emblem with a few abstract constellation arcs and ornamental geometric lines, clearly fantastical decorative markings. No technical drawing, no measurements, no mechanical details, no exploded parts, no assembly information. In the lower right a small rich crimson wax seal with a coiled eastern dragon stamped in gold. The wide scroll and its large central weapon emblem must read instantly at inventory icon size.
Visual identity: golden eastern dragon ornament, rich crimson accents, near-black navy paper, warm ivory curled edges. Sophisticated polished Korean fantasy game item illustration; tactile paper and metal materials, crisp stylized forms and controlled golden highlights. One coherent elegant scroll with restrained detail, high artistic finish, no cartoon toy look.
Composition: centered single object, broad open face, nearly overhead with subtle dimensional tilt; fill about 82 percent of a square 1024x1024 canvas with padding, every extremity fully visible.
Deliver PNG with genuinely transparent background and clean alpha. Isolated asset. No outer card border, UI, words, letters, numbers, caption, logo, watermark, backdrop, ground plane, ground shadow, particles, or extra props. No text inside the icon.
```

## 검증

- 정사각형 RGBA PNG; 완전 투명 픽셀 686,681개, 부분 알파 885,404개, 불투명 픽셀 431개.
- 부분 알파 대부분은 251–254의 거의 불투명한 물체 영역이며 원본 알파를 유지했다.
- 화면 배경이나 카드 프레임이 합성되어 있지 않다.
- SHA-256: `50314A072978D1135474B03FB3DDFB2543B55DF0008AC3BF2FAD526C696B2921`.
- 파일 크기: 2,041,951바이트. 생성 원본과 프로젝트 사본의 해시가 일치한다.
- Edge에서 밝은 배경·어두운 배경의 360px 표시 및 128/96/64px 아이콘을 직접 확인했다. 작은 크기에서도 펼쳐진 두루마리와 봉인 형태가 유지된다.
- 알파 8 초과 영역 경계: 왼쪽 15, 위 36, 오른쪽 1243, 아래 1157. 1254px 캔버스 밖으로 잘리는 부분이 없다.
- QA 캡처와 수치 보고서는 작업 PC의 임시 폴더 `cnine-eastern-blueprint-20260923`에 보관했다.

## 정적 리소스 반영

- 이미지와 제작 기록만 범위 커밋한다. 런타임·아이템 카탈로그·CMS·DB 변경은 없다.
- `AGENTS.md`의 2026-09-19 이미지 업로드 규칙에 따라 `ASSET_DEPLOY_BASE=74d3b0642ffd5929553604e9081f95409ec3cb33`을 지정하고 `npm run deploy:production -- --assets-only`를 사용한다.

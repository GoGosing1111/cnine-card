# 마이바흐 비전 6 차량설계도 리소스 V1

- 제작일: 2026-09-23
- 요청: 마이바흐 비전6 차량설계도 리소스 제작.
- 파일: `assets/items/maybach-vision6-blueprint-v1.png`
- 용도: 차량설계도 아이템 이미지 시안. 차량 카탈로그·제작 비용·획득처·사용 기능은 이번 리소스 제작 범위에 포함하지 않는다.
- 디자인: 네이비 도면 두루마리, 붉은 비전 6 쿠페 도안, 금색 도면 선, 금·백금 장식과 붉은 봉인.
- 차량 기준: [Mercedes-Benz 공식 Vision Mercedes-Maybach 6 쿠페 소개](https://www.mercedes-benz.com/en/design/concept-cars/ultimate-in-luxury-vision-mercedes-maybach-6/).
- 제작 도구: Codex 내장 `image_gen`, 최초 생성 후 같은 도구로 가장자리 여백 보정. CLI/API 대체 경로 미사용.
- 최초 시안: `exec-da9edc6b-d1ea-47cf-a093-5ae95d97ac5c.png`.
- 최종 원본: `exec-6ab22727-9e02-491c-a86e-fbb044402aff.png`.
- 생성 원본은 보존하고 최종 PNG를 변환·재압축 없이 프로젝트로 복사했다.

## 파일 및 검수

- 실제 규격: 1254 × 1254 PNG, RGBA. 생성 요청은 1024 × 1024였으며 도구가 반환한 원본 크기를 유지했다.
- 크기: 1,901,720바이트.
- SHA-256: `9FE96AB46585D8B9113AE05A40FD2C213CC6391D1871E1C1239453302D319AA8`.
- 완전 투명 픽셀 692,681개, 부분 알파 879,107개, 불투명 픽셀 728개.
- 알파 8 초과 영역 경계: 왼쪽 77, 위 108, 오른쪽 1193, 아래 1157. 네 변에 닿는 픽셀 0개.
- 최초 시안에서 오른쪽 금속 장식이 경계에 닿아, 최종본은 투명 여백을 확보했다.
- Edge에서 밝은 배경·어두운 배경의 360px 표시 및 128/96/64px 크기를 확인했다. 차량과 두루마리 형태가 작은 아이콘에서도 유지된다.
- QA 화면과 보고서는 작업 PC의 임시 폴더 `cnine-maybach-blueprint-20260923`에 보관했다.
- 기존 아이템·무기·차량 원본 자산과 게임 코드는 수정하지 않았다.

## 최초 생성 프롬프트

```text
Use case: stylized-concept.
Create one finished premium Korean fantasy RPG inventory icon: a vehicle blueprint collectible for the Vision Mercedes-Maybach 6 coupe (the dramatic red 2016 concept coupe).
Subject: a single broad partially unrolled blueprint scroll. Deep midnight-navy vellum with subtly curled warm ivory paper edges, elegant polished champagne-gold and platinum roll end caps with restrained Art Deco line engraving, a short burgundy silk binding and a small crimson wax seal carrying a tasteful geometric double-M crest. Luxurious automotive craftsmanship, cohesive and sophisticated.
The LARGE central drawing on the open paper is immediately recognizable as the Mercedes-Maybach Vision 6 COUPE, drawn in front three-quarter view: exceptionally long low bonnet, sweeping sculptural fenders, tiny rearward glass cabin with a continuous closed fastback roof, very long graceful teardrop tail, huge elegant aerodynamic disc wheels, narrow slit headlights and the imposing tall chrome grille with many thin vertical slats. Preserve the iconic long-hood proportions rather than a generic modern sedan or supercar. The drawing occupies at least 60 percent of the open paper's width and is the clear focal point. Render it as an exquisite FLAT PRINTED illustration made of bold luminous ivory and champagne-gold blueprint contour strokes with a restrained translucent deep-crimson ink wash inside the body panels. It must visibly be artwork printed on the paper, never a physical miniature car sitting on the page.
Beneath the main car drawing put one much smaller fine side-elevation outline of the same coupe and a few clean abstract drafting guide lines, wheel circles and faint sparse grid marks. Keep the drawings sparse and legible. No readable annotations or dimensions. Do not clutter the page with many little diagrams.
Style: refined hand-painted game item illustration with precise edges, material-rich vellum, polished metal highlights, sumptuous deep colors, confident large forms legible at 64–128px. Match the collectible scroll format of a premium fantasy weapon blueprint, but use refined automotive Art Deco fittings, not dragons or medieval imagery.
Composition: a single isolated coherent object nearly viewed from above, subtle dimensional tilt, broad open face, centered on a square canvas. Fill around 84 percent of the canvas. Leave CLEAR transparent padding on every side; all scroll finials, ribbon and seal fully inside the image.
Output: 1024x1024 PNG with genuinely TRANSPARENT background and clean alpha edges. No outer inventory frame, background scene, tabletop, ground plane, shadow cast outside the object, halo, floating particles, labels, title, watermark or extra props. No words or numbers in the image. Exactly one icon, not a layout of variants.
```

## 여백 보정 프롬프트

입력은 최초 시안 한 장이다.

```text
Use case: precise-object-edit.
Edit this exact transparent game item icon only to correct its outer framing. Preserve the existing navy-and-gold scroll, the large red Mercedes-Maybach Vision 6 coupe illustration, every car proportion, the grille and wheels, the small side elevation drawing, the top crimson seal, and the overall painterly material style.
The current lower-right gold finial reaches the canvas edge. Make the entire assembled icon approximately 12 percent smaller uniformly and center it on a square transparent canvas, completing the tiny clipped tip of that same finial if necessary. There must be a generous clearly transparent margin of at least 6 percent of the canvas on ALL four sides. Keep every ribbon, paper curl and finial fully in frame.
No design changes, no new decoration, no added lettering, no new car, no extra props, no outer UI frame. Retain the flat drawing printed on the vellum. Clean transparent alpha edges with no colored fringe, no background, no shadow outside the object, no checkerboard pattern. Output one finished square RGBA PNG with a genuinely transparent background.
```


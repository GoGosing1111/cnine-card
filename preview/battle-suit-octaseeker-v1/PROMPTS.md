# 8방향 유도탄 · 이미지 생성 기록

도구: 내장 `image_gen` (CLI/API 우회 없음). 프롬프트와 생성 원본은 보존한다. 영상/첨부 스크린샷은 동작 참고만 했으며 게임 픽셀을 추출하거나 복사하지 않았다.

## rocket-flight

```text
Use case: stylized-concept. Asset type: production 2D game VFX sprite animation atlas. Create ONE transparent RGBA PNG spritesheet exactly 1536x1024, a strict 6 columns x 4 rows grid of 24 equal 256x256 cells, invisible cell boundaries. Every cell is one successive frame of the SAME slim silver sci-fi homing micro-rocket flying horizontally RIGHT, with orange-yellow white-hot engine exhaust extending LEFT. Nose pivot fixed at x=200,y=128 within EVERY cell; rocket body silhouette identical: narrow white/silver pointed nose, charcoal central casing, orange band and four small fins, body from x=142 to200. Engine ignition ramps up frames1-4; frames5-20 show genuinely changing/turbulent flame tongues, shock diamonds, curling smoky puffs and sparks, rather than simply scaled clones; frames21-24 stabilize into the looping mature exhaust. Rocket metal remains crisp and readable at a small game size. Long dense orange flame and charcoal gray smoke to left, total effect contained from x=20 to205,y=80 to176; generous fully transparent gutters minimum20px on every cell edge. Painted high-quality semi-realistic 2D sci-fi game effect, not flat icons, not vector symbols. Absolutely no background, no black field, no checkerboard baked in, no text, numbers, outlines, cell borders, watermarks, characters, interface, or ground. Output must have true alpha. Read left-to-right then next row. This is an animation, not a collection of rocket designs.
```

## rocket-impact

```text
Use case: stylized-concept. Asset type: production 2D game continuous impact VFX spritesheet. Make ONE transparent RGBA PNG atlas exactly1536x1024 with strict6 columns x4rows, 24square256x256cells, NO visible gridlines. A continuous 24-frame concentrated rocket explosion in a polished semi-realistic painted 2D sci-fi combat game. Same fixed camera/front three-quarter slight above-ground perspective and ground contact pivot x128,y214 in every cell. Frame1 tiny white-orange ignition; frames2-4 fast sharp white-yellow core and compact orange detonation; frames5-9 rich roiling orange fireball lobes expanding upward, dark red rims and directional shrapnel; frames10-14 collapsing flames turning into charcoal gray smoke; frames15-20 rolling rising ash and few ember trails; frames21-24 thin separated dissipating smoke wisps fading naturally. Every frame genuinely evolves shapes and material, not repeated scaling. Maximum effect bounds x24..232,y20..220 in EACH cell including glow/embers. No part touches cell boundaries. Bright warm impact readable on dark battlefield; keep fire solid bright rather than translucent washed-out. Ground shock dust included close to bottom pivot, no drawn ground. True alpha transparent background, including between cells and outside flames/smoke; no background color/checkerboard, no text, numbers, frame outlines, watermark, robot, enemy, landscape or UI. This is one temporal animation read left-to-right row-by-row, not24different explosion icons.
```

## rocket-chip

기존 rocket-launcher-v1.png는 칩 외장/재질 참고만 사용, 기존 파일 변경 없음.

```text
Use case: stylized-concept. Asset type: new inventory skill-chip raster icon for the same existing game. Reference image1 is ONLY a style/form-factor reference of an existing different skill chip; create a NEW sibling chip, never replace it. Square 1024x1024 transparent PNG. Maintain the reference's premium dark gunmetal microchip outer casing, beveled clipped corners, restrained gold connector pins and warm orange circuitry. Center illustration: eight slim silver micro-rockets bursting outward in eight compass directions from a compact orange glowing core, their long curved orange exhaust paths curl back toward ONE small bright target marker near upper center; strong clear readable eight-rocket radial silhouette. This is an eight-way homing salvo chip, NOT a single rocket launcher gun. Front view crisp painted 2D game UI asset, clean materials and uncluttered silhouette, warm orange-amber interior. No letters, labels, numbers, rank stars, watermark or backdrop. Transparent outside the chip; generous10percent outside transparent margin.
```

## Impact V2 경계 수정

첫 폭발 원본의 프레임 8 경계 알파가 156이므로 런타임에서 사용하지 않는다. 첫 원본은 생성 보관 위치의 exec-80c59b25-8c43-4ffd-885c-0e673414892a.png에 유지했다. 경계 수정본만 assets/generated/impact-atlas.png로 복사했다.

```text
Use case: precise-object-edit. Input image is the EDIT TARGET, an existing 6x4 24frame transparent explosion atlas. Keep the SAME24 temporal phases and rich fire/smoke material. Fix only spatial containment: in EVERY256x256cell reduce the entire effect including embers/dust/glow to75percent of its current cell size about its bottom-center, so the strongest explosion stays safely within x40..216,y36..206. Set ground contact at x128,y206 for all frames. Preserve atlas dimensions1536x1024 and exact6columns4rows256squarecells. There must be at least24pixels of COMPLETELY TRANSPARENT empty gutter on all four edges of every cell, including the second row third frame which previously touched the left border. NO background, NO rendered checkerboard, no opaque haze filling the sheet, no text/lines/numbers. True RGBA alpha cutout, soft smoke can fade but not reach cell boundaries. Do not add new content.
```

## 원본 매핑

- flight-atlas.png ← exec-08534b68-4fa0-4524-ba17-2e79614b0a27.png
- impact-atlas.png ← exec-9e5ec106-d279-42e0-90c8-0818f49b3aeb.png
- chip-source.png ← exec-db758347-8ca4-4584-9f68-0e71437ad6ed.png
- SHA-256, 프레임 수, 런타임 무손실 WebP 경로는 build-report.json에 기록한다.
- 기계적 처리만: 아틀라스는 원본 RGBA → 무손실 WebP, 프레임마다 알파 경계/탄두 끝/폭발 바닥 기준점을 측정. 칩은 균일 비율 512×512 PNG/WebP. 재채색·총기/슈트 변형 없음.

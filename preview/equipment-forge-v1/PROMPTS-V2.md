# 장비 강화 UI V2 — 이미지 생성 기록

2026-09-11 · 내장 image_gen · V1 디자인 반려 후 신규 생성.

게임 원본 무기 6종과 V1 생성 원본은 수정하지 않았다. 아래 3종은 생성 결과를 그대로 복사했다. 최종 규격은 배경 1536×1024 RGB, 보호 모듈·성공 아틀라스 1254×1254 RGBA다. 요청 규격과 실제 반환 규격은 다르며 아틀라스 셀은 실제 1254/4=313.5px에 맞춰 런타임 UV로 분할한다. 파일 재압축·수정·오프라인 프레임 재저장은 하지 않았다. 경로별 SHA-256은 asset-manifest.json에 있다.

## 강화실 배경

- 프로젝트: `preview/equipment-forge-v1/assets/upgrade-lab-v2.png`
- 생성 원본: `C:/Users/User/.codex/generated_images/01a09088-4f1f-7492-82fc-56c215bc0ec0/exec-7cde4405-217b-4d16-b354-ac2f0413e4ed.png`

```text
Use case: stylized-concept. Asset type: new background environment painting for a modern high-end sci-fantasy action game's EQUIPMENT UPGRADE menu, landscape 1536x1024. This replaces an old brown medieval forge concept.
An ultra modern orbital weapon enhancement laboratory, sleek polished gunmetal and navy graphite architecture, restrained blue-violet luminous conduits and icy white light strips, cinematic cel-shaded / painterly game art rather than a generic real photo. No people. A broad, EMPTY high-tech rectangular levitation workbench at bottom center y=78%, its surface made of translucent dark glass with luminous cobalt cyan inlays, and a thin floating horizontal light band above it. Strong angular spatial perspective, black titanium side walls with purposeful bevelled mechanical forms, a receding blue-violet atmospheric shaft in the distant middle, a few hovering tiny energy motes. The main central 55% from y=24% through y=65% is empty low-contrast navy space reserved for overlaying a large equipment weapon sprite. Asymmetric light architecture balanced left-right, clean bold silhouette, gorgeous blue bounced light on gunmetal, ultra refined art direction. Accent cool cobalt #577bff, deep violet #4c39ae, icy cyan #83eaff. No gold, copper, brown, ancient stone, temple, furnace, masonry, ornate engraved rings, runes, steampunk, medieval motifs. No huge circular ring. No weapon, no item, no UI controls, no words, no lettering, no logo, no watermark. This is a finished background game asset, not a website mockup.
```

## 보호 모듈

- 프로젝트: `preview/equipment-forge-v1/assets/protection-module-v2.png`
- 생성 원본: `C:/Users/User/.codex/generated_images/01a09088-4f1f-7492-82fc-56c215bc0ec0/exec-262e61a9-cc0f-44bd-a983-4165249a50a9.png`

```text
Use case: stylized-concept. Asset type: transparent item illustration for a modern high-end sci-fantasy game EQUIPMENT PROTECTION SEAL. A single compact premium sci-fi protection chip module standing in a three-quarter view, dark navy and pearl-white ceramic hard-surface plates, a bright neon mint green translucent energy core shaped as a simple shield in the middle, sharply designed bevelled edges with tiny screwless panel breaks, two small blue-violet illuminated rails, impeccable material finish and bold clean silhouette. A stylized 2D game inventory render, highly legible as a 64px game item. Square 1024x1024 composition, object fills 70% of width and height, centered with padding, completely visible. REAL transparent alpha background. No ground or environment, no outside rectangular card frame, no text, no digits, no lettering, no watermark. No parchment, no paper certificate, no antique ornaments, no gold or brown metal, no medieval talisman.
```

## 성공 폭발 연속 프레임

- 프로젝트: `preview/equipment-forge-v1/assets/success-plasma-atlas-v2.png`
- 생성 원본: `C:/Users/User/.codex/generated_images/01a09088-4f1f-7492-82fc-56c215bc0ec0/exec-188221ee-bf6e-453f-8301-f5cc9fda0601.png`

```text
Use case: stylized-concept. Asset type: production VFX ANIMATION SPRITE SHEET, exactly 4 columns by 4 rows, sixteen equal square cells, total image 2048x2048. This is a SINGLE temporal animation of a spectacular equipment upgrade SUCCESS energy blast in a modern sci-fantasy game. Read frames left to right, top row to bottom row. Each cell has an identical solid pitch BLACK background and the animation pivot exactly at the cell center. Every cell has 8% black padding so neighboring effects NEVER touch. No visible grid lines, no frames, no captions or numbers.
Color: brilliant white core, electric cyan plasma, cobalt-blue outer tongues, tiny lavender fragments and a few sharp pale lime energy shards. Gorgeous hand-painted 2D game VFX, high contrast, crisp lightning filaments within painterly luminous bloom, not a simple flat icon.
Temporal sequence: Frames 1-2: two brilliant thin curved plasma filaments spiral toward a tiny white nucleus. Frames 3-4: filaments physically converge into a very dense white-cyan core with tight lightning curls. Frames 5-6: core violently erupts into a large irregular STARBURST explosion, sharp radial prongs, complex turbulent edges, near-white center. Frames 7-8: the solid explosion transitions into a rupturing energy shell, with a hollow center forming and long lightning tendrils whipping outward. Frames 9-10: large broken annular shockwave, separate flying luminous shards, distinctly changing irregular plasma contours and expanding vapor lobes. Frames 11-12: shell tears into cyan wisps and shards, center is mostly black, no solid orb. Frames 13-14: drifting separate blue-cyan light fragments and tiny vapor trails. Frames 15-16: only a few diminishing fine sparks, final frame almost completely black.
Every frame must truly differ in shape and content as the animation develops, not repeated identical icons merely growing or recolored. The strongest burst occupies 85% of its cell, all edges contained within the padded cell. Consistent central pivot and overall camera. Pure black background is required for additive compositing. No weapon, no words, no characters, no UI, no texture outside the sixteen cells.
```

## 육안 검수와 합성

- 강화실: 고대 석조·황동 장식을 제거하고, 중앙 장비 공간이 빈 SF 연구실로 변경했다.
- 보호 모듈: 실제 알파를 확인하고 작은 인벤토리 크기에서도 방패 코어가 식별되는지 확인했다.
- 성공: 4×4를 시간 순서로 검수했다. 나선 수렴 → 고밀도 코어 → 불규칙 폭발 → 파열 껍질 → 분리된 잔광으로 각 프레임의 형태가 변한다. 최종 프레임은 미세 잔광만 남는다.
- 원본은 어두운 RGB와 알파를 포함한다. 투명 canvas 위에서 단순 가산 합성을 하면 HTML 배경에 검은 경계가 생기므로, 배경을 동일 Pixi 장면에 먼저 렌더링하고 그 위에 가산 합성한다. 원본을 키잉하거나 바꾸지 않는다.
- 기술 검수와 사용자 품질 승인은 별개다. 현재 V2는 사용자 검수 대기다.

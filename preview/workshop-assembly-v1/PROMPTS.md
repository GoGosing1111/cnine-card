# 생성 자산 기록

도구: built-in ImageGen. 생성일 2026-09-08. 기본 생성 저장소에서 아래 파일로 복사했으며 원본은 보존했다. 창작은 이미지 생성, 실제 움직임은 PixiJS/GSAP, 후처리는 행 분리/알파 분할의 기계적 작업만 수행했다.

## vehicle-bay.png

원본 `exec-62aed8fe-ee9e-494e-a0a5-5e639d7636f0.png` · 신규 생성.

Premium videogame crafting-animation BACKGROUND PLATE only. Dark sophisticated industrial automobile assembly bay for a luxury hypercar, low eye level three-quarter factory camera. Central two-thirds EMPTY dark open air for a separately animated car cutout. Long rectangular steel conveyor platform in lower 20%; heavy columns at extreme margins, overhead gantry, warm muted amber lamps, off-white work lights, charcoal gunmetal, restrained volumetric haze. Large quiet negative space, grounded premium game art. No car, humanoid, central tools, ring, portal, text, logo or UI.

## suit-bay.png

원본 `exec-568c4af7-cea3-4b87-8e69-6265974c3852.png` · 신규 생성.

Premium videogame exosuit assembly chamber background plate. Empty dark central vertical space for separately animated slender human exosuit. Recessed rectangular maintenance cradle, thin warm-white segmented lights, small rectangular brushed-metal dais, graphite ceramic walls, sparse copper-orange conduits at margins, surgical robotic gantries parked at extreme sides. Elegant industrial luxury, graphite/ivory/amber, no blue or purple neon, magic circles, text, logo, character or UI. Nearly frontal camera, platform visible at bottom.

## car-cutout.png

원본 `exec-19e76610-066b-4292-84b7-23c94e7a395a.png` · 편집.
입력: `/assets/tire/lamborghini-veneno-showroom-v1.png` (기존 파일 무변경).

Prepare the exact supplied grey hypercar as a crafting-animation sprite. Remove showroom, floor, platform, reflection and cast shadow. Keep the complete car including wheels, rear wing, mirrors, windows and headlights, original three-quarter front-left angle, proportions, grey/black/red materials and body panel design. No redesign, no added emblems. Single car, entire silhouette, real transparent alpha not painted checkerboard. Landscape, clean antialiased edges. Not a poster, collage or multiple views.

## robot-kit.png

원본 `exec-ff2be5e0-5236-46b1-a635-9c8836fda123.png` · 신규 생성.

Transparent RGBA sprite atlas of exactly THREE mechanical assembly-arm components in three horizontal rows. Orthographic side view, pointing right. Upper row: long heavy upper-arm piston beam, charcoal gunmetal, silver beveled armor, brass detail, circular pivot at both ends. Middle: slimmer hydraulic forearm actuator with nested piston and narrow wrist. Bottom: precise three-finger metal gripper, half open. Clear transparent gutters, no overlapping parts. High-end hard-surface game art, coherent machined materials, crisp edges, restrained detail. No text, grid, checkerboard, shadow, character or whole robot.

실제 생성 이미지의 부품 경계에 맞춰 upper=0..411, lower=412..651, grip=652..1023을 분리하고 투명 여백만 trim했다. 배경을 새로 칠하거나 부품을 다시 그리지 않았다.

## ignis-x-cutout.png — 추가 모델

ImageGen 선택 원본 `exec-5b12bcb1-d0e1-44fb-9fb9-7c0b2b9966c0.png`를 `assets/sources/ignis-x-extracted-source-v1.png`로 보존했다. 1679×937 RGB, SHA-256 `569b3b5904e379b2e95b581ae56a299d45a15d1e3bf26b5095672bd413fc5fdb`.

참고 입력은 CMS 차량 `GARAGE_1787232065012`의 `/assets/tire/1321312.jpg`, SHA-256 `e0233448b61e39b171335d8853975cae02abb98b092fd8dd28365b44750e5f22`다. 기존 JPG는 수정하지 않았다.

재현용 생성 지시 요약:

Extract the supplied exact red Ignis-X futuristic roadster for a game crafting animation. Retain the front-left three-quarter view, long red nose, red wheels, open cockpit, roof-mounted jet turbine and its support struts, body-panel design, proportions and materials. Remove showroom, floor, platform, reflections, ribbons, sparks and exhaust flame. One complete car, no new design, no text or UI. Keep the turbine and thin supports intact. Request a true transparent alpha background, not a checkerboard.

도구가 체크무늬를 포함한 RGB를 반환했기 때문에 그대로 런타임에 쓰지 않았다. `prepare-ignis-assets.mjs`가 프로젝트의 `scripts/remove-connected-light-background.cjs`를 호출한 뒤 검수한 내부 공기 영역에 같은 밝은 중성색 flood-fill을 적용한다. 알파만 변경하며 RGB·비율은 보존한다. 후처리 PNG의 SHA와 규격은 `asset-manifest.json`에 기록한다.

투명화 재시도 이미지와 불필요한 E-BODY 재추출 시안은 채택하지 않았다. E/F/G는 이미 실제 알파가 있는 CMS 원본을 그대로 분할했으며 생성 이미지로 교체하지 않는다.

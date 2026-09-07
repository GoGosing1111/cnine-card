# 경찰 조은 — 승인 원화 V1

- 제작 방식: 내장 image_gen 도구, 얼굴/착장 참조 기반 생성
- 상태: APPROVED_SOURCE_ART — 사용자 요청으로 킬러 조은에서 경찰 조은으로 명칭 확정
- 승인 요청: 경찰 조은으로 이름 변경하고 라이브서버 연결해
- 범위: V-042 읽기 전용 라이브 용병도감 공개 승인. 등급, 획득, 편성, 전투 API 미연결.
- 최종 원화: assets/ui/project-v/mercenaries/approved-20260907/mercenary-v042-police-joeun-source-art-v1.png
- 결과 파일: assets/killer-joeun-source-art-v1.png
- 규격: 1024 × 1536, 2:3 RGB PNG. 이미지 생성 원본을 무가공 복사.
- 최우선 기준: 제니스 조은 얼굴의 닮음. 베스페라는 채색 및 재질 참고에만 사용.
- 검수: 파일 규격·원화 내부 문자/프레임 없음·얼굴/손/무기 가림 여부 확인. 사용자가 원화 유지 및 라이브 연결을 승인.

아래 프롬프트와 초안 파일명은 제작 이력으로 보존하며, 실제 도감 이름은 경찰 조은이다.

## 생성 프롬프트

```text
Use case: stylized-concept, identity-preserving reference-conditioned character illustration.
Asset type: ONE finished mercenary source-art illustration for the Korean fantasy card game SOOPKETMON. Character name in metadata only: 킬러 조은 (Killer Joeun). Never print the name inside the image.

HIGHEST PRIORITY: preserve the recognizable facial identity of the adult woman in reference image 1 (the project's ZENITH Joeun card photograph). The user explicitly says recognizable ZENITH Joeun likeness is more important than anything else. Do not replace her with a generic pretty anime woman.
Reference roles:
1. assets/cards/1315415134.png: PRIMARY facial identity. This is a two-photo collage of the same adult woman; use the OPEN-EYED lower photograph as the main guide for her facial structure, proportions, eye spacing and shape, nose, lips, soft smile, jaw and long black hair. Output one character, not a collage. Do not copy the ice cream, pink shirt, tourist setting, watermark or photo layout.
2. supplied c0760cd6 photo: supplemental facial identity and sky-blue uniform shirt reference. Preserve her distinctive face, adult age, dark eyes, side-parted long straight black hair, gentle oval face, naturally tapered jaw and small softly defined lips. Identity consistency with image 1 takes priority over aesthetic idealization.
3. supplied bd253f76 full-body outfit photo: clothing construction only. Sky-blue short-sleeved uniform shirt, black tie, gold buttons, dark epaulets, black high-waisted short straight skirt, black knee socks and black lace-up boots. Ignore phone, mirror, room, hand in foreground and all photo clutter.
4. female-office-sniper-red-v1.png (Vespera): STYLE/PAINTING FINISH ONLY. Borrow the refined 2D painterly shading, hair finish and convincing clean fabric/metal rendering, NOT her face, anatomy exaggeration, glasses, bob haircut, red outfit, weapon pose or background.

Character and clothing: A beautiful adult female professional mercenary with the ACTUAL facial proportions and recognizable features of reference 1. Long sleek black hair, subtle friendly confident expression and direct readable eyes, slight three-quarter face turn close to the open-eyed Zenith reference. Sky-blue collared short-sleeve uniform shirt buttoned modestly with black necktie, small gold buttons, black epaulets; opaque tailored black leather mid-thigh skirt and dark boots/socks if visible. These are regular outer garments, not lingerie. Natural adult build as referenced, no exaggerated curves, no cleavage emphasis, no visible underwear, no garter lingerie, no erotic posing or fetish framing.

Weapon: one elegant, cohesive fantasy-skinned semiautomatic sidearm, black enamel and brushed silver with restrained pale-blue energy inlays flowing across the whole slide and frame. Luxurious clean silhouette, not a bulky sci-fi machine or a ordinary pistol with a gem glued on. Held naturally in a relaxed two-handed low-ready position around waist level, muzzle directed diagonally down and away from the viewer. Anatomically correct distinct fingers, sensible thumb placement, natural wrist-to-grip connection, index finger straight alongside the frame and outside trigger guard. Do not obscure her face.

Scene: understated sophisticated modern-fantasy city terrace at blue hour, softened cool stone architecture, distant warm city windows, subtle evening air. A faint cool rim on the black hair and gentle neutral facial key light. Background subordinate and uncluttered. No battle victim, no blood, no threatening scene, no police wording or real organization emblems.
Style: high-end CHARACTER-CENTERED SEMI-REAL FANTASY SPLASH ART; polished 2D game illustration, painterly not photographic, moderate stylization that preserves the real face. Never enlarge eyes into generic anime proportions or sharpen chin into a doll face. Strong facial readability and attractive clean restrained design. Not 3D, not Western gritty RPG, no pores or excessive weathering, not Vespera reskin.
Composition: one vertical 2:3 canvas, EXACTLY 1024 x 1536 pixels, RGB PNG. Natural eye-level camera; engaging medium three-quarter character portrait from head down to just below knees, face sufficiently large and completely unobstructed, positioned about 25% down from the top. Enough headroom for a slim game frame. Face, hands and weapon all within safe inner margins: no important details in outer 4%, top 8%, bottom 12%. Keep both hands and the entire pistol inside canvas. Eye and mouth detail is the main focal point, outfit secondary, background third.
No text, letters, captions, name, rank, rarity, logo, signature, watermark, borders, card frame or UI. One complete illustration, not character sheet or multiple panels.
Final priority order: 1 recognizable ZENITH Joeun face 2 accurate blue-shirt/black-skirt costume 3 refined painterly game art 4 appealing professional mercenary composition.
```

# FM 오리꿍 제작 기록

- 도구: 내장 image_gen
- 로비: 사용자 승인 원본을 그대로 보존
- 장비창: 승인 로비를 참조한 별도 자세와 네이티브 알파 전신
- 후처리: 비율을 유지한 크기 조정·빈 여백·WebP 압축만 사용
- 덕코프 형태 참조: https://store.steampowered.com/app/3167020/Escape_From_Duckov/
- FM 문장: assets/ui/clan/marks/source/fm-clan-mark-source-v1.png

## 로비 프롬프트

Use case: stylized-concept.
Asset type: one polished full-body game lobby avatar concept, vertical 2:3, 1024 x 1536. Character name for this commission is "FM 오리꿍"; do not put the name or a title on the image.

Primary request: Create an Escape from Duckov duck character wearing the FM clan's uniform.
Input image 1 is the official Escape from Duckov Steam key art: use the MAIN YELLOW DUCK as the anatomy, facial design, proportions, and charming stylized game character reference. Ignore its title typography and the other characters.
Input image 2 is the user's project's actual FM clan crest: use its emerald green, black, and gold identity and reproduce the recognizable gold "FM" crest on the uniform as a nicely integrated embroidered chest patch. It is a clothing emblem, not a giant handheld shield.

Subject: One unmistakable Duckov duck, with a smooth rounded egg-shaped golden-yellow head, tiny glossy black round eyes, a small broad orange duck bill, a rounded compact yellow body, short wing arms, short legs and broad orange webbed feet. Friendly, cheeky, confident personality. Preserve the simple Duckov duck silhouette and its little face, no human face, no humanoid woman, no realistic bird anatomy.
Uniform: A premium FM clan team uniform tailored to the duck's compact body: black short-sleeved zip-collar athletic jersey, rich emerald-green shoulder and side panels, narrow tasteful gold piping, a clearly legible FM clan crest embroidered on the chest, matching compact black cargo shorts, and a slim practical utility belt with a single small pouch. A neat black-and-emerald cap with gold FM lettering and a modest comms earpiece complement the uniform without hiding the eyes or beak. The wing tips and webbed feet remain visible. Make it feel like a real coordinated clan team uniform with attractive materials and cut, with the tactical charm of Duckov, not plate armor or a human mascot costume.

Pose and framing: Full body from cap to the ends of BOTH webbed feet, all extremities inside frame with comfortable margins. Character occupies most of the portrait, approximately 80 percent of its height. Three-quarter front view turned subtly toward screen right, head looking toward the viewer; cheerful self-assured stance, one small wing hand resting at the hip and the other relaxed so the chest emblem remains entirely visible. Camera at the duck's eye level, rounded proportions rather than elongated human proportions.
Scene: A subdued, softly defocused game clan-base ready room, dark slate and emerald accent lighting, a little warm light from one side, clean floor contact shadow. Keep background secondary with clear separation around the silhouette. No other characters.
Style: High-quality stylized 3D game promotional character art closely faithful to the appealing Duckov reference; clean sculpted forms, soft toon-friendly shading, subtle high-quality fabric detail, controlled highlights, strong readable face and complete silhouette. Bright golden-yellow duck against the black/emerald/gold uniform. Charming and polished.
Constraints: exactly one duck, exactly two wings and two webbed feet; no human hands or human body, no photorealistic duck feathers, no long human legs, no armor, no giant ornate jewelry, no weapons obscuring the outfit, no extra floating logos, no poster layout, no card border, no watermark, no text except the integrated FM letters on the clothing.

## 장비창 프롬프트

Use case: identity-preserve / background-extraction.
Asset type: production equipment-screen avatar, one isolated full-body character, native RGBA transparent PNG, portrait 1024 x 1536.
The provided image is the USER-APPROVED identity of "FM 오리꿍". Create its matching equipment-screen full-body cutout. Preserve exactly its recognizable golden-yellow Duckov duck face, small orange bill, glossy black eyes, rounded egg-shaped head and compact body, short wing-arms, short orange legs and webbed feet; preserve the black/emerald/gold FM clan team uniform, gold FM cap letters, embroidered chest crest, headset/microphone, black cargo shorts and belt pouch. Same high-quality stylized 3D game art and warm yellow feather surface. Do not redesign its face, costume, crest or palette. The character remains a duck, not a human.

Pose: distinct restrained equipment display stance, looking nearly forward with a slight three-quarter turn to screen right. Both wing arms relaxed slightly away from its sides; two webbed feet naturally apart and firmly aligned at the same ground level. Keep the chest FM emblem completely visible. Full body from the top of the cap to the bottom of both webbed feet, no cropping, good margin on every edge, centered. Keep its compact cute proportions; never stretch into tall human legs.
Background: fully transparent native alpha, absolutely no room, floor, flag, scene, gray backdrop, white backdrop, black backdrop, checkerboard texture, fog, vignette, border, logo outside clothing, cast floor shadow, or text title. Only the duck and its worn clothing/accessories. Clean antialiased transparent edges suitable for composition over both pale and navy UI panels. Solid body and cloth are opaque. Use clean even character lighting preserving approved black/emerald/gold and yellow colors, no colored haze. One character, two wings, two feet, no weapon, no new props.

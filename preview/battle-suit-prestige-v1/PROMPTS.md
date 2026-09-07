# Prompt set / selected white-orange suit

Mode: built-in image_gen; no CLI/API fallback. User authorized existing scripts for transparency and atlas creation.

## Selection and approval

- Only the white/orange twin-antenna suit remains in scope. The winged design is cancelled.
- M200 integrated pose was explicitly approved: "M200통과 SKS 다시". Do not regenerate or alter that source.
- Both generated purple SKS weapon designs were rejected. They are NOT runtime sources.
- Final SKS uses the existing exact PNG at /assets/ui/project-v/account-battle-suits/weapons/sovereign-sks-v1.png, SHA256 9FE876729D85DE6B45D27CEAA65F49A91915AB340E5B520146B2E8FA81713462. No gun geometry is generated in the final composition.
- Source reference images supplied by the user are not redistributed.

## White/orange base body

Use case: stylized-concept.
Asset type: ONE production 2D full-body PROJECT V V3 battle-suit sprite source, NOT a poster, NOT a splash illustration.
Preserve the long slender adult HUMAN-WORN armored suit proportion from Image 1: about 7 heads tall, narrow articulated waist, long legs, normal sized hands and feet. No chibi, no stocky robot, no massive rounded boots. Make the silhouette visibly high-tier through disciplined layered armor and a strong helmet silhouette.
Camera: elevated isometric/three-quarter combat camera looking down about 20 degrees, figure faces and aims toward screen RIGHT. Both boots fully visible planted in a stable standing rifle-ready stance. Head, torso and knees are consistent in perspective. Single subject centered, entire helmet crest, feet, wings if present and muzzle inside a portrait 1024x1536 canvas with 6% clean margin.
Weapon compositing source: the character must hold ONE completely plain untextured vivid chroma-green (#00FF00) rifle-shaped placeholder HORIZONTALLY, rightward muzzle, butt stock seated naturally at shoulder, right hand gripping pistol grip and left hand underneath the fore-end. Entire placeholder gun including its stock, barrel, magazine and grip is pure green without outline or dark internal details, no green reflected on the suit. The armored fingers visibly wrap over the placeholder and must NOT be green. This placeholder will be removed by the game's existing pipeline and replaced with exact existing gun artwork, so no other weapons, no blade, no shield. Place the rifle below the chin with the chest core still readable.
Background: flat perfectly uniform pure magenta #FF00FF matte key, including all gaps between limbs and armor. No checkerboard, no floor, no shadow, no vignette, no glow cast onto background. No magenta anywhere on the character.
Style: exceptionally clean high-end stylized 2D game sprite rendering, controlled crisp plate facets, strong readable shapes at 240px height, restrained material reflections. Not photoreal, not an illustrated scene. No text, insignias, badges, UI, logos, signatures or watermark. No floating particles, smoke, streaks, lens flare or baked muzzle flash. Local emissive eye/core detail only.
Input roles: Image 1 is only a BODY PROPORTION and COMBAT STANCE reference; completely replace its round low-tier armor and ignore its detailed gun and checkerboard. Image 2 is the USER-SELECTED primary armor design reference.
Design: reinterpret Image 2 as an elite wearable exosuit. Pearl WHITE angular layered plates on a fitted obsidian-black undersuit, fine champagne-gold mechanical joints and armor trims, intensely defined amber ORANGE compact chest reactor and orange eye slit. Tall narrow twin helmet antennae and an angular knight-like face mask, swept pointed shoulder armor with tapered horizontal stabilizer fins, articulated chevron abdomen and elegant long shin armor with inset amber strips. Retain the recognizable white/orange/twin-antenna identity of Image 2. Armor has more grandeur than Image 1 but fits an adult person's shoulders, waist and knees. No huge wings, no cape; small shoulder stabilizer fins only. Avoid bland smooth biker helmet and generic power armor.

## Approved M200 integrated pose

Use case: compositing. Asset type: actual PROJECT V V3 full-body game battle sprite, NOT a poster or illustration scene.
Input 1 is the EDIT TARGET: the single tall slender white armor / orange reactor / twin antenna helmet human-worn suit. Preserve its exact helmet, white angular shoulder armor, orange core, black undersuit, gold joints, legs, feet, detailed 2D game rendering and slim adult human proportions. Only redesign the upper-body aiming posture and insert the requested weapon. Do not make a second suit.
Input 2 is the ACTUAL WEAPON reference; preserve its distinctive entire design and material/color details, mirrored to point RIGHT. Input 3 is ONLY the correct shoulder/hand contact reference: weapon is large and integrated into a natural full-body shouldered aiming stance, trigger hand actually wraps around the pistol grip, support hand wraps around the underside fore-end, buttstock against shoulder. Do NOT copy the gold suit from input 3.
Remove the green placeholder completely. Repose BOTH forearms and hands to fit the actual weapon instead of shrinking or floating the weapon. The gun is IN FRONT of the chest, with both hands correctly wrapping around it; no armor patch covering the receiver, trigger, magazine, scope or barrel. Helmet looks along the sights. No fused fingers or detached hands. Keep full body AND full gun uncropped.
Background: actual transparent alpha requested; if transparency is unavailable, use perfectly flat solid magenta #FF00FF, no shading/checkerboard. No floor/shadow, no text, watermark, logo or muzzle flash. High-resolution isolated sprite, full body with clean negative spaces. Tall 3:4 canvas with room to the right for the long gun, body on left-of-center.
The required weapon is INFINITY M200, the exact orange/red/gold and black dragon sniper rifle in image 2. It must be a LARGE LONG SNIPER RIFLE, substantially longer than a compact assault rifle: overall stock-to-muzzle length about 75% of character head-to-sole height, long heavy cylindrical barrel fully extended to the right, large full-size scope on top, visible skeletal stock at shoulder, ornate dragon receiver and hanging bipod. Preserve the gun's original length-to-thickness proportions: do not compress, miniaturize, shorten the barrel, replace with an assault rifle, or crop the muzzle. Adjust the body slightly left within canvas to give this rifle its full length. Scope near eye height and buttstock firmly in shoulder pocket. SUPPORT HAND under the front receiver behind the bipod, not grabbing the barrel. The entire rifle should read as a heavy sniper at sprite size.

## SKS body-only repair (not a weapon redraw)

Use case: precise-object-edit. This is ONLY a BODY/ARM REPAIR PASS for a V3 game sprite. Do not design a weapon.
Edit the provided full-body white/orange armor sprite. Keep the canvas 1024x1536, exact character footprint, identical slim figure, head, shoulders, legs, feet, palette and facing direction. Preserve the BRIGHT GREEN WEAPON PLACEHOLDER at EXACTLY the same coordinates, shape, orientation and scale. It is the exact silhouette of an existing game weapon and will be replaced pixel-for-pixel offline. DO NOT turn it into a longer rifle, add a barrel, sights, stock or any gun details. All weapon pixels remain flat pure green #00FF00.
Repair the missing BODY artwork around the green silhouette: there is a large incorrect MAGENTA RECTANGULAR HOLE at the upper chest/right shoulder (image x300–460,y315–375) where the previous gun was removed; restore the white armor collar and dark undersuit naturally under/behind the green stock. Also repair missing armor edges near the abdomen and far upper arm at x530–650,y420–520, while retaining the natural triangular open gap between elbow and body.
Adjust only the two hands/wrists minimally for a correctly held weapon: trigger hand on the rear pistol grip at approximately x470,y426, index finger at x510,y392; support hand cradles the underside of forward fore-end at x700,y381. Visible fingers can overlap the green silhouette where a hand must wrap it, but do not cover the receiver. No floating gun or broken wrist, no detached armor islands, no erased chest. Keep all suit details outside those small repairs unchanged.
Flat magenta #FF00FF background, no shadow/checkerboard/text/UI. Full body, uncropped. The fixed green silhouette MUST NOT be lengthened or redesigned. The actual purple weapon is NOT part of this editing pass.

## Offline final SKS operation

V5 was rejected for short proportions and an upward aim angle. It is retained only as intermediate history. The current final transformation is V6 below; never use the former 666px fit as the active resource.

## V6 larger weapon fit correction — 2026-09-08

User rejected V5 SKS and gold heavy-sniper proportions as too short and SKS as aiming upward. Only this selected suit is in scope. M200 remains approved and unchanged.

Final SKS: original PNG, uniform width 840px, whole-image rotation +6°, measured apparent bore angle 0.073°. Final gold heavy sniper: original PNG, width 980px, rotation 0°. Guns occupy 60% and 70% of figure height. See exact-weapon-fit.mjs for fixed grip/sight/muzzle anchors. AI generates only the body around green placeholders; all final visible gun pixels are restored from the original rasters.

## H-BODY live resource completion — 2026-09-08

Mode: built-in image_gen. User approved existing scripts for transparency, exact-weapon compositing and atlas production. Gold AR generated output supplies only the suit/hand layer; final gun pixels are copied from the original PNG. H-BODY source had a rendered checkerboard and was alpha-keyed with the existing connected-background script; final items have verified real RGBA alpha. Suit Core 4 retains generated alpha and uses only uniform padded fitting.

### Gold AR V7 body-only fit — 2026-09-08

Use case: precise-object-edit. Asset: production V3 full-body game sprite body repair.
Image 1 is the EDIT TARGET. Preserve this exact tall slim white/black/gold armor, twin antenna helmet, orange reactor, faceplate, torso, hips, legs, feet, size and position. Keep the pure magenta backdrop, same 5:6 canvas framing and flat green weapon silhouette EXACTLY fixed at the same position and dimensions. Do not draw any actual weapon.
Repair ONLY shoulders/arms/armored hands so they naturally hold this large fixed green rifle silhouette. The rear right hand must wrap the green pistol grip at approximately (468,428) in the 1280x1536 input, index finger correctly near trigger. The support left hand is too far left: extend the forearm toward the right and slightly upward, placing its palm/fingers beneath and around the green fore-end at (772,366), in FRONT of the magazine, not on the magazine. The stock is braced on the shoulder. Preserve both arms, realistic elbows/wrists, original white segmented glove plates and gold knuckles. Fingers may occlude small green areas. Clean natural shouldered aim, level muzzle axis. No changes to green gun shape, no shrinking weapon, no stretching barrel, no new armor design, no new decorations, no text, no ground, no watermark.

### H-BODY inventory image and unarmed fallback

Use case: precise-object-edit. Asset: high-end RPG inventory equipment cutout and fallback V3 body, H-BODY.
Image 1 is the exact design reference and edit target. Preserve the same long slim human-worn suit: white angular armor, black fitted undersuit, fine gold mechanical joints, bright amber-orange chest reactor and eyes, twin tall helmet antennae, slim waist and long legs, identical recognizable armor panels and colors.
Remove the green rifle entirely. Repose ONLY both arms into a relaxed alert stance, hands naturally closed and lowered beside the hips, fully visible, no weapon. Complete the upper torso details naturally where the green rifle had occluded it. Same refined polished 2D game illustration, not chunky/chibi, not a poster. Full body from antenna tips to both soles, clean three-quarter right-facing stance.
Genuinely transparent background with alpha, no checkerboard, no scenery, no floor/shadow pedestal, no extra objects, no text/name/logo/watermark/frame. Entire armor clearly readable as one inventory item, generous clear margins. Portrait canvas, 2:3 ratio.

### Suit Core 4 material icon

Use case: stylized-concept. Asset: premium RPG inventory crafting material icon, Suit Core 4 for the white/amber H-BODY armor.
Image 1 is a STYLE/FAMILY reference only, not a request to preserve purple coloring. Create ONE exquisite compact advanced reactor module in this existing game item family. A crisp nearly square engineered chassis with beveled pearl-white armor corners, black graphite interior, restrained gold fittings. Central circular amber-orange energy core contained inside a precision ring, warm orange circuitry connecting to four sides. Coherent expensive high-tier hardware, strong center silhouette, legible at 64px. Match the 2D detailed game icon render finish and dimensional metal materials. Upgrade elegance through layered white/gold panels and precise engineering, NOT excessive sparks/decorations. Four subtly lit orange indicators may distinguish generation four. No purple.
Square image, centered, around 10% padding, genuinely transparent background with alpha. No checkerboard, no scene, no text, no numbers, no logo, no watermark, no UI frame or unrelated objects.


### Larger SKS body-only fitting prompt

Use case: precise-object-edit. BODY AND ARM ART ONLY, no weapon design. This is a full-body V3 game sprite technical matte.
Edit the provided 1280x1536 canvas. Preserve the ONE white/orange slender human-worn armor exactly: twin helmet antennae, white plates, orange core, gold joints, legs and feet. Preserve the body coordinates and height; do not rescale or recenter the figure.
The BRIGHT GREEN silhouette is a fixed original game weapon. Keep its position, complete length, angle and shape EXACTLY as shown. It must remain FLAT PURE GREEN #00FF00; do not invent gun details or redraw a gun. This is the larger SKS fit. Its fixed muzzle is at 1086,363 and its receiver bore is level with the muzzle. DO NOT tilt the muzzle upward. Keep the entire green outline fixed.
Only rearticulate the arms/hands to hold this larger outline naturally. Rear trigger hand at x468,y428, index finger at trigger guard near x530,y395. MOVE THE SUPPORT HAND OUTWARD to x790,390; extend its bent elbow and forearm anatomically so the palm and fingers wrap the underside of the fore-end. The old support hand is too far inward; move it, do not add a third hand. The long gun is firmly shouldered, no floating fore-end or broken wrist. White armor gloves have restrained gold finger joints, fingers visibly curve around the green shape. Green may be occluded by fingertips, but receiver stays visible.
Restore any missing chest/shoulder/upper arm armor surrounding the green silhouette and remove the faint outline of the former smaller gun behind it. Preserve natural magenta open gaps between arms and torso. Background perfectly flat magenta #FF00FF, including all external areas and limb gaps. No shadow, checkerboard, label, new characters or weapon effects. Whole body and green weapon fully inside canvas. Exact 1280x1536 canvas and stable foot/head coordinates.

### Larger gold heavy-sniper body-only fitting prompt

Use case: precise-object-edit. BODY AND ARM ART ONLY, no weapon design. This is a full-body V3 game sprite technical matte.
Edit the provided 1280x1536 canvas. Preserve the ONE white/orange slender human-worn armor exactly: twin helmet antennae, white plates, orange core, gold joints, legs and feet. Preserve the body coordinates and height; do not rescale or recenter the figure.
The BRIGHT GREEN silhouette is a fixed original game weapon. Keep its position, complete length, angle and shape EXACTLY as shown. It must remain FLAT PURE GREEN #00FF00; do not invent gun details or redraw a gun. This is a very large heavy anti-materiel sniper rifle, noticeably larger than an assault rifle. The full green gun extends to x1220, including its scope and hanging bipod. Do not shorten or miniaturize it.
Only rearticulate the arms/hands to hold this larger outline naturally. Rear trigger hand at x468,y428, index finger at trigger guard near x530,y395. MOVE THE SUPPORT HAND OUTWARD to x840,381; extend its bent elbow and forearm anatomically so the palm and fingers wrap the underside of the fore-end. The old support hand is too far inward; move it, do not add a third hand. The long gun is firmly shouldered, no floating fore-end or broken wrist. White armor gloves have restrained gold finger joints, fingers visibly curve around the green shape. Green may be occluded by fingertips, but receiver stays visible.
Restore any missing chest/shoulder/upper arm armor surrounding the green silhouette and remove the faint outline of the former smaller gun behind it. Preserve natural magenta open gaps between arms and torso. Background perfectly flat magenta #FF00FF, including all external areas and limb gaps. No shadow, checkerboard, label, new characters or weapon effects. Whole body and green weapon fully inside canvas. Exact 1280x1536 canvas and stable foot/head coordinates.

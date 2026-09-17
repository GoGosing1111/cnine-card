# FM 딤우스 제작 프롬프트

도구: 내장 `image_gen`. 로비 V1의 포즈·신발 피드백을 V2에 반영했고, 최종 V2를 장비창 이미지의 참조로 사용했다.

## 로비 최초 제작

```text
Use case: identity-preserve
Asset type: premium 2:3 full-body lobby avatar illustration for the Korean game 숲켓몬.
Primary request: Create a new FM clan uniform version of the existing DIMWOOS (딤우스) avatar. Preserve her recognizable face and long black hair while changing the outfit, pose and body silhouette to the user's request: tall, slender, short fitted skirt and slightly unbuttoned top.

Input images:
Image 1 is the definitive DIMWOOS identity and 2D illustration style reference. Match this adult woman's face, eyes, delicate features, straight black bangs, long flowing black hair and polished painterly rendering closely. The former orange jersey and cargo pants and temple gesture must change.
Image 2 is ONLY a garment palette and FM team-uniform design reference: black cloth, emerald shoulder/side panels, fine gold piping and an embroidered FM chest crest. Do not reproduce the duck, animal anatomy, 3D mascot rendering, cap, headset, pouches or shorts.
Image 3 is the official FM clan crest, to be integrated as a small embroidered uniform chest badge. Its gold letters read exactly "FM".

Subject: One beautiful clearly adult woman in her mid-twenties, recognizable as image 1, with elegant tall slender proportions, long legs, natural anatomy and a face large enough to read in a game portrait. A calm, confident expression looking at the viewer.
Outfit: A tailored fitted short-sleeve collared FM team uniform blouse with black fabric, emerald shoulder and side panels, fine gold piping, tiny gold buttons and the FM crest on the chest. The upper two buttons are undone for a modest relaxed open neckline. The remaining front is neatly fastened and tucked into a short high-waisted body-hugging straight mini skirt, black with coordinated emerald side accents and restrained gold edging. The skirt fits smoothly rather than being pleated or flared. Slim black ankle boots with small gold details finish the same outfit.
New pose: Natural full-body fashion stance in a gentle three-quarter turn, one hand resting comfortably at her waist and the other arm relaxed at her side, weight on one leg and the other foot stepping a little forward. Both hands remain below the shoulders; do not repeat the temple salute from image 1. Let the long hair fall naturally with one restrained soft flow.
Scene/backdrop: A subdued premium FM clan operations lounge, dark architectural panels and soft emerald and warm gold lighting. Keep the background understated and painterly so the face and silhouette dominate.
Style: Closely match image 1's high-quality Korean 2D semi-real fantasy game illustration, refined painterly shading, luminous expressive face, clean fabric tailoring. Not photography and not plastic 3D.
Composition: Exactly 1024 x 1536 portrait 2:3. One complete full-body figure from the top of her hair to the soles of her shoes, centered with a little breathing room around hair and feet. Long-legged tall silhouette without tiny head or warped limbs. Neutral camera height, no extreme low angle.
Constraints: Preserve the identity, bangs and long black hair of image 1. FM palette and crest from images 2 and 3. Adult team uniform, not schoolwear. Elegant non-explicit fashion, opaque clothing. Natural wrists, hands, knees and feet. No extra characters, weapons, cap, headset, UI, card frame, captions, watermarks or oversized floating logos. Only the small clothing badge contains the letters FM.
```

## 최종 로비 V2 — 포즈·신발 수정

```text
Use case: identity-preserve
Asset type: FM DIMWOOS full-body lobby avatar, pose-and-shoes revision.
Edit the supplied FM DIMWOOS illustration. The user likes the face, hair, adult tall slender body, uniform, skirt, colors, rendering and setting. KEEP those. Change ONLY the pose and shoes clearly.

Identity and outfit invariants: The exact same beautiful adult woman in her mid-twenties, delicate face, eyes, long black hair and straight bangs; same tall slim long-legged build; same fitted black/emerald/gold FM short-sleeve button blouse with slightly open upper buttons and small embroidered FM chest crest; same short close-fitting straight mini skirt. Preserve the high-quality 2D semi-real painterly Korean game art, face quality, rich warm light, emerald and gold FM lounge, full head-to-shoe composition and 1024 x 1536 size.

NEW DISTINCT POSE: She has just taken a relaxed small step across the lounge diagonally toward the viewer's right. Her shoulders, torso and hips are turned about 35 degrees toward the viewer's right in a three-quarter FRONT view, while her head naturally turns back to make eye contact with the viewer, giving a confident gentle smile. Both arms extend down and back with elbows softly relaxed, and BOTH HANDS are loosely gathered together behind her lower back. Keep a natural slim silhouette. The forward leg bears her weight, the other foot trails half a step behind, with visible space separating both legs and shoes. She is upright, elegant and naturally balanced. Both feet must remain uncrossed. Do not put a hand on her waist, do not make the original hip-resting arm triangle, and do not reuse the front-facing crossed-leg fashion pose. Avoid a rear view; the front of the blouse, FM chest badge and face must stay visible.

NEW SHOES: Replace both ankle boots with elegant slender black pointed-toe slingback heels, narrow emerald green ankle straps and tiny gold buckles, open heel/instep design with naturally visible ankles. Refined slim heels, no chunky platform. Match the pair and portray anatomically correct foot placement and contact with the floor.

Keep the same FM lounge background and its original palette and lighting. Adapt hair drape and folds just enough for the new pose. No new accessories, hat, weapon, extra characters, captions, UI, borders or watermark. Natural joints, arms, hands and feet. Preserve the user's accepted face, uniform and tall slender proportions closely.
```

## 최종 장비창 V1

```text
Use case: identity-preserve
Asset type: transparent full-body equipment avatar, paired with the supplied FM DIMWOOS lobby illustration.
The supplied image is the exact identity and outfit reference. Make a separate equipment-slot illustration of this same clearly adult woman in her mid-twenties, keeping the exact recognizable face, long black hair with straight bangs, tall slender long-legged proportions, and the high-quality semi-real 2D painted Korean game style.

Identity and wardrobe must match exactly: fitted black short-sleeve collared blouse, emerald shoulder and side panels, fine gold piping, gold buttons, modest slightly open top buttons, small gold/emerald embroidered FM crest; same short high-waisted close-fitting straight black mini skirt with emerald side panels and gold edging. Same slender black pointed-toe slingback heels with narrow emerald ankle straps and tiny gold buckles, open insteps and heels, no boots or platforms. Keep the elegant slim proportions and expressive face from the reference.

Separate equipment pose: Stand upright facing almost directly toward the viewer with a gentle confident smile. Both shoulders naturally relaxed. Her hands are gently gathered in FRONT of the lower waist, one lightly holding the other wrist; fingers relaxed and anatomically natural, arms down rather than folded across the chest. Feet comfortably separated with one slightly ahead of the other, no crossed legs and no hand on hip. Keep the FM chest crest, clothing silhouette and both shoes clearly readable. Hair falls naturally behind the shoulders and along the torso.
Composition: One complete head-to-toe character, exactly 1024 x 1536 vertical 2:3, centered with small safe margins around hair, hands and soles. Maintain tall slim proportions while keeping the face legible.
Lighting: Clean soft neutral-warm character light with subtle emerald rim light, preserving the face and clothing material quality. No floor shadow.
Background: GENUINELY TRANSPARENT with a real RGBA alpha channel, not white, not black, not a drawn checkerboard. Only the isolated avatar, no environment, no floor, no furniture, no giant emblem, no captions, UI, borders, watermark, extra items or extra characters. Preserve true transparency around the entire hair and shoe silhouette.
```

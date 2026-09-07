# 하이희야 아바타 제작 기록

- 사용자 요청: `ma카드에 짱구희야 참고해서 하이희야 아바타 만들어`
- 이미지 생성 스킬의 기본 내장 `image_gen`으로 작화를 제작했다. API/CLI 이미지 생성은 사용하지 않았다. 투명 처리 두 차례 실패 후, 사용자의 명시적인 `배경만 코드로 제거` 승인으로 배경 추출·가장자리 매팅만 코드로 처리했다.
- CMS 읽기 전용 조회로 MA `짱구 희야` 카드 `CN-B2F4D52C44C74C4F`와 `assets/cards/0719card/hih9.png`를 확인했다.
- 로비 일러스트와 장비창 전신은 `assets/ui/avatars-v1/README.md` 규격에 따라 서로 다른 파일·구도로 만들었다.
- 얼굴, 눈썹 분장, 부푼 볼과 붉은 티셔츠는 MA 원본 기준이다. 테란여제 조은 원화는 회화적 렌더링만 참고했다.
- 두 전신 생성 결과가 모두 RGB PNG로 확인되어 이미지 생성 단계의 투명 배경 검수는 실패했다. 해당 원본은 별도 보존한다.
- 후속 코드 처리로 1024×1536 RGBA 전신을 만들었고, 외곽·팔 안쪽·손가락·다리·잔머리 주변 알파를 확인했다. 불투명 픽셀의 RGB 변경은 0이며 얼굴·의상·포즈를 재생성하거나 리사이즈하지 않았다.
- `remove-equipment-background.cjs`는 기존 공용 배경 제거 스크립트를 재사용한 뒤, 검수한 내부 구멍과 경계만 정리한다. 모바일 WebP는 별도 파생물이다.
- 원본·전투·기존 아바타·카드 데이터는 수정하지 않았고, 상점 공개·효과·가격·지급도 설정하지 않았다.

## 1. 로비 일러스트 최종 프롬프트

```text
Use case: identity-preserve / stylized-concept.
Asset type: Korean collectible game's lobby avatar illustration, new avatar named 하이희야 (name is metadata only, no lettering in artwork).
Input image 1 is the exact MA card "짱구 희야" (card CN-B2F4D52C44C74C4F): the sole identity, hairstyle, facial expression, red T-shirt and comedic eyebrow reference. Input image 2 is an existing approved lobby avatar: use ONLY its polished painterly 2D game-illustration rendering, material quality and readable character presentation. Do NOT copy image 2's face, hairstyle, white outfit, flexing pose, yellow tech room or color treatment.

Primary request: create one beautiful, playful adult female avatar who is immediately recognizable as the woman in image 1. Fidelity to her individual face is the highest priority. Preserve her soft rounded oval face, cheek shape, compact nose and small mouth, gray-brown eyes, center-parted dark hair neatly tied back with a few wisps, the very distinctive bold thick rounded dark cartoon eyebrows painted above her natural brows, and slightly puffed cheeks with a tiny pout. Make her an adult in her twenties with natural adult body proportions, not a child and not a chibi. Do not turn her into the second reference woman or a generic sharp-faced doll.

Outfit: retain the original loose bright-red opaque crew-neck short-sleeved T-shirt, simply coordinated with mustard-yellow casual shorts at mid-thigh and plain white low-top sneakers; casual playful avatar, no weapon, no armor, no sexualized redesign. Natural slender adult build, modest relaxed clothing.
Scene/backdrop: airy warm modern lounge inspired by the pale room in image 1, soft cream couch and subtly lit window in painterly soft focus. This is a premium game lobby character illustration, not a photo with a filter. Character is dominant, backdrop quiet and atmospheric.
Composition/framing: exactly 1024 x 1536, vertical 2:3. One character, relaxed standing pose at a slight three-quarter angle, face toward viewer, one hand at waist and the other raised near shoulder in a small friendly open-palm greeting; natural five-finger hands. Frame from head to upper shins with the face large and clearly readable. No wide-angle distortion, no tiny distant head. Leave comfortable clearance around hair and raised hand.
Style/medium: elegant high-end character-centered semi-real 2D game illustration; soft confident brushwork, clean anime-influenced facial modeling without flattening her individual features, restrained painterly fabric folds and hair strands, rich but controlled color, no hyperreal skin pores, no plastic 3D look. Keep the humorous eyebrow and puffed-cheek identity charming, not grotesque.
Lighting: soft warm daylight, gentle edge light, natural balanced skin tone.
Constraints: one finished artwork only; no panels, no comparison grid, no lettering, no Korean name, no card frame, no UI, no logo or watermark. Preserve reference 1 likeness and red-shirt identity. Do not depict Crayon Shin-chan himself or add a cartoon mascot. Output native full-resolution RGB PNG.
```

## 2. 장비창 전신 프롬프트

```text
Use case: identity-preserve / background-extraction.
Asset type: full-body transparent equipment avatar for the Korean game 숲켓몬. This is the same avatar 하이희야, not a mercenary and not a new person.
Input image 1 is the newly created Hi Heeya lobby illustration, the exact identity and outfit continuity reference. Input image 2 is the original MA "짱구 희야" photograph, supplementary face reference. Preserve their individual face identity. Do not change into another woman's face.

Create one separate full-body equipment illustration of this SAME adult woman, on a genuinely transparent alpha background, 1024 x 1536 RGBA PNG. It must be a new complete figure composition rather than a rectangular cropped piece of the lobby scene.
Preserve: her rounded oval face, soft cheek volume and slightly puffed-cheek tiny pout, compact nose, natural gray-brown eyes, middle-parted dark hair tied neatly back, the distinctive broad dark rounded comedic eyebrows above the natural brows, loose opaque red crew-neck T-shirt and mustard-yellow mid-thigh casual shorts. Include simple white low-top sneakers fully visible. Natural adult body proportions. Preserve the clean hand-painted semi-real 2D game illustration look of image 1; no realistic photographic pores or plastic 3D finish.
Pose: upright stable relaxed standing three-quarter near-frontal pose; both feet planted and fully visible with slight natural separation, one hand gently resting near the hip, the other hand doing a small friendly greeting near shoulder level. Keep both arms close enough to the body to fit a narrow equipment slot, natural fingers and wrists. Do not use the lifted-leg pose of the lobby illustration. Keep face front-readable.
Framing: full head-to-toe character with 6 percent clear transparent margin around hair, hands and shoes, feet near the bottom but never clipped; subject cleanly centered. Lighting is softly warm and balanced, matching the lobby identity but not needing a room.
Transparency is essential: all outside pixels and all gaps between limbs must contain true zero-alpha transparency. No black, white, gray, colored, checkerboard or painted transparency background. No room, floor, scenery, ground plane, shadow oval, glow cloud, pedestal or border.
No weapon, no armor, no child proportions, no chibi, no sexualized clothing, no additional characters, no words, no names, no UI, no frames, no watermarks.
```

## 3. 투명 배경 재시도 프롬프트

```text
Precise background extraction only. The input is an already finished full-body game-avatar illustration of an adult woman in a red T-shirt and mustard-yellow shorts, with her individual face and playful drawn eyebrows approved as the identity target for this editing pass.
The current white-gray checkerboard is PAINTED RGB pixels, not transparency. Remove this checkerboard completely and output a genuine transparent PNG with a real RGBA alpha channel. All empty space outside the woman, between the arm and waist, between fingers, between legs and around both sneakers must be zero alpha. Do NOT draw a representation of transparency. Do NOT replace it with white, black, gray, another checkerboard, a colored background or any new scene.
Preserve the woman EXACTLY: same face, eyes, mouth, eyebrow paint, hair, red shirt, yellow shorts, white shoes, standing pose, hand positions, proportions, all internal fabric folds, painterly style, lighting and colors. Do not redraw or beautify her. Maintain the same 1024x1536 canvas and existing full-body scale and placement. Keep all hair, fingertips and both complete shoes within bounds.
This is a production equipment sprite cutout, not a mockup. No ground, shadow, text, frame, watermark, border, or matte fringe. The deliverable itself MUST have real transparent alpha pixels and intact opaque character pixels.
```

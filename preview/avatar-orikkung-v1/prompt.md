# 제니스 오리꿍 아바타 생성 기록

2026-09-11. 내장 image_gen 사용. API/CLI 폴백 없음.

- 원본: `assets/cards/1412312312312.jpg`
- 제니스 카드: `CN-B5718BF375CA42C8`
- 기준 확인: `assets/ui/project-v/characters/zenith/manifest-v1.json`
- 기존 체온 로비 이미지는 렌더링 품질 참고용이며 얼굴·헤어·의상의 기준은 오리꿍 원본 카드다.
- 원본 사진과 기존 아바타 파일은 수정하지 않는다.

## 로비 초안

원본 생성 파일: `exec-cdbf0949-59d3-406a-bb2d-5013e1833a88.png`. 머리 장식 상단 잘림으로 최종 선택하지 않았다.

```text
Use case: identity-preserve / stylized-concept.
Asset type: one premium Korean game lobby avatar illustration for 숲켓몬, named 오리꿍 in metadata only. Native vertical 1024 x 1536 PNG, exact 2:3.
Input image 1 is the exact ZENITH 오리꿍 card source photograph, card CN-B5718BF375CA42C8. It is the SOLE identity, expression, hairstyle, head ornament and upper-costume reference. Input image 2 is an existing game avatar and is ONLY a reference for polished painterly 2D game-illustration rendering and material quality. Do not copy image 2's woman, face, brown hair, black camisole, trousers, pose or room.
Primary request: turn the adult woman in reference 1 into a beautiful, immediately recognizable finished game-avatar illustration. Preserve her soft oval face, rounded cheeks, large gray-blue eyes with their distinctive shape and spacing, small refined nose, softly smiling natural lips and calm friendly direct gaze. Maintain her individual likeness instead of a generic doll face. Clearly adult woman with natural adult proportions, not a child, not chibi.
Identity lock: her very distinctive icy white and pale aqua wig with thick swept white bangs, cyan crown sections, short outward-curled twin tails, large raised aqua loop/bunny-ear-like hair ornaments, small white ribbon ornaments and a dark four-petal flower clip with a round pale-blue center on the viewer-left side. Reproduce these from image 1, with all head ornaments clearly in frame. Keep the white and dark petrol/navy sleeveless futuristic costume: dark high inner collar, broad white hood-like shoulder/collar panels, structured white front panel with restrained cyan geometric piping and the dark wide wrist cuff. Keep the same modest neckline and natural build. Complete the unseen lower costume coherently with a short tailored dark-navy A-line skirt, clean white side panels with pale-cyan trim, and simple opaque dark tights; no extra exposure.
Composition: one character dominant in a comfortable medium-full portrait from the top of her head ornaments to just below the knees. Gently turned torso with face toward viewer, one loosely closed hand resting lightly below her chin recalling the original card gesture, other hand relaxed near the waist. Accurate five-finger hands, graceful natural wrists, no warped anatomy. Keep 6% clearance above all head ornaments and around elbows; large readable face.
Scene: a quiet elegant futuristic music lounge inspired by the original card's blue-violet studio lighting, softly blurred piano silhouette and restrained architectural panels. Pearl-cyan key light and subtle violet ambient light; natural luminous skin, deep petrol shadows, no intense neon fog. Background stays quiet and clearly secondary to her face and white-aqua hair.
Style: sophisticated high-end character-centered semi-real 2D Korean game illustration, visibly hand-painted, refined skin shading without pores, expressive recognizable eyes, clean fabric shapes, subtle polished materials and controlled brushwork. Similar rendering quality to reference 2 while strongly preserving reference 1's unique person and costume. No photo filter, no waxy 3D render, no huge anime eyes.
Text: none. No card frame, ZENITH label, name, lettering, logo, watermark, UI, border, collage, weapon, added character or mascot. One finished lobby artwork only.
```

## 로비 구도·작화 수정 — 최종 선택

원본 생성 파일: `exec-e564eb5c-6aae-4023-9b7a-54910981d8f5.png`.

```text
Use case: identity-preserve / style-transfer, targeted revision.
Input image 1 is the newly generated lobby artwork of the adult avatar 오리꿍 and is the edit target. Input image 2 is her exact ZENITH card photograph and is the identity and costume truth.
Create a revised 1024 x 1536 vertical 2:3 game-avatar lobby illustration. Make only two deliberate changes to image 1:
1. Reframe the whole scene with the camera slightly farther back and the subject slightly lower, so BOTH large pale-cyan raised loop hair ornaments, every ribbon and all hair are completely visible, with at least 6% empty space above the highest ornament. The current top crop is an error. Frame the seated woman from her complete head ornaments to just below both knees.
2. Render it as an unmistakable polished, hand-painted 2D Korean character illustration: softly designed painted skin planes, clean expressive painted eyes, grouped flowing hair shapes, delicate illustrated outlines only where needed, simplified painterly fabric shading, visible restrained brushwork in the background. Keep natural adult anatomy and sophisticated semi-real styling, but eliminate photographic skin pores, photographic lighting/material texture and the camera-photo look. Preserve the unique face likeness from image 2; do not substitute a generic anime girl, brown-haired woman or 3D doll.
Keep the face structure, gray-blue eyes, soft smile, white/aqua bangs and twin tails, dark four-petal flower ornament on viewer-left, white ribbons, white/navy sleeveless high-collar costume, cyan geometric piping, dark wrist cuff, tailored navy skirt with white panels, opaque dark tights, hand under chin, other hand gently resting, and quiet blue-violet music lounge with a softly painted piano. Preserve tasteful modest clothing and natural body proportions. No weapon, armor, new accessory, mascot, text, logos, typography, UI, border or watermark.
ONE coherent finished artwork, no comparison panels. Image 1 already establishes this identity and scene; improve framing and illustrated rendering, do not invent a different avatar.
```

## 장비창 전신

원본 생성 파일: `exec-b73bd222-f80a-4f95-8514-3196238abe6f.png`. 1024×1536 RGB이며 체크무늬가 실제 픽셀로 그려져 있어 투명 리소스로 사용하지 않는다. 후속 사용자 승인으로 아래 배경-only 처리를 완료했다.

```text
Use case: identity-preserve / stylized-concept.
Asset type: transparent full-body equipment-window avatar sprite for the Korean game 숲켓몬, named 오리꿍 in metadata only.
Input image 1 is the finalized lobby avatar and the exact character, outfit, colors and illustration-style continuity reference. Input image 2 is the original ZENITH 오리꿍 card photo and a supplementary facial-identity reference only.
Create ONE separate complete standing full-body avatar of this SAME adult woman, native 1024 x 1536 RGBA PNG with a genuinely transparent alpha background. This must be an isolated character asset, not a picture of a character on a background.
Keep her recognizable soft oval face, cheek shape, gray-blue eyes, small nose and softly smiling lips, the white/aqua hairstyle with swept bangs, short outward-curled twin tails, BOTH tall looped aqua hair ornaments, white ribbons and dark four-petal flower clip with pale round center. The large hair ornaments and face must be completely intact and visible.
Keep the precise outfit from image 1: white and dark petrol/navy sleeveless high-collar costume, broad white hood-like collar, structured white bodice with cyan geometric piping, dark wrist cuff, tailored navy A-line skirt with white pale-cyan-trimmed side panels, and opaque dark tights. Complete the feet with understated dark navy ankle boots with small low heels and a single slim cyan trim detail. No weapons or additional gear. Natural adult body proportions and tasteful modest costume. Match the refined painted semi-real 2D illustration style, with clean fabric shapes and readable face, not chibi, not a photo or a plastic 3D figure.
Pose: stable relaxed near-frontal three-quarter standing pose, both feet clearly visible and slightly separated, one hand loosely resting at the waist and the other arm comfortably relaxed alongside the body with natural open fingers. Both arms fit near the silhouette for a narrow equipment slot. This is a different useful standing pose from the seated lobby composition. Accurate shoulders, hands, wrists, knees and ankles.
Composition: full character from the highest hair loops down to the sole of BOTH boots. Center the figure and keep a generous 6% clear margin on ALL four sides. Never crop the tall hair or shoes. No huge empty side margin; character fills the vertical canvas comfortably.
TRANSPARENCY REQUIREMENT: deliver actual PNG alpha, with truly zero-alpha empty space outside the woman and through every arm gap, finger gap and gap between legs. Do not paint white, black, gray or checkerboard pixels to imitate transparency. No background, piano, room, chair, ground, floor, pedestal, cast shadow, shadow oval, glow cloud, frame or border.
No names, text, logos, watermark, UI, second character, comparisons or panels. ONE genuine transparent full-body game equipment asset.
```

## 사용자 승인 후 배경-only 처리

사용자 답변: **배경만 코드로 제거 (권장)**.

원본 RGB 그림을 재생성하지 않고 GrabCut과 확인된 배경 영역으로 마스크를 만든 뒤 경계 알파만 매팅했다. 흰 머리·의상 보존과 밝은/어두운 배경을 검수했고, 최종 불투명 RGB 변경은 0이다. 마스크·소스 해시·좌표·OpenCV 버전은 `segmentation-qa.json`, 최종 알파 통계는 `alpha-qa.json`에 보존했다.

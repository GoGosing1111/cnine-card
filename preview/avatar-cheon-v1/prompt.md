# 체온 — 생성·가공 기록

2026-09-08, 내장 `image_gen` 사용. 외부 API/CLI 폴백은 사용하지 않았다.

## 1. 로비 원화

입력: 사용자가 첨부한 `codex-clipboard-4d65df2d-f178-41b8-af4e-e5c8226da7d9.png` (원본 사진은 공개 폴더에 복사하지 않음).
출력: `exec-f44e9071-0255-45c0-92ec-4f8d5312090f.png` → `assets/avatar-cheon-lobby-source-art-v1.png` 무가공 복사.

```text
Use case: identity-preserve / stylized-concept.
Asset type: SOOPKETMON game avatar lobby illustration, native vertical 1024 x 1536 PNG, exact 2:3.
Input image 1 is the user's identity, hair, expression and upper-outfit reference. Create ONE polished game-avatar illustration of the same clearly adult woman, internally named "체온"; do not print the name in the image.
Preserve her recognizable soft oval face, gently almond-shaped eyes and their spacing, small refined nose, softly smiling pink lips, long straight chestnut-brown hair with a natural off-centre part and hair falling mostly over one shoulder. Preserve the small silver pendant and tiny earrings. Keep the reference's black sleeveless V-neck top and contrasting ivory shoulder-strap detail, but remove all brand lettering. Do not exaggerate neckline, chest or body proportions.
Complete a tasteful modern full-body outfit with well-tailored high-waisted charcoal trousers and clean black ankle boots. Relaxed confident standing pose, weight on one leg, one hand resting naturally near the hip and the other relaxed beside her body, accurate natural fingers. Entire head, hair, hands, both legs and both shoes visible, 5% empty margin above and below. Character large and readable, mature natural proportions, not chibi.
Art direction: premium character-focused 2D semi-real Korean game illustration; elegant painterly rendering, expressive recognizable face, crisp hair silhouette, controlled fabric folds and refined materials. Clearly an illustration rather than a camera photograph or a 3D wax doll. Do not turn her into a different generic fantasy character.
Environment: quiet sophisticated SOOPKETMON lobby lounge with dark graphite architectural panels, soft warm champagne rim light and very restrained dusty-rose ambient light recalling the reference. Low-detail background and calm negative space so the face and silhouette dominate. One grounded soft floor reflection, no busy neon, magic circles, particles or machinery.
No weapons, armor, wings, crowns, extra characters, logos, watermark, typography, card frame, collage or UI. One finished avatar illustration only.
```

## 2. 장비창 배경 추출

입력: 위 로비 원화.
출력: `exec-93d69214-8e0e-41ff-ad63-279318f78c55.png` → `assets/avatar-cheon-equipment-draft-v1.png`.
메타데이터 검사: 1024×1536 RGB, `hasAlpha: false`; 실제 투명 배경이 아니므로 이 파일 자체는 사용 불가.

```text
Use case: background-extraction / identity-preserve.
Asset type: transparent equipment-window full-body avatar sprite for SOOPKETMON, named 체온 in metadata only.
Input image 1 is the EXACT edit target and finished avatar artwork. Remove ONLY its entire room, furniture, floor, cast shadow and floor reflection. Deliver the isolated whole woman on a genuinely transparent alpha background in a native 1024 x 1536 RGBA PNG.
Absolutely preserve the existing face, eyes, expression, head angle, chestnut hair strands, skin, necklace, earrings, black camisole with ivory strap, charcoal pleated trousers, two black ankle boots, hand in pocket, relaxed other hand, limb placement, body proportions, color and the original 2:3 framing. Do not redraw, beautify, change clothing, add contour lines, move limbs, crop, distort, shorten her hair or invent accessories. Both shoes and all hair must stay intact.
The ONLY intended change is background removal including enclosed gaps around arms, fingertips and between the legs. Keep fine antialiased hair edges and the ivory shoulder strap. No painted checkerboard, solid white/black backdrop, glow, halo, ground, floor, reflection, shadow, border, text, logo or watermark. Alpha must be actually transparent, not depicted. One transparent game sprite, not a mockup.
```

## 3. 사용자가 승인한 배경-only 처리

질문: 장비창용 이미지의 얼굴·의상은 그대로 두고, 기존 프로젝트 스크립트로 체크무늬 배경만 제거해도 될까요?

답변: **배경만 스크립트로 제거**

`remove-equipment-background.cjs`는 기존 `scripts/remove-connected-light-background.cjs`와 하이희야 아바타의 2픽셀 경계 매팅을 바탕으로 만들었다. 이 원본의 회색 체크색·상단 머리카락 주변 색 번짐만 연결 탐색하고, 손가락 사이의 확인된 배경 좌표 2곳을 제거한다. 가장자리만 알파 매팅과 0.8σ 알파 평활화하며 불투명 RGB를 바꾸지 않는다. 장비창 전신의 캔버스·의상·얼굴·포즈·신발은 유지한다.

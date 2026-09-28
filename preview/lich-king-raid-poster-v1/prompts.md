# 리치왕 정벌 원화·영문 포스터 V1

- 제작일: 2026-09-28
- 생성 방식: 내장 `image_gen` 도구, 원화 생성 후 원화를 입력으로 한 포스터 편집
- 작화: 하이엔드 캐릭터 중심 세미리얼 판타지 스플래시 아트
- 상태: 사용자 시각 검수 대기. 레이드 원화 및 홍보 포스터 시안이며 운영 런타임 연결 없음.
- 원화: `lich-king-source-art-v1.png` — 문자 없는 마스터
- 포스터: `lich-king-raid-poster-en-v1.png` — 영문 홍보 포스터
- 입력 원본과 공식 앵커는 수정하지 않았으며 생성본도 별도 파일로 보존한다.

## 영문 카피

```text
NEW RAID
CONQUEST OF THE
LICH KING
IN THE FACE OF DEATH,
WHO WILL CLAIM THE FIRST VICTORY?
```

요청한 “신규 레이드 리치왕 정벌 / 죽음의 난이도 앞에서 첫 정벌은 누가”를 위 영문 홍보 문구로 구성했다.

## 원화 생성 프롬프트

```text
Use case: style-transfer / stylized-concept.
Asset: a completely re-illustrated, text-free master key art for the new Lich King raid in a Korean character-collection fantasy RPG. Create ONE finished vertical 2:3 illustration, native 2048x3072 if supported, otherwise at least native 1024x1536, opaque sRGB PNG. Full bleed, no side bars.
Input image 1 is the design reference to reinterpret: retain the iconic towering crown-helmet, narrow icy-blue glowing eye slits, silver-black heavy plate armor, dark regal cape, and huge frost greatsword held vertically point-down with BOTH anatomically correct armored hands stacked around its long hilt. Preserve the identity and ominous presence of this frost-undead king.
Input image 2 is the PRIMARY rendering-style reference (Vespera): sophisticated premium 2D character-centered semi-realistic fantasy splash art, controlled painterly edges, smooth stylized shading, beautiful readable design and unified atmospheric light. Borrow only its rendering quality; do not borrow its woman, face, outfit, firearm, red palette, architecture, or pose.
Input image 3 is the supporting heavy-armor rendering reference: coherent, elegant armor construction, clean silver metal planes, painterly highlights. Do not copy its bare-faced paladin, white/gold palette, or diagonal sword.
Scene: a frozen royal fortress lost in a blizzard, distant ruined spires in desaturated deep navy haze, restrained flying snow, cracked ice under the king's greatsword. No other characters.
Character: an imposing adult male armored Lich King, fully enclosed sovereign helmet with three distinct tall crown spires, concentrated bright cyan eyes readable in shadow, regal dark layered cuirass and clean articulated pauldrons, modest ominous skull-like sword-guard motif. Keep the helm enclosed, no exposed human face. His silhouette is broad-shouldered and tall, human anatomy under armor, with hands proportional and wrists naturally joined to the forearms. Two hands, five fingers each where visible, one coherent weapon with a straight blade.
Composition: commanding frontal near-full-body portrait from a slightly low viewpoint; large head/helm in upper quarter, clear eyes, hands and crossguard in middle third; sword blade runs downward through the center and ends in fractured ice near the bottom. One restrained cape sweep. Recompose and repaint beautifully rather than upscaling the low-resolution reference. Keep the uppermost 8% and lower 24% relatively low-detail, dark and quiet for a later poster treatment, without any blank boxes. Character remains richly drawn there; no text now.
Color/light: charcoal navy, cool brushed silver, luminous glacier cyan as a controlled accent; a strong cold rim light, soft reflected sword light on helm and gauntlets, luminous blade with elegant frosty abstract incisions, no legible writing or runic gibberish. Rich layered painterly depth with sharper character and softer fortress. Threatening, majestic, deathly cold.
Avoid: photo, cosplay, western live-action RPG screenshot, 3D render, plastic material, coarse metal wear, excessive micro-ornament, giant mechanical gauntlets, flat cel shading, small distant character, indistinct melted armor, tangled hands, overlapping extra swords, cluttered particles, excessive bloom.
Absolutely no typography, letters, logos, signatures, watermarks, game UI, rank badges, frames, poster mockup or borders. Return only the single polished illustration.
```

## 포스터 편집 프롬프트

```text
Use case: ads-marketing / precise poster typography edit.
Create ONE finished English new-raid announcement poster using the attached illustration as the exact artwork base. Vertical 2:3, same full-bleed composition, native 1024x1536 or higher, opaque PNG. This is the final poster itself, not a photograph of a printed poster.
Input image 1 is the EDIT TARGET and the already finished art: preserve this exact Lich King, enclosed crown helmet, cyan eyes, face silhouette, armor, two hands, sword design, sword angle, cloak, icy architecture, cold blue palette and polished painterly 2D rendering. Do not redesign, regenerate the character, change pose, add characters, or turn it into 3D art. The only changes are professional English typography and restrained tonal support behind the lower text.
Art direction: a premium dark-fantasy raid campaign poster, intimidating, regal, cinematic, exceptionally clean typography with generous spacing. The king's face, hands and sword guard remain wholly visible. Design the hierarchy so the immense name reads instantly in a mobile thumbnail.
Render ONLY the following exact English wording, each exactly once:
NEW RAID
CONQUEST OF THE
LICH KING
IN THE FACE OF DEATH,
WHO WILL CLAIM THE FIRST VICTORY?
Typographic placement:
- NEW RAID: a small but clearly legible, widely tracked cool silver sans-serif label in the upper-left atmospheric space, inset well from the edges. A short fine horizontal rule is allowed. Do not cover the crown.
- The main title sits in the lower quarter: CONQUEST OF THE as a refined smaller classical serif line centered directly above the enormous LICH KING. LICH KING is by far the largest text, spanning about 85% of the page width, distinguished engraved silver-white Roman capitals, sharp elegant serifs with subtle frost on outer edges only. No excessive bevel, no illegible filigree, no pseudo-alphabet. Ensure letters L I C H K I N G are perfect and clearly separated.
- At the bottom, center the two-line challenge IN THE FACE OF DEATH, / WHO WILL CLAIM THE FIRST VICTORY? in clean readable pale silver typography with measured tracking and comfortable line spacing. The question line can be slightly stronger. Keep a generous bottom margin.
Use a seamless dark navy vignette or soft atmospheric gradient in the lower third as necessary for excellent title and challenge contrast; retain the original image underneath. It should feel integrated into the icy environment, never a rectangular text panel. Keep brighter art/detail at the face and sword guard.
No additional wording, dates, websites, franchise logos, publisher logos, ratings, QR codes, watermarks, signatures, frames, borders, UI or decorative diamonds. Every requested word must be correctly spelled and unclipped. Deliver just this one immaculate polished poster.
```

## 확인 기록

- 원화·포스터 모두 2:3 세로 RGB PNG이며 업스케일·재압축 없이 생성 원본을 복사했다.
- 원화의 투구·두 손·수직 대검과 포스터의 제목·도전 문구를 시각 확인했다.
- 포스터의 영어 철자, 문구 누락 및 글자 잘림을 확인했다.
- 신규 레이드 코드·설정·메뉴·자산 등록은 변경하지 않았다.

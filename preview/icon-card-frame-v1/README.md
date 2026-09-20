# ICON 스트리머 카드 프레임 V1

상태: **USER_APPROVED_20260920**. 사용자가 `승인 이거로 채택함`으로 V1 프레임을 공식 채택했다. 이 승인은 프레임 디자인 고정에 대한 것이며 라이브 등급·카드 데이터·획득 경로 연결이나 운영 배포 승인은 아니다.

## 결과물

- 프레임: `../../assets/ui/card-frames/icon-streamer-frame-v1.png`
- 규격: 1024 × 1536 PNG, RGBA
- 중앙 인물 창과 프레임 외곽은 투명
- 승인 원본 SHA-256: `1368693F6861B7ABDCC8601CBF7EB5DAA13B5063B579DB3A8A38285CDCD0CA6F`
- 라이브 카드 시스템에는 아직 연결하지 않은 공식 채택본

## 디자인 기준

- ZENITH보다 상위인 별도 `ICON` 등급
- FUR의 용·쌍수·적색 왕관·유기적 감김 구조를 사용하지 않음
- ZENITH의 보라색 성좌·월식 문법을 사용하지 않음
- 흑요석, 백금, 샴페인 골드, 오팔광을 사용한 방송 명예의 전당 콘셉트
- 중앙 하단 이름판, 배너, 리본, 빈 가로 패널을 만들지 않음
- 하단은 측면과 이어지는 얇은 장식 레일로 마감

## 최종 이미지 생성 프롬프트

```text
Use case: stylized-concept
Asset type: production-ready transparent game card frame overlay for the new highest streamer-card rarity "ICON"
Input images: Image 1 is a size, transparency, and usable photo-window layout reference only; Image 2 is a negative reference whose dragon, crown, red-black color language, organic wrapping forms, and bottom plaque must NOT be copied.
Primary request: create one exceptionally prestigious 2:3 portrait card frame that visibly ranks above ZENITH while establishing an entirely separate ICON identity. The design language is an eternal broadcast hall-of-fame monument: sharply tailored black obsidian architecture, liquid platinum edges, restrained champagne-gold inlays, luminous opalescent crystal facets, and thin spectral light accents. Use a refined abstract aperture/spotlight halo motif at the top center and elegant vertical broadcast-frequency or soundwave engravings along the side rails. It must feel rare, expensive, ceremonial, modern, and unmistakably top-tier, with controlled detailing rather than clutter.
Composition/framing: exact 1024×1536 portrait frame, symmetrical overall silhouette with finely varied details; a large uninterrupted rounded-rectangle central portrait window, approximately x=100 to 924 and y=135 to 1416, genuinely transparent. Keep the frame concentrated around the perimeter. The bottom border must be a continuous slim ornamental rail matching the sides.
Lighting/mood: museum-grade dark luxury, crisp metallic highlights, concentrated opal radiance, small intentional lens-like sparkles, deep contrast.
Color palette: obsidian black, polished platinum, warm pale champagne gold, opal white with subtle cyan-magenta spectral refractions. No dominant red, no dominant purple.
Materials/textures: precision-cut obsidian, mirror platinum, fine gold filigree lines, opalescent crystal, subtle micro-engraving.
Text: no text anywhere.
Constraints: genuinely transparent background outside the frame and genuinely transparent center window; preserve clean alpha edges; frame only; no card artwork; no character; no background; no UI labels; no bottom-center name area; no nameplate; no banner; no ribbon; no rectangular text panel; no empty plaque; do not reserve a wide blank panel at the bottom. Keep the lower edge just as a slim decorative frame rail so the portrait remains visible to the bottom. No logos, no watermark.
Avoid: dragons, serpents, phoenixes, wings, animals, creatures, horns, crowns, thrones, skulls, swords, shields, laurel wreaths, moon phases, eclipses, constellation diagrams, generic fantasy vines, excessive baroque curls, red-black esports styling, a FUR-like silhouette, a ZENITH-like cosmic frame, and any solid fill inside the portrait window.
```

## 검수

```powershell
node preview/icon-card-frame-v1/qa-frame.mjs
```

- 1024 × 1536 확인
- 알파 채널 확인
- 중앙 검수 영역 투명도 99.9897%
- 1440 × 1000 데스크톱과 390 × 844 모바일 프리뷰에서 가로 오버플로 없음

# ImageGen 편집 프롬프트

- 모드: 기본 제공 ImageGen 이미지 편집.
- 편집 대상: 사용자 제공 1024×1536 세로형 대회 포스터(`source-poster.png`).
- 사용 사례: `text-localization`, `precise-object-edit`.

> Preserve the blue-versus-red fantasy stadium, opposing creature characters, energy effects, purple-gold material palette, and every panel below the central title. Edit only the large central title/headline zone, approximately x=190..830 and y=75..480. Remove the original Korean headline and two handwritten slogan lines completely. Replace them with a richly finished, empty dark midnight-blue esports title plaque with sculpted gold and violet edging. Keep the interior clean for later compositing of an authentic game logo and exact Korean typography. Do not write any text, glyphs, pseudo-lettering, logos, marks, or numbers in the central title zone. Do not redesign the lower panels, icons, prizes, or characters. The intended final title will be separately typeset as “서든어택 숲켓몬배 대회”.

최종본은 `build.mjs`로 원본 하단을 보존하고 공식 서든어택 로고와 정확한 한글 제목을 별도 계층으로 합성했다.

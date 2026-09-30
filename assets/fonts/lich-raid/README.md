# 리치왕 대기실 자체 호스팅 서체

운영 UI 기준 `docs/ui-fixed-reference-20260915.md`의 Noto Sans KR 한글 / Barlow Condensed 숫자 조합을 사용한다. CSS 별칭은 `LichSans`, `LichNumbers`로 리치왕 대기실에 적용하며 다른 화면의 서체를 바꾸지 않는다. 실행 중 외부 서체 서버에 의존하지 않는다.

2026-10-01 Google Fonts 공식 저장소에서 취득했다. 두 서체 모두 SIL Open Font License 1.1이며 저작권·라이선스 전문을 각각 동봉했다.

| 파일 | 원본 | 가공 | SHA-256 |
| --- | --- | --- | --- |
| NotoSansKR-lich-v1.woff2 | [NotoSansKR[wght].ttf](https://github.com/google/fonts/tree/main/ofl/notosanskr) | 100–900 가변 굵기, 한글·라틴·문장부호 서브셋, 힌팅 제거, WOFF2 | d2c21771a2eb4daa4c4d05a20cc2e89a23de0b0e036a9e528726cb0c254ef19d |
| BarlowCondensed-lich-v1.woff2 | [BarlowCondensed-SemiBold.ttf](https://github.com/google/fonts/tree/main/ofl/barlowcondensed) | 600 굵기, 라틴·숫자 서브셋, 힌팅 제거, WOFF2 | 9da9b4638576d6d7f416ca4c5f08b9fd72cb5d5cadc13372700ab2bada735a68 |

원본 SHA-256: Noto Sans KR `194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252`, Barlow Condensed `7b619d14bc2327509a9ef32b0890f709626f7ecc9ff61191c2a4314c5499d2d9`.

FontTools 4.66.1의 `fontTools.subset`으로 만들었다. Noto Sans KR은 `U+0000-024F,U+2000-206F,U+3000-30FF,U+3130-318F,U+A960-A97F,U+AC00-D7FF,U+FF00-FFEF`, Barlow Condensed는 `U+0000-024F,U+2000-206F`를 포함한다. 공통 옵션은 `--flavor=woff2 --no-hinting`이다. 런타임·npm 의존성은 추가하지 않는다.

글꼴 크기는 각각 1,173,656 / 15,396바이트다. `NotoSansKR-OFL.txt`, `BarlowCondensed-OFL.txt`와 함께 배포한다.

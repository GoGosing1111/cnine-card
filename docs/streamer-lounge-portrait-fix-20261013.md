# 라운지 프로필 확대·픽셀 뭉개짐 수정

사용자 제보: 움직이는 프로필이 너무 크게 표시돼 픽셀이 뭉개짐.

- 원인: /m/ 썸네일 중 조은·주성·나무늘봉순·아윤 등은 100×100인데 기존 PC 슬롯이 최대 172px였다.
- SOOP의 원본 주소를 직접 확인했다. 같은 프로필의 /m/ 없는 WebP 경로가 제공되며 GIF/움직이는 WebP의 프레임 수가 유지된다. 9명 모두 HTTP 200으로 확인했다.
- 확인 예: 조은 100→200px(77프레임), 나무늘봉순 100→204px(6프레임), 주성 100→130px(196프레임), 아윤 100→316px(36프레임). 디임 240px·하이희야 400px GIF는 같은 원본을 유지한다.
- 표시 슬롯은 PC 최대 96px, 모바일 최대 64px로 축소했다. 카드 높이와 사진 상단 간격도 함께 줄였다.
- 원본 이미지의 실제 크기와 devicePixelRatio로 표시 크기를 추가 제한한다. 예를 들어 3배 화면에서 130px 원본은 43px로 표시한다.
- 원본을 불러오지 못하면 기존 CMS 썸네일로 돌아가며 그때도 실제 해상도 이상으로 확대하지 않는다. 직접 등록한 외부/로컬 이미지 주소와 운영 DB는 변경하지 않는다.
- CSS·배경 원화·카드 원화는 변경하지 않았다.

## 검수

- 실제 Chrome PC 1440×900(1배), 모바일 390×844(3배)에서 사진과 화면을 직접 확인했다.
- 9명 전원의 표시 크기×화면 배율이 원본 최소 변 길이 이하임을 확인했다. 이름 검색·링크·키보드 닫기와 CMS 숨김 동작도 통과했다.
- 원본 404를 한 프로필에 재현하여 기존 썸네일로 복구되고 확대 제한이 유지됨을 확인했다.
- 같은 기능의 tests/streamer-lounge-v2036.test.mjs만 scoped 배포에서 실행한다. 직전 운영 배포는 05ef954d-4763-4fe6-b165-be3deab60739, 커밋 ca7a919e3089d5490214f9e599caba3f38bb94fd(Cloudflare Pages 조회).
- [PC](qa/streamer-lounge-portrait-fix-20261013/desktop.png), [모바일](qa/streamer-lounge-portrait-fix-20261013/mobile.png), [원본 해상도 확인](qa/streamer-lounge-portrait-fix-20261013/originals.json).

## 운영 반영

- scoped 회귀 18/18 및 출시·Hyperdrive 검사를 통과했다. 운영 코드 커밋 7205a9e4.
- Pages: https://00237b0e.cnine-card.pages.dev
- 2026-10-13 19:48 KST 실제 운영 주소에서 두 JS 해시 일치, 9개 원본 주소 사용과 3배 모바일의 픽셀 확대 방지를 확인했다. 주성은 130px 원본에 맞춰 43px, 나머지는 64px로 표시됐다.
- [운영 검증](qa/streamer-lounge-portrait-fix-20261013/live-verification.json), [운영 모바일 화면](qa/streamer-lounge-portrait-fix-20261013/live-mobile.png).

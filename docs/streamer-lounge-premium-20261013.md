# 스트리머 라운지 이미지 개편 · 남수댕 추가

사용자 최종 요청: 고급스럽고 예쁜 라운지, CSS로 장식을 만들지 않을 것. 남수댕 방송국 https://www.sooplive.com/station/mew030709 추가.

## 최종 화면

- built-in image_gen으로 야경·우드·차콜 석재의 라운지 원화와 브론즈 테두리 메탈 카드 원화를 제작했다. 최종 원본과 실제 프롬프트는 assets/ui/streamer-lounge/premium-v1/manifest.json에 보존한다.
- 새 CSS 파일/규칙/인라인 스타일을 만들지 않았다. 기존 로비 버튼·모달·검색창의 공통 스타일은 그대로 두고, 새 화면의 이미지·프로필·문자는 SVG의 이미지와 좌표로 배치한다. 초기 꽃·아이보리 시안은 최종 구현에서 제거했다.
- PC 3열, 모바일 2열로 표시하며 이름 검색, 빈 결과 초기화, 방송국 새 탭 이동, 키보드 Enter/Escape, 포커스 복귀를 제공한다. 사진·이름 자체에는 별도 동작이 없고 방송국 링크만 작동한다.
- CMS의 노출/숨김, 전체 OFF, 기존 순서를 그대로 읽는다. 실제 방송 여부를 추정하지 않는다.
- 화면: [PC](qa/streamer-lounge-premium-20261013/desktop.png), [모바일](qa/streamer-lounge-premium-20261013/mobile.png), [남수댕 카드](qa/streamer-lounge-premium-20261013/mobile-roster.png).

## 운영 목록

- 2026-10-13 19:28 KST, 기존 8명을 보존하고 남수댕을 마지막에 추가했다. 공개 API에서 9명과 요청된 방송국 URL을 확인했다.
- app_meta의 기존 설정 행 잠금과 수정, 관리자 감사 기록, 작업 영수증을 한 거래로 저장했다. 신규 스키마/마이그레이션은 없다.
- 작업: scripts/ops/streamer-namsudaeng-20261013.mjs
- 영수증: ops:streamer-namsudaeng:20261013:v1 / 감사 기록: 45576
- 설정 revision: db2ab200-8f5c-47d1-83e0-f6200884a57d

## 검수·배포 범위

- 실제 Chrome, 전체 게임 스타일과 로비 어댑터를 함께 로드한 독립 계정 없는 fixture: 1440×900, 390×844, 360×640. 사진 원격 로드, 가로 넘침 없음, 로비 기존 버튼과 겹침 없음, 9명 명칭/링크, 남수댕 검색, 새 탭 opener 차단, 빈 검색 초기화, CMS 숨김 새로 읽기를 확인했다.
- PC/모바일 스크린샷을 직접 확인했다. SVG 링크의 키보드 Enter 이동도 별도로 확인했다.
- 전역 스타일·인증·게임 거래를 바꾸지 않는 라운지 국소 변경이므로 scoped 배포를 사용한다.
- 실제 직전 운영 배포: f264c6ee-16af-4b49-bdd5-1928b867b538, 커밋 70e7199a4b2b87b59dc4563e02dbcc1ff04518c3. Cloudflare Pages 목록으로 확인.
- 선택 회귀: tests/streamer-lounge-v2036.test.mjs. 해당 회귀와 기존 출시/캐시/Hyperdrive 보호 검사는 npm run deploy:production -- --scoped 안에서 한 번 수행한다.
- 선택 회귀 16/16, 출시 보호 검사, Hyperdrive 검사 통과. 운영 커밋 ca7a919e3089d5490214f9e599caba3f38bb94fd.
- Pages 배포 05ef954d-4763-4fe6-b165-be3deab60739: https://05ef954d.cnine-card.pages.dev
- API runtime 버전 10abaef9-85a3-4033-92a3-8f55ffe63a08 / clan-draft 버전 ceb2dc27-b679-49e5-8aa4-500597da4d18.
- 2026-10-13 19:34 KST 운영 주소 확인: JS와 두 PNG의 SHA-256이 로컬 원본과 일치하고, 실제 페이지에서 라운지를 열어 9명 표시·남수댕 검색·방송국 주소·가로 넘침 없음·Escape 닫기를 확인했다.
- 공개 API·파일 해시 검증: [운영 확인 기록](qa/streamer-lounge-premium-20261013/live-verification.json), [실제 운영 화면](qa/streamer-lounge-premium-20261013/live-desktop.png), [목록 추가 영수증](qa/streamer-lounge-premium-20261013/roster-receipt.json).

# 이름 미정 SSS · 전투 리소스 검수판 — 2026-10-14

사용자 요청에 따라 승인된 청옥 중갑 마법사 원화를 기준으로 전투용 SD, 몸 동작 18프레임, 마법진·결정창·강림 효과 36프레임과 공용 V3 프리뷰를 제작했다. 이름과 운영 코드, 수치·획득·운영 연결은 미정/비활성이다. 프리뷰의 이름은 연출 설명이며 최종 명명이 아니다.

산출물 및 공정별 증빙: `preview/mercenary-sapphire-archmage-battle-v1/README.md`, `manifest.json`, `qa/runtime-report.json`, `qa/video-inspection.json`. PC·모바일 실제 전체 재생과 각 접점, 0.25/0.5/2배속, 정지·탐색·취소·대상 소멸·동작만·동작 줄이기·이탈 정리를 통과했다. 기술 검수와 최종 사용자 시각 승인은 구분하며 후자는 대기다.

## 배포 범위

- 직전 실제 운영 배포 소스: `7afe8ae483518ee602513c5b0c62d8d6d6780336` (승인 펫 9종, Pages `b751d74f`). 이후의 `85c529438`은 기록, `6193b4ef4`는 지급 작업 스크립트·영수증이며 게임 실행 파일 변경이 없다.
- 이번 변경은 신규 `preview/mercenary-sapphire-archmage-battle-v1/`와 이 문서뿐이다. 라이브 전투 모듈, CMS, DB, 로스터, 의존성은 변경하지 않는다.
- 실제 직전 배포 기준 diff에 이전 지급 스크립트가 포함되므로 assets-only 제한을 우회하지 않고 scoped 명령을 사용한다.
- 관련 검사: `preview/mercenary-sapphire-archmage-battle-v1/qa.test.mjs` (승인 원본·무기 픽셀 동일성, 프레임/아틀라스 해시, 취소·대상 소멸·복귀).
- 지정 명령: `npm run deploy:production -- --scoped`. 이미 통과한 브라우저 검수나 무관한 게임 전체 게이트를 반복하지 않는다. 배포 후 프리뷰·manifest·번들 반영만 짧게 확인한다.
- 배포는 검수 링크 제공을 위한 정적 리소스 공개다. 전투 리소스의 사용자 최종 승인이나 운영 용병 출시로 기록하지 않는다.

## 배포 완료

- 소스 커밋: `f8a15447c8ce3db75781c4b1ebccba2ab1164b4a`.
- Pages: `a3c3a3bb` (`https://a3c3a3bb.cnine-card.pages.dev`). 지정 scoped 명령 정상 종료.
- API runtime: `451b31a8-c52b-4471-93be-0571be123d4a`. API 실행 코드는 변경하지 않았고 지정 배포 명령의 공통 단계로 재배포됐다.
- 공개 프리뷰: `https://cnine-card.pages.dev/preview/mercenary-sapphire-archmage-battle-v1/index.html?showcase`.
- 영상 페이지: `https://cnine-card.pages.dev/preview/mercenary-sapphire-archmage-battle-v1/review.html`.
- 운영 `index.html`, `manifest.json`, `preview.bundle.js` HTTP 200 및 로컬 배포 파일과 SHA-256 일치. 녹화 영상 HTTP 200 / `video/webm` 확인.
- 배포 번들 SHA-256: `9527C3C2149BFAA8171CD80C2DF2764276D67A8F92B8FFE4E4BD38BFBE9C22BB`. Git Windows 체크아웃의 CRLF를 LF로 정규화한 해시는 브라우저 검수 보고서의 `e5c94578919eb63ceea25e7265cf6aa1edf359cab7099a223ec38c23ac29eeed`와 일치한다. 실행 내용은 동일하다.
- 최초 배포 사전 검사에서 로컬 `.wrangler/cache/cf.json`을 발견해 배포 디렉터리 밖으로 보존 이동한 뒤 정상 진행했다.
- 원격에 먼저 반영된 `52c19b030`은 바르센 보상 설정 작업의 JSON 영수증만 추가한 커밋이다. 이를 리베이스로 보존했으며 이 작업에서 해당 설정이나 영수증을 수정하지 않았다.
- 사용자 최종 시각 승인 대기, 이름 미정, 운영 용병 연결 OFF를 유지한다. 이 완료 기록은 문서 전용 커밋으로 반영하고 게임 재배포하지 않는다.

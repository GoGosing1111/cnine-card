# S-BODY 제작 연출 — 2026-09-28

사용자 요청: 기존 H-BODY까지 연결된 제작 연출을 확인하고 S-BODY를 추가한다.

## 범위

기존 E/F/G/H와 차량 라인은 유지하고, 승인된 S-BODY 아이템 원화에서 분리한 11개 부품을 기존 제작 장면에 추가했다. 실제 구현/원본 해시/접점/버전/브라우저 검수는 `preview/workshop-assembly-v1/README.md`의 같은 날짜 기록을 따른다.

제작 API·확률·비용·보상·재시도·전투·기능 출시 플래그·DB·의존성 변경은 없다. 성공과 실패의 서버 확정 영수증을 기존 결과 팝업에 전달한다. 앱 로더와 연출 번들의 캐시 키는 `20260928-s-body`, 메인 앱 진입 키는 `sBodyAssembly=20260928`로 갱신한다.

## Scoped 배포 선정

- 실제 직전 운영 배포: `0b245f28-4f96-4fe8-805d-fb0544caea2a`, 소스 `2d42985910ce271520145c5812e6e0d6bad5aa59` (Wrangler production deployment list로 확인).
- 작업 시작 원격 main: `6f7df16d`. 직전 배포 이후 선행 변경은 검수/지급 기록 문서와 완료된 1회성 운영 지급 스크립트이며 게임 런타임 변경은 없다.
- 선정 이유: S-BODY 제작 결과의 국소 클라이언트 연출 추가. 공통 인증·거래·DB·의존성 변경이 없어 전체 검사를 하지 않는다.
- 선택 검사: `tests/workshop-assembly-preview-v1.test.mjs`, `tests/workshop-assembly-live-v2073.test.mjs`. 원본 RGBA 복원, 기계식 헬멧/추진기 타임라인, 성공/실패 라우팅, 기존 모델 회귀, 확정 결과 유지, 중복 요청 없는 정리, 실제 번들/로더 연결을 확인한다.
- 빌드: `node preview/workshop-assembly-v1/build.mjs --model=s` 통과. PC/모바일 핵심 화면 확인 완료. 선택 회귀는 배포 명령에서 한 번 실행하고 실패 시 중단한다.
- 운영 배포 명령: `npm run deploy:production -- --scoped`. 깨끗한 커밋, origin/main 일치, 출시 플래그·캐시·Hyperdrive 보호를 유지한다.
- 배포 후 확인은 새 번들/부품 반영과 S-BODY 대표 연출 한 번으로 한정한다.

# 할로윈 V-980 할리퀸 나무늘봉순

사용자 정정으로 교체 대상은 **V-980 할로윈 SS 리미티드 나무늘봉순** 한 장이다. 최신 `굳이 모션 필요없음 SS리미티드급은 이거로 쓰고 스킬이나 잘만들고 연결반영해`에 따라 첨부 SD를 그대로 채택하고 신체 동작 시트 제작은 중단했다. V-990 설원 나무늘봉순, 일반·ICON 나무늘봉순, 다른 할로윈 6종과 보유 카드는 수정하지 않았다.

## 자산과 연결

- 단일 색인: `assets/ui/project-v/mercenaries/halloween-harlequin-20261017/manifest.json`.
- 원화: 같은 폴더 `source-art.png`, SHA-256 `C82230FB51DB845F9B337083D144700542EC898E8F27A041C2904348EA66A207`.
- 사용자 SD: `sd-approved.png`, SHA-256 `C51F275D8DFB5F2E5ACC5C3299B9B6C60114F862367E4750F33A5F730E08A067`. 첨부 PNG 바이트를 그대로 보존했다. 표시용 `sd.webp`만 균일 축소·투명 여백을 적용했다.
- 신규 효과: `skill-fx-source.png`와 `skill-fx.webp`. 내장 ImageGen으로 생성했다. `prompt-skill-fx.json`, `prompt-skill-fx-final.json`에 실제 프롬프트와 경계 겹침 보정 이력을 남겼다. 원화 생성 이력은 `source-art-provenance.json`이다.
- 기존 흑적색 총기 원화는 삭제하지 않고 `mercenary-halloween-art-approvals-20261014.json`의 `retiredVersions`에 보존했다. 현재 V-980 도감·팩·CMS 참조만 새 원화와 SD로 바꿨다.
- 중앙 카탈로그 `shared/mercenary-halloween-catalog-v1.mjs`에서 도감 API, 할로윈팩 및 관리 화면으로 전달한다. 도감 상세에 전용 스킬 시연 링크를 연결했다.

## 카니발 브레이크

징박힌 몽둥이에 홍청 에너지를 응축한 뒤 초승달 모양 타격 궤적, 다이아몬드 파열·보라 충격파, 파편·잔광으로 이어지는 서로 다른 16개 프레임이다. 0~0.6초 충전, 0.6~1.2초 이동, **1.2초 실제 표적 적중**, 2.6초 소멸로 구성했다. 기본 공격은 같은 전용 아틀라스의 4~15번 프레임을 1초에 재생하며 적중은 0.38초다. 이 시간은 연출 시간이며 서버 쿨다운이나 피해 수치를 정한 것이 아니다.

기존 PixiJS **8.20.0** / GSAP **3.13.0**과 V3 단일 렌더러·시계를 사용한다. 실제 구현은 `preview/project-v-v3/source/battle/LimitedMercenaryPlayback.js`, 메타데이터는 `shared/mercenary-harlequin-skill-v1.mjs`, 좌표·아틀라스 등록은 `shared/mercenary-harlequin-visual-v1.mjs`다. 승인 SD의 몽둥이 끝 좌표를 실제 스프라이트 변환으로 계산하고 표적 몸통 좌표에 적중시킨다. 서버 `MERCENARY_HIT`/기본 공격 영수증을 한 번만 적용하며 연출에서 피해를 계산하지 않는다. 별도 사운드는 추가하지 않았다.

SS 등급, V-980 코드, 캐릭터별 서버 5장, 기존 발행 카운터와 할로윈팩 OFF를 유지한다. 가격·조건부 확률·피해·쿨다운·대상 수는 새로 정하지 않았다. `visualSkill`은 연출 연결이며 기존 `skills:[]`, 획득·편성 잠금과 별개다. 새 FX의 사용자 시각 승인으로 기술 검수를 기록하지 않는다.

## 검수

- 빌더 `scripts/build-halloween-harlequin-20261017.cjs`: 선택 원본 해시 고정, 실제 알파·빈 셀·프레임 경계·16개 프레임 고유 해시 확인. 셀 경계 알파 최대 2/255.
- V3 공용 소비자 10종과 전용 시연 번들을 현재 공용 소스로 재빌드했다. 기존 룬 바닥 문양 업데이트를 포함한 최신 main을 통합했다.
- `tests/halloween-harlequin-20261017.browser.mjs`: 1440×1000 / 390×844에서 실제 도감 원화·SD, 할로윈팩 원화, V3 단일 캔버스, SD 화면 크기·배치, 충전/적중/소멸, 동일 SD 텍스처, 적중 오차 0, 배속·정지·탐색·중단·효과 OFF·해제, 서버 이벤트 1회 적용 확인. 브라우저 오류·실패 자산 0.
- 모바일 전용 시연은 중복 상태 표시를 숨겨 콘텐츠 높이 계산의 순환과 전장 축소를 해소했다. 상태 문구는 바깥 시연 컨트롤에 표시한다. 일반 게임 레이아웃은 이 수정으로 바꾸지 않았다.
- 증빙: `preview/halloween-bongsoon-harlequin-20261017/qa/`의 PC·모바일 화면, `browser-report.json`, `skill-preview.webm`.
- 배포 지정 검사: `tests/halloween-harlequin-20261017.test.mjs`, `tests/mercenary-halloween-art-20261014.test.mjs`, `tests/valter-attack-motion-speed-20261009.test.mjs`, 정책상 추가되는 `tests/pve-battlefield-entry-v2117.test.mjs`, `check:worker`.

## 운영 반영 완료

- 소스 커밋 `e7f9ee737e1b731a73d79bac54d2c0e0a6ca6683`, Pages `https://8b4a037b.cnine-card.pages.dev`. 지정된 `npm run deploy:production -- --scoped`를 완료했다. 관련 검사 **24/24**, Worker 문법, 출시 보호 조건, Hyperdrive 캐시 OFF 검사를 통과했다. 최초 캐시 태그 불일치는 배포 전 바로잡았다.
- API Runtime `6788a2fa-2538-401a-a2d4-f07af29b4232` 100% 활성 확인. Clan Draft `fbb22be2-ffc6-4d1a-918d-d572b5b7d232` 배포 완료.
- 2026-10-17 09:01 KST 운영 도감 API의 V-980 원화·SD·`HALLOWEEN_CARNIVAL_BREAK` 연결을 확인했다. 운영 파일 15개가 HTTP 200이고 로컬 검수본 해시와 일치한다. 텍스트는 CRLF/LF를 정규화하고 PNG/WebP는 원본 바이트로 비교했다.
- 공개 팩 API를 배포 전후 읽기 전용으로 비교했다. revision, settings, stock, releaseEnabled, userOpeningEnabled가 모두 동일하며 **OFF / 서버 5장 / 획득·편성 비활성**을 유지한다. CMS 설정·발행 카운터 쓰기는 수행하지 않았다.
- 실제 운영 프리뷰에서 0.25배 재생·정지·적중을 추가 확인했다. 0.6초에서 약 600ms 재생 후 0.754초, 정지 후 시각 고정, 적중 위치 오차 0, SD 정상 크기, 브라우저 오류 0. `qa/production-report.json`, `qa/production-browser.json`, `qa/production-preview.png`에 보존했다.
- 배포 전 잠시 분리한 기존 원화 제작 출력 폴더는 원래 위치로 복구하고 V2 원본 해시 일치를 확인했다. 사용자 원본·프롬프트·해시·재현 빌더는 모두 보존한다. 이 후속 기록만 추가하는 커밋은 운영 재배포나 통과한 게임 검사를 반복하지 않는다.

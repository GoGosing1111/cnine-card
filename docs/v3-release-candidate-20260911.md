# V3 개편 배포 후보와 검증 기록

2026-09-11. 사용자 지시 **“라이브는 아직”**을 유지한 로컬 배포 후보다. 운영 배포·원격 main 변경·운영 계정 지급·설정 변경은 실행하지 않았다.

## 후보 위치와 통합 기준

- 브랜치: `codex/v3-release-ready-20260911`
- 작업 트리: `C:/Users/User/Downloads/upload/cnine-v3-release-ready-20260911/site`
- 최신 운영 기준: `946d2d26b2e38359d522afc4aff36631a8ca0e34`
- 기능/화면 코드 검증 기준: `029c313a5fff0f54ea0fee208cbe695347d2cf1a`
- 운영 기준 위에 연속 PVE 기반, 카우방, 공통 그리드, 무한의탑, 폐차장 3구역과 투명 SD를 순서대로 통합했다. 최근 아바타·독립 용병 스킬 목록과 기존 출시 검사를 보존했다.
- `index.html`, `js/app.js`, `functions/api/[[path]].js`, `js/pve-command-v2-live.js`, `service-worker.js`는 운영 기준과 동일하다. 이 후보는 새 탑과 폐차장 계정 경로를 활성화하지 않는다.
- 의존성·체험 SQLite·스크린샷·로그는 모두 `site` 밖에 둔다. 검증 시 후보에는 미커밋/미추적/ignored 파일이 없었다.

## 통과한 검증

| 검증 | 결과 | 원본 기록 |
| --- | --- | --- |
| 운영 회귀 명령 전체 | 41개 명령 통과, 테스트 1,193개 통과 | `../qa/preparation.json`과 명령별 로그 |
| 공통 전장 | 10개 모드의 PC/모바일, 3개 연속 전투 화면, 스킬/보스 실험실, 코어 경로 등 33개 검사 통과 | `../browser/common-grid/qa.json` |
| 무한의탑 | PC/모바일/높이 변경, 정지·재생, 완주와 새로고침 복구 3개 검사 통과 | `../browser/tower/tower-qa.json` |
| 폐차장 | 3구역 × PC/모바일 및 모바일 용광로 16/16 완주, 7개 검사 통과 | `../browser/scrapyard/scrapyard-qa.json` |
| 마지막 구역 문구 수정 | 구역/보스 이름과 전황 초기화 수정 후 관련 테스트 21개 및 폐차장 화면 검사 7개 재통과 | `../qa/final-zone-tests.log`, `../qa/scrapyard-browser-final.log` |
| 투명 SD | 네 원본과 출력의 모든 RGB 동일, 배경 알파와 경계 검사 통과 | `preview/scrapyard-v3-v1/sd-completion-qa-v1.json` |

전체 회귀 기록은 `7cbae2de` 기준이다. 이후 `029c313a`는 폐차장 표시 문구만 바꾸었으며 해당 범위는 다시 검증했다. 브라우저 검사에서 JavaScript 오류와 실패 HTTP 요청은 없었다. 탑 저장/정산 검사는 SQLite와 PostgreSQL 양쪽에서 100회 반복, 중복 요청, 응답 유실, 동시 요청, 자정, 지급 실패 롤백을 포함한다.

`release:prepare:v3`는 `release:gate`에 등록된 모든 회귀 명령을 실행하며 최종 운영 소스 확인을 별도로 남긴다. 운영 소스 확인기는 실제로 실행했으며 **HEAD가 origin/main과 다르다는 사유로 차단**했다. 이 결과는 정상적인 배포 보류이며, `release:gate` 전체 통과나 운영 배포 완료로 보고하지 않는다. 원본은 `../qa/production-guard.log`다.

## 검수 입구

- 후보 통합 현황: `http://127.0.0.1:8898/preview/pve-overhaul-ready-v1/`
- 후보 무한의탑: `http://127.0.0.1:8898/preview/infinite-tower-v3-v1/`
- 후보 폐차장: `http://127.0.0.1:8898/preview/scrapyard-v3-v1/`
- 기존 작업 트리 체험 주소 `127.0.0.1:8897`도 유지한다.

후보 서버를 다시 실행할 때는 PowerShell에서 다음처럼 데이터 디렉터리를 배포 폴더 밖으로 지정한다.

```powershell
$env:PVE_PREVIEW_PORT = '8898'
$env:PVE_PREVIEW_DATA_DIR = 'C:/Users/User/Downloads/upload/cnine-v3-release-ready-20260911/review-data'
npm run preview:pve-overhaul
```

## 운영 활성화 전 필요한 작업

1. 탑 입장·반복 보상 수량과 최초 돌파 부가 드롭 정책을 확정한다. 현 시안은 무료 입장, 성공 보상 10회/일, 일반층 최초 코인의 2%와 1회 50만 상한, 20층 이상 보상 성공 5회마다 타이어 1개와 일일 2개 상한이다.
2. 준비된 탑/폐차장 저장 서비스와 세션 컨트롤러를 운영 계정 입장 UI 및 기존 인증·계정 잠금 경로에 최종 연결한다. `_tower_v3_routes.js`는 공개 OFF인 경계 초안이며 운영 API에 등록되어 있지 않다. 기존 탑과 새 탑을 동시에 보상 가능하게 열지 않는다.
3. 카우방 입장·보상과 원정 연결 범위를 확정하고 계정 정산을 완성한다. 새 폐차장 SD 4종·모바일 배치의 최종 시각 검수, 용병 등급/사용자 스킬 배정/개별 효과 승인도 각각 남아 있다.
4. 전체 콘텐츠 연결·검수와 사용자 최종 운영 반영 지시가 충족된 뒤 마이그레이션, 기능 플래그, 캐시, 공지 및 롤백을 같은 배포 회차에서 점검한다. 기존 Core·블랙미라클 출시 조건을 임의로 바꾸지 않는다.
5. 승인된 최종 커밋을 원격 main과 일치시키고 깨끗한 후보에서 `npm run release:gate`를 통과한 뒤 `npm run deploy:production`만 사용한다. 직접 Wrangler 배포나 dirty 우회는 사용하지 않는다.

상세 콘텐츠 현황은 [V3 전체 현황](v3-overhaul-readiness-20260911.md), 수치 근거는 [무한의탑 경제 시안](infinite-tower-v3-economy-draft-20260911.md)을 따른다.

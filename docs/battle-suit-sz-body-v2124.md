# S-BODY · Z-BODY 및 슈트 코어 5·6 — V2124

## 승인과 범위

2026-09-16 사용자의 `라이브 배포해 전체 승인` 및 `슈터코어 5 6 만들고` 지시를 반영한다. H-BODY 다음에 S-BODY, 그 다음 Z-BODY를 등록한다.

| 바디 | 장비 코드 | 재료 | 재료 코드 |
| --- | --- | --- | --- |
| S-BODY | `BATTLE_SUIT_S_BODY` | 슈트 코어 5 | `SUIT_CORE_5` |
| Z-BODY | `BATTLE_SUIT_Z_BODY` | 슈트 코어 6 | `SUIT_CORE_6` |

바디별 M4A1·AK·M200·SKS·금룡 돌격소총·금룡 대물저격총 6조합을 연결한다. 지원 사격은 기존 H-BODY의 공용 V3·PixiJS 8.20.0·GSAP 3.13.0 및 총기별 서버 피해 주기를 그대로 사용한다. 총 프로필은 기존 24개와 신규 12개를 합쳐 36개다.

## 자산과 빌드

- 승인 원본·무기 합성·프리뷰: `preview/battle-suit-sz-v1/`.
- S 원화 SHA-256: `A497FBB8A4DE40B10951E08BA06120CC36295472980C12A35777DBA67886D15C`.
- Z 최종 원화 SHA-256: `094A2C618F2683059FA129DE5DA2BCE558D5774748477D9AD26C3B41CE62CD6D`.
- 코어 원본과 생성 프롬프트: `assets/sources/suit-core-{5,6}-source-v2124.png`, `CORE-PROMPTS.md`.
- 운영 명세: `assets/ui/project-v/account-battle-suits/sz-body-v2124.json`, 기존 `manifest-v2.json`의 확장으로 등록.
- 운영 자산: 전투 PNG 12개, 아틀라스 6개, 비무장 2개, 바디 아이템 2개, 코어 아이템 2개.
- 승인 전투 PNG·아틀라스를 바이트 그대로 복사하고 피벗·총구 좌표를 계승한다. 코어는 1254×1254 RGBA다.
- 빌드: `node scripts/build-sz-body-resources-v2124.mjs`, `npm run build:v3-grid`.
- 공용 렌더러와 로더 버전은 모두 `2124-sz-body-core`. 실제 앱 리소스 URL에 `suits=2124`를 추가하며 기존 공통 메뉴의 메인 캐시 태그를 유지한다.

## 운영 등록과 경제

`functions/_battle_suit_sz_body.js`는 신규 장비 2개를 원자적으로 등록한다. `functions/_battle_suit_materials.js`는 기존 코어 1~4와 신규 코어 5·6의 완료 표식을 분리하여 기존 CMS 기본값을 재적용하지 않는다.

- 장비 신규값: 공개·활성, NORMAL, 총/ PVE/ PVP 전투력 0, 공급 OFF, 정렬 50·60.
- 코어 신규값: MATERIAL, MYTHIC, 활성, 정렬 200405·200406. 직접 사용 불가.
- 재실행 시 기존 전투력·등급·활성·공급·정렬 등 CMS 값을 보존한다. 명칭·승인 이미지·설명·PVP 0과 코어 재료 분류만 갱신한다.
- 완료 표식: `safe_runtime_upgrade_v2124_sz_body`, `safe_runtime_upgrade_v2124_battle_suit_core_5_6`.
- 소유 장비나 재료를 지급하지 않는다. 레시피·가격·재료 수량·드롭·보상 풀을 생성하지 않는다. 신규 전투력과 획득 정책은 사용자 별도 지시에 따라 CMS에서 설정한다.
- 로컬 전투 검수의 300,000 지원 전투력은 테스트 서버에서만 사용한 값이며 운영 기본값이 아니다.

## 검증

- `tests/battle-suit-sz-body-v2124.test.mjs`: 실제 SQLite·PostgreSQL 어댑터의 원자성, 실패 롤백/재시도, 기존 CMS 보존, 운영 12조합과 승인 파일 해시, 알파·피벗·총구, H-BODY 동일 주기, 전투력 0 비활성 확인.
- `npm run test:battle-suit`: 기존 H-BODY와 제작소·총기·계정 지원 유닛 회귀.
- `npm run test:live-connections`: 실제 배포 번들/로더 준비 계약, PVE·PVP 진입/복귀, 오래된 런타임 복구.
- `preview/battle-suit-sz-v1/qa/browser-report.json`: 12조합 PC·모바일 선택, 사격·취소·연속 사격, 접점·투명 여백 검수.
- 실제 index.html에서 PC 1440×1000, 모바일 390×844로 토벌 시작→사격→결과→복귀, PVE 이후 PVP 매칭→전투→결과→복귀를 별도 확인한다. 로컬 API 계정을 사용해 실제 계정 재화는 소모하지 않는다.
- 운영 배포는 전체 `npm run release:gate`를 실행하는 `npm run deploy:production`만 사용한다. 사전 회귀 일부 성공을 전체 출시 검사 성공으로 취급하지 않는다.

## 출시 및 복구

1. 최신 main 기반의 깨끗한 후보를 검증하고 `[CF-Pages-Skip]` 커밋을 origin/main에 반영한다.
2. 공식 배포 명령으로 전체 출시 검사, Pages, 기존 클랜 Worker 순서로 배포한다.
3. 운영 DB에서 위 장비·코어·완료 표식만 확인하고 누락 항목은 동일한 검증된 함수의 SQL로 원자적으로 등록한다. H-BODY·코어 4의 기존 설정을 전후 비교한다.
4. 운영 URL의 자산 해시·API 등록·런타임 버전을 확인한다. 운영 정적 파일을 사용하는 로컬 검수 API로 실화면 진입을 재검증한다.
5. 복구가 필요하면 이전 승인 커밋의 코드로 공식 배포 절차를 수행한다. 신규 소유 데이터나 CMS 설정은 삭제하지 않는다. 신규 노출 중단이 필요한 경우 새 코드 2개와 코어 2개의 활성 상태만 기존 스냅샷을 기준으로 되돌린다.

운영 DB 점검·배포 로그와 사후 자산 해시 영수증은 배포 디렉터리 밖의 작업별 `qa/`, `ops/`에 보관한다.

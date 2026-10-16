# 아르덴 에너지 · 비밀무기 설계도 라이브 재료 등록

사용자 `다 라이브에 반영해서 재료아이템으로 등록해`에 따라 열려 있던 `/preview/arden-energy-secret-blueprints-v1/`의 4종을 운영 재료 카탈로그에 등록했다. 기존 PNG 원본과 512px WebP를 그대로 사용하며, 새 이미지 제작이나 재압축은 하지 않았다.

| 재료 | 운영 코드 | 이미지 |
| --- | --- | --- |
| 아르덴 에너지 | `ARDEN_ENERGY` | `assets/items/arden-energy-v1.webp` |
| 비밀무기 설계도 1장 | `SECRET_WEAPON_BLUEPRINT_CHAPTER_1` | `assets/items/secret-weapon-blueprint-chapter-1-v1.webp` |
| 비밀무기 설계도 2장 | `SECRET_WEAPON_BLUEPRINT_CHAPTER_2` | `assets/items/secret-weapon-blueprint-chapter-2-v1.webp` |
| 비밀무기 설계도 3장 | `SECRET_WEAPON_BLUEPRINT_CHAPTER_3` | `assets/items/secret-weapon-blueprint-chapter-3-v1.webp` |

4종 모두 `MATERIAL`, 기존 재료 카탈로그 기본 분류 `SPECIAL`, 활성 상태 1이다. 직접 사용은 불가하며 제작소 CMS 재료 선택 목록에 포함된다. 설계도 1·2·3장은 동방무기 상위 버전용 서로 다른 세 도면이다. 사용자 지정이 없는 제작식·수량·비용·성공률·획득처·보상 풀은 추가하지 않았다. 기존 동방무기상 무기설계도와 비전6 차량설계도는 유지한다.

## 운영 적용 및 보존

- 등록 완료: **2026-10-16 08:59:49 KST**. 별도 읽기 연결로 **08:59:53 KST** 재조회 완료.
- 영수증: `ops:arden-blueprint-materials:20261016:v1`, 감사 로그 **46722**.
- `scripts/ops/arden-blueprint-materials-20261016.mjs`의 명시적 일회 작업으로 4행·감사 로그·완료 영수증을 같은 SERIALIZABLE 거래에 저장했다. 시작 코드·마이그레이션에는 연결하지 않는다.
- 코드·이름·이미지 충돌이면 기존 값을 덮어쓰지 않고 중단한다. 완료 영수증이 있는 재시도는 기존 등록을 반환하고 운영자의 후속 CMS 편집을 보존한다. 기존 카탈로그 71행은 변경 전후 동일하다.
- 신규 재료 보유 원장과 제작식 참조는 모두 0건이다. 운영 계정에 검수 아이템을 지급하지 않았다.
- 현재 승인 범위는 기존 이미지의 라이브 재료 등록이다. 10월 11일 제작·검수 기록과 에너지 원본 승인 기록은 이력으로 보존한다. 현재 색인은 `preview/arden-energy-secret-blueprints-v1/manifest.json`과 같은 폴더의 `material-registration-20261016.json`이다.

## 필요한 범위의 검수

- `node --test tests/arden-blueprint-materials-20261016.test.mjs`: **7개 통과**. 원본/런타임 8개 해시, 활성 재료 조회, 기존 카탈로그·보유·제작식 보존, 중복 실행, 코드/이름/이미지 충돌, 잘못된 연결/권한/자산 차단, 중간 저장 실패 롤백, 불완전 영수증 차단을 실제 PostgreSQL 호환 PGlite 거래로 검수했다.
- 운영 PNG/WebP 8개가 HTTP 200이며 최초 보존 해시와 일치한다.
- 운영 CMS와 동일한 활성 카탈로그 SELECT에서 4종 모두 MATERIAL로 조회된다. 실제 `/api/inventory`의 SELECT를 읽기 전용 거래로 실행해 4종의 `usable=0`과 올바른 이미지 경로를 확인했다. 인증된 브라우저 화면 검수와 혼동하지 않는다.
- 운영 증빙: `docs/qa/arden-blueprint-materials-20261016/registration-live.json`. 프리뷰는 PC 1440px·모바일 390px에서 4종 등록 완료 표시, 12개 이미지 로딩, 가로 넘침 없음, 브라우저 오류 0건을 확인하고 화면을 직접 검수했다. 결과와 두 스크린샷은 같은 폴더의 `gallery-check.json`, `1440-registered.png`, `390-registered.png`에 보존한다. 런타임·스키마·인증·공통 거래 기반 변경이 없으므로 전체 게임 검사는 실행하지 않는다.

## 정적 상태 표시 배포

기존 프리뷰의 검수 대기 문구와 색인을 등록 완료로 갱신한다. 이 정적 배포와 별개로 위 카탈로그 등록은 이미 운영 DB에 반영됐다. 일회 운영 도구와 관련 검사를 함께 기록하므로 지정된 `npm run deploy:production -- --scoped`를 사용한다. 실제 운영 배포 목록에서 직전 Pages `d032e59d-53ff-42f7-aa78-77e083fcf867`, 소스 `3d02d2b5e579e539ad50ea63e2d6e815cf9cba17`을 확인했다. scoped 검사 대상은 `tests/arden-blueprint-materials-20261016.test.mjs`이며 기존 출시·캐시·Hyperdrive 검사를 유지한다. 최종 Pages 결과는 배포 확인 후 기록한다. 운영 코드 변경이 없는 상태 기록 때문에 무관한 전체 검사를 반복하지 않는다.

### 배포 완료

- 소스 `2d8198a889c76a576f075d681e50593f7828192e`, Pages `152d2636-a0b5-4ff2-9893-804758db4580`으로 운영 반영했다. API Worker `23042207-34cf-4aae-8465-5b2bee1a89f6`, clan scheduler `56132601-c99a-4061-a97d-1fba73541d05`다.
- scoped 관련 7개 검사·출시/캐시 검사 통과, Hyperdrive query cache OFF와 양쪽 바인딩 일치를 확인했다. 기존 19,306개 정적 파일을 재사용하고 변경된 9개만 전송했다.
- **2026-10-16 09:08:23 KST** 운영 갤러리 HTML·색인·등록 메타데이터 3개 HTTP 200 및 로컬 소스 일치를 확인했다. 4종의 현재 등록 상태와 과거 DESIGN REVIEW 표시 제거를 확인했다.
- `docs/qa/arden-blueprint-materials-20261016/deployment.json`, `live-check.json`에 증빙을 보존한다. 이 완료 기록 추가는 문서 변경이므로 재배포하지 않는다.

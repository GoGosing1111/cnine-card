# 아이콘 합성과 라이브 등록 — 2026-09-30

**현재 상태: 화면·아이콘 공개, 실제 합성 OFF.** 사용자 후속 `최종 검토해야 함`, `유저들은 볼 수 있게 해놓고 합성만 잠궈` 지시가 아래 최초 운영 연결 기록보다 우선한다. 최종 검토와 별도 오픈 지시 전에는 합성을 재개하지 않는다.

사용자가 아이콘 합성 UI·연출 및 라이브 공개를 지시하고 재료·확률·선택 방식을 모두 확정했다. 과거 CMS 전용 공개 제한을 이번 7종의 합성·도감·편성·전투 연결 범위에서 대체한다.

## 확정 정책

| 항목 | 적용 |
| --- | --- |
| 카드 재료 | SUPERSTAR +13 1장 + FUR +13 1장, 총 2장 |
| 재화 | 마스터의 별 500만 개 + 코인 1천억 |
| 성공 | 10%, 선택한 아이콘 1장 지급 |
| 실패 | 두 카드와 두 재화 전체 소모, 보상·천장 없음 |
| 결과 선택 | 디임·하이희야·나무늘봉순·오조은·오리꿍·강구열·아윤 7종 중 선택 |
| 아이콘 능력치 | 기존 승인 기본 전투력 18만, 추가 강화 OFF |
| 연출 | 합성 화면 내부 수렴·성공/실패 연출, 별도 창 없음 |
| 성공 영상 | OWNER CMS에서 같은 사이트 assets/의 MP4·WebM 경로 및 최대 재생 길이 등록 |

카드 강화는 기존 DB에서 카드 종류별 보유 묶음에 저장된다. 합성은 각 재료 한 장만 차감하고 남은 중복 카드의 강화는 +0으로 초기화한다. +13 한 번을 여러 번 재사용할 수 없으며 화면에 조건을 명시했다. PVE·PVP·저장 프리셋에 사용 중인 재료는 해제해야 한다. FUR +14/+15는 +13 조건과 같게 취급하지 않는다.

미확정 고유효과 8종은 기존 `icon_cms_v1` 문서의 초안으로 보존한다. 수치를 자동 확정하거나 평타·스킬 시안만으로 새로운 전투 효과를 활성화하지 않는다. 일반 팩 확률과 리롤 대상에도 넣지 않는다.

## 구현

- 정책과 고정 ID: `shared/icon-fusion-policy-v1.mjs`, CN-1C000001~CN-1C000007. 기존 승인 사진/프레임/SD를 사용하며 원본을 변경하지 않는다.
- 서버: `functions/_icon_fusion.js`. 기존 인증·계정 잠금·공동 거래 기반을 그대로 사용한다. 준비된 결과를 저장한 뒤 재료/코인/별 차감, 성공 카드 지급, 지급 수량 검증, 완료 영수증을 원자적으로 처리한다.
- 같은 요청 번호는 원래 결과를 재사용한다. 완료 전 영수증은 성공 여부를 공개하지 않는다. 응답 유실·중복 클릭으로 재추첨하거나 추가 차감하지 않는다. 재료/편성이 바뀐 미완료 거래는 취소한다.
- UI: `js/icon-fusion-v1.mjs`, `css/icon-fusion-v1.css`. 전체 메뉴의 아이콘 합성 진입, 7종 선택, 인라인 재료 선택·위험 확인, 한글 단위 비용, 결과 복구를 제공한다. 성공 영상 오류/자동 재생 거부/종료/시간 초과/건너뛰기/화면 이탈을 정리한다.
- CMS: `admin/icon-fusion-admin-v1.mjs`. 기존 초안 입력과 분리한 운영 ON/OFF·영상 경로·길이 설정, OWNER 제한, 버전 비교와 동일 저장 요청 재시도를 적용한다.
- 공용 카드 렌더러 및 PVE/PVP에서 ICON 등급·기본 전투력·원본 사진 프레임을 처리하고 기존 V3 아트 어댑터에 별도 SD 매니페스트를 연결한다. 전투 엔진이나 공통 진형은 변경하지 않는다.
- `node scripts/build-icon-fusion.mjs --check`로 배포 번들과 SD 매니페스트 재현성 및 보존 자산 해시를 확인한다.

## 운영 등록

`scripts/operations/register-icon-cards-20260930.mjs`는 정확한 7개 멤버·카드 ID를 검증하고 한 트랜잭션으로 등록한다. 운영 `cards.rarity`의 기존 CHECK를 변경하지 않고 기존 SUPERSTAR/ZENITH와 동일하게 저장 등급 FUR + `rarity_override=ICON`을 쓴다. 실제 조회·획득·전투 등급은 `cards_effective_v1210`의 ICON이다. draw_weight·리롤 허용값은 0이다.

운영 DB의 기존 거래 기반과 멤버 7명을 확인했다. 최초 저장 형식 검수에서 CHECK 제약을 확인해 롤백한 뒤 기존 override 형식으로 수정했다. 최종 dry-run은 7종과 정책 등록·기존 초안 보존을 검증하고 전부 롤백했다. 코드 배포 후 일회 apply로 등록하며 계정 카드 지급·보유 재화 변경은 없다. `release_icon_fusion_cards_20260930_v1` 영수증으로 중복 등록을 방지한다. 등록 전에는 7종 전체 존재 조건에 의해 합성 거래가 열리지 않는다.

## 검사와 배포 범위

직전 운영 배포는 `67a7967d-a66a-424e-95e3-9ed8b4da788f`, 커밋 `b570ac5377fcc37f33452d105042f9b93d78b950`이다. 그 이후 기존 커밋은 포스터 자산과 작업 기록이며 이번 코드 변화는 ICON 합성 및 그 카드의 기존 표시/전투 연결에 한정된다. 공통 인증·트랜잭션 기반·DB 스키마·의존성은 변경하지 않아 scoped 배포를 선택한다.

선택 회귀는 다음과 같다. `npm run deploy:production -- --scoped` 안에서 실행하며 별도 전체 게이트를 중복 실행하지 않는다.

- `tests/icon-fusion-live-20260930.test.mjs`: SQLite/PostgreSQL 성공·실패 경계, 재료·재화 원자성, 0행 지급, 응답 유실, 중복·재시도, 편성/단계/잔액 제한, 실제 라우팅 잠금 연결, OWNER 설정, 사진/SD/전투력.
- `tests/icon-cms-v1.test.mjs`: 기존 효과 초안 저장·권한·버전·보존 계약.
- `tests/project-v-tier-battle-art-adapter-v1.mjs`: 기존 등급 및 신규 매니페스트 호환.
- `tests/pve-battlefield-entry-v2117.test.mjs`: 실제 배포 전장 번들·메인 로더 연결.
- Worker 컴파일, 출시 플래그·캐시·깨끗한 커밋·origin/main 일치 및 Hyperdrive 쿼리 캐시 OFF 검사.

실제 메인 UI와 공용 V3를 Chrome 1440px/390px에서 음소거 검수했다. 합성 선택·성공·실패·중복 클릭·응답 유실 복구·영상 404·화면 이탈, CMS 영상 저장/재조회, PVE/PVP 재생과 원본 사진 프레임을 확인했다. 수평 넘침이나 브라우저 예외가 없고 비용/주요 조작은 모바일에서 접근 가능하다. 픽셀 시각 검수도 별도로 수행했다. 운영 계정에 시험 합성을 실행하지 않는다.

검수 파일은 작업 트리 외부 `C:/Users/User/.codex/worktrees/qa-icon-fusion-20260930/`의 `report.json`, `display-report.json`, `battle-report.json`과 viewport/전투 스크린샷이다. 임시 운영 도구와 dry-run 결과는 `C:/Users/User/.codex/worktrees/ops-icon-live-20260930/`에 보존한다. 배포 및 실제 등록 결과는 완료 후 아래에 추가한다.

## 운영 반영 완료

- 코드 커밋 `ebe6e43d55cc1a881bbce2cc8ded04f753c98dfa`, `origin/main` 반영 후 지정 scoped 명령으로 배포했다. 선택 회귀 **34개 통과**, Worker 컴파일·출시/캐시/깨끗한 소스·Hyperdrive 검사 모두 통과했다.
- Pages 배포: https://b5e6d7d5.cnine-card.pages.dev. API Runtime 버전 `12dcfc84-4804-489a-82aa-41b75506bb8c`, Clan Draft 버전 `71339015-330c-4b09-b461-232258347fc4`.
- 2026-09-30 13:19:37 KST 운영 7종 등록을 커밋했다. 등록 영수증을 재조회해 7종 및 `icon_fusion_settings_v1` revision 1 / enabled true를 확인했다. 기존 효과 초안 보존, 계정 보유 카드·재화 변경 0건이다.
- 라이브 `/api/cards`는 7종 모두 ICON·기본 전투력 180000·지정 원본 사진으로 반환한다. 합성 overview의 미인증 접근은 401로 차단된다. 합성 번들/CSS·CMS 모듈·ICON SD 매니페스트·공용 어댑터·독립 V3 페이지의 운영 파일 해시가 소스와 일치하며 메인 캐시 버전은 `2108-shared-navigation-icon-20260930`이다.
- 성공 영상 경로는 빈 값으로 출시했다. 사용자가 영상을 제공하면 `assets/`에 배포하고 OWNER CMS의 **아이콘 카드 → 아이콘 합성 · 성공 영상**에서 경로와 최대 길이를 연결한다. 그전에는 구현된 인라인 합성 연출을 사용한다.
- 운영 확인 자료: 외부 작업 폴더의 `deploy.log`, `apply.json`, `inspect-before-registration.json`, `inspect.json`, `live-verification.json`. 로컬 QA 서버와 임시 운영 조회 세션을 종료했다. 이 완료 기록은 문서 전용 후속 커밋이며 게임 재배포를 반복하지 않는다.

## 후속 최종 검토 대기 · 합성만 잠금

2026-09-30 13:41:28 KST에 운영 합성 설정을 revision 2 / enabled false / FINAL_REVIEW_PENDING으로 전환했다. 아이콘 7종의 PUBLIC 등록과 합성 화면은 유지한다. `icon_fusion_review_hold_20260930_v1`에 변경 전후와 사용자 지시를 저장했다. 최초 도구 응답은 커밋 뒤 부가 조회에서 시간 초과가 발생했으므로 쓰기를 반복하지 않고 설정/영수증을 재조회해 OFF 커밋을 확인했다.

첫 등록 시각부터 잠금 이후까지 `joint_operations_v1`의 ICON_FUSION 시도는 0건이다. 완료된 차감/지급 거래도 없으며 복구할 계정은 발견되지 않았다. 공개 아이콘은 7종이다. 조회 결과는 `C:/Users/User/.codex/worktrees/ops-icon-review-hold-20260930/inspect.json`에 보존한다.

후속 코드에서는 설정 부재 시 OFF로 닫고, 미결제 PENDING 재시도에도 현재 ON 상태를 재확인한다. 실제 결제 트랜잭션에 설정 값 비교 조건을 포함해 결제 직전 OFF 전환도 전체 롤백한다. 기존 COMPLETED 영수증 조회는 계속 허용한다. 화면은 7종 선택·재료 미리 보기를 제공하면서 `최종 검토 중 · 합성 잠금` 안내 및 비활성 버튼으로 표시한다.

변경 범위는 ICON 설정 기본값·잠금 거래·안내 UI다. 직전 실제 배포 커밋 `ebe6e43d55cc1a881bbce2cc8ded04f753c98dfa`를 기준으로 `tests/icon-fusion-live-20260930.test.mjs`와 자동 Worker 컴파일/출시·캐시·Hyperdrive 검사만 선택해 scoped 배포한다. 기존 전장/CMS/다른 콘텐츠 검사를 반복하지 않는다. PC 1440px·모바일 390px에서 7종 공개·선택, 재료 미리 보기, 버튼/확인란 잠금, 합성 POST 0건 및 재화 불변을 확인했다. 검수 자료는 `C:/Users/User/.codex/worktrees/qa-icon-review-hold-20260930/`에 있다.

잠금 안내 및 서버 재시도 차단을 커밋 `ca4384ac`로 운영 배포했다. 관련 검사 20개와 필수 배포 검사가 모두 통과했다. Pages는 https://2099941c.cnine-card.pages.dev, API Runtime은 `a04d29dc-27c9-4331-a7c7-386f9c86e415`다. 배포 후 메인 버전 `2108-shared-navigation-icon-review-20260930`, 합성 JS/CSS·서비스워커의 소스 일치, 공개 아이콘 7종을 확인했다. 운영 설정은 계속 revision 2 / enabled false이며 합성 시도는 여전히 0건이다. 로컬 검수 서버와 임시 조회 세션을 종료했다. 이 결과 기록은 문서만 커밋하고 재배포하지 않는다.

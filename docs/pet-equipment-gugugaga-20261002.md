# 구구가가 펫 원본 복구와 장착창 — 2026-10-02

사용자 요청: `이전에 구구가가 펫 일러스트 확인되나 봐봐 그리고 펫 장착창 만들어야지`.

## 복구한 원본

Git `7096a12267c5fcb342caeb80755f0364557880ec`의 `preview/pets-gugugaga-four-v1/`을 그대로 복구했다. 최초 4종, 이름표/돼지 의상 후속 4종과 manifest·프롬프트·README 총 12개 파일을 보존한다. 최신 네 장은 1254×1254 투명 RGBA PNG이며 기록된 SHA-256과 일치한다.

| 이름 | 최신 원본 | SHA-256 |
| --- | --- | --- |
| 봉순 | `pet-bongsoon-gugugaga-nametag-v2.png` | `2ba48e1b55f6da43c2ba65d6c74b5a8802fd8aa5eebab26b527f13988e8e4b2f` |
| 조은 | `pet-joeun-gugugaga-nametag-v2.png` | `814905a3639b6e4b341d6a32ab3058e3b3fe14ad5b87f328a292dd6326fc1122` |
| 희야 | `pet-heeya-pig-nametag-v3.png` | `1c89ac01721e048ee4981717857c1fa5e9b8f80fd6e10166d0eeaa7888de5bb8` |
| 디임 | `pet-diim-gugugaga-nametag-v2.png` | `907c3a1ca2ec4f86ebad7ec31fa73981e4e106eb62ee78566a8d3bea59ecef41` |

봉순·조은·디임은 구구가가 펭귄 의상, 희야는 후속 지정된 분홍 돼지 의상이다. 최신 파일을 재압축·가공하지 않고 `assets/ui/pets/gugugaga/`에 동일 바이트로 복사했다. 참조 목록은 `shared/pet-art-catalog-v1.mjs`다. 과거 `ART_READY_USER_REVIEW_PENDING`, `runtimeConnected:false` 기록은 유지한다. 복구/장착창 검수가 최종 이미지 채택·전투 SD 승인으로 이어지지 않는다.

## 장착창

- `/pets/`: 기존 플레이어 인증을 사용하는 장착창 준비 화면. 실제 펫 획득·장착·전투는 OFF여서 비어 있는 지원 슬롯과 준비 안내를 표시한다.
- `/pets/?review=1`: 기존 OWNER 인증을 사용하는 1마리 장착 검수. 큰 원본 일러스트, 네 장 선택 목록, 현재 장착 슬롯, 선택/교체/해제, 버프 종류·%·대상·PvE/PvP를 표시한다. 복구된 펫은 **검수용 보유**로 명시한다.
- PvE/PvP 덱 옆의 `펫 장착창` 버튼에서 같은 컴포넌트를 모달로 연다. 일반 카드/용병 수와 전투력 계산은 변경하지 않는다. Escape/닫기·포커스 복귀·키보드 이동·모바일 내부 스크롤을 지원한다.
- OWNER CMS **펫·동료 준비**의 `펫 장착창 검수` 링크로 진입한다. 복구된 일러스트 선택 후 수동으로 초안에 추가할 수 있다. 자동 등록/저장/보유권 부여는 없다. `sourceArt`와 `battleSprite`를 구분하고, 버프 수치는 미정·검수 사용은 OFF로 시작한다.

## 저장/API

- `GET /api/admin/pets/equipment/state`, `POST /api/admin/pets/equipment/loadout`: BATTLE_MANAGE + OWNER 제한. OWNER별 `app_meta` 키 `pet_equipment_review_v1:<ownerId>`에 검수 선택만 저장한다.
- GET은 DDL·초기 데이터·보유 목록을 쓰지 않는다. 처음 저장은 충돌 방지 INSERT, 이후 저장은 이전 JSON 일치 조건의 CAS UPDATE다. 선택과 최근 50개 요청 영수증을 한 행에 기록한다. 같은 요청 ID는 같은 내용에만 재사용할 수 있다.
- 저장 본문은 `petCode`, `expectedRevision`, `petCmsRevision`, `requestId` 네 필드만 받는다. 서버 목록/보유 조건과 CMS 버전을 확인한다. 등록되지 않은 코드·복수 코드·클라이언트 버프/보유권·구버전 저장을 거부한다.
- 동일 출처·JSON·8 KiB 제한, `private, no-store`를 적용한다. 결과를 알 수 없는 실패는 같은 요청 ID로 재확인하고, 버전 충돌은 새로고침해야 변경할 수 있다.
- `GET /api/pets/v1/state`는 인증 후 준비 상태만 반환하고 DB에 접근하지 않는다. `POST /api/pets/v1/loadout`은 423 `PET_EQUIPMENT_CLOSED`다. 실제 계정 보유권·편성·버프에 연결하지 않는다.
- CMS의 새 `sourceArt` 필드는 선택 사항이다. 기존 8필드 문서에는 이 필드를 합성하지 않아 기존 저장 영수증 해시와 재시도가 유지된다.

## 확인 범위

`tests/pet-equipment-20261002.test.mjs`는 원본/복사본 해시, 보유/코드 계약, CMS 이전 문서 호환, OWNER 제한·읽기 전용 GET·라이브 OFF, 저장/교체/해제·OWNER 분리, 저장 경쟁·실패/재시도, CMS 버전·삭제된 펫, 요청 제한·훼손 시 차단을 확인한다.

`tests/pet-equipment-20261002.browser.mjs`는 실제 핸들러와 PostgreSQL 호환 저장소에서 PC 1440×1050 / 모바일 390×844의 4종 표시, 저장/재조회/해제, CMS 원본 초안·버프 표시, 버전 충돌, 저장 성공 후 응답 유실/동일 요청 재확인, PvE/PvP 진입, 모달 키보드/닫기와 권한 거부를 확인한다. **7%는 격리 테스트 데이터이며 운영 CMS에 등록하지 않는다.** 원본/장착창 이미지와 결과 JSON은 저장소 밖 `C:/Users/User/.codex/tmp/pet-equipment-gugugaga-20261002/qa/`에 보존한다.

공통 인증·DB 기반·기존 라이브 전투/계정 계약을 바꾸지 않는 펫 장착 준비 범위다. 관련 펫/동료 회귀와 Worker 컴파일을 선택한 scoped 배포로 마무리한다. 새 의존성·마이그레이션은 없다. 공개/획득/실전 플래그와 실제 운영 CMS 목록은 그대로다.

## 배포 완료

- 직전 운영 커밋은 Cloudflare에서 확인한 `4f7a6397f1e8a770aa03bb855c2d5e3ef013fd97`이다. 최신 main의 이네스 SS 정정과 문서 기록을 유지한 뒤 범위 커밋 `b297a2a066fcc05f966dbc2cf280e5af7b1a8361`을 반영했다.
- `npm run deploy:production -- --scoped`가 펫 장착 8개 + 기존 동료 준비 11개, 총 **19개 검사**와 `check:worker`, 출시 잠금/캐시/Hyperdrive 검사를 통과했다. 장착창과 변경한 CMS의 PC·모바일 브라우저 검수도 통과했고 이미지·여백·가로 넘침·모바일 닫기 버튼을 직접 확인했다.
- Pages 배포 `90cc74dd-4cb3-4af5-97ce-1bdb37415de3`, API runtime `343a004b-6e4a-4651-b425-4e3e4991f391`, clan-draft `90279e40-c697-4456-b863-5561103241bc`.
- 2026-10-02 16:45 KST 운영 확인: 페이지/모듈/CSS 200, 네 PNG의 운영 SHA-256 일치, OWNER API 제한과 실전 장착 차단 코드, 기존 세 플래그 OFF를 확인했다. 비인증 장착 API는 모두 401이었다.
- 운영 확인 기록은 `C:/Users/User/.codex/tmp/pet-equipment-gugugaga-20261002/release-after.json`, 배포 로그는 같은 폴더의 `deploy.log`다. 이 완료 기록만 추가하는 커밋에는 게임 재검사·운영 재배포를 하지 않는다.

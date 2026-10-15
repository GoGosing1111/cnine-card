# 신규 ICON 기술 8종 준비 — 2026-10-15

사용자 승인: “그래 확정하고 기술만 작업하고 라이브 준비해놔 아이콘 8개 카드 추가할거임”. 확정 범위는 아래 기술 8종이다. 실제 신규 카드의 이름·ID·원화·획득·배정은 추후 작업이다. 기존 ICON 9종과 보유분은 유지한다.

## 승인한 기술

| 코드 | 기술 | 고유 작동 | 제한 |
| --- | --- | --- | --- |
| CROWN_USURP | 왕관 찬탈 | 적의 제거 가능한 능력치 강화 1개를 자신에게 이전 | 남은 기간 보존, 복제·고유 패시브·보스 변신 제외 |
| FORMATION_EDIT | 전열 편집 | 적 전열과 후열의 실제 자리를 교환 | 이미 시작한 공격 대상 유지, 고정 보스 제외 |
| WOUND_DEFER | 상처 유예 | 직접 체력 피해 일부를 다음 정규 행동 종료까지 부채로 미룸 | 피해 삭제 아님, 보호막·정화로 상환 취소 불가 |
| SKILL_ADVANCE | 선불 출격 | 아군의 대기 중 기술을 다음 정규 행동으로 당김 | 당긴 대기를 다음 재사용 대기에 가산, 추가 행동 없음 |
| PURSUIT_BAN | 추적 금지 | 같은 적의 단일 공격이 보호 대상을 연속 선정하지 못하게 함 | 다른 아군 공격으로 해제, 광역·최후 생존자 예외 |
| SKILL_CENSOR | 기술 검열 | 적 다음 공격 기술의 본 피해를 유지하고 부가 효과를 억제 | 일반 패시브·보스 단계 변환 제외 |
| AUTONOMOUS_WEAPON | 자율 병기 | 별도 슬롯의 체력·행동·피격 가능한 독립 병기 소환 | 주인당 1개, 주인 사망 시 소멸, 추가 보상 없음 |
| RETURN_OATH | 귀환 서약 | 제한 행동 내 구출 목표 처치로 사망 아군 부활 | 단일 보스는 실제 피해 목표, 같은 아군 반복 부활 금지 |

## 준비와 운영 경계

- 실제 카드 매핑은 미배정, 신규 기술 운영 활성화는 OFF다. CMS는 별도 초안만 저장한다.
- 수치가 지정되지 않았으므로 운영 수치는 null로 시작한다. 격리 전투 검수에 사용하는 수치는 운영 설정으로 저장하거나 자동 채택하지 않는다.
- 준비 전투는 서버 코드에서 전달하는 Symbol 계약으로만 실행한다. 카드 JSON이나 공개 요청의 문자열 필드는 신규 기술 활성화 권한이 아니다.
- 신규 카드 등록·지급·합성 풀·획득·기존 카드 교체와 운영 DB 변경은 이 작업에 포함하지 않는다.
- 새 연출 프리뷰는 기술 검수용이다. 실제 새 카드의 외형이나 최종 시각 승인으로 기록하지 않는다.

## 구현·검수 기록

운영 배포는 수행하지 않는다. 준비 파일을 기존 운영 설정이나 신규 카드 출시로 취급하지 않는다.

### 구현 위치

- 단일 기술 목록·초안 검증: `shared/icon-techniques-v1.mjs`.
- 실제 전투 상태: `functions/_icon_technique_combat.js`. 기존 서버 전투기와 ICON/용병 대상 선택에 선택적 연결을 추가한다.
- OWNER 초안 API: `functions/_icon_techniques.js`, `/api/admin/icon-techniques`. 기존 9종의 `icon_role_settings_v1`과 별도 `icon_technique_preparation_v1` 키를 사용하며 조회는 기록을 만들지 않는다.
- CMS: `admin/icon-technique-editor-v1.mjs`, 기존 아이콘 관리 안의 ‘신규 기술 8종 준비실’. 미입력·부분 입력 초안, 재시도, 충돌 안내, 편집본 내려받기를 지원한다.
- V3 재생: `preview/project-v-v3/source/battle/IconTechniquePlayback.js`. 서버 이벤트를 소비해 진형 좌표·피해 부채·쿨다운 상환·추적 제한·검열·병기·귀환 상태를 표시한다.
- 격리 시연: `preview/icon-techniques-20261015/`, 생성기 `scripts/build-icon-technique-preview-20261015.mjs`. 실제 서버 시뮬레이션에서 나온 타임라인만 재생한다. 기존 승인 이미지의 대역과 검수 전용 수치를 명시한다.

### 현재 호환 범위

- 왕관 찬탈의 탈취 대상은 현재 서버에 존재하는 제거 가능·행동 기한이 있는 다음 공격 강화 `iconEmpower`다. 영구 능력치·장비·펫·고유 패시브·보스 변신·보호막은 대상이 아니다. 종류를 늘릴 때는 제거·이전·만료 어댑터가 함께 필요하다.
- 선불 출격은 기존 ICON의 명시적 스킬과 신규 준비 기술의 재사용 대기를 당긴다. 충전형은 선불 적용 시 피해·추가 행동 없이 즉시 충전 준비를 시작하고 다음 정규 행동에 방출한다. 이미 충전 중인 대상은 제외하며, 실제 시전 시 당긴 재사용 대기를 다음 대기에 가산한다. 용병의 에너지/연속기, 장착 마법, 일반 카드 타입 패시브, 보스 고유기는 대상이 아니다.
- 기술 검열은 기존 ICON 공격 스킬의 새 부가 효과를 억제한다. 본 피해·시전 비용·쿨다운과 별개 패시브는 유지한다. 용병 기술·장착 마법·보스 고유기 억제는 포함하지 않는다.
- 추적 금지는 일반 단일 공격·ICON 단일기·새로 시작하는 용병 단일기에 연결한다. 진행 중인 다중 타격 대상을 바꾸지 않으며 광역기에는 적용하지 않는다.
- 자율 병기는 별도 전투 배우로 존재하지만 카드 보유·획득·보상 대상이 아니며 승패 HP 비율 분모에 추가하지 않는다. 귀환 대상·다시 소환하는 주체로 사용하지 않는다.

### 출시 시 남는 입력

새 카드 8종의 실제 이름·ID·이미지와 기술별 매핑, 승인한 운영 수치, 신규 전투 외형의 최종 검수, 획득 정책과 개방 지시가 필요하다. 후속 사용자 지시로 신규 ICON 남수댕의 기술은 왕관 찬탈(CROWN_USURP)로 확정됐다. 남수댕은 첨부 사진을 보존하고 정지 SD·FX만 별도로 제작하며, 이 기술 선택은 cardId 등록·운영 기술 배정·활성화 승인이 아니다. 실제 shared 초안의 cardId와 매핑은 계속 null이다. 현재 초안 저장 API는 이 조건을 우회해서 ON으로 저장할 수 없다. 준비용 Symbol을 공개 요청 필드나 운영 개방 스위치로 바꾸지 않는다.

### 검증 결과

- 준비 설정/API 7개 검사 통과: null 기본값, 카드 미배정·OFF 강제, OWNER 외 무조회 차단, 읽기 전용 GET, actor와 payload를 묶은 동일 요청 재시도, revision CAS, 저장 실패 원자성, 기존 ICON 9종 설정 키 보존을 확인했다.
- CMS 격리 브라우저 PC 1440px·모바일 390px 검수 통과. 8종 전환·빈 수치 표시·기존 카드와 편집 이벤트 분리·응답 유실 후 같은 영수증 재확인을 확인했다. 기록은 `preview/icon-techniques-cms-20261015/report.json`, 같은 폴더의 `1440/390-crown.png`와 `1440/390-return.png`다.
- 기존 전투 비교는 기준 `0fb6b15cf1c71bcfce7c3500a5beb1378d5292fc`와 125쌍(250회)을 대조했고, 준비 Symbol이 없는 전체 전투 영수증 차이는 0건이다. 근거는 `docs/qa/icon-techniques-20261015/unchanged-controls.json`이다.
- 연출 담당은 실제 서버 타임라인 8종 × PC·모바일 16개를 검수했다. 헤더·효과·병기 보정 후 주요 3종 × 2폭 6개, 마지막 병기 간격 조정 후 병기 × 2폭 2개를 재검수했다. 상태/reset/재소환/병기 구분·경로 보안 회귀 6개도 통과했다. 캡처 원본은 로컬 임시 폴더 `C:\Users\User\AppData\Local\Temp\cnine-icon-techniques-20261015\`에 있으며, 그곳의 `report.json`은 마지막 병기 2개 검수 결과만 담는다.
- 전체 검사의 앞 구간은 `docs/qa/icon-techniques-20261015/release-gate-prefix.log`에 보존했다. 새 ICON 연출 소스 동결 뒤 freshness 목록에 `IconTechniquePlayback.js`를 추가하고 V3 consumer 10종을 다시 빌드했다. `build:v3-grid`, `test:v3-grid`, `test:v3-joint`가 통과했다.
- 첫 이어 실행의 `test:live-connections`는 141개 중 140개 통과, 배너 소스 합계에 신규 `IconTechniquePlayback.js`가 빠진 계약 검사 1개가 실패했다. 실제 번들 52개와 소스 목록 51개의 차이는 새 파일의 `queueBanner` 1개였다. 숫자를 고정하지 않고 누락된 source만 비교 목록에 추가했고 해당 파일 단독 재검수가 통과했다.
- 누락 소스 수정 파일의 단독 재검수와 `test:wish-lamp`부터 `test:legion-hunt`까지 남은 구간을 순서대로 이어 실행했으며 총 55단계가 모두 통과했다(종료 `2026-10-15T10:38:29.986Z`). 실행기 `continue-release.mjs`, `continue-release-after-banner.mjs`와 `release-continuation*.log/json`은 `docs/qa/icon-techniques-20261015/`에 보존했다. 앞서 통과한 구간은 반복하지 않았다.
- 로컬 Wrangler 4.125.0으로 `workers/api-runtime/wrangler.jsonc`의 실제 Worker `deploy --dry-run` 컴파일이 종료 코드 0으로 통과했다. 결과 `worker-dry-run.json`에 실제 번들 7,531,580바이트와 소스맵 11,466,140바이트의 SHA-256을 기록했다. 두 산출물은 경로를 확인한 뒤 ignored `tmp/icon-techniques-api-worker-compiled/`로 이동했으며, 검수 실행기 `compile-worker-dry-run.mjs`와 요약 JSON만 위 QA 폴더에 보존했다. 운영 배포나 비밀값 출력은 없었다.
- 미래 `test:icon-cms`에는 `tests/icon-techniques-preparation-v1.test.mjs`와 `tests/icon-techniques-combat-20261015.test.mjs`를 연결했다. 이미 통과한 무관한 검사 구간은 다시 실행하지 않는다.
- 운영 배포·운영 DB 쓰기·카드 등록·수치 승인·개방은 수행하지 않았다. 준비 브랜치이므로 마지막 `verify-production-release`는 실행하지 않는다.


### 연출 검수 자료 보존

검수 자료는 `docs/qa/icon-techniques-20261015/visual/`에 보존한다. `manifest.json`에 PC 1440·모바일 390의 8종 효과 화면, 선택 화면, 최종 병기 결과 화면의 원본 SHA-256을 기록했다. 화면은 최신 해당 기술 검수본이며 사용자 최종 승인을 뜻하지 않는다.

- 전체 8종 × 2폭 16개 통과: `browser-full-16.summary.json`.
- 헤더·효과 크기·병기 배치 조정 뒤 핵심 3종 × 2폭 6개 통과: `browser-targeted-6.summary.json`.
- 병기 크기·간격 최종 조정 뒤 2폭 통과: `browser-weapon-2.raw.json`, `browser-weapon-2.summary.json`.
- 상태 복원·재소환·병기 분리·경로 보안 6개 통과: `state-and-server-6.summary.json`.

테스트가 동일한 임시 `report.json`을 재사용해 전체 16개와 후속 6개의 원시 JSON은 마지막 실행으로 덮어써졌다. 두 파일은 당시 완료 출력에 근거한 결과 요약이며 원시 텔레메트리로 표시하지 않는다. 최종 병기 2개의 원시 JSON과 보존 화면은 바이트 그대로 복사했다. 자료 보존을 위한 추가 재검사는 수행하지 않았다.

# 8방향 유도탄 승인·운영 연결 — 2026-09-24

사용자: `승인 헬기폭격보다 2배 쌔개 만들어라`, 발동 주기 후속 지정 `17초`.

## 확정 범위

- `SKILL_CHIP_OCTA_SEEKER` / 8방향 유도탄. 17초마다 8발을 8방향으로 발사해 **한 대상**에 집중한다.
- 헬기폭격은 기존 스킬 기준 피해 ×5 / 4타 / 15초 유지. 신규는 **총 ×10 / 8타 / 17초**. 1회 총 피해가 헬기의 2배이며, 주기가 다르므로 지속 DPS 2배라는 뜻은 아니다.
- 일반 사격 배율 4, 기존 스킬 기준 배율 12, 기존 스킬/장비 전투력·PVP·일반 5장 편성은 유지한다. 8타에 정수 잔여를 나눠 합계가 한 번 계산한 총 피해와 정확히 일치한다. 과잉 피해는 기존 잔여 HP/방벽 한도 적용.
- 기존 비소모 장착·3슬롯·중복 금지·보유/활성 검증 그대로 사용. 카탈로그 등록만 추가하며 자동 지급·상점·드롭·보상 풀은 추가하지 않는다. CMS 후보 표시는 미편입 상태다.
- 기존 카탈로그가 이미 설치된 DB도 새 코드가 등록되도록 **카탈로그 시드 마커만 갱신**한다. DB 스키마/DDL/권한/트랜잭션 기반은 변경하지 않는다. `ON CONFLICT DO NOTHING`으로 CMS 편집·보유·기존 장착을 보존한다.

## 렌더링·사운드

- 승인된 24프레임 추진 / 24프레임 폭발 / 아이콘 / CC0 녹음 바이트를 유지한다. 아이콘만 운영 아이템 경로에 바이트 복사한다.
- 실제 파일: `preview/battle-suit-octaseeker-v1/source/OctaSeekerFX.js`, `OctaSeekerAudio.js`; 공용 연결은 `preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js`.
- PixiJS 8.20.0 / GSAP 3.13.0. 기존 단일 V3 전투 시계로 FX·서버 확정 충돌·녹음 피크를 구동하고 개별 FX 자율 시계는 정지한다.
- 명중 순서와 8방향 인덱스를 분리 매핑한다. 확정 전 폭발 없음. 치명 타격은 원래 좌표에 남고, 사망·재바인딩 후 미명중 탄은 다른 적으로 이동하지 않는다. 지연 충돌/취소/늦은 텍스처 로드/공유 텍스처 보존 회귀를 포함한다.
- 신·구 칩은 같은 오디오 스케줄러를 사용한다. 발사/타격 구분과 append, 확정 시각 이동, 배속·QTE 정지·취소를 보존한다. 실장치 루프백 동기화 측정은 하지 않았다.
- 메인 로더·런타임 식별자는 `20260924-octaseeker-v1`. 9개 기존 V3 소비자를 동일 원본에서 빌드한다. 승인 원화·SD·총기·프레임·진형은 변경하지 않는다.

## 검수·배포 범위

직전 운영 배포 기준: `defbc26e136401b9be78b38f225cb39650f86ce8` (Pages `b699d86a`). 이후 원격의 문서/운영 스크립트 커밋은 보존한다.

이번은 기존 스킬칩 계약에 한 종류를 연결한 한정 변경이다. 공통 DB/DDL/의존성·인증·재화 정책 변경은 없고, 생성 소비자 번들의 동일 공용 전투 연결만 달라진다. `deploy:production -- --scoped`로 해당 전투·카탈로그·장착·CMS 미편입·메인 로더 검사와 Worker 컴파일만 수행한다. 무관한 콘텐츠 전수 검수는 하지 않는다.

선택 검사:

- `tests/battle-suit-octaseeker-live-20260924.test.mjs`
- `tests/battle-suit-octaseeker-preview-v1.test.mjs`
- `tests/battle-suit-skill-chip-v2046.test.mjs`
- `tests/battle-suit-skill-chip-runtime-v2046.test.mjs`
- `tests/battle-suit-skill-chip-preview-v1.test.mjs`
- `tests/battle-suit-damage-v2063.test.mjs`
- `tests/prime-draw-skill-chips.test.mjs`
- `tests/prime-draw-live-v1985.test.mjs`
- 자동 추가 `tests/pve-battlefield-entry-v2117.test.mjs`, `check:worker` 및 운영 플래그·캐시·Hyperdrive 확인.

PC 1440×1000 / 모바일 390×844의 실제 장비 탭 프리뷰에서 세 번째 칩 아이콘·×10·17초·설명·장착/해제를 확인했다. 프리뷰 장착은 로컬 메모리만 변경하며 실제 계정 지급/저장/재화 소모는 없다. 모바일 가로 넘침 없음.

동일 뷰포트에서 원본 V3 전장의 유도 선회·8발 집중 명중·재생을 확인했다. 기존 카드 원화 도크·적 발바닥 충돌·소멸을 유지한다. 연출 스냅샷은 독립 프리뷰이고, 서버 확정 재생·처치 중단·PVE/PVP 범위는 실제 공용 컨트롤러 회귀로 별도 확인한다.

최종 테스트·배포 결과는 완료 후 덧붙인다.

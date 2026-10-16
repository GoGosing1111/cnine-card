# 배찌 나무늘봉순 별도 펫 — 2026-10-16

사용자 `나무늘봉순 배찌 캐릭터로 펫 리소스 준비한거 찾아보고 라이브 반영해` 및 `‘배찌 나무늘봉순’ 별도 펫으로 추가`에 따라 준비된 V3를 별도 펫 `PET-BAZZI-BONGSOON`으로 연결한다. 기존 `PET-NAMUNEUL-BONGSOON`(나무늘보)과 `PET-BONGSOON`(펭귄)은 그대로 보존한다.

## 원본과 연결

- 원본: `preview/pet-bazzi-pucca-20261014-v1/assets/pet-bazzi-pucca-v3.png`
- 운영 파일: `assets/ui/pets/bazzi-bongsoon-20261016/pet-bazzi-bongsoon-v3.png`
- 승인 색인: 같은 폴더의 `approval-20261016.json`
- SHA-256: `39c5e3451d9b6bac5fe5bb30419fb11856e6eef187c84405dfdb51bef9e47702`
- 1152×1366 RGBA PNG, alpha 0~255. 재생성·재압축·얼굴/알파 수정 없이 바이트 그대로 복사했다. 과거 프리뷰와 피드백은 보존한다.
- `shared/pet-art-catalog-v1.mjs`에 추가하고 도감·장착창·CMS·PVE/PVP 지원 슬롯에서 같은 PNG를 사용한다. 기존 신규 펫 기본값인 카드+용병 공격력 10% 하나이며 운영자가 CMS에서 변경할 수 있다.
- 계정 지급·개봉 풀/가중치·잠재력·기존 펫 효과는 변경하지 않는다. 장착 보너스는 기존의 미설정 0%를 따른다.

## 운영 등록 방식

`scripts/ops/pet-bazzi-bongsoon-live-20261016.mjs`는 현재 CMS 문서에 한 행만 추가한다. 읽은 revision과 행 잠금/CAS를 확인하고 CMS·감사 로그·일회 영수증을 같은 거래로 저장한다. 기본 실행은 롤백 검수이며 명시적인 commit만 저장한다. 재실행은 기존 영수증을 반환한다.

일회 키: `ops:pet-bazzi-bongsoon-live:20261016:v1`. 최초 조회는 CMS revision 28, 기존 펫 19종이며 최종 저장 시 다시 조회해 운영자의 후속 편집을 보존한다. 자산 배포 확인 후 등록한다.

## 검수·배포

범위는 기존 펫 경로의 원화 카탈로그 한 행과 신규 운영 등록이다. 공통 전투·인증·거래 기반·경제를 바꾸지 않으므로 scoped 배포를 사용한다.

- 관련 회귀: `tests/pet-bazzi-bongsoon-live-20261016.test.mjs` — 원본 해시, 미보유 장착 차단, 보유 장착, PVE/PVP 지원 이벤트, 기존 정의/설정 보존, revision 충돌, 롤백, 감사 실패와 중복 재시도.
- 화면: 실제 도감 PC/모바일 및 메인 V3 PVE/PVP에서 원본 표시를 확인한다. 검수 계정/보유권은 로컬 fixture만 사용하고 음소거한다.
- 배포 게이트: `tests/pet-equipment-20261002.test.mjs`, `tests/pet-live-magnet-20261006.test.mjs`, `check:worker`. 이미 통과한 신규 회귀는 중복 실행하지 않는다.
- 배포·운영 완료 결과는 아래에 추가한다.

사전 검수 결과: 신규 회귀 2개 통과. 도감 1440×1050/390×844와 OWNER CMS에서 기존 나무늘보·펭귄이 유지되고 새 원본이 정상 표시됐다. 메인 V3의 PC PVE는 슈트 왼쪽, 모바일 PVP는 양 진영 중앙 아래에 표시되며 시작 버프 1회, 원본 텍스처 폭 1152, fallback 0, 페이지 오류 0을 확인했다. 자료는 작업 폴더 외부 `C:/Users/User/.codex/worktrees/cooperative-reward-reveal/pet-bazzi-qa/`의 `browser-report.json`과 `desktop-codex.png`, `mobile-codex.png`, `desktop-cms.png`, `desktop-pve.png`, `mobile-pvp.png`에 보존한다. 시즌패스·잠재력 설정 API는 이번 화면 fixture의 검수 범위 밖이며 운영 설정을 수정하지 않았다.

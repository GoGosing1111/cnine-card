# 전투 데미지 Russo One 적용 — 2026-10-07

사용자 `Russo One 이게 괜찮은듯` → `적용해` 지시에 따라 공통 V3 전투와 기존 V2 전투의 피해·연타·회복 숫자에 적용한다. 서버의 피해 수치, 보상, 승패, 행동 속도는 변경하지 않는다.

- 일반 피해: `#f4f8ff`, 치명타: 화이트 → `#ffadbb` → `#ff3864`, 회복: `#70f5cd`, 외곽선: `#07101e`.
- 폰트 파일을 자체 호스팅하고 최초 전투의 글꼴 준비를 최대 1.5초까지 기다린다. 실패 시 전투를 진행하며 다음 입장에서 다시 시도한다. 늦게 준비되면 이후 타격부터 적용하고, 대체 글꼴 아틀라스를 Russo One 이름으로 캐시하지 않는다.
- Pixi 동적 비트맵의 로컬 그라데이션이 단색으로 나오는 문제를 실제 화면에서 확인했다. 치명타 숫자 12글자(`0123456789,.`)의 작은 공용 비트맵 아틀라스를 한 번 생성해 글리프별 그라데이션을 보존한다. 타격마다 캔버스 텍스트나 새로운 스타일을 생성하지 않는다.
- 모바일 기본 공격 숫자는 글자 폭을 포함한 여백으로 화면 안에 배치한다. V2의 CRITICAL 문구는 숫자 위에 작게 분리한다.
- 공통 엔진을 쓰는 10개 번들 재빌드, 메인 로더·엔진 버전 일치, V2 CSS/JS와 앱·서비스워커 캐시 갱신.

## 폰트 출처

- 원본: [Google Fonts Russo One](https://github.com/google/fonts/tree/main/ofl/russoone), `RussoOne-Regular.ttf`, 39,124 bytes.
- SHA-256: `BC0ABCC660BD8B7AD3000ECB2898A27C58A29A50F7EC81652FA12E75148D09DF`.
- SIL Open Font License 1.1 원문 및 저작권을 `assets/fonts/battle/RussoOne-OFL.txt`에 포함. 원본 TTF 변경 없음.

## 관련 검수 및 배포 범위

직전 운영 Pages: `16e7219f-a56c-4b9e-b7d4-fc66746414ca`, 배포 커밋 `8230061c390f40d9b04a9cbdfeb343d4da328925` (Wrangler production 목록 확인).

글꼴·표시 및 최초 로딩 범위의 수정으로 scoped 배포를 사용한다. 서버/DB/거래/확률 변경이 없어 전체 게이트를 반복하지 않는다.

배포 게이트 선정:

1. `tests/battle-damage-font-20261007.test.mjs`: 동시 진입 로딩 공유, 시간 제한·지연 완료, 실패 후 재시도, 실제 피해/회복/연타 숫자 보존.
2. `tests/v3-damage-style-cache.test.mjs`: 8,000회 풀 재사용 시 스타일 수 제한과 활성 라벨 불변성.
3. `tests/v3-common-grid-v1.test.mjs`: 공통 소스와 10개 제공 번들의 일치.
4. `tests/pve-battlefield-entry-v2117.test.mjs`: 실제 PVE/PVP 메인 로더와 배포 번들 연결.

UI 확인: 로컬에서 실제 제공 V3 번들을 로드해 PC 1280px 및 모바일 390px에서 PVE 일반/회복, PVP 치명타, 실제 타격 재생 완료를 확인했다. 모바일 끝자리 잘림을 발견해 보정 후 재확인했다. V2 실제 `playPvpBattleV2Live`에서도 일반 피해 `-128,440`, 치명타 `-256,880`, 회복 `+64,220` 모두 Russo One으로 표시되고 재생 완료됐다. 검수용 데이터만 사용하며 운영 계정의 전투·재화 API를 호출하지 않았다.

검수 화면과 실행용 임시 페이지: `C:/Users/User/.codex/tmp/damage-font-20261007/`. 이 임시 페이지는 배포하지 않는다.

운영 배포 결과는 아래에 후속 기록한다.

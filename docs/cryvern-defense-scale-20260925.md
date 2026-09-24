# 크라이베른 방어 후 본체 확대 수정 · 2026-09-25

사용자 요청: 방어 동작 중 캐릭터만 갑자기 커지는 현상을 원래 크기로 수정한다. 방어막·오오라·스킬 위력은 변경하지 않는다.

## 원인과 수정

- 768px 연속 모션 아틀라스가 표시되는 동안 다른 공격의 피격/대기 GSAP 애니메이션이 시작되면, 해당 프레임의 배율을 고정 숫자로 저장했다.
- 방어 종료 후 1254px 기본 SD로 돌아와도 그 애니메이션이 모션용 배율을 다시 적용했다. 실제 Pixi Sprite와 공용 BattleAnimation 재현에서 380px 본체가 IDLE 863.779px, HIT 899.770px로 커졌다.
- `IceDualSwordFX.applyPose()`에서 개별 모션 재생 중 또는 기본 SD 복귀 시 충돌하는 공용 애니메이션만 정리한다. 올바른 텍스처·원래 크기를 적용한 뒤 neutral pose를 갱신한다. 개별 모션 밖의 정상 대기 애니메이션은 유지한다.
- 타임라인이 실제로 존재할 때만 정리한다. 매 프레임 새 타임라인·텍스처를 생성하지 않는다. 승인 원화/SD/134프레임/방어막/실루엣 광원과 서버 판정·DB·획득 확률은 그대로다.
- 공용 런타임과 래퍼 버전: `20260925-cryvern-pose-scale-v1`. 메인 로더·앱 URL도 `cryvern=20260925-pose-scale`로 갱신한다. 기존 네트워크 우선 전투 캐시 정책은 유지한다.

## 관련 검수

- 신규 회귀: 실제 Pixi/GSAP에서 방어→IDLE, 방어→HIT 배율 충돌을 먼저 재현했다. 수정 후 원래 380×380 복귀, 광원 추종, 공격/교차/회전/궁극기 모션 소유권, 취소 복구, 정상 idle 유지의 3개 검사를 통과했다.
- 최종 검사는 아래 선택 파일을 scoped 배포 과정에서 실행한다. 전체 게임 검사를 추가하거나 동일 최종 빌드 검사를 사전/배포로 중복 실행하지 않는다.
- UI 검수는 계정 재화를 쓰지 않는 `combat.html`의 실제 V3 엔진·공용 래퍼·서버 생성 전투 결과로 완료했다. PC PVP(1280×900) 결과 A·생존 3:0, 모바일 PVE(390×844) 결과 A·생존 5:0에서 초기/종료 본체 크기와 광원·카드 도크를 확인했다. 최종 재빌드 후 두 흐름에서 신규 콘솔 오류는 없었다. 메인 앱 입장 연결은 실제 번들을 로딩하는 `pve-battlefield-entry` 회귀에 포함한다.

```json
[
  "tests/mercenary-cryvern-pose-scale-20260925.test.mjs",
  "preview/mercenary-ice-crystal-dual-sword-v1/qa.test.mjs",
  "tests/mercenary-cryvern-preparation.test.mjs",
  "tests/v3-common-grid-v1.test.mjs",
  "tests/pve-battlefield-entry-v2117.test.mjs"
]
```

## 배포 범위

- 분류: 한 용병의 시각 배율 충돌에 한정된 작은 버그. 생성된 공용 번들 변경만으로 대규모 변경으로 분류하지 않는다.
- 실제 직전 운영 배포: Pages `2675adba-3735-414b-9800-db26a3baba16`, 소스 `323ad4e942fe06021ed49643b130ce8cb3347ff5`(Wrangler 운영 배포 목록으로 확인).
- 직전 배포 이후 main에 있는 별도 작업은 운영 기록·일회성 지급 스크립트/검사·독립 한복 아바타 시안이다. 실행·획득 연결 또는 지급 스크립트 재실행 없이 보존한다.
- 명령: `npm run deploy:production -- --scoped`, 위 기준 SHA와 선택 검사, `SCOPED_DEPLOY_CHECKS=[]`. 깨끗한 범위 커밋·origin/main 일치·출시 플래그·캐시 호환·Hyperdrive query cache OFF 검사는 유지한다.

# PROJECT V 계정 배틀슈트 기준

## 적용 범위

- 배틀슈트는 기존 장비 5부위와 분리된 `BATTLE_SUIT` 전용 슬롯이다.
- 초기 적용 범위는 PVE 전투다. PVP, 랭크전, 영토전, 대장전, 클랜전과 공성 전장에서는 수치와 V3 외형을 모두 사용하지 않는다.
- 운영 전투력은 1번 100,000, 2번 200,000, 3번 300,000이며 CMS에서도 PVE 전용 수치로 관리한다.
- 기본 시드 배틀슈트는 장비 보급상자 풀에 자동 편입하지 않는다.

## 전투력 계약

```text
equipmentPve = BATTLE_SUIT를 제외한 장착 장비 PVE 합계
battleSuitPve = 장착 BATTLE_SUIT의 PVE 전투력
pve = equipmentPve + battleSuitPve + garagePve + titlePve

equipmentPvp = BATTLE_SUIT를 제외한 장착 장비 PVP 합계
pvp = equipmentPvp + garagePvp + titlePvp
```

- 배틀슈트는 `total_power = pve_power`, `pvp_power = 0`으로 저장·공개한다.
- CMS 입력과 DB의 과거 값에 관계없이 배틀슈트의 공개 PVP 전투력과 PVP 합산값은 항상 0이다.
- 서버는 `battleSuitPve`를 기존 카드 5장에 분배하지 않는다. 배틀슈트는 별도 지원 액터로 몬스터 HP·방벽에 독립 피해를 적용하고 `damageBreakdown.battleSuit`에 실제 적용량을 기록한다.

## V3 렌더링 계약

- 계정 캐릭터는 기존 아군 카드 5명의 `allies`, `characters`, 카드 도크와 진형 배열에 넣지 않는 보조 유닛이다.
- 위치는 전열 왼쪽 고정이며 이동하지 않는다. 대기 모션과 총기 반동·총구 섬광·탄도 연출만 사용한다.
- 승인된 배틀슈트 3종 × 총기 6종은 정확한 DB 무기 래스터를 손·팔 가림과 함께 합성한 4프레임 authored atlas를 사용한다. 배틀슈트 교체는 전신 외형을, 기존 `WEAPON` 장착 교체는 atlas의 총기 외형과 자세를 함께 바꾼다. 2026-09-04 추가된 동방무기상 금룡 돌격소총·금룡 대물저격총도 세 외형 모두 전용 atlas를 사용한다.
- 승인 조합 atlas가 로드되지 않거나 아직 등록되지 않은 외형은 정지 배틀슈트 본체와 명시적인 투명 무기 컷아웃의 별도 스프라이트 계층으로 복구한다. 사각형 장비 카드 이미지는 이 복구 경로에서도 사용하지 않는다.
- 배틀슈트 사격 루프는 배치 완료 직후 시작해 전투 종료까지 계속되며 카드 공격 턴·스킬·행동력 게이지와 무관하다. 서버의 배틀슈트 독립 피해 이벤트는 다음 연속 사격의 탄착에 결합하되 발사 주기를 시작하거나 멈추지 않는다.
- 배틀슈트는 HP와 피격 대상이 없는 타깃 불가 지원 액터다. 서버 판정은 총기별 독립 시간 주기(`INDEPENDENT_TIME_CADENCE`)를 사용하고 카드/몬스터 속도 게이지와 전투 행동 횟수를 소비하지 않는다.
- 승인된 총기 코드 6종은 투명 전투 컷아웃에 매핑한다. 그 외 무기는 명시적인 `battleSprite` 또는 `appearanceUrl`이 있을 때만 표시하며, 사각형 DB 카드 이미지는 전투 스프라이트로 사용하지 않는다.
- animated 자산의 단일 기준은 `assets/ui/project-v/account-battle-suits/manifest-v2.json`이다. `manifest-v1.json`은 정지 컷아웃 호환 기준으로만 유지한다.

## 사격음 검수 계약

- 신규 총기 사운드는 실제 녹음·폴리 기반 원음만 사용하고, action/notice·ballistic impact·acoustic tail의 3계층으로 분리한다.
- strongest impact는 authored `fire` 프레임 콜백의 ±20ms 이내에 맞춘다. 원음 URL, 라이선스, 자산 ID, 해시, 파형 측정값과 런타임 가공 방식을 프리뷰 매니페스트에 남긴다.
- 2026-09-02 사용자 연결 승인 이후 동일한 녹음·믹스 매니페스트를 라이브 PVE와 독립 QC 화면이 함께 사용한다. PVP·영토전 등 경쟁 모드에는 배틀슈트와 사격음을 연결하지 않는다.
- 동방무기상 2종은 새 합성음을 만들지 않고 승인된 실총 녹음을 물리 등급별로 재사용한다. 금룡 돌격소총은 M4A1 AR 대역, 금룡 대물저격총은 Tac-50 고구경 대역이며 프록시 사실을 오디오 매니페스트에 표시한다.
- 라이브 전투음 설정이 OFF이면 신규 사격 예약을 음소거하고 진행 중인 배틀슈트 사운드 계층도 즉시 중지한다. 모바일은 실제 전투 시작/전투음 클릭의 trusted gesture 또는 공용 전투 AudioContext를 사용한다.

## API 계약

- `character/loadout`과 `userEquipmentBonuses()`는 `equippedBattleSuit`, `equippedWeapon`, `battleSuitPve`를 제공한다.
- `equippedBattleSuit`에는 인스턴스 ID, 장비 코드, 이미지, PVE 전투력과 `pvpPower: 0`을 포함한다.
- V3는 최상위 `equippedBattleSuit`/`equippedWeapon`를 우선하고, 호환을 위해 `characterBonus` 내부 값을 보조 경로로 읽는다.
- 토벌·탑·봉인전·호송·레이드는 V3 진입 payload에 같은 장착 메타데이터와 로그인 계정명을 전달한다.
- PVE 외 모드에서는 클라이언트 값과 관계없이 모드 게이트가 계정 유닛을 생성하지 않는다.

# PROJECT V 계정 배틀슈트 기준

## 적용 범위

- 배틀슈트는 기존 장비 5부위와 분리된 `BATTLE_SUIT` 전용 슬롯이다.
- 초기 적용 범위는 PVE 전투다. PVP, 랭크전, 영토전, 대장전, 클랜전과 공성 전장에서는 수치와 V3 외형을 모두 사용하지 않는다.
- 기본 시드 3종의 전투력은 0이다. 운영 수치는 CMS에서 별도로 정한 뒤 유저에게 지급한다.
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
- 서버의 PVE 전투 판정은 이미 `characterBonus.pve`를 사용한다. V3 계정 캐릭터의 사격은 이 보너스를 보여주는 연출이며 별도 피해를 한 번 더 가하지 않는다.

## V3 렌더링 계약

- 계정 캐릭터는 기존 아군 카드 5명의 `allies`, `characters`, 카드 도크와 진형 배열에 넣지 않는 보조 유닛이다.
- 위치는 전열 왼쪽 고정이며 이동하지 않는다. 대기 모션과 총기 반동·총구 섬광·탄도 연출만 사용한다.
- 배틀슈트 본체와 무기는 별도 스프라이트 계층이다. 배틀슈트 교체는 본체 외형을, 기존 `WEAPON` 장착 교체는 총기 외형을 바꾼다.
- 아군의 서버 `TURN` 또는 `SKILL` 재생 직후 보조 사격을 동기화한다. 계정 유닛은 HP, 피격 대상, 독립 피해 이벤트를 갖지 않는다.
- 승인된 총기 코드 4종은 투명 전투 컷아웃에 매핑한다. 그 외 무기는 명시적인 `battleSprite` 또는 `appearanceUrl`이 있을 때만 표시하며, 사각형 DB 카드 이미지는 전투 스프라이트로 사용하지 않는다.
- 단일 자산 기준은 `assets/ui/project-v/account-battle-suits/manifest-v1.json`이다.

## API 계약

- `character/loadout`과 `userEquipmentBonuses()`는 `equippedBattleSuit`, `equippedWeapon`, `battleSuitPve`를 제공한다.
- `equippedBattleSuit`에는 인스턴스 ID, 장비 코드, 이미지, PVE 전투력과 `pvpPower: 0`을 포함한다.
- V3는 최상위 `equippedBattleSuit`/`equippedWeapon`를 우선하고, 호환을 위해 `characterBonus` 내부 값을 보조 경로로 읽는다.
- 토벌·탑·봉인전·호송·레이드는 V3 진입 payload에 같은 장착 메타데이터와 로그인 계정명을 전달한다.
- PVE 외 모드에서는 클라이언트 값과 관계없이 모드 게이트가 계정 유닛을 생성하지 않는다.

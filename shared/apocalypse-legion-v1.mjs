// Approved 2026-09-18. Stable registered monster IDs; client never calculates combat outcomes.
export const APOCALYPSE_LEGION_BOSSES=Object.freeze([
  {
    "key": "alucard",
    "code": "APOCALYPSE_ALUCARD",
    "name": "아카드",
    "subtitle": "붉은 밤의 불사왕",
    "color": "#fa5b66",
    "powerRatio": 1.3636363636363635,
    "sourceArt": "/assets/ui/project-v/monsters/apocalypse-legion-v1/alucard-source.jpg",
    "battleSprite": "/assets/ui/project-v/monsters/apocalypse-legion-v1/alucard-sd-v1.png",
    "skills": [
      {
        "code": "ALUCARD_SEAL",
        "boss": "alucard",
        "kind": "seal",
        "name": "혈계 · 구속의 사슬",
        "description": "공격력이 높은 적 2명의 스킬을 각자 2행동 동안 봉인합니다. 일반 공격은 유지됩니다.",
        "asset": "alucard-seal",
        "atlas": "/assets/ui/project-v/monsters/apocalypse-legion-v1/alucard-seal-atlas.json",
        "frameCount": 12,
        "collisionFrame": 6,
        "impactAt": 0.8,
        "duration": 1.8,
        "anchor": {
          "x": 0.5,
          "y": 0.9
        },
        "targetCount": 2,
        "statusActions": 2,
        "dispel": true
      },
      {
        "code": "ALUCARD_CURSE",
        "boss": "alucard",
        "kind": "curse",
        "name": "불사의 저주 · 메마른 성혈",
        "description": "적 전체의 회복을 각자 2행동 동안 100% 차단합니다. 재생·흡혈도 차단하며 정화로 해제할 수 있습니다.",
        "asset": "alucard-curse",
        "atlas": "/assets/ui/project-v/monsters/apocalypse-legion-v1/alucard-curse-atlas.json",
        "frameCount": 12,
        "collisionFrame": 6,
        "impactAt": 0.8,
        "duration": 1.8,
        "anchor": {
          "x": 0.5,
          "y": 0.9
        },
        "targetCount": "ALL",
        "statusActions": 2,
        "healReductionPercent": 100,
        "dispel": true
      },
      {
        "code": "ALUCARD_ULTIMATE",
        "boss": "alucard",
        "kind": "ultimate",
        "name": "구속 해제 · 불사군단",
        "description": "불사군단의 마수가 적 전체를 덮칩니다. 공격력 190% 피해를 가하며 피해의 40%가 보호막을 관통합니다.",
        "asset": "alucard-ultimate",
        "atlas": "/assets/ui/project-v/monsters/apocalypse-legion-v1/alucard-ultimate-atlas.json",
        "frameCount": 12,
        "collisionFrame": 6,
        "impactAt": 1.15,
        "duration": 2.25,
        "anchor": {
          "x": 0.5,
          "y": 0.9
        },
        "targetCount": "ALL",
        "attackPercent": 190,
        "shieldPiercePercent": 40
      }
    ],
    "monsterId": 75
  },
  {
    "key": "kaneki",
    "code": "APOCALYPSE_KANEKI_KEN",
    "name": "카네키 켄",
    "subtitle": "척안의 재앙",
    "color": "#e9eaf2",
    "powerRatio": 1.8181818181818181,
    "sourceArt": "/assets/ui/project-v/monsters/apocalypse-legion-v1/kaneki-source.jpg",
    "battleSprite": "/assets/ui/project-v/monsters/apocalypse-legion-v1/kaneki-sd-v1.png",
    "skills": [
      {
        "code": "KANEKI_SEAL",
        "boss": "kaneki",
        "kind": "seal",
        "name": "린카쿠 · 가시 감옥",
        "description": "공격력이 높은 적 3명의 스킬을 각자 3행동 동안 봉인합니다. 일반 공격은 유지됩니다.",
        "asset": "kaneki-seal",
        "atlas": "/assets/ui/project-v/monsters/apocalypse-legion-v1/kaneki-seal-atlas.json",
        "frameCount": 12,
        "collisionFrame": 6,
        "impactAt": 0.8,
        "duration": 1.8,
        "anchor": {
          "x": 0.5,
          "y": 0.9
        },
        "targetCount": 3,
        "statusActions": 3,
        "dispel": true
      },
      {
        "code": "KANEKI_CURSE",
        "boss": "kaneki",
        "kind": "curse",
        "name": "구울의 허기 · 회복 포식",
        "description": "적 전체의 회복을 각자 3행동 동안 100% 차단합니다. 재생·흡혈도 차단하며 정화로 해제할 수 있습니다.",
        "asset": "kaneki-curse",
        "atlas": "/assets/ui/project-v/monsters/apocalypse-legion-v1/kaneki-curse-atlas.json",
        "frameCount": 12,
        "collisionFrame": 6,
        "impactAt": 0.8,
        "duration": 1.8,
        "anchor": {
          "x": 0.5,
          "y": 0.9
        },
        "targetCount": "ALL",
        "statusActions": 3,
        "healReductionPercent": 100,
        "dispel": true
      },
      {
        "code": "KANEKI_ULTIMATE",
        "boss": "kaneki",
        "kind": "ultimate",
        "name": "카쿠자 · 백족의 종언",
        "description": "거대한 백족 카쿠자가 적 전체를 내려칩니다. 공격력 225% 피해를 가하며 피해의 60%가 보호막을 관통합니다.",
        "asset": "kaneki-ultimate",
        "atlas": "/assets/ui/project-v/monsters/apocalypse-legion-v1/kaneki-ultimate-atlas.json",
        "frameCount": 12,
        "collisionFrame": 6,
        "impactAt": 1.15,
        "duration": 2.25,
        "anchor": {
          "x": 0.5,
          "y": 0.9
        },
        "targetCount": "ALL",
        "attackPercent": 225,
        "shieldPiercePercent": 60
      }
    ],
    "monsterId": 76
  }
]);
export const APOCALYPSE_MINIONS=Object.freeze([
  {
    "monsterId": 19,
    "name": "뱀파이어",
    "sourceArt": "assets/tower/1.jpg",
    "battleSprite": "assets/ui/project-v/monsters/hunt-tower/tower-019-vampire-sd-v1.png",
    "projectVMonsterArt": {
      "scope": "BATTLE_ENGINE_ONLY",
      "kind": "MONSTER_SD",
      "name": "뱀파이어",
      "primaryUrl": "/assets/ui/project-v/monsters/hunt-tower/tower-019-vampire-sd-v1.png",
      "pngFallbackUrl": "/assets/ui/project-v/monsters/hunt-tower/tower-019-vampire-sd-v1.png",
      "sourceArt": "assets/tower/1.jpg",
      "isBoss": false,
      "approved": true
    }
  },
  {
    "monsterId": 21,
    "name": "타락한 성기사",
    "sourceArt": "assets/tower/2.jpg",
    "battleSprite": "assets/ui/project-v/monsters/hunt-tower/tower-021-fallen-paladin-sd-v1.png",
    "projectVMonsterArt": {
      "scope": "BATTLE_ENGINE_ONLY",
      "kind": "MONSTER_SD",
      "name": "타락한 성기사",
      "primaryUrl": "/assets/ui/project-v/monsters/hunt-tower/tower-021-fallen-paladin-sd-v1.png",
      "pngFallbackUrl": "/assets/ui/project-v/monsters/hunt-tower/tower-021-fallen-paladin-sd-v1.png",
      "sourceArt": "assets/tower/2.jpg",
      "isBoss": false,
      "approved": true
    }
  },
  {
    "monsterId": 27,
    "name": "달빛 악령",
    "sourceArt": "assets/tower/98fb377d65ff92e9392cbd53d75169e8.jpg",
    "battleSprite": "assets/ui/project-v/monsters/hunt-tower/tower-027-moon-wraith-sd-v1.png",
    "projectVMonsterArt": {
      "scope": "BATTLE_ENGINE_ONLY",
      "kind": "MONSTER_SD",
      "name": "달빛 악령",
      "primaryUrl": "/assets/ui/project-v/monsters/hunt-tower/tower-027-moon-wraith-sd-v1.png",
      "pngFallbackUrl": "/assets/ui/project-v/monsters/hunt-tower/tower-027-moon-wraith-sd-v1.png",
      "sourceArt": "assets/tower/98fb377d65ff92e9392cbd53d75169e8.jpg",
      "isBoss": false,
      "approved": true
    }
  }
]);
export function apocalypseLegionBoss(monster={}){
 const values=typeof monster==='object'?[monster.monsterId,monster.id,monster.cardId]:[monster];
 for(const value of values){const id=String(value??'').match(/(?:^|:)(75|76)$/)?.[1];if(id)return APOCALYPSE_LEGION_BOSSES.find(b=>b.monsterId===Number(id));}
 return null;
}
export const apocalypseLegionSkill=code=>APOCALYPSE_LEGION_BOSSES.flatMap(b=>b.skills).find(s=>s.code===code)||null;

import {BLACKCROWN_COMBAT,blackcrownCombatDescription} from './mercenary-blackcrown-combat-v1.mjs';
// Approved presentation and the server-owned combat definitions.
export const BLACKCROWN_CODEX_VERSION='blackcrown-live-20261027-v1';
const approvedDetails={
  "V-950": {
    "id": "heeya",
    "weapon": "총과 결합된 장우산",
    "battleSprite": "assets/ui/project-v/mercenaries/black-crown-battle-20261027-v2/heeya-idle.png",
    "battleSpriteSha256": "97E73C6AE831D62047C9FC3EF805A5892B7DF4B60E9D9B135C3167C52444F86A",
    "battleSpriteViewport": {
      "x": 85,
      "y": 11,
      "width": 923,
      "height": 1481,
      "imageWidth": 1024,
      "imageHeight": 1536
    },
    "skills": [
      {
        "id": "MS-930",
        "name": "흑관 관통",
        "target": "적 1명",
        "effect": "장우산에 결합된 총을 조준해 은빛 관통탄을 발사합니다.",
        "ready": false,
        "codexOnly": true,
        "balance": {},
        "trigger": "스킬 연출 공개 · 전투 적용 준비 중",
        "counterplay": "전투 수치 확정 시 공개됩니다.",
        "bossRule": "전투 적용 준비 중",
        "procRule": "전투 적용 준비 중"
      },
      {
        "id": "MS-931",
        "name": "흑우 탄막",
        "target": "적 3명",
        "effect": "장우산 총구에서 은빛 탄환을 세 방향으로 흩뿌려 여러 적을 연속으로 타격합니다.",
        "ready": false,
        "codexOnly": true,
        "balance": {},
        "trigger": "스킬 연출 공개 · 전투 적용 준비 중",
        "counterplay": "전투 수치 확정 시 공개됩니다.",
        "bossRule": "전투 적용 준비 중",
        "procRule": "전투 적용 준비 중"
      }
    ]
  },
  "V-951": {
    "id": "bongsoon",
    "weapon": "저격총",
    "battleSprite": "assets/ui/project-v/mercenaries/black-crown-battle-20261027-v2/bongsoon-idle.png",
    "battleSpriteSha256": "463858A8DC54888BBA2579961CB682DA6481DACA3179BEF398E5B1AA7418D06A",
    "battleSpriteViewport": {
      "x": 14,
      "y": 35,
      "width": 1004,
      "height": 1469,
      "imageWidth": 1024,
      "imageHeight": 1536
    },
    "skills": [
      {
        "id": "MS-932",
        "name": "녹옥 저격",
        "target": "적 1명",
        "effect": "녹옥 장식 저격총으로 한 적을 조준하고 응축한 탄환을 발사합니다.",
        "ready": false,
        "codexOnly": true,
        "balance": {},
        "trigger": "스킬 연출 공개 · 전투 적용 준비 중",
        "counterplay": "전투 수치 확정 시 공개됩니다.",
        "bossRule": "전투 적용 준비 중",
        "procRule": "전투 적용 준비 중"
      },
      {
        "id": "MS-933",
        "name": "녹옥 관통",
        "target": "적 2명",
        "effect": "응축한 녹옥 관통탄으로 적을 꿰뚫고, 뒤쪽까지 이어지는 파열을 일으킵니다.",
        "ready": false,
        "codexOnly": true,
        "balance": {},
        "trigger": "스킬 연출 공개 · 전투 적용 준비 중",
        "counterplay": "전투 수치 확정 시 공개됩니다.",
        "bossRule": "전투 적용 준비 중",
        "procRule": "전투 적용 준비 중"
      }
    ]
  },
  "V-952": {
    "id": "joeun",
    "weapon": "AK47 스킨총",
    "battleSprite": "assets/ui/project-v/mercenaries/black-crown-battle-20261027-v2/joeun-idle.png",
    "battleSpriteSha256": "D3844815558D1172C7267EFAD22758FF79C50ED62BAD88C8037088575E009BC9",
    "battleSpriteViewport": {
      "x": 201,
      "y": 12,
      "width": 733,
      "height": 1483,
      "imageWidth": 1024,
      "imageHeight": 1536
    },
    "skills": [
      {
        "id": "MS-934",
        "name": "왕관 점사",
        "target": "적 3명",
        "effect": "AK47 스킨총으로 세 적을 향해 짧게 점사합니다.",
        "ready": false,
        "codexOnly": true,
        "balance": {},
        "trigger": "스킬 연출 공개 · 전투 적용 준비 중",
        "counterplay": "전투 수치 확정 시 공개됩니다.",
        "bossRule": "전투 적용 준비 중",
        "procRule": "전투 적용 준비 중"
      },
      {
        "id": "MS-935",
        "name": "흑관 파쇄",
        "target": "적 1명",
        "effect": "한 적에게 집중 사격을 가해 검정·금색 파편이 퍼지는 강한 탄착을 만듭니다.",
        "ready": false,
        "codexOnly": true,
        "balance": {},
        "trigger": "스킬 연출 공개 · 전투 적용 준비 중",
        "counterplay": "전투 수치 확정 시 공개됩니다.",
        "bossRule": "전투 적용 준비 중",
        "procRule": "전투 적용 준비 중"
      }
    ]
  },
  "V-953": {
    "id": "diim",
    "weapon": "사시미 칼과 표창",
    "battleSprite": "assets/ui/project-v/mercenaries/black-crown-battle-20261027-v2/diim-idle.png",
    "battleSpriteSha256": "E11AAB60FD964AB7B0F5A3B3E835634D0F092CC6D85535DFCD324AEC42391AFD",
    "battleSpriteViewport": {
      "x": 80,
      "y": 11,
      "width": 824,
      "height": 1481,
      "imageWidth": 1024,
      "imageHeight": 1536
    },
    "skills": [
      {
        "id": "MS-936",
        "name": "자월 연격",
        "target": "적 1명",
        "effect": "표창으로 먼저 견제한 뒤 사시미 칼의 참격을 연계합니다.",
        "ready": false,
        "codexOnly": true,
        "balance": {},
        "trigger": "스킬 연출 공개 · 전투 적용 준비 중",
        "counterplay": "전투 수치 확정 시 공개됩니다.",
        "bossRule": "전투 적용 준비 중",
        "procRule": "전투 적용 준비 중"
      },
      {
        "id": "MS-937",
        "name": "월영 회수",
        "target": "적 1명",
        "effect": "표창을 곡선으로 날려 적을 베고 회수하며, 사시미 칼로 다음 공격에 대비합니다.",
        "ready": false,
        "codexOnly": true,
        "balance": {},
        "trigger": "스킬 연출 공개 · 전투 적용 준비 중",
        "counterplay": "전투 수치 확정 시 공개됩니다.",
        "bossRule": "전투 적용 준비 중",
        "procRule": "전투 적용 준비 중"
      }
    ]
  },
  "V-954": {
    "id": "sudaeng",
    "weapon": "지포 라이터 마법",
    "battleSprite": "assets/ui/project-v/mercenaries/black-crown-battle-20261027-v2/sudaeng-idle.png",
    "battleSpriteSha256": "449EC1AF3126C2EA20EFB93240A950D4F69193943591F2646EE54E592DBEEC67",
    "battleSpriteViewport": {
      "x": 120,
      "y": 6,
      "width": 828,
      "height": 1517,
      "imageWidth": 1024,
      "imageHeight": 1536
    },
    "skills": [
      {
        "id": "MS-938",
        "name": "황금화관",
        "target": "적 1명",
        "effect": "지포 라이터의 불씨를 황금 화관으로 바꾸어 적에게 날립니다.",
        "ready": false,
        "codexOnly": true,
        "balance": {},
        "trigger": "스킬 연출 공개 · 전투 적용 준비 중",
        "counterplay": "전투 수치 확정 시 공개됩니다.",
        "bossRule": "전투 적용 준비 중",
        "procRule": "전투 적용 준비 중"
      },
      {
        "id": "MS-939",
        "name": "흑염 결계",
        "target": "적 3명",
        "effect": "지포의 불씨를 지면에 옮겨 검정·금빛 화염 기둥이 차례로 솟는 결계를 펼칩니다.",
        "ready": false,
        "codexOnly": true,
        "balance": {},
        "trigger": "스킬 연출 공개 · 전투 적용 준비 중",
        "counterplay": "전투 수치 확정 시 공개됩니다.",
        "bossRule": "전투 적용 준비 중",
        "procRule": "전투 적용 준비 중"
      }
    ]
  },
  "V-955": {
    "id": "orikkung",
    "weapon": "샷건",
    "battleSprite": "assets/ui/project-v/mercenaries/black-crown-battle-20261027-v2/orikkung-idle.png",
    "battleSpriteSha256": "964EA0757EC220F0E7F2A17E265DC6A013C4E9B186A5D07732B1CB8BE11E6E25",
    "battleSpriteViewport": {
      "x": 32,
      "y": 38,
      "width": 977,
      "height": 1448,
      "imageWidth": 1024,
      "imageHeight": 1536
    },
    "skills": [
      {
        "id": "MS-940",
        "name": "왕관 산탄",
        "target": "적 1명",
        "effect": "코트와 제복모 차림으로 중심을 잡고 샷건 산탄을 발사합니다.",
        "ready": false,
        "codexOnly": true,
        "balance": {},
        "trigger": "스킬 연출 공개 · 전투 적용 준비 중",
        "counterplay": "전투 수치 확정 시 공개됩니다.",
        "bossRule": "전투 적용 준비 중",
        "procRule": "전투 적용 준비 중"
      },
      {
        "id": "MS-941",
        "name": "크라운 일제탄",
        "target": "적 3명",
        "effect": "제자리를 지키며 샷건 산탄을 넓게 퍼뜨려 여러 적을 동시에 타격합니다.",
        "ready": false,
        "codexOnly": true,
        "balance": {},
        "trigger": "스킬 연출 공개 · 전투 적용 준비 중",
        "counterplay": "전투 수치 확정 시 공개됩니다.",
        "bossRule": "전투 적용 준비 중",
        "procRule": "전투 적용 준비 중"
      }
    ]
  }
};
export const BLACKCROWN_CODEX_DETAILS=Object.freeze(Object.fromEntries(Object.entries(approvedDetails).map(([code,detail])=>[code,Object.freeze({...detail,skills:detail.skills.map((s,i)=>({...s,...BLACKCROWN_COMBAT[code].skills[i]}))})])));
export function blackcrownCodexCard(card){
 const detail=BLACKCROWN_CODEX_DETAILS[card.code];
 if(!detail||card.season!=='BLACKCROWN')return card;
 return {...card,...structuredClone(detail),releaseStatus:'BATTLE_RELEASED',resourceStatus:'BATTLE_RELEASED',artOnly:false,deploymentEnabled:true,deploymentModes:['PVE','PVP'],combatLinkDescription:blackcrownCombatDescription(card.code),battlePresentation:{facing:'RIGHT_TOWARD_ENEMY',motionSpeed:2,bodyHeight:285}};
}

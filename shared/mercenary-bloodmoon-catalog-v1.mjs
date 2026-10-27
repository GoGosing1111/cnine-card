import {BLOODMOON_COMBAT,bloodmoonCombatDescription} from './mercenary-bloodmoon-combat-v1.mjs';
import {NAMSUDAENG_ART} from './mercenary-bloodmoon-namsudaeng-v1.mjs?bloodmoonStock=20261025-bloodmoon-expansion-v1';
// User, 2026-10-25: add five more copies to each of the six SS limited characters.
export const BLOODMOON_SERVER_LIMIT=40;
export const BLOODMOON_LEGACY_SERVER_LIMIT=10;
export const BLOODMOON_BASE_POWER=356400;
export const BLOODMOON_MERCENARIES=Object.freeze([
  {
    "code": "V-960",
    "name": "나무늘봉순",
    "nameStatus": "CONFIRMED",
    "title": "블러드문 SS 리미티드",
    "rank": "SS",
    "rankStatus": "USER_DESIGNATED_20261023",
    "edition": "LIMITED",
    "season": "BLOODMOON",
    "role": "LIMITED",
    "position": null,
    "artOnly": true,
    "releaseStatus": "CODEX_RELEASED_ACQUISITION_LOCKED",
    "sourceArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-960-source.png",
    "sourceArtSha256": "F72CFF4055340C7859649F0A971B2557E16DDFC57F7AB8EBD7E1309B070E4A8E",
    "battleSprite": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-960-idle.png",
    "battleSpriteSha256": "044565913CE77B068955ADC3D3D6B5DED046A38844AC1C01838EC21282787728",
    "thumbnailArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-960-320.webp",
    "displayArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-960-640.webp",
    "accent": "#eb4164",
    "basePower": 356400,
    "skills": [
      {
        "id": "MS-960",
        "name": "적월 섬멸탄",
        "nameStatus": "WORKING_LABEL",
        "mechanic": "DISTRIBUTED_CORAL_VOLLEY",
        "effect": "세 차례 탄막을 나누어 발사합니다.",
        "target": "적 표적",
        "ready": false,
        "trigger": "기존 서버의 에너지·재사용·행동 조건",
        "counterplay": "기존 회피·방어·보호막·제어 면역 적용",
        "procRule": "연출 프레임은 추가 피해·행동·비용을 발생시키지 않습니다.",
        "balance": {
          "damageRatio": 14.4,
          "cooldownTurns": 2,
          "cost": 20
        },
        "bossRule": "공개된 전투 검수 기준이며 현재 획득·편성은 잠겨 있습니다."
      }
    ],
    "acquisition": "LOCKED",
    "acquisitionEnabled": false,
    "packAcquisitionEnabled": false,
    "deploymentEnabled": false,
    "packOpeningEnabled": false,
    "acquisitionPackId": "mercenary-bloodmoon-ss-limited",
    "acquisitionPackName": "블러드문팩",
    "serverLimit": BLOODMOON_SERVER_LIMIT,
    "frame": "assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png",
    "frameSha256": "F5F636CAC672A485F19CE4ED484ECB2798217D365A4D31B2C6C7FABB878189EA",
    "artWindow": {
      "left": 5.957,
      "top": 5.794,
      "width": 88.086,
      "height": 88.086
    },
    "resourceStatus": "ART_AND_BATTLE_RESOURCES_CODEX_RELEASED",
    "visualApproval": "SOURCE_ART_USER_APPROVED_BATTLE_REVIEW_PENDING",
    "combatLinkDescription": "기본 전투력 356,400 · 할로윈 SS 리미티드 상위 기준. 블러드문팩 전용이며 전투 편성은 준비 중입니다.",
    "battleSpriteViewport": {
      "x": 15,
      "y": 11,
      "width": 734,
      "height": 917,
      "imageWidth": 1254,
      "imageHeight": 1254
    }
  },
  {
    "code": "V-961",
    "name": "조은",
    "nameStatus": "CONFIRMED",
    "title": "블러드문 SS 리미티드",
    "rank": "SS",
    "rankStatus": "USER_DESIGNATED_20261023",
    "edition": "LIMITED",
    "season": "BLOODMOON",
    "role": "LIMITED",
    "position": null,
    "artOnly": true,
    "releaseStatus": "CODEX_RELEASED_ACQUISITION_LOCKED",
    "sourceArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-961-source.png",
    "sourceArtSha256": "2756F59F1703411C57D7257FB10F049DF046241CF395A646610B9EA19E567787",
    "battleSprite": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-961-idle.png",
    "battleSpriteSha256": "DC95449200629518CA158CD6E5E5C805CDFE7CC8A18B539AAE9E7B64A32A7278",
    "thumbnailArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-961-320.webp",
    "displayArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-961-640.webp",
    "accent": "#eb4164",
    "basePower": 356400,
    "skills": [
      {
        "id": "MS-961",
        "name": "홍련의 속박",
        "nameStatus": "WORKING_LABEL",
        "mechanic": "REPEAT_OFFENDER_RESTRAINT",
        "effect": "채찍 적중 즉시 기본 공격을 25% 약화하고, 위반 표식 2개가 쌓인 대상에게 다시 적중하면 표식을 소모해 다음 공격 스킬도 25% 약화합니다.",
        "target": "적 표적",
        "ready": false,
        "trigger": "기존 서버의 에너지·재사용·행동 조건",
        "counterplay": "기존 회피·방어·보호막·제어 면역 적용",
        "procRule": "연출 프레임은 추가 피해·행동·비용을 발생시키지 않습니다.",
        "balance": {
          "damageRatio": 11.6,
          "cooldownTurns": 1,
          "cost": 20
        },
        "bossRule": "공개된 전투 검수 기준이며 현재 획득·편성은 잠겨 있습니다."
      }
    ],
    "acquisition": "LOCKED",
    "acquisitionEnabled": false,
    "packAcquisitionEnabled": false,
    "deploymentEnabled": false,
    "packOpeningEnabled": false,
    "acquisitionPackId": "mercenary-bloodmoon-ss-limited",
    "acquisitionPackName": "블러드문팩",
    "serverLimit": BLOODMOON_SERVER_LIMIT,
    "frame": "assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png",
    "frameSha256": "F5F636CAC672A485F19CE4ED484ECB2798217D365A4D31B2C6C7FABB878189EA",
    "artWindow": {
      "left": 5.957,
      "top": 5.794,
      "width": 88.086,
      "height": 88.086
    },
    "resourceStatus": "ART_AND_BATTLE_RESOURCES_CODEX_RELEASED",
    "visualApproval": "SOURCE_ART_USER_APPROVED_BATTLE_REVIEW_PENDING",
    "combatLinkDescription": "기본 전투력 356,400 · 할로윈 SS 리미티드 상위 기준. 블러드문팩 전용이며 전투 편성은 준비 중입니다.",
    "battleSpriteViewport": {
      "x": 15,
      "y": 5,
      "width": 270,
      "height": 351,
      "imageWidth": 512,
      "imageHeight": 512
    }
  },
  {
    "code": "V-962",
    "name": "디임",
    "nameStatus": "CONFIRMED",
    "title": "블러드문 SS 리미티드",
    "rank": "SS",
    "rankStatus": "USER_DESIGNATED_20261023",
    "edition": "LIMITED",
    "season": "BLOODMOON",
    "role": "LIMITED",
    "position": null,
    "artOnly": true,
    "releaseStatus": "CODEX_RELEASED_ACQUISITION_LOCKED",
    "sourceArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-962-source.png",
    "sourceArtSha256": "EC0AE02A8DCF159DDEA5BAC6215EB56CA271FADA9EA19E4A4DB2589513A5D537",
    "battleSprite": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-962-idle.png",
    "battleSpriteSha256": "CB9BAC03F199DEFB9F1AC22834DE4CE87F89E490F896B622638F5D1E524B14FB",
    "thumbnailArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-962-320.webp",
    "displayArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-962-640.webp",
    "accent": "#eb4164",
    "basePower": 356400,
    "skills": [
      {
        "id": "MS-962",
        "name": "적월 단죄",
        "nameStatus": "WORKING_LABEL",
        "mechanic": "WOUNDED_MOON_DRAW",
        "effect": "잃은 체력이 많은 적을 큰 낫으로 마무리합니다.",
        "target": "적 표적",
        "ready": false,
        "trigger": "기존 서버의 에너지·재사용·행동 조건",
        "counterplay": "기존 회피·방어·보호막·제어 면역 적용",
        "procRule": "연출 프레임은 추가 피해·행동·비용을 발생시키지 않습니다.",
        "balance": {
          "damageRatio": 11.6,
          "cooldownTurns": 1,
          "cost": 20
        },
        "bossRule": "공개된 전투 검수 기준이며 현재 획득·편성은 잠겨 있습니다."
      }
    ],
    "acquisition": "LOCKED",
    "acquisitionEnabled": false,
    "packAcquisitionEnabled": false,
    "deploymentEnabled": false,
    "packOpeningEnabled": false,
    "acquisitionPackId": "mercenary-bloodmoon-ss-limited",
    "acquisitionPackName": "블러드문팩",
    "serverLimit": BLOODMOON_SERVER_LIMIT,
    "frame": "assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png",
    "frameSha256": "F5F636CAC672A485F19CE4ED484ECB2798217D365A4D31B2C6C7FABB878189EA",
    "artWindow": {
      "left": 5.957,
      "top": 5.794,
      "width": 88.086,
      "height": 88.086
    },
    "resourceStatus": "ART_AND_BATTLE_RESOURCES_CODEX_RELEASED",
    "visualApproval": "SOURCE_ART_USER_APPROVED_BATTLE_REVIEW_PENDING",
    "combatLinkDescription": "기본 전투력 356,400 · 할로윈 SS 리미티드 상위 기준. 블러드문팩 전용이며 전투 편성은 준비 중입니다.",
    "battleSpriteViewport": {
      "x": 16,
      "y": 12,
      "width": 302,
      "height": 316,
      "imageWidth": 512,
      "imageHeight": 512
    }
  },
  {
    "code": "V-963",
    "name": "카르베나",
    "nameStatus": "USER_APPROVED_20261023",
    "title": "블러드문 SS 리미티드",
    "rank": "SS",
    "rankStatus": "USER_DESIGNATED_20261023",
    "edition": "LIMITED",
    "season": "BLOODMOON",
    "role": "LIMITED",
    "position": null,
    "artOnly": true,
    "releaseStatus": "CODEX_RELEASED_ACQUISITION_LOCKED",
    "sourceArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-963-source.png",
    "sourceArtSha256": "4A3CE150F220EF56CBE8C457F1CD4329650C0DA8092848D90E54873D058E728F",
    "battleSprite": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-963-idle.png",
    "battleSpriteSha256": "C729CC2489870EC2D2608D9FFD79D9DD51C7838842E2AF8D5A7F46528A351A1C",
    "thumbnailArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-963-320.webp",
    "displayArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-963-640.webp",
    "accent": "#eb4164",
    "basePower": 356400,
    "skills": [
      {
        "id": "MS-963",
        "name": "혈조 교차참",
        "nameStatus": "WORKING_LABEL",
        "mechanic": "TWO_BEAT_FOLLOWUP",
        "effect": "양손 클로의 교차 공격을 두 행동에 나누어 이어갑니다.",
        "target": "적 표적",
        "ready": false,
        "trigger": "기존 서버의 에너지·재사용·행동 조건",
        "counterplay": "기존 회피·방어·보호막·제어 면역 적용",
        "procRule": "연출 프레임은 추가 피해·행동·비용을 발생시키지 않습니다.",
        "balance": {
          "damageRatio": 26.4,
          "cooldownTurns": 1,
          "cost": 20
        },
        "bossRule": "공개된 전투 검수 기준이며 현재 획득·편성은 잠겨 있습니다."
      }
    ],
    "acquisition": "LOCKED",
    "acquisitionEnabled": false,
    "packAcquisitionEnabled": false,
    "deploymentEnabled": false,
    "packOpeningEnabled": false,
    "acquisitionPackId": "mercenary-bloodmoon-ss-limited",
    "acquisitionPackName": "블러드문팩",
    "serverLimit": BLOODMOON_SERVER_LIMIT,
    "frame": "assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png",
    "frameSha256": "F5F636CAC672A485F19CE4ED484ECB2798217D365A4D31B2C6C7FABB878189EA",
    "artWindow": {
      "left": 5.957,
      "top": 5.794,
      "width": 88.086,
      "height": 88.086
    },
    "resourceStatus": "ART_AND_BATTLE_RESOURCES_CODEX_RELEASED",
    "visualApproval": "SOURCE_ART_USER_APPROVED_BATTLE_REVIEW_PENDING",
    "combatLinkDescription": "기본 전투력 356,400 · 할로윈 SS 리미티드 상위 기준. 블러드문팩 전용이며 전투 편성은 준비 중입니다.",
    "battleSpriteViewport": {
      "x": 73,
      "y": 0,
      "width": 291,
      "height": 329,
      "imageWidth": 512,
      "imageHeight": 512
    }
  },
  {
    "code": "V-964",
    "name": "네베라",
    "nameStatus": "USER_APPROVED_20261023",
    "title": "블러드문 SS 리미티드",
    "rank": "SS",
    "rankStatus": "USER_DESIGNATED_20261023",
    "edition": "LIMITED",
    "season": "BLOODMOON",
    "role": "LIMITED",
    "position": null,
    "artOnly": true,
    "releaseStatus": "CODEX_RELEASED_ACQUISITION_LOCKED",
    "sourceArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-964-source.png",
    "sourceArtSha256": "B438EA1FCD38F7D04C960FEDD04EF350A99EFB0B21940C27444E4E90860F2EC8",
    "battleSprite": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-964-idle.png",
    "battleSpriteSha256": "76D1D632AE2FA8E7CD13698B9459885FCF7E337FCB647409A22874CAFD8D72A7",
    "thumbnailArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-964-320.webp",
    "displayArt": "assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/v-964-640.webp",
    "accent": "#eb4164",
    "basePower": 356400,
    "skills": [
      {
        "id": "MS-964",
        "name": "월영 급습",
        "nameStatus": "WORKING_LABEL",
        "mechanic": "INTERRUPT_WINDUP",
        "effect": "단검으로 급습해 적의 준비 중인 기술을 중단합니다. 보스와 제어 면역은 중단되지 않습니다.",
        "target": "적 표적",
        "ready": false,
        "trigger": "기존 서버의 에너지·재사용·행동 조건",
        "counterplay": "기존 회피·방어·보호막·제어 면역 적용",
        "procRule": "연출 프레임은 추가 피해·행동·비용을 발생시키지 않습니다.",
        "balance": {
          "damageRatio": 11.8,
          "cooldownTurns": 1,
          "cost": 20
        },
        "bossRule": "공개된 전투 검수 기준이며 현재 획득·편성은 잠겨 있습니다."
      }
    ],
    "acquisition": "LOCKED",
    "acquisitionEnabled": false,
    "packAcquisitionEnabled": false,
    "deploymentEnabled": false,
    "packOpeningEnabled": false,
    "acquisitionPackId": "mercenary-bloodmoon-ss-limited",
    "acquisitionPackName": "블러드문팩",
    "serverLimit": BLOODMOON_SERVER_LIMIT,
    "frame": "assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png",
    "frameSha256": "F5F636CAC672A485F19CE4ED484ECB2798217D365A4D31B2C6C7FABB878189EA",
    "artWindow": {
      "left": 5.957,
      "top": 5.794,
      "width": 88.086,
      "height": 88.086
    },
    "resourceStatus": "ART_AND_BATTLE_RESOURCES_CODEX_RELEASED",
    "visualApproval": "SOURCE_ART_USER_APPROVED_BATTLE_REVIEW_PENDING",
    "combatLinkDescription": "기본 전투력 356,400 · 할로윈 SS 리미티드 상위 기준. 블러드문팩 전용이며 전투 편성은 준비 중입니다.",
    "battleSpriteViewport": {
      "x": 42,
      "y": 0,
      "width": 239,
      "height": 375,
      "imageWidth": 512,
      "imageHeight": 512
    }
  }
,NAMSUDAENG_ART].map(card=>{
 const profile=BLOODMOON_COMBAT[card.code];
 return Object.freeze(profile?{...card,artOnly:false,releaseStatus:'BATTLE_RELEASED_PACK_PENDING',acquisition:'BLOODMOON_PACK',packAcquisitionEnabled:true,deploymentEnabled:true,deploymentModes:Object.freeze(['PVE','PVP']),
  role:profile.role==='RANGED'?'MARKSMAN':profile.role,position:profile.position==='BACK'?'REAR':profile.position,
  skills:card.skills.map(s=>({...s,...profile.skill,bossRule:'기존 서버의 보스·제어 면역 규칙을 적용합니다.'})),combatLinkDescription:bloodmoonCombatDescription(card.code)}:card);
}));
export const BLOODMOON_ORIGINAL_CODES=Object.freeze(['V-960','V-961','V-962','V-963','V-964']);
export const BLOODMOON_CODES=Object.freeze(BLOODMOON_MERCENARIES.map(c=>c.code));

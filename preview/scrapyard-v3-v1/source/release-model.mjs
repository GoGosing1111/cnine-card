import {buildScrapyardV3Battle,SCRAPYARD_V3_DRAFT} from '../../../functions/_scrapyard_v3.js';
import {buildPreviewDeck,BATTLE_SUIT} from '../../idle-v3-v1/source/idle-model.mjs';
export const ZONES=Object.freeze([
  {id:'OUTER',name:'외곽 폐차장',requiredPowerStart:70000,requiredPowerEnd:150000,clearCoin:1000000,waves:10},
  {id:'CORE',name:'압축 설비 구역',requiredPowerStart:100000,requiredPowerEnd:200000,clearCoin:2000000,waves:10},
  {id:'FURNACE',name:'용광로 심부',requiredPowerStart:150000,requiredPowerEnd:300000,clearCoin:4000000,waves:10}
]);
export function createReleaseEncounter({catalog,equipment,seed=7123,powerScale=1,zone='OUTER',config}={}){
  if(![.25,1,2].includes(powerScale))throw new Error('INVALID_PREVIEW_POWER');
  const difficulty=ZONES.find(r=>r.id===zone);if(!difficulty)throw new Error('INVALID_PREVIEW_ZONE');
  const cards=buildPreviewDeck(catalog).map(c=>({...c,power:Math.round(c.power*powerScale)}));
  const suit=equipment.suits.find(r=>r.code===BATTLE_SUIT.code),weapon=equipment.weapons.find(r=>r.equipmentCode===BATTLE_SUIT.weaponCode);
  if(!suit||!weapon)throw new Error('승인된 슈트와 무기 리소스가 없습니다.');
  const power=Math.round(BATTLE_SUIT.basePower*powerScale),equippedBattleSuit={code:suit.code,pvePower:power,appearance:{battleSprite:suit.image,battleHeight:278}},equippedWeapon={code:weapon.equipmentCode,appearance:{battleSprite:weapon.battleSprite}};
  const snapshot={schemaVersion:1,cards,accountNickname:'폐차장 체험 회수대',cardSupportBonus:0,
    power:{cards:cards.reduce((s,c)=>s+c.power,0),equipment:0,battleSuit:power},
    battleSuit:{...equippedBattleSuit,weapon:equippedWeapon,accountNickname:'회수대 지원'},characterBonus:{pve:power,battleSuitPve:power,equippedBattleSuit,equippedWeapon}};
  const battle=buildScrapyardV3Battle({snapshot,difficulty,seed,config:config||SCRAPYARD_V3_DRAFT[zone]});
  return {...battle,previewOnly:true,difficulty,scrapyardPreview:battle.continuousEncounter};
}

import {BLUE_GEAR,BLUE_GEAR_DESCRIPTION} from './mercenary-blue-gear-v1.mjs';
import {BLUE_GEAR_RESOURCES} from './mercenary-blue-gear-resources-v1.mjs';

export const BLUE_GEAR_MEDIA='assets/ui/project-v/mercenaries/blue-gear-live-v1/';
export const BLUE_GEAR_PACK_ART='assets/ui/packs/blue-gear-live-v1/';
export const BLUE_GEAR_MERCENARIES=Object.freeze(Object.values(BLUE_GEAR).map(profile=>{
 const {code,id,name,variantId,position,role,attackStyle,basePower,weapon}=profile;
 const art=BLUE_GEAR_PACK_ART+id;
 return Object.freeze({code,name,variantId,title:'블루기어 SS 리미티드',rank:'SS',edition:'LIMITED',season:'BLUE_GEAR',
  position,role:role==='RANGED'?'MARKSMAN':role,attackStyle,basePower,weapon,artOnly:false,deploymentEnabled:true,releaseStatus:'BATTLE_RELEASED',
  acquisition:'BLUE_GEAR_PACK',acquisitionEnabled:true,packAcquisitionEnabled:true,acquisitionPackId:'mercenary-blue-gear',acquisitionPackName:'블루기어팩',
  serverLimit:10,stockPolicy:'SEASONAL',sourceArt:art+'-640.webp',displayArt:art+'-640.webp',thumbnailArt:art+'-320.webp',
  sourceArtSha256:BLUE_GEAR_RESOURCES[id].sourceArtSha256,battleSprite:BLUE_GEAR_MEDIA+'actors/'+id+'/runtime/guard.webp',
  battleSpriteSha256:BLUE_GEAR_RESOURCES[id].battleSpriteSha256,accent:'#48bfff',frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
  artWindow:{left:5.957,top:5.794,width:88.086,height:88.086},acquisitionDescription:'블루기어팩에서 종당 10장 한정으로 획득합니다.',
  combatLinkDescription:BLUE_GEAR_DESCRIPTION,skills:profile.skills.map(skill=>({...skill,effect:skill.name+' · '+skill.target+' 공격',trigger:'에너지 25 · 재사용 3행동',counterplay:'방어·보호막 적용',bossRule:'서버 전투 규칙 적용',procRule:'대상당 1회'}))});
}));
export const BLUE_GEAR_CODES=Object.freeze(BLUE_GEAR_MERCENARIES.map(card=>card.code));

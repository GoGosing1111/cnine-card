import {petBuffVisual} from '../../../../shared/pet-buff-visuals-v1.mjs';

export const PET_CAST_MS=3200;
export const PET_EFFECT_MS=2600;
const THEMES=Object.freeze({
 ATTACK_PERCENT:{title:'용맹의 포효',short:'공격력',motif:'sword'},
 DEFENSE_PERCENT:{title:'강철의 가호',short:'방어력',motif:'armor'},
 MAX_HP_PERCENT:{title:'생명의 축복',short:'최대 HP',motif:'heart'},
 SPEED_PERCENT:{title:'질풍의 날개',short:'속도',motif:'wing'},
 START_SHIELD_PERCENT:{title:'수호의 결계',short:'시작 보호막',motif:'barrier'}
});
export function petEffectRows(buffs=[]){
 return buffs.flatMap(buff=>{
  const visual=petBuffVisual(buff?.type),theme=THEMES[buff?.type];
  if(!visual||!theme||!Number.isFinite(buff.percent))return [];
  return [{...visual,...theme,percent:buff.percent,text:`${theme.short} +${buff.percent}%`,tint:Number.parseInt(visual.color.slice(1),16)}];
 });
}
export const petSupportKey=(side,ownerId)=>ownerId!==undefined&&ownerId!==null?`${side}:${ownerId}`:side;
export function petOpeningMatches(row,event){
 if(!row||row.applied||event?.type!=='PET_OPENING_BUFF'||row.side!==event.actorSide)return false;
 if(row.snapshot?.definition?.code!==event.petCode)return false;
 return row.ownerId===undefined||row.ownerId===null
  ?event.ownerId===undefined||event.ownerId===null||Number(row.snapshot.ownerId)===Number(event.ownerId)
  :Number(row.ownerId)===Number(event.ownerId);
}
export function skippedPetOpenings(timeline,elapsed){
 return timeline.filter(event=>event.type==='PET_OPENING_BUFF'&&(Number(event.combatAtMs)||0)<elapsed);
}

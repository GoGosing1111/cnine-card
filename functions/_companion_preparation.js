import {COMPANION_PREPARATION_REVIEW,COMPANION_FORMATION_RULES,COMPANION_RELEASE,validatePreparedMercenaries} from '../shared/companion-loadout-v2.mjs';
import {petReadiness} from '../shared/pet-cms-v1.mjs';
import {applyTypeStacking,distributeEquipment,buildFighter,buildPvePlayerTeam,buildMonsterFighter,simulateBattleV2Preview,resolvePvpOutcome,teamSummary} from './_battle_v2_preview.js';
import {buildMercenaryFighter} from './_mercenary_combat.js';

// Review fixtures are not an account's deck or balance/launch defaults.
export const COMPANION_REVIEW_CARDS=Object.freeze(['ATTACK','DEFENSE','SPEED','HP','NONE'].map((power_type,index)=>Object.freeze({id:`REVIEW-CARD-${index+1}`,name:`검수 카드 ${index+1}`,power_type,power:50000,grade:'FUR'})));
function prepareTeam({cards,mercenaries=[],pet=null,equipmentBonus=0,battleSuit=null},side,mode){
  if(!Array.isArray(cards)||cards.length!==5||new Set(cards.map(card=>String(card.id))).size!==5||cards.some(card=>!card.id||card.isMercenary||card.isMonster||card.actorKind==='PET'||/^V-\d{3}$/.test(String(card.id))||String(card.id).startsWith('PET-')))throw Error('일반 카드는 서로 다른 5장으로 편성해 주세요.');
  validatePreparedMercenaries(mercenaries);
  if(pet){const readiness=petReadiness(pet,mode);if(!readiness.ok)throw Error(readiness.reasons.join(' '));}
  const regular=mode==='PVE'?buildPvePlayerTeam({cards,characterBonus:equipmentBonus,battleSuit}):{teamA:distributeEquipment(applyTypeStacking(cards),equipmentBonus).map((card,index)=>buildFighter(card,index,side,card.uniqueAbility||null,mode))};
  const fighters=mercenaries.map((row,index)=>({...buildMercenaryFighter(row,side,mode,buildFighter),slot:5+index}));
  return {actors:[...regular.teamA,...fighters,...(regular.battleSuitFighter?[{...regular.battleSuitFighter,slot:7}]:[])],pet};
}
export function createCompanionPreparationBattle({mode='PVE',attacker,defender={cards:COMPANION_REVIEW_CARDS},monster={id:'REVIEW-BOSS',name:'검수 보스',power:300000,isBoss:true},seed=1}={}){
  if(!['PVE','PVP'].includes(mode))throw Error('전투 모드를 확인해 주세요.');
  const a=prepareTeam(attacker,'A',mode),b=mode==='PVP'?prepareTeam(defender,'B',mode):{actors:[buildMonsterFighter(monster)],pet:null};
  const simulated=simulateBattleV2Preview({teamA:a.actors,teamB:b.actors,seed,maxActions:mode==='PVE'?2000:83,maxDuration:mode==='PVE'?4:0,forcedMonsterEvery:mode==='PVE'?8:0,suddenDeathAfter:mode==='PVP'?64:0,healerPenalty:true,[COMPANION_PREPARATION_REVIEW]:{mode,pets:{A:a.pet,B:b.pet}}});
  let result=mode==='PVP'?resolvePvpOutcome(simulated,a.actors,b.actors):simulated;
  if(mode==='PVE'&&result.final.B.some(actor=>actor.hp>0))result={...result,winner:'B',reason:'MONSTER_SURVIVED',timeline:result.timeline.map(event=>event.type==='RESULT'?{...event,winner:'B',reason:'MONSTER_SURVIVED'}:event)};
  const teams=Object.fromEntries(['A','B'].map(side=>{
    const rows=result.openingTeams[side],cards=rows.filter(row=>!row.isMercenary&&!row.isBattleSuit),mercenaries=rows.filter(row=>row.isMercenary),pet=side==='A'?a.pet:b.pet;
    return [side,{cards,mercenaries,supports:rows.filter(row=>row.isBattleSuit),pets:pet?[{code:pet.code,name:pet.name,battleSprite:pet.battleSprite,occupiesCombatSlot:false}]:[],summary:teamSummary([...cards,...mercenaries])}];
  }));
  return {schemaVersion:2,engine:'COMPANION_PREPARATION_V2',reviewOnly:true,mode,seed:Number(seed)>>>0,rules:COMPANION_FORMATION_RULES,release:COMPANION_RELEASE,teams,result};
}

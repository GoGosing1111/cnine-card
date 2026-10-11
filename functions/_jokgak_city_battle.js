import {buildFighter,publicFighter,simulateBattleV2Preview,resolvePvpOutcome,teamSummary} from './_battle_v2_preview.js';
import {defaultCityArsenal} from '../shared/jokgak-city-expansion-v1.mjs';

// Five identical city roles for both sides. The PVP deck supplies portraits,
// never growth, type combinations, unique skills or a sixth mercenary actor.
export const CITY_FORMATION_TYPES=Object.freeze(['DEFENSE','DEFENSE','ATTACK','SPEED','HEAL']);
export function buildCityTeam(cards,_mercenary,side,power,basePower=100000){
  const unit=Math.floor(power/5),baseUnit=Math.floor(basePower/5);
  return cards.map((c,i)=>{
    const card={id:String(c.id),name:c.name,title:c.title,image:c.image||c.image_url,focus_x:c.focus_x,focus_y:c.focus_y,rarity:c.rarity,
      power:i===4?power-unit*4:unit,type:CITY_FORMATION_TYPES[i],breakthrough_level:0};
    const fighter=buildFighter(card,i,side,null,'PVP');
    fighter.speed=buildFighter({...card,power:baseUnit},i,side,null,'PVP').speed;
    fighter.statMode='CITY_NORMALIZED';
    return fighter;
  });
}
export function createCityBattle({attackerCards,defenderCards,attackerPower,defenderPower,basePower=100000,seed=1}){
  const A=buildCityTeam(attackerCards,null,'A',attackerPower,basePower),B=buildCityTeam(defenderCards,null,'B',defenderPower,basePower);
  const simulated=simulateBattleV2Preview({teamA:A,teamB:B,seed,maxActions:83,suddenDeathAfter:64,healerPenalty:true,singleHealerBonus:{enabled:false},petMode:'PVP'}),result=resolvePvpOutcome(simulated,A,B);
  result.final={...result.final,mercenaries:{A:[],B:[]}};
  return {schemaVersion:2,engine:'BATTLE_ENGINE_V2_PVP',playbackSpeed:1.3,seed,rules:{hpMode:'CITY_GEAR_NORMALIZED',formation:'FRONT_2_BACK_3',actionMode:'SPEED_GAUGE',maxActions:83,suddenDeathAfter:64,cityNormalizationVersion:2,accountGrowthApplied:false,accountTypesApplied:false,mercenarySkillsApplied:false,cityFormationTypes:[...CITY_FORMATION_TYPES],basePower,weaponPower:{A:attackerPower,B:defenderPower}},
    teams:Object.fromEntries([['A',A],['B',B]].map(([side,team])=>{const opening=simulated.openingTeams?.[side]||team.map(publicFighter);return [side,{summary:teamSummary(opening),cards:opening,mercenaries:[]}];})),result};
}
export async function prepareCityBattle(env,deps,attacker,defender,{attacker:aCity,defender:dCity,policy}={}){
  const decks=await Promise.all([deps.pvpDeckSnapshot(env,attacker.id),deps.pvpDeckSnapshot(env,defender.id,true)]);
  if(decks.some(deck=>deck.length!==5||new Set(deck.map(c=>String(c.id))).size!==5))throw Object.assign(Error('양쪽 모두 PVP 덱에 일반 카드 5장이 필요합니다.'),{status:409,code:'CITY_DECK'});
  const cfg=policy?.arsenal||defaultCityArsenal(),powers=[aCity?.cityPower||cfg.basePower,dCity?.cityPower||cfg.basePower],seed=crypto.getRandomValues(new Uint32Array(1))[0];
  const battleV2=createCityBattle({attackerCards:decks[0],defenderCards:decks[1],attackerPower:powers[0],defenderPower:powers[1],basePower:cfg.basePower,seed});
  const cards=side=>battleV2.teams[side].cards.map(c=>({id:c.cardId,name:c.name,title:c.title,rarity:c.grade,image:c.image,power:c.power,type:c.type}));
  return {battleV2,battleSeed:seed,attackerCards:cards('A'),defenderCards:cards('B'),attackerPower:powers[0],defenderPower:powers[1],cityWeapons:{A:aCity?.weapon||null,B:dCity?.weapon||null},cityArmors:{A:aCity?.armor||null,B:dCity?.armor||null},attackerCharacterBonus:{pvp:0},defenderCharacterBonus:{pvp:0},attackerNickname:attacker.nickname,defenderNickname:defender.nickname,opponent:{id:defender.id,nickname:defender.nickname},mode:'PVP',sceneAssetKey:'JOKGAK_CITY',battleEngine:{active:true}};
}

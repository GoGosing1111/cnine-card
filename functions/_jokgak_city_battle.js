import {releasedMercenarySnapshot} from './_mercenary_account.js';
import {buildMercenaryFighter} from './_mercenary_combat.js';
import {applyTypeStacking,buildFighter,publicFighter,simulateBattleV2Preview,resolvePvpOutcome,teamSummary} from './_battle_v2_preview.js';
import {defaultCityArsenal} from '../shared/jokgak-city-expansion-v1.mjs';

// Only the city uses these transient teams; account loadouts stay unchanged.
export function buildCityTeam(cards,mercenary,side,power,basePower=100000){
  const count=5+(mercenary?1:0),unit=Math.floor(power/count),baseUnit=Math.floor(basePower/count);
  const normalized=applyTypeStacking(cards.map((c,i)=>({id:String(c.id),name:c.name,title:c.title,image:c.image||c.image_url,focus_x:c.focus_x,focus_y:c.focus_y,rarity:c.rarity,
    power:i===count-1?power-unit*i:unit,type:c.uniqueAbility?.dominantType||c.power_type||c.type||'NONE',breakthrough_level:0})));
  const fighters=normalized.map((card,i)=>{
    const fighter=buildFighter(card,i,side,null,'PVP');
    fighter.speed=buildFighter({...card,power:baseUnit},i,side,null,'PVP').speed;
    return fighter;
  });
  if(mercenary){
    const fighter=buildMercenaryFighter(mercenary,side,'PVP',buildFighter),p=power-unit*5;
    const base=buildFighter({id:mercenary.code,type:'NONE',power:p},5,side,null,'PVP');
    Object.assign(fighter,{statMode:'CITY_NORMALIZED',mercenaryLink:null,power:p,basePower:p,level:1,equipmentShare:0,maxHp:base.maxHp,hp:base.maxHp,attack:base.attack,defense:base.defense,speed:buildFighter({id:mercenary.code,type:'NONE',power:baseUnit},5,side,null,'PVP').speed,shield:0,maxShield:0,uniqueAdvancement:null,iconRole:null});
    fighter.mercenaryLevel=null;fighter.mercenaryLevelApplied=false;
    fighter.stats={hp:fighter.maxHp,attack:fighter.attack,defense:fighter.defense,speed:fighter.speed};fighters.push(fighter);
  }
  return fighters;
}
export function createCityBattle({attackerCards,defenderCards,attackerMercenary=null,defenderMercenary=null,attackerPower,defenderPower,basePower=100000,seed=1,singleHealerBonus={}}){
  const A=buildCityTeam(attackerCards,attackerMercenary,'A',attackerPower,basePower),B=buildCityTeam(defenderCards,defenderMercenary,'B',defenderPower,basePower);
  const simulated=simulateBattleV2Preview({teamA:A,teamB:B,seed,maxActions:83,suddenDeathAfter:64,healerPenalty:true,singleHealerBonus,petMode:'PVP'}),result=resolvePvpOutcome(simulated,A,B);
  result.final={...result.final,mercenaries:{A:result.final.A.filter(c=>c.isMercenary),B:result.final.B.filter(c=>c.isMercenary)},A:result.final.A.filter(c=>!c.isMercenary),B:result.final.B.filter(c=>!c.isMercenary)};
  return {schemaVersion:2,engine:'BATTLE_ENGINE_V2_PVP',playbackSpeed:1.3,seed,rules:{hpMode:'CITY_WEAPON_NORMALIZED',formation:'FRONT_2_BACK_3',actionMode:'SPEED_GAUGE',maxActions:83,suddenDeathAfter:64,cityNormalizationVersion:1,accountGrowthApplied:false,basePower,weaponPower:{A:attackerPower,B:defenderPower}},
    teams:Object.fromEntries([['A',A],['B',B]].map(([side,team])=>{const opening=simulated.openingTeams?.[side]||team.map(publicFighter);return [side,{summary:teamSummary(opening),cards:opening.filter(c=>!c.isMercenary),mercenaries:simulated.openingMercenaries?.[side]||opening.filter(c=>c.isMercenary)}];})),result};
}
export async function prepareCityBattle(env,deps,attacker,defender,{attacker:aCity,defender:dCity,policy}={}){
  const [battle,aDeck,dDeck]=await Promise.all([deps.battleSettings(env),deps.pvpDeckSnapshot(env,attacker.id),deps.pvpDeckSnapshot(env,defender.id,true)]);
  if([aDeck,dDeck].some(deck=>deck.length!==5||new Set(deck.map(c=>String(c.id))).size!==5))throw Object.assign(Error('양쪽 모두 PVP 덱에 일반 카드 5장이 필요합니다.'),{status:409,code:'CITY_DECK'});
  const users=[attacker,defender],decks=[aDeck,dDeck];
  const [unique,mercenaries]=await Promise.all([deps.cardUniqueDeckStates(env,users.map((user,i)=>({user,cards:decks[i]})),'PVP'),Promise.all(users.map(user=>releasedMercenarySnapshot(env,user,'PVP')))]);
  const cards=decks.map((deck,i)=>{const byId=new Map((unique[i]?.cards||[]).map(c=>[String(c.id),c]));return deck.map(c=>({...c,uniqueAbility:byId.get(String(c.id))?.uniqueAbility||c.uniqueAbility||null}));});
  const cfg=policy?.arsenal||defaultCityArsenal(),powers=[aCity?.cityPower||cfg.basePower,dCity?.cityPower||cfg.basePower],seed=crypto.getRandomValues(new Uint32Array(1))[0];
  const battleV2=createCityBattle({attackerCards:cards[0],defenderCards:cards[1],attackerMercenary:mercenaries[0],defenderMercenary:mercenaries[1],attackerPower:powers[0],defenderPower:powers[1],basePower:cfg.basePower,seed,singleHealerBonus:battle?.engine?.singleHealerBonus});
  return {battleV2,battleSeed:seed,attackerCards:cards[0].map((c,i)=>({...c,power:battleV2.teams.A.cards[i].power})),defenderCards:cards[1].map((c,i)=>({...c,power:battleV2.teams.B.cards[i].power})),attackerPower:powers[0],defenderPower:powers[1],cityWeapons:{A:aCity?.weapon||null,B:dCity?.weapon||null},attackerCharacterBonus:{pvp:0},defenderCharacterBonus:{pvp:0},attackerNickname:attacker.nickname,defenderNickname:defender.nickname,opponent:{id:defender.id,nickname:defender.nickname},mode:'PVP',sceneAssetKey:'JOKGAK_CITY',battleEngine:{active:true}};
}

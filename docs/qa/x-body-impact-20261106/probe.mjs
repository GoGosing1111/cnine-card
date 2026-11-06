import {simulateBattleV2Preview,buildBattleSuitFighter,buildFighter,buildMonsterFighter,createPvpBattleV2} from '../../../functions/_battle_v2_preview.js';
export const codes=['BATTLE_SUIT_H_BODY','BATTLE_SUIT_S_BODY','BATTLE_SUIT_Z_BODY','BATTLE_SUIT_OVERLORD','BATTLE_SUIT_SX'];
export const chips=['SKILL_CHIP_ROCKET_LAUNCHER','SKILL_CHIP_HELICOPTER_AIRSTRIKE','SKILL_CHIP_OCTA_SEEKER'];
export function input({code='BATTLE_SUIT_X_BODY',apocalypse=false,power=50000000,seed=27,pvpActor=false,skillChips=chips}={}){
 const teamA=Array.from({length:5},(_,i)=>({...buildFighter({id:String(i+1),power:1000000,power_type:'NONE'},i,'A',null,'PVE'),attack:1,hp:1e12,maxHp:1e12,shield:0,maxShield:0,speed:75}));
 const suit=buildBattleSuitFighter({code,pvePower:power,weaponCode:'EQ_1788486929132',skillChips});
 if(suit){if(pvpActor)suit.battleMode='PVP';teamA.push(suit);}
 const monster={...buildMonsterFighter({id:1,name:'fixed target',battle_power:4400000000,is_boss:1}),attack:1,hp:1e12,maxHp:1e12,shield:2e11,maxShield:2e11,defense:2044350000,speed:75,isApocalypse:apocalypse,battleSuitSkillDefensePercent:apocalypse?50:0};
 return {teamA,teamB:[monster],seed,maxActions:1000,maxCombatDurationMs:65000,forcedMonsterEvery:12};
}
export const run=options=>simulateBattleV2Preview(input(options));
export function pvp(){const cards=Array.from({length:5},(_,i)=>({id:String(i+1),power:1000000,power_type:['HP','DEFENSE','ATTACK','SPEED','ATTACK'][i]}));return createPvpBattleV2({attackerCards:cards,defenderCards:cards,seed:27});}

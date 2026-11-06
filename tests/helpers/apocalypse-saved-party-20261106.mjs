// Rehydrate a saved public opening snapshot without applying its buffs twice.
// Outcome/action count and bounded residual differences are checked first.
import {simulateBattleV2Preview,buildMonsterFighter} from '../../functions/_battle_v2_preview.js';
import {buildApocalypseLegion} from '../../functions/_apocalypse_legion.js';
import {pveDifficultyRuntime} from '../../functions/_pve_nightmare.js';
export function savedBattleInput(sample){
 const init=x=>({...structuredClone(x),alive:true,actions:0,damageDealt:0,healingDone:0,emergencyUsed:false,survivalUsed:false,indomitableUsed:false,frontlineAnnounced:false});
 const teamA=[...sample.teams.A.cards,...sample.teams.A.mercenaries,...sample.teams.A.supports].map(init),teamB=sample.teams.B.cards.map(init);
 for(const team of [teamA,teamB]){
  const members=team.filter(a=>!a.isBattleSuit),healers=members.filter(a=>a.type==='HP').length;
  const curve=[.7,.4,.25,.15,.1][Math.min(4,healers-1)]||0;
  const percent=sample.rules.singleHealerBonus?.enabled===false?0:(sample.rules.singleHealerBonus?.teamHpPercent??8)*curve/100;
  const kinds=new Set(members.filter(a=>['ATTACK','DEFENSE','HP','SPEED'].includes(a.type)).map(a=>a.type)).size;
  const variety=[0,0,.04,.09,.15][kinds]||0;
  for(const a of members){a.hp=a.maxHp=Math.round(Math.round(a.maxHp/(1+percent))/(1+variety));a.attack=Math.round(a.attack/(1+variety));}
  const cards=members.filter(a=>!a.isMercenary),guards=cards.filter(a=>a.type==='DEFENSE');
  const share=Math.round(guards.reduce((sum,a,i)=>sum+a.maxHp*.4*([1,.6,.35,.2,.12][Math.min(4,i)]),0)*2.6/Math.max(1,cards.length));
  for(const a of cards){a.shield-=share;a.maxShield-=share;}
 }
 return {teamA,teamB,seed:sample.seed,maxActions:sample.rules.maxActions,maxDuration:sample.rules.maxDuration,forcedMonsterEvery:sample.rules.forcedMonsterEvery,healerPenalty:true,singleHealerBonus:sample.rules.singleHealerBonus,bossUltimateCapPercent:sample.rules.bossUltimateCapPercent,openingPlayerUltimateDamage:sample.openingUltimate};
}
export function replaySavedBattle(sample,{boss,profile,seed=sample.seed}={}){
 const input=savedBattleInput(sample);input.seed=seed;
 if(boss){const r=pveDifficultyRuntime({apocalypse:{enabled:true,monsterProfiles:{[boss.monsterId]:profile}}},{id:boss.monsterId,name:boss.name,pve_tab:'APOCALYPSE',is_boss:1,image_url:boss.sourceArt});input.teamB=buildApocalypseLegion(r.engineMonster,buildMonsterFighter);}
 return simulateBattleV2Preview(input);
}
export function savedFinalSignature(result){return [...result.final.A,...result.final.B].filter(a=>!a.isBattleSuit).map(a=>({id:a.id,hp:a.hp,maxHp:a.maxHp,shield:a.shield,attack:a.attack,defense:a.defense})).sort((a,b)=>a.id.localeCompare(b.id));}

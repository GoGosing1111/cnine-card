import {createPveBattleV2} from './engine.mjs';
const P=120000,E=500000;
const eff=a=>({dominantType:'ATTACK',attackPercent:a,defensePercent:0,hpPercent:0,speedPercent:0,effectName:'t',maxActivations:1,triggerChance:100});
const deck=(a,dbl)=>Array.from({length:5},(_,i)=>({id:`c${i}`,power_type:'ATTACK',power:dbl?Math.round(P*(1+a/100)):P,uniqueAbility:eff(a)}));
const mon=(pw,boss)=>({id:1,name:'M',battle_power:pw,is_boss:boss?1:0});
function run(a,dbl,pw,boss,seeds=80){
  let w=0,act=0;
  for(let s=0;s<seeds;s++){
    const r=createPveBattleV2({cards:deck(a,dbl),characterBonus:E,monster:mon(pw,boss),seed:1000+s*7919});
    if(r.result.winner==='A')w++;act+=(r.result.timeline||[]).filter(e=>e.type==='TURN').length;
  }
  return {wr:w/seeds*100,act:act/seeds};
}
console.log('=== S0: PVE 이중 적용 제거 영향 (공격 고유효과, 카드 12만x5 + 장비 50만) ===\n');
for(const boss of [false,true]){
 console.log(`--- ${boss?'보스':'일반 몬스터'} ---`);
 console.log('고유%   몬스터전투력    현행(이중) 승률/행동     S0(단일) 승률/행동     차이');
 for(const a of [0,20,40,80]){
  for(const pw of [600000,900000,1200000,1600000]){
   const d=run(a,true,pw,boss),s=run(a,false,pw,boss);
   console.log(`${String(a).padStart(4)}%  ${String(pw).padStart(9)}      ${d.wr.toFixed(0).padStart(5)}% /${d.act.toFixed(0).padStart(4)}        ${s.wr.toFixed(0).padStart(5)}% /${s.act.toFixed(0).padStart(4)}       ${(s.wr-d.wr).toFixed(0).padStart(5)}%p`);
  }
 }
 console.log('');
}

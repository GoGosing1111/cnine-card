import {createPveBattleV2} from './engine.mjs';
const P=120000,E=500000;
const eff=(t,v)=>{const e={dominantType:t,attackPercent:0,defensePercent:0,hpPercent:0,speedPercent:0,maxActivations:1,triggerChance:100};
  e[{ATTACK:'attackPercent',DEFENSE:'defensePercent',HP:'hpPercent',SPEED:'speedPercent'}[t]]=v;return e};
// BEFORE: 패시브가 card.power 에 이미 곱해진 상태로 엔진에 들어감(공격형만 power 를 바꾼다)
// AFTER : 원본 power + uniqueAbility
const deck=(t,v,before)=>Array.from({length:5},(_,i)=>({id:'c'+i,power_type:t,
  power: before && t==='ATTACK' ? Math.round(P*(1+v/100)) : P, uniqueAbility:eff(t,v)}));
const run=(t,v,before,pw,boss,seeds=60)=>{let w=0,act=0;
  for(let s=0;s<seeds;s++){const r=createPveBattleV2({cards:deck(t,v,before),characterBonus:E,monster:{id:1,battle_power:pw,is_boss:boss?1:0},seed:1000+s*7919});
    if(r.result.winner==='A')w++;act+=(r.result.timeline||[]).filter(e=>e.type==='TURN').length}
  return {wr:w/seeds*100,act:act/seeds}};
console.log('=== S0 검증: 이중 적용 제거 전/후 (PVE, 카드 12만x5 + 장비 50만, 조합당 60시드) ===\n');
let flips=0,rows=0,maxLen=0;
for(const boss of [false,true]){
  console.log(`--- ${boss?'보스':'일반'} ---`);
  console.log('계열     고유%   몬스터      전(승률/행동)   후(승률/행동)   승패차  길이변화');
  for(const t of ['ATTACK','DEFENSE','HP','SPEED']){
    for(const v of [20,40,80]){
      for(const pw of [600000,1200000,2000000]){
        const b=run(t,v,true,pw,boss), a=run(t,v,false,pw,boss);
        const d=a.wr-b.wr, len=(a.act/b.act-1)*100; rows++; if(Math.abs(d)>0.01)flips++; maxLen=Math.max(maxLen,len);
        if(t==='ATTACK'&&pw===1200000) console.log(`${t.padEnd(8)} ${String(v).padStart(4)}%  ${String(pw/10000).padStart(4)}만    ${b.wr.toFixed(0).padStart(4)}% /${b.act.toFixed(0).padStart(4)}     ${a.wr.toFixed(0).padStart(4)}% /${a.act.toFixed(0).padStart(4)}     ${d.toFixed(0).padStart(4)}%p   ${(len>0?'+':'')}${len.toFixed(0)}%`);
      }}}
  console.log('');
}
console.log(`전체 ${rows}개 조합 중 승패가 달라진 조합: ${flips}개`);
console.log(`전투 길이 최대 증가: +${maxLen.toFixed(0)}%`);

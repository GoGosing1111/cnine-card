const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const KOR={ATTACK:'공',DEFENSE:'방',SPEED:'속',HP:'힐'};
const comps=[];(function g(i,l,c){if(i===4){if(l===0)comps.push(Object.fromEntries(c));return}for(let k=l;k>=0;k--){c.push([T[i],k]);g(i+1,l-k,c);c.pop()}})(0,5,[]);
const ORDER=['DEFENSE','HP','ATTACK','SPEED'];
const build=m=>{const o=[];for(const t of ORDER)for(let i=0;i<(m[t]||0);i++)o.push(t);return o.map((t,i)=>({id:`${t}${i}`,power_type:t,power:P}))};
const nm=m=>ORDER.filter(t=>m[t]>0).map(t=>KOR[t].repeat(m[t])).join('');
const decks=comps.map(m=>({m,name:nm(m),cards:build(m)}));
const METAI=decks.findIndex(d=>d.m.HP===1&&d.m.DEFENSE===2&&d.m.ATTACK===1&&d.m.SPEED===1);
const NONE={hp:.40,attack:.28,defense:.18,speed:.14,label:'균형형'};
async function league(tun,S=20){globalThis.__T=tun;
  const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
  const win=(a,b)=>{let w=0;for(let s=0;s<S;s++){const r=createPvpBattleV2({attackerCards:a.cards,defenderCards:b.cards,attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++}return w/S*100};
  const sc=decks.map(()=>0);
  for(let i=0;i<decks.length;i++)for(let j=0;j<decks.length;j++)if(i!==j)sc[i]+=win(decks[i],decks[j]);
  const avg=sc.map(x=>x/(decks.length-1));
  const rank=decks.map((d,i)=>({name:d.name,avg:avg[i],m:d.m})).sort((a,b)=>b.avg-a.avg);
  return {rank,meta:avg[METAI],viable:rank.filter(r=>r.avg>=45&&r.avg<=65).length,spread:rank[0].avg-rank[55].avg,
    mono:rank.slice(0,10).filter(r=>Math.max(...T.map(t=>r.m[t]||0))>=3).length};
}
const mkPROF=sp=>({ATTACK:{hp:.37,attack:.34,defense:.15,speed:.14},DEFENSE:{hp:.40,attack:.25,defense:.25,speed:.10},
  HP:{hp:.44,attack:.27,defense:.17,speed:.12},SPEED:{hp:.38,attack:.27,defense:.15,speed:sp},NONE});
const base=sp=>({defCurve:'POWER',defK:0.9,profiles:mkPROF(sp),surviveHp:0.42,surviveMaxHealers:6,emergencyHp:0.30,
  counterChance:0.45,counterMult:0.68,regenInSuddenDeath:0.5,regenPercent:0.055,healerPen:[0,0,25,45,62,75],
  healerBonusCurve:[1,0.65,0.4,0.25,0.15],stackCurve:[1,0.72,0.45,0.28,0.28]});
const show=(r,l)=>console.log(`${l.padEnd(30)} 힐방방공속 ${r.meta.toFixed(1).padStart(5)}%  1위 ${r.rank[0].name.padEnd(6)}${r.rank[0].avg.toFixed(1).padStart(5)}%  폭 ${r.spread.toFixed(0).padStart(3)}%p  경쟁권 ${String(r.viable).padStart(2)}  Top10 3장몰빵 ${r.mono}`);
console.log('=== 팀 총량제 추가 (56조합 리그) ===\n');
show(await league({}),'현행');
show(await league(base(.18)),'S1+L1+L3');
show(await league({...base(.18),indomTeamMax:1,surviveTeamMax:1}),'+ 부활 팀당 각 1회');
show(await league({...base(.20),indomTeamMax:1,surviveTeamMax:1}),'+ 속도 .20');
show(await league({...base(.22),indomTeamMax:1,surviveTeamMax:1}),'+ 속도 .22');
const FIN={...base(.21),indomTeamMax:1,surviveTeamMax:1};
const fin=await league(FIN,28);
console.log('\n=== 최종 후보 순위 ===');
console.log('상위 10                        하위 10');
for(let i=0;i<10;i++)console.log(`${String(i+1).padStart(3)}. ${fin.rank[i].name.padEnd(8)}${fin.rank[i].avg.toFixed(1).padStart(6)}%      ${String(47+i).padStart(3)}. ${fin.rank[46+i].name.padEnd(8)}${fin.rank[46+i].avg.toFixed(1).padStart(6)}%`);
console.log(`\n힐방방공속: ${fin.meta.toFixed(1)}% (${fin.rank.findIndex(r=>r.name==='방방힐공속')+1}위 / 56)`);
console.log(`경쟁권(45~65%) ${fin.viable}개, 순위 폭 ${fin.spread.toFixed(0)}%p`);
import fs from 'fs';fs.writeFileSync('meta-final.json',JSON.stringify({knobs:FIN,rank:fin.rank.map(r=>({name:r.name,avg:Number(r.avg.toFixed(1))}))},null,1));

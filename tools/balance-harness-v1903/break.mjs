const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const KOR={ATTACK:'공',DEFENSE:'방',SPEED:'속',HP:'힐'};
const comps=[];(function g(i,l,c){if(i===4){if(l===0)comps.push(Object.fromEntries(c));return}for(let k=l;k>=0;k--){c.push([T[i],k]);g(i+1,l-k,c);c.pop()}})(0,5,[]);
const ORDER=['DEFENSE','HP','ATTACK','SPEED'];
const build=m=>{const o=[];for(const t of ORDER)for(let i=0;i<(m[t]||0);i++)o.push(t);
  return o.map((t,i)=>({id:`${t}${i}`,power_type:t,power:P}))};
const nm=m=>ORDER.filter(t=>m[t]>0).map(t=>KOR[t].repeat(m[t])).join('');
const decks=comps.map(m=>({m,name:nm(m),cards:build(m)}));
const METAI=decks.findIndex(d=>d.m.HP===1&&d.m.DEFENSE===2&&d.m.ATTACK===1&&d.m.SPEED===1);
async function league(tun,S=20){
  globalThis.__T=tun;
  const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
  const win=(a,b)=>{let w=0;for(let s=0;s<S;s++){const r=createPvpBattleV2({attackerCards:a.cards,defenderCards:b.cards,attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++}return w/S*100};
  const sc=decks.map(()=>0);
  for(let i=0;i<decks.length;i++)for(let j=0;j<decks.length;j++)if(i!==j)sc[i]+=win(decks[i],decks[j]);
  const avg=sc.map(x=>x/(decks.length-1));
  const rank=decks.map((d,i)=>({name:d.name,avg:avg[i],m:d.m})).sort((a,b)=>b.avg-a.avg);
  const viable=rank.filter(r=>r.avg>=45&&r.avg<=65).length;
  const hp1=rank.slice(0,10).filter(r=>r.m.HP===1).length;
  const d2=rank.slice(0,10).filter(r=>r.m.DEFENSE>=2).length;
  return {rank,meta:avg[METAI],top:rank[0],viable,hp1,d2,spread:rank[0].avg-rank[rank.length-1].avg};
}
const show=(r,label)=>console.log(`${label.padEnd(28)} 힐방방공속 ${r.meta.toFixed(1).padStart(5)}%  1위 ${r.top.name.padEnd(6)}${r.top.avg.toFixed(1).padStart(5)}%  1~56위 폭 ${r.spread.toFixed(0).padStart(3)}%p  경쟁권(45~65%) ${String(r.viable).padStart(2)}개  Top10중 힐1장 ${r.hp1} 방2+ ${r.d2}`);
console.log('=== 메타 파괴 레버 (56조합 리그, 조합당 20시드) ===\n');
show(await league({}),'현행');
show(await league({healerBonusCurve:[1,0.65,0.4,0.25,0.15]}),'L1 힐보너스 연속화');
show(await league({stackCurve:[1,0.75,0.5,0.3,0.3]}),'L3 계열 중첩 체감');
show(await league({healerBonusCurve:[1,0.65,0.4,0.25,0.15],stackCurve:[1,0.75,0.5,0.3,0.3]}),'L1+L3');
show(await league({healerBonusCurve:[1,0.65,0.4,0.25,0.15],stackCurve:[1,0.7,0.42,0.25,0.25],
  healerPen:[0,0,25,45,62,75],surviveMaxHealers:6}),'L1+L3+힐페널티 완화');

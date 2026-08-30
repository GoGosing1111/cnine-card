const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const KOR={ATTACK:'공',DEFENSE:'방',SPEED:'속',HP:'힐'};
const comps=[];(function g(i,l,c){if(i===4){if(l===0)comps.push(Object.fromEntries(c));return}for(let k=l;k>=0;k--){c.push([T[i],k]);g(i+1,l-k,c);c.pop()}})(0,5,[]);
const ORDER=['DEFENSE','HP','ATTACK','SPEED'];
const build=m=>{const o=[];for(const t of ORDER)for(let i=0;i<(m[t]||0);i++)o.push(t);
  return o.map((t,i)=>({id:`${t}${i}`,power_type:t,power:P}))};
const nm=m=>ORDER.filter(t=>m[t]>0).map(t=>KOR[t].repeat(m[t])).join('');
const decks=comps.map(m=>({m,name:nm(m),cards:build(m)}));
const META=decks.find(d=>d.m.HP===1&&d.m.DEFENSE===2&&d.m.ATTACK===1&&d.m.SPEED===1);
async function league(tun,extra={},S=20){
  globalThis.__T=tun;
  const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
  const win=(a,b)=>{let w=0;for(let s=0;s<S;s++){const r=createPvpBattleV2({attackerCards:a.cards,defenderCards:b.cards,attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919,...extra});if(r.result.winner==='A')w++}return w/S*100};
  const sc=decks.map(()=>0);
  for(let i=0;i<decks.length;i++)for(let j=0;j<decks.length;j++){if(i!==j)sc[i]+=win(decks[i],decks[j])}
  const rank=decks.map((d,i)=>({name:d.name,avg:sc[i]/(decks.length-1)})).sort((a,b)=>b.avg-a.avg);
  const mi=rank.findIndex(r=>r.name===META.name);
  return {rank,metaRank:mi+1,metaAvg:rank[mi].avg,top:rank[0]};
}
const line=(r,label)=>console.log(`${label.padEnd(30)} 힐방방공속 ${r.metaRank.toString().padStart(2)}위 ${r.metaAvg.toFixed(1).padStart(5)}%   1위 ${r.top.name.padEnd(7)} ${r.top.avg.toFixed(1)}%`);
console.log('=== 힐방방공속 코어 해부 (56조합 리그, 조합당 20시드) ===\n');
line(await league({}),'현행');
line(await league({},{singleHealerBonus:{enabled:false}}),'힐 1장 보너스 OFF');
line(await league({indomitable:false}),'방어형 불굴(무료부활) OFF');
line(await league({indomitable:false},{singleHealerBonus:{enabled:false}}),'둘 다 OFF');
line(await league({counterChance:0}),'방어형 반격 OFF');
line(await league({surviveHp:0}),'생명형 생존부활 OFF');

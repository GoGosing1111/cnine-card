const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const KOR={ATTACK:'공',DEFENSE:'방',SPEED:'속',HP:'힐'};
const B=JSON.parse(await (await import('fs')).promises.readFile('B-FINAL.json','utf8')).knobs;
const S1=B;
const COMPS=[];(function g(i,l,c){if(i===4){if(l===0)COMPS.push([...c]);return}for(let n=0;n<=l;n++){c.push([T[i],n]);g(i+1,l-n,c);c.pop()}})(0,5,[]);
const ORDER=['DEFENSE','HP','ATTACK','SPEED'];
const build=sp=>{const m=Object.fromEntries(sp),o=[];for(const t of ORDER)for(let i=0;i<(m[t]||0);i++)o.push(t);
  return o.map((x,i)=>({id:x+i,power_type:x,power:P}))};
const nm=sp=>{const m=Object.fromEntries(sp);return ORDER.filter(t=>m[t]>0).map(t=>KOR[t].repeat(m[t])).join('')};
const decks=COMPS.map(c=>({c,name:nm(c),cards:build(c),kinds:c.filter(([,n])=>n>0).length}));
async function league(tun,S=22){globalThis.__T=tun;
  const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
  const win=(a,b)=>{let w=0,ac=0;for(let s=0;s<S;s++){const r=createPvpBattleV2({attackerCards:a.cards,defenderCards:b.cards,attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++;ac+=(r.result.timeline||[]).filter(e=>e.type==='TURN').length}return[w/S*100,ac/S]};
  const sc=decks.map(()=>0);let acts=0,n=0;
  for(let i=0;i<decks.length;i++)for(let j=0;j<decks.length;j++)if(i!==j){const[w,c]=win(decks[i],decks[j]);sc[i]+=w;acts+=c;n++}
  const avg=sc.map(x=>x/(decks.length-1));
  const rank=decks.map((d,i)=>({...d,avg:avg[i]})).sort((a,b)=>b.avg-a.avg);
  const mean=avg.reduce((a,b)=>a+b)/avg.length;
  return {rank,band:rank.filter(d=>Math.abs(d.avg-mean)<=10).length,act:acts/n,
    top10kinds:rank.slice(0,10).reduce((s,d)=>s+d.kinds,0)/10};
}
const cur=await league({}), fin=await league(S1);
console.log('=== 5장 조합 56개 전수 리그 ===');
console.log(`현행   1위 ${cur.rank[0].name.padEnd(6)}${cur.rank[0].avg.toFixed(0)}%   폭 ${(cur.rank[0].avg-cur.rank[55].avg).toFixed(0)}%p   경쟁밴드 ${cur.band}/56   상위10 평균 계열수 ${cur.top10kinds.toFixed(1)}   평균 ${cur.act.toFixed(0)}행동`);
console.log(`S1     1위 ${fin.rank[0].name.padEnd(6)}${fin.rank[0].avg.toFixed(0)}%   폭 ${(fin.rank[0].avg-fin.rank[55].avg).toFixed(0)}%p   경쟁밴드 ${fin.band}/56   상위10 평균 계열수 ${fin.top10kinds.toFixed(1)}   평균 ${fin.act.toFixed(0)}행동`);
console.log('\n현행 상위 10            S1 상위 10');
for(let i=0;i<10;i++)console.log(`${String(i+1).padStart(3)}. ${cur.rank[i].name.padEnd(7)}${cur.rank[i].avg.toFixed(0).padStart(4)}% (${cur.rank[i].kinds}계열)      ${fin.rank[i].name.padEnd(7)}${fin.rank[i].avg.toFixed(0).padStart(4)}% (${fin.rank[i].kinds}계열)`);
import fs from 'fs';fs.writeFileSync('S1-FINAL.json',JSON.stringify({knobs:S1,before:{top:cur.rank.slice(0,15).map(d=>({n:d.name,a:+d.avg.toFixed(1),k:d.kinds})),band:cur.band,top10kinds:cur.top10kinds},after:{top:fin.rank.map(d=>({n:d.name,a:+d.avg.toFixed(1),k:d.kinds})),band:fin.band,top10kinds:fin.top10kinds}},null,1));

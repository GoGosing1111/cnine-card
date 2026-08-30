import {createPvpBattleV2 as NEW} from './engineS1.mjs';
import {createPvpBattleV2 as OLD} from '/tmp/uv/engine.mjs';
const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const KOR={ATTACK:'공',DEFENSE:'방',SPEED:'속',HP:'힐'};
const C=[];(function g(i,l,c){if(i===4){if(l===0)C.push([...c]);return}for(let n=0;n<=l;n++){c.push([T[i],n]);g(i+1,l-n,c);c.pop()}})(0,5,[]);
const ORDER=['DEFENSE','HP','ATTACK','SPEED'];
const decks=C.map(c=>{const m=Object.fromEntries(c),o=[];
  for(const t of ORDER)for(let i=0;i<(m[t]||0);i++)o.push(t);
  return {name:ORDER.filter(t=>m[t]>0).map(t=>KOR[t].repeat(m[t])).join(''),kinds:c.filter(([,n])=>n>0).length,
    cards:o.map((x,i)=>({id:x+i,power_type:x,power:P}))}});
const run=(fn,S=22)=>{const sc=decks.map(()=>0);let acts=0,n=0;
  const win=(a,b)=>{let w=0,ac=0;for(let s=0;s<S;s++){const r=fn({attackerCards:a.cards,defenderCards:b.cards,attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++;ac+=(r.result.timeline||[]).filter(e=>e.type==='TURN').length}return[w/S*100,ac/S]};
  for(let i=0;i<decks.length;i++)for(let j=0;j<decks.length;j++)if(i!==j){const[w,c]=win(decks[i],decks[j]);sc[i]+=w;acts+=c;n++}
  const avg=sc.map(x=>x/(decks.length-1));
  const rank=decks.map((d,i)=>({...d,avg:avg[i]})).sort((a,b)=>b.avg-a.avg);
  const mean=avg.reduce((a,b)=>a+b)/avg.length;
  return {rank,band:rank.filter(d=>Math.abs(d.avg-mean)<=10).length,act:acts/n,
    k10:rank.slice(0,10).reduce((s,d)=>s+d.kinds,0)/10}};
const o=run(OLD), n=run(NEW);
console.log('=== 5장 조합 56개 전수 리그 ===');
console.log(`현행   1위 ${o.rank[0].name.padEnd(6)}${o.rank[0].avg.toFixed(0)}%(${o.rank[0].kinds}계열)  폭 ${(o.rank[0].avg-o.rank[55].avg).toFixed(0)}%p  경쟁밴드 ${o.band}/56  상위10 평균계열 ${o.k10.toFixed(1)}  ${o.act.toFixed(0)}행동`);
console.log(`S1     1위 ${n.rank[0].name.padEnd(6)}${n.rank[0].avg.toFixed(0)}%(${n.rank[0].kinds}계열)  폭 ${(n.rank[0].avg-n.rank[55].avg).toFixed(0)}%p  경쟁밴드 ${n.band}/56  상위10 평균계열 ${n.k10.toFixed(1)}  ${n.act.toFixed(0)}행동`);
console.log('\n현행 상위 10              S1 상위 10');
for(let i=0;i<10;i++)console.log(`${String(i+1).padStart(3)}. ${o.rank[i].name.padEnd(7)}${o.rank[i].avg.toFixed(0).padStart(4)}% (${o.rank[i].kinds}계열)      ${n.rank[i].name.padEnd(7)}${n.rank[i].avg.toFixed(0).padStart(4)}% (${n.rank[i].kinds}계열)`);
import fs from 'fs';fs.writeFileSync('S1-ENGINE-RESULT.json',JSON.stringify({before:{band:o.band,k10:o.k10,act:o.act,top:o.rank.slice(0,15).map(d=>({n:d.name,a:+d.avg.toFixed(1),k:d.kinds}))},after:{band:n.band,k10:n.k10,act:n.act,top:n.rank.map(d=>({n:d.name,a:+d.avg.toFixed(1),k:d.kinds}))}},null,1));

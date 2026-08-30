import {createPvpBattleV2} from './engine.mjs';
const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const KOR={ATTACK:'공',DEFENSE:'방',SPEED:'속',HP:'힐'};
// 56개 조합 생성
const comps=[];
(function gen(i,left,cur){ if(i===4){ if(left===0)comps.push([...cur]); return;} for(let k=left;k>=0;k--){cur.push([T[i],k]);gen(i+1,left-k,cur);cur.pop();} })(0,5,[]);
// 배치: 방어·생명 앞줄 우선 (FRONT_2_BACK_3)
const ORDER=['DEFENSE','HP','ATTACK','SPEED'];
const build=c=>{const m=Object.fromEntries(c);const out=[];
  for(const t of ORDER)for(let i=0;i<(m[t]||0);i++)out.push(t);
  return out.map((t,i)=>({id:`${t}${i}`,power_type:t,power:P}));};
const name=c=>c.filter(([,n])=>n>0).map(([t,n])=>KOR[t].repeat(n)).join('');
const decks=comps.map(c=>({c,name:name(c),cards:build(c)}));
const S=24;
const win=(a,b)=>{let w=0;for(let s=0;s<S;s++){const r=createPvpBattleV2({attackerCards:a.cards,defenderCards:b.cards,attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++}return w/S*100};
const score=decks.map(()=>0);
for(let i=0;i<decks.length;i++)for(let j=0;j<decks.length;j++){
  if(i===j)continue; score[i]+=win(decks[i],decks[j]);
}
const rank=decks.map((d,i)=>({...d,avg:score[i]/(decks.length-1)})).sort((a,b)=>b.avg-a.avg);
console.log('=== [현행 v1902] 5장 조합 전수 리그 (56조합, 조합당 24시드, 총 '+(56*55*24).toLocaleString()+'판) ===\n');
console.log('순위  조합       공격시 평균승률');
rank.slice(0,12).forEach((d,i)=>console.log(`${String(i+1).padStart(3)}.  ${d.name.padEnd(9)} ${d.avg.toFixed(1).padStart(6)}%`));
console.log('  ...');
rank.slice(-6).forEach((d,i)=>console.log(`${String(56-5+i).padStart(3)}.  ${d.name.padEnd(9)} ${d.avg.toFixed(1).padStart(6)}%`));
const meta=rank.find(d=>d.name==='방방힐공속'||d.name==='방방힐속공');
console.log('\n힐방방공속(=방방힐공속) 순위:', rank.findIndex(d=>d.name.includes('방방힐'))+1, '위', meta?meta.avg.toFixed(1)+'%':'');
import fs from 'fs';fs.writeFileSync('meta-rank.json',JSON.stringify(rank.map(d=>({name:d.name,avg:d.avg})),null,1));

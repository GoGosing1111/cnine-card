const P=120000,E=500000,T4=['ATTACK','DEFENSE','SPEED','HP'];
const mk=t=>Array(5).fill(0).map((_,i)=>({id:`${t}${i}`,power_type:t,power:P}));
const NONE={hp:.40,attack:.28,defense:.18,speed:.14,label:'균형형'};
const PROF={ATTACK:{hp:.37,attack:.34,defense:.15,speed:.14},DEFENSE:{hp:.40,attack:.25,defense:.25,speed:.10},
  HP:{hp:.44,attack:.27,defense:.17,speed:.12},SPEED:{hp:.39,attack:.27,defense:.16,speed:.18},NONE};
async function ev(extra,seeds=150){globalThis.__T={defCurve:'POWER',defK:0.9,profiles:PROF,...extra};
  const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
  const rate=(a,b)=>{let w=0;for(let s=0;s<seeds;s++){const r=createPvpBattleV2({attackerCards:mk(a),defenderCards:mk(b),attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++}return w/seeds*100};
  const m={};for(const a of T4){m[a]={};for(const b of T4)m[a][b]=rate(a,b)}return m}
const KO=t=>({surviveHp:t,surviveMaxHealers:6,emergencyHp:0.30,counterChance:0.45,counterMult:0.68,regenInSuddenDeath:0.5,regenPercent:0.055});
console.log('부활량 스윕                            공격  방어  속도  생명   편차');
let best=null;
for(const s of [0.30,0.34,0.38,0.42]){
  const m=await ev(KO(s));const avg=t=>T4.reduce((x,b)=>x+m[t][b],0)/4;const v=T4.map(avg);
  const sp=Math.max(...v)-Math.min(...v);
  console.log(`  부활 ${(s*100).toFixed(0)}%                              ${v.map(x=>x.toFixed(0).padStart(6)).join('')}  ${sp.toFixed(0).padStart(4)}`);
  if(!best||sp<best.sp)best={s,sp,m};
}
const m=best.m;
console.log(`\n=== 최종 후보 (부활 ${(best.s*100).toFixed(0)}%) 매치업 표 ===`);
console.log('  공격측\\수비측 '+T4.map(t=>t.slice(0,3).padStart(8)).join('')+'    평균');
for(const a of T4)console.log('  '+a.padEnd(12)+T4.map(b=>m[a][b].toFixed(0).padStart(8)).join('')+(T4.reduce((s,b)=>s+m[a][b],0)/4).toFixed(0).padStart(9));
import fs from 'fs';fs.writeFileSync('final-tuning.json',JSON.stringify({profiles:PROF,knobs:KO(best.s),matchup:m},null,1));
console.log('\n저장: final-tuning.json');

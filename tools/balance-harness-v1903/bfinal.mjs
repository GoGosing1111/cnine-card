const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const KOR={ATTACK:'공격',DEFENSE:'방어',SPEED:'속도',HP:'생명'};
const N={hp:.40,attack:.28,defense:.18,speed:.14};
const prof=(hpK,spdK)=>({NONE:{...N,label:'균형형'},
  ATTACK :{hp:.400,attack:.350,defense:.110,speed:.140},
  DEFENSE:{hp:.400,attack:.210,defense:.250,speed:.140},
  SPEED  :{hp:Number((1-(0.28-spdK)-0.18-(0.14+spdK)).toFixed(3)),attack:Number((0.28-spdK).toFixed(3)),defense:.180,speed:Number((0.14+spdK).toFixed(3))},
  HP     :{hp:Number((0.40+hpK).toFixed(3)),attack:.280,defense:.180,speed:Number((0.14-hpK).toFixed(3))}});
const deck=(t,n)=>{const o=Array(n).fill(t);while(o.length<5)o.push('NONE');return o.map((x,i)=>({id:x+i,power_type:x==='NONE'?'':x,power:P}))};
const B=o=>({defCurve:'POWER',defK:0.9,defCap:0.65,speedBaseK:0.012,capPercent:0.60,
  surviveMaxHealers:6,counterChance:0.20,counterMult:0.60,guardProtect:false,
  regenInSuddenDeath:0.5,healerPen:[0,0,35,55,68,78],healerBonusCurve:[0.7,0.4,0.25,0.15,0.1],
  stackCurve:[1,0.72,0.45,0.28,0.28],indomitable:false,guardShieldPct:0.40,counterNeedsShield:true,
  speedShieldBonus:1.0,surviveTeamMax:1,surviveHp:0,executePvp:1.30,penAttackPvp:0.42,
  attackSealRevive:1,speedChaseGauge:70,speedChaseUses:3,chainGauge:45,chainUses:2,
  varietyBonus:[0,0,0.04,0.09,0.15],healPoolPct:0.65,regenPercent:0.07,emergencyHp:0.30,...o});
async function ev(tun,S=110){globalThis.__T=tun;
  const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
  const win=(a,b)=>{let w=0;for(let s=0;s<S;s++){const r=createPvpBattleV2({attackerCards:deck(a,2),defenderCards:deck(b,2),attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++}return w/S*100};
  const m={},avg={};for(const a of T){m[a]={};for(const b of T)m[a][b]=win(a,b)}
  for(const t of T)avg[t]=T.reduce((s,b)=>s+m[t][b],0)/4;
  const v=T.map(t=>avg[t]);return {m,avg,gap:Math.max(...v)-Math.min(...v)}}
const show=(r,l)=>console.log(`${l.padEnd(34)}${T.map(t=>r.avg[t].toFixed(0).padStart(6)).join('')}   격차 ${r.gap.toFixed(0).padStart(3)}%p`);
console.log('설정                               공격  방어  속도  생명   격차');
let best=null;
for(const hpK of [0.07,0.05,0.03,0.01]) for(const spdK of [0.085,0.10]){
  const t=B({profiles:prof(hpK,spdK)});
  const r=await ev(t);
  show(r,`생명 HP특화 ${hpK} / 속도 특화 ${spdK}`);
  if(!best||r.gap<best.r.gap)best={r,t,hpK,spdK};
}
const r=best.r;
console.log(`\n=== 최종: 생명 HP특화 ${best.hpK} / 속도 특화 ${best.spdK} · 격차 ${r.gap.toFixed(0)}%p ===`);
console.log('  공격측\\수비측 '+T.map(t=>KOR[t].padStart(7)).join('')+'    평균');
for(const a of T)console.log('  '+KOR[a].padEnd(11)+T.map(b=>r.m[a][b].toFixed(0).padStart(7)).join('')+r.avg[a].toFixed(0).padStart(9));
const p=best.t.profiles;
console.log('\n확정 프로필      HP    공격   방어   속도');
for(const t of T)console.log(`${KOR[t].padEnd(12)}${p[t].hp.toFixed(3)} ${p[t].attack.toFixed(3)} ${p[t].defense.toFixed(3)} ${p[t].speed.toFixed(3)}`);
console.log(`${'균형형'.padEnd(12)}${N.hp.toFixed(3)} ${N.attack.toFixed(3)} ${N.defense.toFixed(3)} ${N.speed.toFixed(3)}`);
import fs from 'fs';fs.writeFileSync('B-FINAL.json',JSON.stringify({knobs:best.t,matchup:r.m,avg:r.avg,gap:r.gap},null,1));

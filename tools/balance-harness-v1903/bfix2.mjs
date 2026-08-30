const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const N={hp:.40,attack:.28,defense:.18,speed:.14};
const D={ATTACK:{attack:+1,defense:-1},DEFENSE:{defense:+1,attack:-1},SPEED:{speed:+1,attack:-1},HP:{hp:+1,speed:-1}};
const mk=(k=0.07,spd=null)=>{const p={NONE:{...N,label:'균형형'}};
  for(const t of T){const o={...N};for(const [s,d] of Object.entries(D[t]))o[s]=Number((o[s]+d*k).toFixed(3));p[t]=o}
  if(spd){p.SPEED={attack:Number((0.28-spd).toFixed(3)),defense:0.18,speed:Number((0.14+spd).toFixed(3))};
    p.SPEED.hp=Number((1-p.SPEED.attack-p.SPEED.defense-p.SPEED.speed).toFixed(3))}
  return p};
const deck=(t,n)=>{const o=Array(n).fill(t);while(o.length<5)o.push('NONE');return o.map((x,i)=>({id:x+i,power_type:x==='NONE'?'':x,power:P}))};
const B=o=>({defCurve:'POWER',defK:0.9,defCap:0.65,speedBaseK:0.012,capPercent:0.60,profiles:mk(0.07,0.085),
  surviveMaxHealers:6,counterChance:0.20,counterMult:0.60,guardProtect:false,
  regenInSuddenDeath:0.5,healerPen:[0,0,35,55,68,78],
  healerBonusCurve:[0.7,0.4,0.25,0.15,0.1],stackCurve:[1,0.72,0.45,0.28,0.28],
  indomitable:false,guardShieldPct:0.40,counterNeedsShield:true,speedShieldBonus:1.0,
  surviveTeamMax:1,executePvp:1.30,penAttackPvp:0.42,
  attackSealRevive:1,speedChaseGauge:70,speedChaseUses:3,chainGauge:45,chainUses:2,
  varietyBonus:[0,0,0.04,0.09,0.15],surviveHp:0.12,emergencyHp:0.24,regenPercent:0.05,...o});
async function ev(tun,S=90){globalThis.__T=tun;
  const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
  const win=(a,b)=>{let w=0;for(let s=0;s<S;s++){const r=createPvpBattleV2({attackerCards:deck(a,2),defenderCards:deck(b,2),attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++}return w/S*100};
  const m={},avg={};for(const a of T){m[a]={};for(const b of T)m[a][b]=win(a,b)}
  for(const t of T)avg[t]=T.reduce((s,b)=>s+m[t][b],0)/4;
  const v=T.map(t=>avg[t]);return {m,avg,gap:Math.max(...v)-Math.min(...v)}}
const show=(r,l)=>console.log(`${l.padEnd(38)}${T.map(t=>r.avg[t].toFixed(0).padStart(6)).join('')}   격차 ${r.gap.toFixed(0).padStart(3)}%p`);
console.log('설정                                     공격  방어  속도  생명   격차');
show(await ev(B({})),'B2 (회복 무제한)');
let best=null;
for(const hp of [1.2,0.9,0.65,0.45]){
  const t=B({healPoolPct:hp,regenPercent:0.07,emergencyHp:0.30});
  const r=await ev(t); show(r,`회복 총량 = 생명형 최대HP의 ${(hp*100).toFixed(0)}%`);
  if(!best||r.gap<best.r.gap)best={r,t};
}
for(const [hp,gs] of [[0.65,0.34],[0.65,0.46],[0.45,0.40]]){
  const t=B({healPoolPct:hp,regenPercent:0.07,emergencyHp:0.30,guardShieldPct:gs});
  const r=await ev(t); show(r,`  회복총량 ${(hp*100).toFixed(0)}% + 방벽 ${(gs*100).toFixed(0)}%`);
  if(r.gap<best.r.gap)best={r,t};
}
const r=best.r;
console.log(`\n=== 최적 ===`);
const KOR={ATTACK:'공격',DEFENSE:'방어',SPEED:'속도',HP:'생명'};
console.log('  공격측\\수비측 '+T.map(t=>KOR[t].padStart(7)).join('')+'    평균');
for(const a of T)console.log('  '+KOR[a].padEnd(11)+T.map(b=>r.m[a][b].toFixed(0).padStart(7)).join('')+r.avg[a].toFixed(0).padStart(9));
import fs from 'fs';fs.writeFileSync('B-FINAL.json',JSON.stringify({knobs:best.t,matchup:r.m,avg:r.avg,gap:r.gap},null,1));

const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const N={hp:.40,attack:.28,defense:.18,speed:.14};
const DIR={ATTACK:{attack:+1,hp:-1},DEFENSE:{defense:+1,attack:-1},SPEED:{speed:+1,attack:-1},HP:{hp:+1,speed:-1}};
const mkProf=k=>{const p={NONE:{...N,label:'균형형'}};for(const t of T){const o={...N};for(const [s,d] of Object.entries(DIR[t]))o[s]=Number((o[s]+d*k).toFixed(3));p[t]=o}return p};
const deck=spec=>{const o=[];for(const [t,n] of spec)for(let i=0;i<n;i++)o.push(t);while(o.length<5)o.push('NONE');
  return o.map((t,i)=>({id:t+i,power_type:t==='NONE'?'':t,power:P}))};
async function W(tun,S=120){globalThis.__T=tun;
  const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
  return (a,b)=>{let w=0;for(let s=0;s<S;s++){const r=createPvpBattleV2({attackerCards:a,defenderCards:b,attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++}return w/S*100}}
const CFG=o=>({defCurve:'POWER',defK:0.9,defCap:0.65,speedBaseK:0.012,profiles:mkProf(0.07),
  surviveMaxHealers:6,emergencyHp:0.24,counterChance:0.38,counterMult:0.60,regenInSuddenDeath:0.5,
  regenPercent:0.05,healerPen:[0,0,35,55,68,78],healerBonusCurve:[1,0.6,0.35,0.2,0.12],
  stackCurve:[1,0.72,0.45,0.28,0.28],indomTeamMax:1,surviveTeamMax:1,surviveHp:0.18,...o});
const B=deck([]);
console.log('=== 진단 ===');
let w=await W(CFG({}));
console.log('균형형 5장 미러 (50% 여야 정상):', w(B,B).toFixed(1)+'%');
console.log('방어 1장 vs 균형형 5장:', w(deck([['DEFENSE',1]]),B).toFixed(1)+'%');
console.log('생명 1장 vs 균형형 5장:', w(deck([['HP',1]]),B).toFixed(1)+'%');
console.log('공격 1장 vs 균형형 5장:', w(deck([['ATTACK',1]]),B).toFixed(1)+'%');
console.log('\n프로필 강도 k=0 (모든 계열 = 균형형과 동일 스탯) 일 때:');
w=await W(CFG({profiles:mkProf(0)}));
for(const t of T)console.log(`  ${t.padEnd(8)} 1장 → ${w(deck([[t,1]]),B).toFixed(1)}%   (스탯은 균형형과 완전히 같다. 차이는 계열 능력뿐)`);
console.log('\n계열 능력을 하나씩 끄면:');
const cases=[['방어형 불굴 OFF',{indomitable:false}],['힐 오라 OFF',{healerBonusCurve:[0,0,0,0,0]}],
  ['생명 부활 OFF',{surviveHp:0}],['반격 OFF',{counterChance:0}]];
for(const [lbl,o] of cases){
  const w2=await W(CFG({profiles:mkProf(0),...o}));
  console.log(`  ${lbl.padEnd(16)} 방어 ${w2(deck([['DEFENSE',1]]),B).toFixed(0).padStart(3)}%  생명 ${w2(deck([['HP',1]]),B).toFixed(0).padStart(3)}%`);
}

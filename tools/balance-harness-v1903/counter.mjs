const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const NONE={hp:.40,attack:.28,defense:.18,speed:.14,label:'균형형'};
const PROF={ATTACK:{hp:.37,attack:.34,defense:.15,speed:.14},DEFENSE:{hp:.40,attack:.25,defense:.25,speed:.10},
  HP:{hp:.44,attack:.27,defense:.17,speed:.12},SPEED:{hp:.38,attack:.27,defense:.15,speed:.21},NONE};
const FIN={defCurve:'POWER',defK:0.9,profiles:PROF,surviveHp:0.42,surviveMaxHealers:6,emergencyHp:0.30,
  counterChance:0.45,counterMult:0.68,regenInSuddenDeath:0.5,regenPercent:0.055,healerPen:[0,0,25,45,62,75],
  healerBonusCurve:[1,0.65,0.4,0.25,0.15],stackCurve:[1,0.72,0.45,0.28,0.28],indomTeamMax:1,surviveTeamMax:1};
globalThis.__T=FIN;
const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
const ORDER=['DEFENSE','HP','ATTACK','SPEED'];
const mk=(spec)=>{const o=[];for(const [t,n] of spec)for(let i=0;i<n;i++)o.push(t);
  return o.map((t,i)=>({id:`${t}${i}`,power_type:t,power:P}))};
const META=[['DEFENSE',2],['HP',1],['ATTACK',1],['SPEED',1]];   // 힐방방공속
const rate=(a,b,seal,block,S=200)=>{let w=0;for(let s=0;s<S;s++){
  const A=a.map(c=>({...c})),B=b.map(c=>({...c}));
  if(seal) B.filter(c=>['DEFENSE','HP'].includes(c.power_type)).slice(0,seal).forEach(c=>c.__seal=1);
  const r=createPvpBattleV2({attackerCards:A,defenderCards:B,attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});
  if(r.result.winner==='A')w++} return w/S*100};
console.log('=== 카운터 특성 효과 검증: 상대가 힐방방공속일 때 ===\n');
const cases=[['방힐공공속',[['DEFENSE',1],['HP',1],['ATTACK',2],['SPEED',1]]],
 ['공공공속속',[['ATTACK',3],['SPEED',2]]],['방방힐공속(미러)',META],['속속속공공',[['SPEED',3],['ATTACK',2]]]];
console.log('내 덱                 봉인 0장   봉인 1장   봉인 2장   봉인 3장');
for(const [nm,spec] of cases){
  const row=[0,1,2,3].map(n=>rate(mk(spec),mk(META),n).toFixed(1).padStart(9));
  console.log(nm.padEnd(20)+row.join(''));
}
console.log('\n(봉인 N장 = 상대 방어형/생명형 N장의 무료 부활을 무효화 = REVIVE_SEAL 특성)');

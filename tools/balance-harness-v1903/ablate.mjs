const P=120000,E=500000,TYPES=['ATTACK','DEFENSE','SPEED','HP'];
const mk=ts=>ts.map((t,i)=>({id:`c${i}`,power_type:t,power:P}));
const BAL=['ATTACK','DEFENSE','SPEED','HP','ATTACK'];
async function run(tun,label){
  globalThis.__T=tun;
  const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
  const rate=(a,b,seeds=150)=>{let w=0;for(let s=0;s<seeds;s++){const r=createPvpBattleV2({attackerCards:mk(a),defenderCards:mk(b),attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++}return w/seeds*100};
  // 계열 평균 승률 (동종 5장 vs 4계열 동종 5장)
  const avg={};
  for(const t of TYPES)avg[t]=TYPES.reduce((s,b)=>s+rate(Array(5).fill(t),Array(5).fill(b)),0)/4;
  const vals=TYPES.map(t=>avg[t]);
  const spread=Math.max(...vals)-Math.min(...vals);
  const spd1=rate([...BAL.slice(0,4),'SPEED'],BAL);
  console.log(`${label.padEnd(30)} ${TYPES.map(t=>avg[t].toFixed(0).padStart(6)).join('')}   편차 ${spread.toFixed(0).padStart(3)}%p   속도1장추가 ${spd1.toFixed(0)}%`);
}
console.log('                                  공격  방어  속도  생명');
await run({}, '[현행] 기준');
await run({dodgeSpeedBase:0.02,dodgeSpeedMax:0.02}, 'A. 회피 차등 제거');
await run({critAttack:0,critSpeed:0}, 'B. 치명타 차등 제거');
await run({penOther:0.15}, 'C. 관통 차등 완화(3%→15%)');
await run({defCurve:'POWER',defK:0.9}, 'D. 방어곡선 부활(공격력 비례)');
await run({dodgeSpeedBase:0.02,dodgeSpeedMax:0.02,critAttack:0,critSpeed:0,penOther:0.15}, 'A+B+C 전부');
await run({dodgeSpeedBase:0.02,dodgeSpeedMax:0.02,critAttack:0,critSpeed:0,penOther:0.15,defCurve:'POWER',defK:0.9}, 'A+B+C+D 전부');

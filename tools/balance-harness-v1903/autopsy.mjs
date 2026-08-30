const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const KOR={ATTACK:'공격',DEFENSE:'방어',SPEED:'속도',HP:'생명'};
const N={hp:.40,attack:.28,defense:.18,speed:.14};
const D={ATTACK:{attack:+1,defense:-1},DEFENSE:{defense:+1,attack:-1},SPEED:{speed:+1,attack:-1},HP:{hp:+1,speed:-1}};
const k=0.07,prof={NONE:{...N,label:'균형형'}};
for(const t of T){const o={...N};for(const [s,d] of Object.entries(D[t]))o[s]=Number((o[s]+d*k).toFixed(3));prof[t]=o}
const LOCK={defCurve:'POWER',defK:0.9,defCap:0.65,speedBaseK:0.012,capPercent:0.60,profiles:prof,
  surviveMaxHealers:6,emergencyHp:0.24,counterChance:0.20,counterMult:0.60,guardProtect:false,
  regenInSuddenDeath:0.5,regenPercent:0.05,healerPen:[0,0,35,55,68,78],
  healerBonusCurve:[0.7,0.4,0.25,0.15,0.1],stackCurve:[1,0.72,0.45,0.28,0.28],
  indomTeamMax:1,surviveTeamMax:1,surviveHp:0.12,executePvp:1.30,penAttackPvp:0.42,
  attackSealRevive:1,speedChaseGauge:70,speedChaseUses:3,chainGauge:45,chainUses:2};
globalThis.__T=LOCK;
const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
const deck=(t,n)=>{const o=Array(n).fill(t);while(o.length<5)o.push('NONE');return o.map((x,i)=>({id:x+i,power_type:x==='NONE'?'':x,power:P}))};
function autopsy(a,b,seeds=40){
  const ev={},dmgA=[],dmgB=[];let acts=0,winA=0;
  for(let s=0;s<seeds;s++){
    const r=createPvpBattleV2({attackerCards:deck(a,2),defenderCards:deck(b,2),attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});
    if(r.result.winner==='A')winA++;
    for(const e of (r.result.timeline||[])){
      ev[e.type]=(ev[e.type]||0)+1;
      if(e.type==='TURN'&&e.damage>0){(String(e.actorId||'').startsWith('A')?dmgA:dmgB).push(e.damage)}
      acts+=e.type==='TURN'?1:0;
    }
  }
  const avg=x=>x.length?Math.round(x.reduce((s,y)=>s+y)/x.length):0;
  return {winA:winA/seeds*100,acts:acts/seeds,ev,dmgA:avg(dmgA),dmgB:avg(dmgB),nA:dmgA.length/seeds,nB:dmgB.length/seeds};
}
for(const [a,b] of [['ATTACK','DEFENSE'],['DEFENSE','ATTACK'],['ATTACK','SPEED'],['ATTACK','HP']]){
  const r=autopsy(a,b);
  const one=createPvpBattleV2({attackerCards:deck(a,2),defenderCards:deck(b,2),attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1007});
  const cA=one.teams.A.cards[0],cB=one.teams.B.cards[0];
  console.log(`\n=== ${KOR[a]}2 vs ${KOR[b]}2 · 승률 ${r.winA.toFixed(0)}% · 평균 ${r.acts.toFixed(0)}행동 ===`);
  console.log(`  카드스탯  A(${KOR[a]}) HP ${cA.maxHp} ATK ${cA.attack} DEF ${cA.defense} SPD ${cA.speed}`);
  console.log(`            B(${KOR[b]}) HP ${cB.maxHp} ATK ${cB.attack} DEF ${cB.defense} SPD ${cB.speed}`);
  console.log(`  한 대 피해  A→B ${r.dmgA}  (B 최대HP의 ${(r.dmgA/cB.maxHp*100).toFixed(0)}%, ${(cB.maxHp/Math.max(1,r.dmgA)).toFixed(1)}대에 사망)`);
  console.log(`            B→A ${r.dmgB}  (A 최대HP의 ${(r.dmgB/cA.maxHp*100).toFixed(0)}%, ${(cA.maxHp/Math.max(1,r.dmgB)).toFixed(1)}대에 사망)`);
  console.log(`  타격 횟수  A ${r.nA.toFixed(1)}회 / B ${r.nB.toFixed(1)}회`);
  const keys=Object.keys(r.ev).filter(x=>x!=='TURN'&&x!=='RESULT'&&x!=='DEPLOY').sort((x,y)=>r.ev[y]-r.ev[x]);
  console.log('  능력 발동  '+keys.slice(0,7).map(x=>`${x} ${(r.ev[x]/40).toFixed(1)}`).join(' / '));
}

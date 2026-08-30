const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const KOR={ATTACK:'공',DEFENSE:'방',SPEED:'속',HP:'힐'};
const N={hp:.40,attack:.28,defense:.18,speed:.14};
const D={ATTACK:{attack:+1,defense:-1},DEFENSE:{defense:+1,attack:-1},SPEED:{speed:+1,attack:-1},HP:{hp:+1,speed:-1}};
const k=0.07,prof={NONE:{...N,label:'균형형'}};
for(const t of T){const o={...N};for(const [s,d] of Object.entries(D[t]))o[s]=Number((o[s]+d*k).toFixed(3));prof[t]=o}
const CFG=o=>({defCurve:'POWER',defK:0.9,defCap:0.65,speedBaseK:0.012,capPercent:0.60,profiles:prof,
  surviveMaxHealers:6,emergencyHp:0.24,counterChance:0.20,counterMult:0.60,guardProtect:false,
  regenInSuddenDeath:0.5,regenPercent:0.05,healerPen:[0,0,35,55,68,78],
  healerBonusCurve:[0.7,0.4,0.25,0.15,0.1],stackCurve:[1,0.72,0.45,0.28,0.28],
  indomTeamMax:1,surviveTeamMax:1,surviveHp:0.12,executePvp:1.30,penAttackPvp:0.42,
  attackSealRevive:1,speedChaseGauge:70,speedChaseUses:3,chainGauge:45,chainUses:2,...o});
// 실전 조합 공간: 고유효과 카드 0~5장을 4계열로 배분 (나머지는 균형형)
const COMPS=[];
(function g(i,left,cur){ if(i===4){if(left===0)COMPS.push([...cur]);return}
  for(let n=0;n<=left;n++){cur.push([T[i],n]);g(i+1,left-n,cur);cur.pop()} })(0,5,[]);
const ORDER=['DEFENSE','HP','ATTACK','SPEED'];
const build=spec=>{const m=Object.fromEntries(spec),o=[];
  for(const t of ORDER)for(let i=0;i<(m[t]||0);i++)o.push(t);
  while(o.length<5)o.push('NONE');
  return o.map((x,i)=>({id:x+i,power_type:x==='NONE'?'':x,power:P}))};
const nm=spec=>{const m=Object.fromEntries(spec);const s=ORDER.filter(t=>m[t]>0).map(t=>KOR[t].repeat(m[t])).join('');
  const u=Object.values(m).reduce((a,b)=>a+b,0);return (s||'없음')+(u<5?'+일반'+(5-u):'')};
const decks=COMPS.map(c=>({c,name:nm(c),cards:build(c),n:Object.values(Object.fromEntries(c)).reduce((a,b)=>a+b,0)}));
async function league(tun,S=14){globalThis.__T=tun;
  const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
  const win=(a,b)=>{let w=0;for(let s=0;s<S;s++){const r=createPvpBattleV2({attackerCards:a.cards,defenderCards:b.cards,attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++}return w/S*100};
  const sc=decks.map(()=>0);
  for(let i=0;i<decks.length;i++)for(let j=0;j<decks.length;j++)if(i!==j)sc[i]+=win(decks[i],decks[j]);
  const avg=sc.map(x=>x/(decks.length-1));
  const rank=decks.map((d,i)=>({...d,avg:avg[i]})).sort((a,b)=>b.avg-a.avg);
  // 고유효과 5장 다 쓴 조합만 = 실제 경쟁 구간
  const full=rank.filter(d=>d.n===5);
  return {rank,full,fullSpread:full[0].avg-full[full.length-1].avg,
    band:full.filter(d=>Math.abs(d.avg-full.reduce((s,x)=>s+x.avg,0)/full.length)<=10).length,
    fullN:full.length};
}
console.log(`조합 공간 ${decks.length}개 (고유효과 5장 전부 쓴 조합 ${decks.filter(d=>d.n===5).length}개)\n`);
console.log('설정                       1위            최하위        폭    밴드   다양성');
for(const [lbl,o] of [['S1 기준',{}],
  ['다양성 2/3/4종 4/9/15%',{varietyBonus:[0,0,0.04,0.09,0.15]}],
  ['다양성 8/18/30%',{varietyBonus:[0,0,0.08,0.18,0.30]}],
  ['다양성 12/26/42%',{varietyBonus:[0,0,0.12,0.26,0.42]}],
  ['다양성 12/26/42% + 추가타',{varietyBonus:[0,0,0.12,0.26,0.42],followUpChance:0.45}]]){
  const r=await league(CFG(o));
  const kinds=d=>new Set(d.c.filter(([t,n])=>n>0).map(([t])=>t)).size;
  const top10k=r.full.slice(0,10).map(kinds);
  console.log(`${lbl.padEnd(26)}${r.full[0].name.padEnd(7)}${r.full[0].avg.toFixed(0).padStart(4)}%  ${r.full[r.fullN-1].name.padEnd(7)}${r.full[r.fullN-1].avg.toFixed(0).padStart(4)}%   ${r.fullSpread.toFixed(0).padStart(4)}%p   ${String(r.band).padStart(2)}/56   상위10 평균 계열수 ${(top10k.reduce((x,y)=>x+y,0)/10).toFixed(1)}`);
}

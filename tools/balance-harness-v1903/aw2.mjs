const P=120000,E=500000,T4=['ATTACK','DEFENSE','SPEED','HP'];
const NONE={hp:.40,attack:.28,defense:.18,speed:.14,label:'균형형'};
const PROF={ATTACK:{hp:.37,attack:.34,defense:.15,speed:.14},DEFENSE:{hp:.40,attack:.25,defense:.25,speed:.10},
  HP:{hp:.44,attack:.27,defense:.17,speed:.12},SPEED:{hp:.39,attack:.27,defense:.16,speed:.18},NONE};
const BASE={defCurve:'POWER',defK:0.9,profiles:PROF,surviveHp:0.42,surviveMaxHealers:6,emergencyHp:0.30,
  counterChance:0.45,counterMult:0.68,regenInSuddenDeath:0.5,regenPercent:0.055};
const KOR={ATTACK:'파쇄',DEFENSE:'수호',SPEED:'기동',HP:'생명'};
const BRANCH={ATTACK:[['SHATTER','파쇄자'],['EXECUTOR','집행자']],DEFENSE:[['RIPOSTE','반격자'],['BULWARK','불굴자']],
  SPEED:[['AFTERIMAGE','잔영자'],['VANGUARD','선봉장']],HP:[['IMMORTAL','불멸자'],['SANCTUARY','성역자']]};
async function measure(awaken,seeds=150){
  globalThis.__T={...BASE,awaken};
  const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
  const mk=(t,aw)=>Array(5).fill(0).map((_,i)=>({id:`${t}${i}`,power_type:t,power:P,awaken:aw||null}));
  const rate=(a,b)=>{let w=0;for(let s=0;s<seeds;s++){const r=createPvpBattleV2({attackerCards:a,defenderCards:b,attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++}return w/seeds*100};
  const out=[];
  for(const t of T4){
    const base=T4.map(b=>rate(mk(t),mk(b)));
    for(const [code,name] of BRANCH[t]){
      const v=T4.map((b,i)=>rate(mk(t,code),mk(b))-base[i]);
      out.push({t,code,name,avg:v.reduce((a,b)=>a+b)/4,spread:Math.max(...v)-Math.min(...v),v});
    }
  }
  return out;
}
const AW={
  SHATTER  :{pen:0.30, crit:0.06, hp:-0.10},
  EXECUTOR :{execute:0.30, dmg:-0.13},
  RIPOSTE  :{counter:0.30, dmg:-0.17},
  BULWARK  :{indomShield:0.12, hp:0.10, counter:-0.14},
  AFTERIMAGE:{dodge:0.14, pen:0.10, hp:-0.05},
  VANGUARD :{gauge:35, spd:0.12, hp:-0.09},
  IMMORTAL :{revive:0.14, dmg:-0.09},
  SANCTUARY:{regen:0.05, regenSD:0.9, revive:-0.16}
};
const r=await measure(AW);
console.log('=== 전직 8종 (2차 조정) ===');
console.log('전직          vs파쇄  vs수호  vs기동  vs생명    평균     분산   판정');
for(const x of r){
  const ok = Math.abs(x.avg)<=4 && x.spread>=12 ? '✅ 사이드그레이드' : Math.abs(x.avg)>4 ? (x.avg>0?'⚠ 상위호환':'⚠ 하위호환') : '⚠ 무의미';
  console.log(`[${KOR[x.t]}]${x.name.padEnd(8)}${x.v.map(y=>(y>0?'+':'')+y.toFixed(0).padStart(6)).join('')}  ${(x.avg>0?'+':'')}${x.avg.toFixed(1).padStart(5)}%p  ${x.spread.toFixed(0).padStart(4)}%p  ${ok}`);
}

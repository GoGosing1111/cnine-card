const P=120000,E=500000,T4=['ATTACK','DEFENSE','SPEED','HP'];
const NONE={hp:.40,attack:.28,defense:.18,speed:.14,label:'균형형'};
const PROF={ATTACK:{hp:.37,attack:.34,defense:.15,speed:.14},DEFENSE:{hp:.40,attack:.25,defense:.25,speed:.10},
  HP:{hp:.44,attack:.27,defense:.17,speed:.12},SPEED:{hp:.39,attack:.27,defense:.16,speed:.18},NONE};
const BASE={defCurve:'POWER',defK:0.9,profiles:PROF,surviveHp:0.42,surviveMaxHealers:6,emergencyHp:0.30,
  counterChance:0.45,counterMult:0.68,regenInSuddenDeath:0.5,regenPercent:0.055};
const OWNER={SHATTER:'ATTACK',EXECUTOR:'ATTACK',RIPOSTE:'DEFENSE',BULWARK:'DEFENSE',
  AFTERIMAGE:'SPEED',VANGUARD:'SPEED',IMMORTAL:'HP',SANCTUARY:'HP'};
const AW={
  SHATTER:{pen:0.30,crit:0.06,hp:-0.10}, EXECUTOR:{execute:0.30,dmg:-0.13},
  RIPOSTE:{counter:0.34,dmg:-0.17}, BULWARK:{indomShield:0.12,hp:0.10,counter:-0.14},
  AFTERIMAGE:{dodge:0.14,pen:0.14,hp:-0.05}, VANGUARD:{gauge:35,spd:0.20,hp:-0.09},
  IMMORTAL:{revive:0.14,dmg:-0.09}, SANCTUARY:{regen:0.05,regenSD:0.9,revive:-0.16}};
const COST={SHATTER:['hp',-0.30,0], EXECUTOR:['dmg',-0.35,0], RIPOSTE:['dmg',-0.35,0], BULWARK:['counter',-0.45,0],
  AFTERIMAGE:['hp',-0.30,0], VANGUARD:['hp',-0.35,0], IMMORTAL:['dmg',-0.40,0], SANCTUARY:['revive',-0.42,0]};
async function evalBranch(awaken,code,seeds=120){
  globalThis.__T={...BASE,awaken};
  const {createPvpBattleV2}=await import('./tunable.mjs?v='+Math.random());
  const t=OWNER[code];
  const mk=(ty,aw)=>Array(5).fill(0).map((_,i)=>({id:`${ty}${i}`,power_type:ty,power:P,awaken:aw||null}));
  const rate=(a,b)=>{let w=0;for(let s=0;s<seeds;s++){const r=createPvpBattleV2({attackerCards:a,defenderCards:b,attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++}return w/seeds*100};
  const v=T4.map(b=>rate(mk(t,code),mk(b))-rate(mk(t),mk(b)));
  return {avg:v.reduce((a,b)=>a+b)/4,spread:Math.max(...v)-Math.min(...v),v};
}
const tuned=JSON.parse(JSON.stringify(AW));
for(const code of Object.keys(COST)){
  const [key,lo0,hi0]=COST[code];let lo=lo0,hi=hi0,res=null;
  for(let i=0;i<7;i++){
    const mid=(lo+hi)/2; tuned[code][key]=Number(mid.toFixed(3));
    res=await evalBranch(tuned,code);
    if(res.avg>0) hi=mid; else lo=mid;      // 대가(음수)를 키우면 avg 하락
  }
  console.log(`${code.padEnd(11)} ${key}=${tuned[code][key].toFixed(3)}  avg ${res.avg>0?'+':''}${res.avg.toFixed(1)}%p  분산 ${res.spread.toFixed(0)}%p`);
}
import fs from 'fs';fs.writeFileSync('awaken-tuned.json',JSON.stringify(tuned,null,1));
console.log('\n=== 최종 검증 (시드 200) ===');
const KOR={ATTACK:'파쇄',DEFENSE:'수호',SPEED:'기동',HP:'생명'};
console.log('전직          vs파쇄  vs수호  vs기동  vs생명    평균     분산');
for(const code of Object.keys(COST)){
  const r=await evalBranch(tuned,code,200);
  console.log(`[${KOR[OWNER[code]]}]${code.padEnd(11)}${r.v.map(y=>(y>0?'+':'')+y.toFixed(0).padStart(6)).join('')}  ${r.avg>0?'+':''}${r.avg.toFixed(1).padStart(5)}%p  ${r.spread.toFixed(0).padStart(4)}%p`);
}

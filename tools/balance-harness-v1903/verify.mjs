import {createPvpBattleV2 as NEW, createPveBattleV2 as NEWPVE} from './engineS1.mjs';
import {createPvpBattleV2 as OLD, createPveBattleV2 as OLDPVE} from '/tmp/uv/engine.mjs';
const P=120000,E=500000,T=['ATTACK','DEFENSE','SPEED','HP'];
const KOR={ATTACK:'공격',DEFENSE:'방어',SPEED:'속도',HP:'생명'};
const deck=(t,n)=>{const o=Array(n).fill(t);while(o.length<5)o.push('NONE');return o.map((x,i)=>({id:x+i,power_type:x==='NONE'?'':x,power:P}))};
const tier=(fn,S=110)=>{const m={},avg={};
  const win=(a,b)=>{let w=0;for(let s=0;s<S;s++){const r=fn({attackerCards:deck(a,2),defenderCards:deck(b,2),attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919});if(r.result.winner==='A')w++}return w/S*100};
  for(const a of T){m[a]={};for(const b of T)m[a][b]=win(a,b)}
  for(const t of T)avg[t]=T.reduce((s,b)=>s+m[t][b],0)/4;return {m,avg}};
const o=tier(OLD), n=tier(NEW);
console.log('=== 계열 카드 2장 + 균형형 3장 (매치업당 110시드) ===');
console.log('계열      현행    S1반영   시뮬 예측');
const pred={ATTACK:40,DEFENSE:49,SPEED:46,HP:60};
for(const t of T)console.log(`${KOR[t].padEnd(8)}${o.avg[t].toFixed(0).padStart(5)}%  ${n.avg[t].toFixed(0).padStart(5)}%   ${String(pred[t]).padStart(5)}%`);
const ov=T.map(t=>o.avg[t]), nv=T.map(t=>n.avg[t]);
console.log(`격차     ${(Math.max(...ov)-Math.min(...ov)).toFixed(0).padStart(5)}%p ${(Math.max(...nv)-Math.min(...nv)).toFixed(0).padStart(5)}%p      20%p`);
console.log('\nS1 매치업표');
console.log('  공격측\\수비측 '+T.map(t=>KOR[t].padStart(7)).join('')+'    평균');
for(const a of T)console.log('  '+KOR[a].padEnd(11)+T.map(b=>n.m[a][b].toFixed(0).padStart(7)).join('')+n.avg[a].toFixed(0).padStart(9));
// PVE 회귀
console.log('\n=== PVE 회귀 (카드 12만x5 + 장비 50만) ===');
console.log('구성        몬스터    현행 승률/행동/생존   S1 승률/행동/생존');
const pve=(fn,cards,pw,boss,S=50)=>{let w=0,ac=0,alive=0;
  for(let s=0;s<S;s++){const r=fn({cards,characterBonus:E,monster:{id:1,battle_power:pw,is_boss:boss?1:0},seed:1000+s*7919});
    if(r.result.winner==='A')w++;ac+=(r.result.timeline||[]).filter(e=>e.type==='TURN').length;
    alive+=(r.result.final?.A||[]).filter(c=>c.hp>0).length}
  return [w/S*100,ac/S,alive/S]};
const mkd=spec=>{const o=[];for(const [t,n] of spec)for(let i=0;i<n;i++)o.push(t);while(o.length<5)o.push('NONE');
  return o.map((x,i)=>({id:x+i,power_type:x==='NONE'?'':x,power:P}))};
for(const [lbl,spec] of [['균형형 5장',[]],['방1힐1공2속1',[['DEFENSE',1],['HP',1],['ATTACK',2],['SPEED',1]]],['방2힐1공1속1',[['DEFENSE',2],['HP',1],['ATTACK',1],['SPEED',1]]]]){
  for(const [pw,boss] of [[1200000,false],[1200000,true],[2400000,true]]){
    const c=mkd(spec), a=pve(OLDPVE,c,pw,boss), b=pve(NEWPVE,c,pw,boss);
    console.log(`${lbl.padEnd(12)}${(pw/10000)}만${boss?'보스':'일반'}   ${a[0].toFixed(0).padStart(4)}% ${a[1].toFixed(0).padStart(4)}행 ${a[2].toFixed(1)}장    ${b[0].toFixed(0).padStart(4)}% ${b[1].toFixed(0).padStart(4)}행 ${b[2].toFixed(1)}장`);
  }
}

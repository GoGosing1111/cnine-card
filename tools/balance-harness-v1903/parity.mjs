import {matrix,printMatrix} from './harness.mjs';
const {createPvpBattleV2:T}=await import('./tunable.mjs');
import {createPvpBattleV2 as O} from './engine.mjs';
const P=120000,E=500000;
const mk=t=>Array.from({length:5},(_,i)=>({id:`${t}-${i}`,power_type:t,power:P}));
let same=0,n=0;
for(const a of ['ATTACK','DEFENSE','SPEED','HP'])for(const b of ['ATTACK','DEFENSE','SPEED','HP'])for(let s=0;s<60;s++){
  const args={attackerCards:mk(a),defenderCards:mk(b),attackerEquipmentBonus:E,defenderEquipmentBonus:E,seed:1000+s*7919};
  const o=O(args),t=T(args);n++;
  if(o.result.winner===t.result.winner&&JSON.stringify((o.result.final?.A||[]).map(c=>[c.hp,c.alive]))===JSON.stringify((t.result.final?.A||[]).map(c=>[c.hp,c.alive]))&&o.result.reason===t.result.reason)same++;
}
console.log(`기본값 패리티: ${same}/${n} ${same===n?'✅ 완전 일치':'❌ 불일치'}`);

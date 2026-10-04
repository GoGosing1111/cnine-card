// Isolated review model. No account API, storage or production economics.
export const OPTIONS = Object.freeze([
  { id:'attack', name:'공격력', symbol:'↗', increment:.5, unit:'%' },
  { id:'criticalChance', name:'치명타 확률', symbol:'✧', increment:.2, unit:'%p' },
  { id:'criticalDamage', name:'치명타 피해', symbol:'✦', increment:1, unit:'%p' },
  { id:'bossDamage', name:'보스 피해', symbol:'♜', increment:.5, unit:'%' },
  { id:'penetration', name:'방어 관통', symbol:'◇', increment:.2, unit:'%p' }
]);
export const LIMITS = Object.freeze({ total:20, perOption:10, stoneCost:1 });
export function createState(){return {levels:[0,0,0,0,0],total:0,stones:100,coins:200000,receipts:{}};}
export function eligible(state){return state.levels.map((level,i)=>level<LIMITS.perOption?i:-1).filter(i=>i>=0);}
export function probabilities(state){const pool=eligible(state);return state.levels.map((_,i)=>state.total>=LIMITS.total||!pool.includes(i)?0:100/pool.length);}
export function coinCost(state){return 1000*2**Math.floor(state.total/5);}
export function valueText(index,level){const value=Number((OPTIONS[index].increment*level).toFixed(2));return '+'+value+OPTIONS[index].unit;}
export function randomUnit(){const value=new Uint32Array(1);globalThis.crypto.getRandomValues(value);return value[0]/4294967296;}
export function polish(state,requestId,unit=randomUnit()){
  if(!requestId)throw new Error('requestId required');
  if(state.receipts[requestId])return {state,receipt:state.receipts[requestId]};
  if(!Number.isFinite(unit)||unit<0||unit>=1)throw new Error('Invalid random sample');
  if(state.total>=LIMITS.total)throw new Error('연마가 모두 완료되었습니다.');
  if(state.stones<LIMITS.stoneCost||state.coins<coinCost(state))throw new Error('시연 재료가 부족합니다.');
  const pool=eligible(state),selected=pool[Math.floor(unit*pool.length)];
  const receipt=Object.freeze({id:requestId,selected,before:state.levels[selected],after:state.levels[selected]+1,total:state.total+1,cost:coinCost(state)});
  const levels=state.levels.slice();levels[selected]++;
  return {state:{...state,levels,total:state.total+1,stones:state.stones-1,coins:state.coins-receipt.cost,receipts:{...state.receipts,[requestId]:receipt}},receipt};
}

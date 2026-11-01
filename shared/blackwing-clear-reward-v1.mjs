export const BLACKWING_MAX_COIN_REWARD=20000000000000;
export const BLACKWING_SCROLLS=Object.freeze([
  Object.freeze({code:'WEAPON_ENHANCEMENT_SCROLL',name:'무기 강화주문서',quantity:1}),
  Object.freeze({code:'ARMOR_ENHANCEMENT_SCROLL',name:'방어구 강화주문서',quantity:1})
]);
function secureRandomInt(limit){
  const ceiling=Math.floor(4294967296/limit)*limit;
  let value;do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=ceiling);
  return value%limit;
}
// One independent draw per eligible player. The two items share the total chance equally.
export function drawBlackwingScroll(chance=0,randomInt=secureRandomInt){
  if(!Number.isSafeInteger(chance)||chance<0||chance>100)throw Error('Invalid Blackwing scroll chance');
  if(!chance)return null;
  const ticket=randomInt(200);
  if(!Number.isSafeInteger(ticket)||ticket<0||ticket>=200)throw Error('Invalid Blackwing scroll sample');
  return ticket<chance?{...BLACKWING_SCROLLS[0]}:ticket<chance*2?{...BLACKWING_SCROLLS[1]}:null;
}

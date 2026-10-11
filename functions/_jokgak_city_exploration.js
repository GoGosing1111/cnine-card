import {CITY_WEAPONS,cityArmory} from '../shared/jokgak-city-expansion-v1.mjs';
import {CITY_FOUND_WEAPONS,CITY_ARMORS,defaultCityExploration,cityExplorationBag,citySearchPool,citySearchRoll} from '../shared/jokgak-city-exploration-v1.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:409,code:'CITY_EXPLORATION'});};
export function cityExplorationAction({action,product,location,me,life,policy,now}){
  const cfg=policy.exploration||defaultCityExploration(),bag=cityExplorationBag(life,policy.mode,now);
  if(me.nextActionAt>now)fail('행동 대기가 끝나면 이용할 수 있습니다.');
  if(action==='unequipArmor'){
    if(!bag.equippedArmor)fail('장착한 방어구가 없습니다.');
    bag.equippedArmor=null;return {kind:action};
  }
  if(action==='equipArmor'){
    const rule=cfg.armors.find(a=>a.code===product&&a.enabled);
    if(!rule||!bag.ownedArmor.includes(product))fail('보유 중인 사용 가능한 방어구를 선택하세요.');
    if(bag.equippedArmor===product)fail('이미 장착 중입니다.');
    bag.equippedArmor=product;return {kind:action,...CITY_ARMORS.find(a=>a.code===product),power:rule.power};
  }
  if(location!==me.location)fail('현재 머무는 지역에서만 탐색할 수 있습니다.');
  if(life.careers?.[policy.mode]?.work)fail('근무를 마치거나 취소한 뒤 탐색하세요.');
  const pool=citySearchPool(policy,location);
  if(!pool)fail('이 지역은 현재 탐색할 수 없습니다.');
  if(bag.nextAt>now)fail('다음 탐색까지 잠시 기다려 주세요.');
  const roll=crypto.getRandomValues(new Uint32Array(1))[0]/4294967296,code=citySearchRoll(pool,roll);
  bag.nextAt=now+cfg.cooldownMs;
  // The outer city transaction saves this roll, inventory and cooldown in one receipt.
  if(!code)return {kind:'explore',location,outcome:'EMPTY',nextAt:bag.nextAt,item:null};
  const armor=CITY_ARMORS.find(a=>a.code===code),meta=armor||[...CITY_WEAPONS,...CITY_FOUND_WEAPONS].find(w=>w.code===code);
  const owned=armor?bag.ownedArmor:cityArmory(life,policy.mode).owned,duplicate=owned.includes(code);
  if(!duplicate)owned.push(code);
  const rule=(armor?cfg.armors:[...policy.arsenal.weapons,...cfg.weapons]).find(r=>r.code===code);
  return {kind:'explore',location,outcome:duplicate?'DUPLICATE':'FOUND',nextAt:bag.nextAt,item:{code,name:meta.name,kind:armor?'armor':'weapon',power:rule.power,tier:meta.tier||2}};
}

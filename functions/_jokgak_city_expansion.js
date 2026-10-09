import {changeCityCash} from '../shared/jokgak-city-cash-v1.mjs';
import {CITY_WEAPONS,cityArmory,defaultCityArsenal,defaultCityFacilities} from '../shared/jokgak-city-expansion-v1.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:409,code:'CITY_EQUIPMENT'});};
export function cityExpansionAction({action,product,me,life,policy,now}){
  const facilities=policy.facilities||defaultCityFacilities(),arsenal=policy.arsenal||defaultCityArsenal();
  if(action==='rest'){
    if(me.location!=='MOTEL'||!facilities.motel.enabled)fail('모텔로 이동한 뒤 휴식하세요.');
    if(life.motel?.until>now)fail('이미 개인 객실에서 쉬고 있습니다.');
    if(life.motel?.nextAt>now)fail('모텔 재이용 대기시간이 남았습니다.');
    if(me.nextActionAt>now)fail('행동 대기가 끝난 뒤 입실하세요.');
    life.motel={until:now+facilities.motel.stayMs,nextAt:now+facilities.motel.stayMs+facilities.motel.cooldownMs};
    return {kind:'rest',until:life.motel.until,nextAt:life.motel.nextAt};
  }
  if(action==='checkout'){
    if(!(life.motel?.until>now))fail('현재 모텔에서 쉬고 있지 않습니다.');
    life.motel={until:0,nextAt:now+facilities.motel.cooldownMs};me.location='HOME';me.nextMoveAt=now+policy.rules.moveCooldownMs;
    return {kind:'checkout',nextAt:life.motel.nextAt};
  }
  if(me.nextActionAt>now)fail('다음 행동까지 잠시 기다려 주세요.');
  const bag=cityArmory(life,policy.mode);
  if(action==='unequipWeapon'){if(!bag.equipped)fail('장착한 무기가 없습니다.');bag.equipped=null;return {kind:action};}
  const w=arsenal.weapons.find(w=>w.code===product),meta=CITY_WEAPONS.find(w=>w.code===product);if(!w||!w.enabled)fail('판매·사용 가능한 무기를 확인하세요.');
  if(action==='buyWeapon'){
    if(me.location!=='MARKET')fail('시장에서 무기를 구매하세요.');
    if(bag.owned.includes(product))fail('이미 보유한 무기입니다.');
    const cash=changeCityCash(life,policy,-w.price);bag.owned.push(product);me.nextActionAt=now+policy.life.serviceCooldownMs;
    return {kind:action,code:product,name:meta.name,price:w.price,cash};
  }
  if(!bag.owned.includes(product))fail('보유한 무기만 장착할 수 있습니다.');
  if(bag.equipped===product)fail('이미 장착 중입니다.');bag.equipped=product;
  return {kind:action,code:product,name:meta.name,power:w.power};
}

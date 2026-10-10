import {cityShift} from './jokgak-city-v1.mjs';
import {changeCityCash} from './jokgak-city-cash-v1.mjs';
export const CITY_MEGAPHONE=Object.freeze({code:'MEGAPHONE',name:'도시 확성기',price:500,maxLength:100,maxCount:99,cooldownMs:15000,displayMs:10000});
export function validateCityCommsState(life){
 if(life.megaphones==null)return;
 if(typeof life.megaphones!=='object'||Array.isArray(life.megaphones)||Object.keys(life.megaphones).some(k=>!['ON','TEST'].includes(k)))throw Error('CITY_COMMS_STATE');
 for(const item of Object.values(life.megaphones))if(item!=null&&(!Number.isSafeInteger(item.epoch)||!Number.isSafeInteger(item.count)||item.count<0||item.count>99||!Number.isSafeInteger(item.nextAt)||item.nextAt<0))throw Error('CITY_COMMS_STATE');
}
export function cityMegaphones(life,mode,now){
 if(!['ON','TEST'].includes(mode))return {count:0,nextAt:0};
 life.megaphones??={};const epoch=cityShift(now).id;
 if(life.megaphones[mode]?.epoch!==epoch)life.megaphones[mode]={epoch,count:0,nextAt:0};
 return life.megaphones[mode];
}
export function cityBroadcastText(value){
 if(typeof value!=='string')throw Object.assign(Error('방송할 메시지를 입력하세요.'),{status:400,code:'CITY_MESSAGE'});
 const text=value.normalize('NFC').replace(/\s+/gu,' ').trim();
 if(!text||Array.from(text).length>CITY_MEGAPHONE.maxLength||/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(text))throw Object.assign(Error('메시지는 1~100자로 입력하세요.'),{status:400,code:'CITY_MESSAGE'});
 return text;
}
export function cityCommsAction({action,message,me,life,policy,now}){
 const stock=cityMegaphones(life,policy.mode,now),fail=text=>{throw Object.assign(Error(text),{status:409,code:'CITY_MEGAPHONE'});};
 if(action==='buyMegaphone'){
  if(me.location!=='MARKET')fail('시장으로 이동한 뒤 확성기를 구매하세요.');
  if(stock.count>=CITY_MEGAPHONE.maxCount)fail('확성기는 최대 99개까지 보관할 수 있습니다.');
  const cash=changeCityCash(life,policy,-CITY_MEGAPHONE.price);stock.count++;
  return {kind:action,name:CITY_MEGAPHONE.name,price:CITY_MEGAPHONE.price,cash,count:stock.count};
 }
 if(stock.count<1)fail('시장에서 확성기를 먼저 구매하세요.');
 if(stock.nextAt>now)fail('확성기는 15초마다 사용할 수 있습니다.');
 const text=cityBroadcastText(message);stock.count--;stock.nextAt=now+CITY_MEGAPHONE.cooldownMs;
 return {kind:'broadcast',message:text,count:stock.count,senderId:me.userId,senderName:me.nickname,location:me.location,epoch:cityShift(now).id,mode:policy.mode,createdAt:now};
}

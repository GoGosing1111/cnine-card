import {CITY_ROLES,cityShift} from './jokgak-city-v1.mjs';
export const CITY_DISGUISE=Object.freeze({code:'DISGUISE_ID',name:'위장신분증',price:3000,durationMs:1800000,maxUses:2,maxCount:99});
const integer=(v,min,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function validateCityDisguiseState(life){
 if(life.disguises===undefined)return;
 if(!life.disguises||typeof life.disguises!=='object'||Array.isArray(life.disguises)||Object.keys(life.disguises).some(k=>!['ON','TEST'].includes(k)))throw Error('CITY_DISGUISE_STATE');
 for(const stock of Object.values(life.disguises)){
  if(!stock||!integer(stock.epoch,0)||!integer(stock.count,0,99)||!integer(stock.uses,0,2))throw Error('CITY_DISGUISE_STATE');
  const a=stock.active;
  if(a!=null&&(!integer(a.sourceUserId,1)||typeof a.nickname!=='string'||!a.nickname.trim()||a.nickname.length>200||!CITY_ROLES.some(r=>r.code===a.role)||!integer(a.startedAt,0)||!integer(a.until,a.startedAt+1)||a.until-a.startedAt!==CITY_DISGUISE.durationMs))throw Error('CITY_DISGUISE_IDENTITY');
 }
}
export function cityDisguiseStock(life,mode,now=life.at){
 if(!['ON','TEST'].includes(mode))return null;
 life.disguises??={};const epoch=cityShift(now).id;
 if(life.disguises[mode]?.epoch!==epoch)life.disguises[mode]={epoch,count:0,uses:0,active:null};
 const stock=life.disguises[mode];
 if(stock.active?.until<=now)stock.active=null;
 return stock;
}
export function cityDisguiseIdentity(life,mode,now=life.at){
 const stock=life.disguises?.[mode];
 return stock?.epoch===cityShift(now).id&&stock.active?.until>now?stock.active:null;
}
export function applyCityDisguiseView(state,life,policy){
 const stock=cityDisguiseStock(life,policy.mode);
 if(!stock)return state;
 // Display identity never replaces the role used for abilities or income.
 if(state.role==='POLICE')stock.active=null;
 state.disguise={count:stock.count,uses:stock.uses,remainingUses:Math.max(0,CITY_DISGUISE.maxUses-stock.uses),active:state.active&&stock.active?{nickname:stock.active.nickname,role:stock.active.role,startedAt:stock.active.startedAt,until:Math.min(stock.active.until,cityShift(life.at).endsAt)}:null};
 return state;
}
export const cityDisplayName=state=>state?.disguise?.active?.nickname??state?.nickname??'';
export function cityPublicAppearance(state){
 if(!state)return state;
 const {disguise,...visible}=state;
 if(disguise?.active){
  visible.nickname=disguise.active.nickname;visible.role=disguise.active.role;
  // Rank and work metadata must not expose the original occupation.
  for(const key of ['policeRank','policePowerBonus','policeIncomeBonus','hospitalStaff','begging'])delete visible[key];
 }
 return visible;
}

import {cityShift} from './jokgak-city-v1.mjs';
import {CITY_SUPPLY_WEAPONS} from './jokgak-city-supply-v1.mjs';
import {CITY_FOUND_WEAPONS,defaultCityExploration,cityExplorationBag,cityArmor} from './jokgak-city-exploration-v1.mjs';
export const CITY_HOSPITAL_MAX_STAY_MS=180000;
export const CITY_WEAPONS=Object.freeze([
  {code:'PIPE',name:'쇠파이프',tag:'STREET / 01',icon:'pipe',description:'맨손을 벗어나는 거리의 기본 무장',price:2000,power:200000},
  {code:'PISTOL',name:'권총',tag:'TACTICAL / 02',icon:'pistol',description:'도시 교전을 위한 실전형 무장',price:8000,power:300000},
  {code:'RIFLE',name:'소총',tag:'ASSAULT / 03',icon:'rifle',description:'편성 전체를 강화하는 상위 무장',price:20000,power:450000}
]);
export const defaultCityArsenal=()=>({basePower:100000,weapons:CITY_WEAPONS.map(({code,price,power})=>({code,enabled:true,price,power}))});
export const defaultCityFacilities=()=>({motel:{enabled:true,stayMs:900000,cooldownMs:3600000},hospital:{maxStayMs:CITY_HOSPITAL_MAX_STAY_MS}});
const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function validateCityExpansion(arsenal=defaultCityArsenal(),facilities=defaultCityFacilities()){
  const fail=()=>{throw Object.assign(Error('도시 무기·모텔·병원 설정을 확인하세요.'),{status:400,code:'CITY_EXPANSION_POLICY'});};
  if(!object(arsenal,['basePower','weapons'])||!integer(arsenal.basePower,10000,10000000)||!Array.isArray(arsenal.weapons)||arsenal.weapons.length!==3||new Set(arsenal.weapons.map(w=>w?.code)).size!==3)fail();
  for(const w of arsenal.weapons)if(!object(w,['code','enabled','price','power'])||!CITY_WEAPONS.some(x=>x.code===w.code)||typeof w.enabled!=='boolean'||!integer(w.price,1,100000000)||!integer(w.power,arsenal.basePower+1,100000000))fail();
  if(!object(facilities,['motel','hospital'])||!object(facilities.motel,['enabled','stayMs','cooldownMs'])||typeof facilities.motel.enabled!=='boolean'||!integer(facilities.motel.stayMs,60000,900000)||!integer(facilities.motel.cooldownMs,60000,86400000)||!object(facilities.hospital,['maxStayMs'])||!integer(facilities.hospital.maxStayMs,60000,900000))fail();
  const normalized=structuredClone({arsenal,facilities});
  // Older saved CMS policies used five minutes. The new city maximum is three.
  normalized.facilities.hospital.maxStayMs=Math.min(CITY_HOSPITAL_MAX_STAY_MS,facilities.hospital.maxStayMs);
  return normalized;
}
export function cityArmory(life,mode){
  life.armory??={TEST:{owned:[],equipped:null},ON:{owned:[],equipped:null}};
  return life.armory[mode]||{owned:[],equipped:null};
}
export function cityWeapon(life,policy){
  const bag=cityArmory(life,policy.mode),cfg=policy.arsenal||defaultCityArsenal(),code=bag.owned.includes(bag.equipped)?bag.equipped:null;
  const w=[...cfg.weapons,...(policy.exploration||defaultCityExploration()).weapons,...CITY_SUPPLY_WEAPONS].find(w=>w.code===code&&w.enabled);
  return w?{...[...CITY_WEAPONS,...CITY_FOUND_WEAPONS,...CITY_SUPPLY_WEAPONS].find(x=>x.code===w.code),...w}:{code:null,name:'맨손',power:cfg.basePower,icon:'person'};
}
export function validateCityFacilitiesState(life){
  for(const bag of Object.values(life.armory||{}))if(!Array.isArray(bag.owned)||new Set(bag.owned).size!==bag.owned.length||bag.owned.some(code=>![...CITY_WEAPONS,...CITY_FOUND_WEAPONS,...CITY_SUPPLY_WEAPONS].some(w=>w.code===code))||bag.equipped!=null&&!bag.owned.includes(bag.equipped))throw Error('CITY_ARMORY');
  if(life.armory&&(!life.armory.TEST||!life.armory.ON||Object.keys(life.armory).some(m=>!['TEST','ON'].includes(m))))throw Error('CITY_ARMORY_MODE');
  if(life.motel&&!['until','nextAt'].every(k=>integer(life.motel[k],0,Number.MAX_SAFE_INTEGER)))throw Error('CITY_MOTEL');
  if(life.hospital&&!['enteredAt','leaveAt','autoReturnAfter'].every(k=>integer(life.hospital[k],0,Number.MAX_SAFE_INTEGER)))throw Error('CITY_HOSPITAL');
}
export const cityMedicalRole=role=>['DOCTOR','NURSE'].includes(role);
// A stable pseudo-random exit per admission prevents polling from rerolling it.
export function cityHospitalExit(userId,at){
  const places=['POLICE','POST','MARKET','DEPARTMENT','HOME','DOCK','ALLEY','SHOP','RESTAURANT'];
  let n=2166136261;for(const ch of `${userId}:${at}`)n=Math.imul(n^ch.charCodeAt(0),16777619);n^=n>>>16;
  return places[(n>>>0)%places.length];
}
export function projectCityFacilities(state,life,now,policy){
  const cfg=policy.facilities||defaultCityFacilities(),dead=!!life.death&&!life.death.resolved;
  const hotel=life.motel;
  if(hotel?.until&&(!state.active||dead||state.location!=='MOTEL')){hotel.until=0;hotel.nextAt=Math.max(hotel.nextAt,now+cfg.motel.cooldownMs);}
  if(hotel?.until&&hotel.until<=now){hotel.until=0;if(state.active&&state.location==='MOTEL')state.location='HOME';}
  life.hospital??={enteredAt:0,leaveAt:0,autoReturnAfter:0};const visit=life.hospital;
  if(state.active&&!dead&&state.location==='HOSPITAL'){
    if(!visit.enteredAt){visit.enteredAt=now;visit.leaveAt=now+cfg.hospital.maxStayMs;}
    visit.leaveAt=Math.min(visit.leaveAt,visit.enteredAt+Math.min(CITY_HOSPITAL_MAX_STAY_MS,cfg.hospital.maxStayMs));
    if(!cityMedicalRole(state.role)&&now>=visit.leaveAt){
      state.location=cityHospitalExit(state.userId,visit.enteredAt);
      visit.transfer={id:cityShift(now).id+':'+visit.enteredAt,epoch:cityShift(now).id,at:visit.leaveAt,from:'HOSPITAL',to:state.location};
      visit.autoReturnAfter=now+CITY_HOSPITAL_MAX_STAY_MS;visit.enteredAt=0;visit.leaveAt=0;state.nextMoveAt=0;
    }
  }else{visit.enteredAt=0;visit.leaveAt=0;}
  return state;
}
export function applyCityExpansionView(state,life,policy){
  const cfg=policy.facilities||defaultCityFacilities();
  const exploration=cityExplorationBag(life,policy.mode);
  state.weapon=cityWeapon(life,policy);state.ownedWeapons=[...cityArmory(life,policy.mode).owned];
  state.armor=cityArmor(life,policy);state.ownedArmors=[...exploration.ownedArmor];state.exploreNextAt=exploration.nextAt;
  state.cityPower=state.weapon.power+state.armor.power;
  state.hospitalTransfer=life.hospital?.transfer?.epoch===cityShift(life.at).id?{...life.hospital.transfer}:null;
  state.restUntil=state.active&&state.location==='MOTEL'&&life.motel?.until>life.at?life.motel.until:0;
  state.motelNextAt=life.motel?.nextAt||0;
  state.hospitalLeaveAt=state.active&&state.location==='HOSPITAL'&&!state.deadUntil&&!cityMedicalRole(state.role)?life.hospital?.leaveAt||life.at+cfg.hospital.maxStayMs:0;
  state.hospitalStaff=cityMedicalRole(state.role);
  return state;
}

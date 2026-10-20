import {cityShift} from './jokgak-city-v1.mjs';

// City equipment exists only in the current round's TEST/ON inventories.
export const CITY_FOUND_WEAPONS=Object.freeze([
  {code:'CROWBAR',name:'쇠지렛대',power:150000,tier:1,kind:'weapon'},
  {code:'BAT',name:'알루미늄 배트',power:175000,tier:1,kind:'weapon'},
  {code:'KNIFE',name:'전술 단검',power:225000,tier:2,kind:'weapon'},
  {code:'CROSSBOW',name:'사냥 석궁',power:275000,tier:2,kind:'weapon'},
  {code:'SHOTGUN',name:'산탄총',power:375000,tier:3,kind:'weapon'},
  {code:'SMG',name:'기관단총',power:400000,tier:3,kind:'weapon'},
  {code:'SNIPER',name:'정밀 저격총',power:500000,tier:4,kind:'weapon'}
]);
export const CITY_ARMORS=Object.freeze([
  {code:'JACKET',name:'가죽 재킷',power:20000,tier:1,kind:'armor'},
  {code:'WORK_VEST',name:'작업 조끼',power:40000,tier:1,kind:'armor'},
  {code:'PADDED',name:'보강 방호복',power:65000,tier:2,kind:'armor'},
  {code:'KEVLAR',name:'방탄 조끼',power:90000,tier:2,kind:'armor'},
  {code:'RIOT',name:'진압 방어구',power:120000,tier:3,kind:'armor'},
  {code:'PLATE',name:'중장갑 플레이트',power:150000,tier:4,kind:'armor'}
]);
export const CITY_SEARCH_AREAS=Object.freeze([
  {location:'HOME',label:'다락과 창고',codes:['BAT','JACKET','CROSSBOW']},
  {location:'POLICE',label:'폐기 보급함',codes:['KNIFE','KEVLAR','RIOT']},
  {location:'POST',label:'분실 화물 구역',codes:['CROWBAR','WORK_VEST','SMG']},
  {location:'MARKET',label:'골목의 고물 좌판',codes:['PIPE','PADDED','SHOTGUN']},
  {location:'DEPARTMENT',label:'폐쇄된 보안실',codes:['PISTOL','KEVLAR','PLATE']},
  {location:'DOCK',label:'잠긴 컨테이너',codes:['CROWBAR','RIFLE','SNIPER']},
  {location:'ALLEY',label:'버려진 은신처',codes:['KNIFE','SMG','RIOT']},
  {location:'SHOP',label:'뒤편 적재 공간',codes:['BAT','WORK_VEST','CROSSBOW']},
  {location:'RESTAURANT',label:'지하 물품 보관실',codes:['JACKET','PADDED','SHOTGUN']}
]);
export const defaultCityExploration=()=>({
  enabled:true,cooldownMs:60000,
  weapons:CITY_FOUND_WEAPONS.map(({code,power})=>({code,enabled:true,power})),
  armors:CITY_ARMORS.map(({code,power})=>({code,enabled:true,power})),
  areas:CITY_SEARCH_AREAS.map(({location,codes})=>({location,enabled:true,emptyWeight:30,drops:codes.map((code,i)=>({code,weight:[35,25,10][i]}))}))
});
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k));
export function validateCityExploration(value=defaultCityExploration()){
  const fail=()=>{throw Object.assign(Error('지역 탐색의 대기시간·장비 전투력·발견 비중을 확인하세요.'),{status:400,code:'CITY_EXPLORATION_POLICY'});};
  if(!exact(value,['enabled','cooldownMs','weapons','armors','areas'])||typeof value.enabled!=='boolean'||!integer(value.cooldownMs,10000,3600000))fail();
  for(const [key,metas] of [['weapons',CITY_FOUND_WEAPONS],['armors',CITY_ARMORS]]){
    const rows=value[key];
    if(!Array.isArray(rows)||rows.length!==metas.length||new Set(rows.map(r=>r?.code)).size!==metas.length)fail();
    for(const row of rows)if(!exact(row,['code','enabled','power'])||!metas.some(m=>m.code===row.code)||typeof row.enabled!=='boolean'||!integer(row.power,1,100000000))fail();
  }
  if(!Array.isArray(value.areas)||value.areas.length!==CITY_SEARCH_AREAS.length||new Set(value.areas.map(a=>a?.location)).size!==CITY_SEARCH_AREAS.length)fail();
  for(const area of value.areas){
    const meta=CITY_SEARCH_AREAS.find(a=>a.location===area.location);
    if(!meta||!exact(area,['location','enabled','emptyWeight','drops'])||typeof area.enabled!=='boolean'||!integer(area.emptyWeight,0,10000)||!Array.isArray(area.drops)||area.drops.length!==meta.codes.length||new Set(area.drops.map(d=>d?.code)).size!==meta.codes.length)fail();
    for(const d of area.drops)if(!exact(d,['code','weight'])||!meta.codes.includes(d.code)||!integer(d.weight,0,10000))fail();
    if(area.emptyWeight+area.drops.reduce((sum,d)=>sum+d.weight,0)===0)fail();
  }
  return structuredClone(value);
}
export function cityExplorationBag(life,mode,now=life.at){
  life.exploration??={TEST:null,ON:null};
  if(!['TEST','ON'].includes(mode))return {epoch:cityShift(now).id,ownedArmor:[],equippedArmor:null,nextAt:0};
  let bag=life.exploration[mode];const epoch=cityShift(now).id;
  if(!bag||bag.epoch!==epoch){
    // First adoption preserves the current round's already purchased weapons.
    if(bag&&life.armory?.[mode])Object.assign(life.armory[mode],{owned:[],equipped:null,supplyExpiresAt:{}});
    bag=life.exploration[mode]={epoch,ownedArmor:[],equippedArmor:null,nextAt:0};
  }
  return bag;
}
export function validateCityExplorationState(life){
  if(life.exploration&&!exact(life.exploration,['TEST','ON']))throw Error('CITY_EXPLORATION_STATE');
  for(const bag of Object.values(life.exploration||{})){
    if(bag===null)continue;
    if(!exact(bag,['epoch','ownedArmor','equippedArmor','nextAt'])||!integer(bag.epoch,0,Number.MAX_SAFE_INTEGER)||!integer(bag.nextAt,0,Number.MAX_SAFE_INTEGER)||!Array.isArray(bag.ownedArmor)||new Set(bag.ownedArmor).size!==bag.ownedArmor.length||bag.ownedArmor.some(code=>!CITY_ARMORS.some(a=>a.code===code))||bag.equippedArmor!==null&&!bag.ownedArmor.includes(bag.equippedArmor))throw Error('CITY_EXPLORATION_STATE');
  }
}
export function cityArmor(life,policy){
  const bag=cityExplorationBag(life,policy.mode),cfg=policy.exploration||defaultCityExploration();
  const rule=cfg.armors.find(a=>a.code===bag.equippedArmor&&bag.ownedArmor.includes(a.code)&&a.enabled);
  return rule?{...CITY_ARMORS.find(a=>a.code===rule.code),...rule}:{code:null,name:'방어구 없음',power:0};
}
export function citySearchPool(policy,location){
  const cfg=policy.exploration||defaultCityExploration(),area=cfg.areas.find(a=>a.location===location);
  if(!cfg.enabled||!area?.enabled)return null;
  const rules=[...(policy.arsenal?.weapons||[]),...cfg.weapons,...cfg.armors];
  return {area,drops:area.drops.filter(d=>d.weight>0&&rules.some(r=>r.code===d.code&&r.enabled))};
}
export function citySearchRoll(pool,random){
  const total=pool.area.emptyWeight+pool.drops.reduce((sum,d)=>sum+d.weight,0);
  if(!total)return null;
  let n=random*total-pool.area.emptyWeight;
  if(n<0)return null;
  for(const d of pool.drops){n-=d.weight;if(n<0)return d.code;}
  return null;
}

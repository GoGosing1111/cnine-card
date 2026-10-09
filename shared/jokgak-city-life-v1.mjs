// City-only survival state. Combat HP and everyday health are separate meters.
export const CITY_DEATH_MS=180000;
export const CITY_SUPPLIES=[
  {code:'LUNCHBOX',name:'휴대 도시락',icon:'meal',description:'이동 중 허기를 달래는 따뜻한 도시락'},
  {code:'VITAMIN',name:'비타민 드링크',icon:'bottle',description:'지친 몸의 건강 상태를 회복하는 음료'},
  {code:'FIRST_AID',name:'응급 처치 키트',icon:'medical',description:'도시 전투 체력을 회복하는 일회용 구급품'}
];
export function defaultCityLifePolicy(){return {
  hungerPerHour:12,wellnessPerHour:6,starvingWellnessPerHour:24,hospitalThreshold:25,
  serviceCooldownMs:5000,
  meal:{enabled:true,price:1000,hunger:60,wellness:10},
  treatment:{enabled:true,price:2000,health:100,wellness:100},
  supplies:[
    {code:'LUNCHBOX',enabled:true,price:1500,hunger:35,wellness:0,health:0},
    {code:'VITAMIN',enabled:true,price:1500,hunger:0,wellness:25,health:0},
    {code:'FIRST_AID',enabled:true,price:2000,hunger:0,wellness:0,health:40}
  ]
};}
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k));
export function validateCityLifePolicy(value){
  const bad=()=>{throw Object.assign(Error('생활 설정의 감소량·위험 기준·가격·회복량을 확인하세요.'),{status:400,code:'CITY_LIFE_POLICY'});};
  if(!exact(value,['hungerPerHour','wellnessPerHour','starvingWellnessPerHour','hospitalThreshold','serviceCooldownMs','meal','treatment','supplies'])||!['hungerPerHour','wellnessPerHour','starvingWellnessPerHour'].every(k=>integer(value[k],0,100))||!integer(value.hospitalThreshold,1,50)||!integer(value.serviceCooldownMs,1000,60000))bad();
  for(const [key,meters] of [['meal',['hunger','wellness']],['treatment',['health','wellness']]]){
    const r=value[key];if(!exact(r,['enabled','price',...meters])||typeof r.enabled!=='boolean'||!integer(r.price,0,100000000)||!meters.every(k=>integer(r[k],0,100))||!meters.some(k=>r[k]>0))bad();
  }
  if(!Array.isArray(value.supplies)||value.supplies.length!==3||new Set(value.supplies.map(x=>x?.code)).size!==3)bad();
  for(const r of value.supplies)if(!exact(r,['code','enabled','price','hunger','wellness','health'])||!CITY_SUPPLIES.some(x=>x.code===r.code)||typeof r.enabled!=='boolean'||!integer(r.price,0,100000000)||!['hunger','wellness','health'].every(k=>integer(r[k],0,100))||!['hunger','wellness','health'].some(k=>r[k]>0))bad();
  return structuredClone(value);
}
export const cityLifeKey=id=>'jokgak_city_life_v1:'+id;
export const newCityLife=now=>({version:1,at:now,hunger:100,wellness:100,death:null,bags:{TEST:{},ON:{}}});
export function readCityLife(raw,now){
  if(raw==null)return newCityLife(now);
  try{
    const life=JSON.parse(raw);
    if(life.version!==1||!Number.isSafeInteger(life.at)||!['hunger','wellness'].every(k=>Number.isFinite(life[k])&&life[k]>=0&&life[k]<=100)||!life.bags?.TEST||!life.bags?.ON)throw Error();
    for(const mode of ['TEST','ON'])for(const [code,n] of Object.entries(life.bags[mode]))if(!CITY_SUPPLIES.some(s=>s.code===code)||!integer(n,0,99))throw Error();
    if(life.death&&(!Number.isSafeInteger(life.death.until)||!Number.isSafeInteger(life.death.at)||typeof life.death.killerName!=='string'))throw Error();
    return life;
  }catch{throw Object.assign(Error('도시 생활 상태를 확인하지 못했습니다. 다시 시도해 주세요.'),{status:503,code:'CITY_LIFE_RETRY'});}
}
export function projectCityLife(state,life,now,policy){
  const cfg=policy.life,death=life.death;
  if(death&&!death.resolved){
    state.location='HOSPITAL';state.jailedUntil=0;state.wanted=0;
    if(death.until>now){state.health=0;life.at=now;}
    else{
      state.health=state.maxHealth;state.nextActionAt=Math.min(state.nextActionAt,death.until);state.nextMoveAt=0;
      state.protectedUntil=Math.max(state.protectedUntil,death.until+policy.rules.targetProtectionMs);
      life.wellness=100;life.hunger=Math.max(30,life.hunger);life.at=death.until;death.resolved=true;
    }
  }
  const dead=!!death&&!death.resolved;
  if(state.active&&!dead){
    const hours=Math.max(0,now-life.at)/3600000;
    const starvingHours=cfg.hungerPerHour>0?Math.max(0,hours-life.hunger/cfg.hungerPerHour):life.hunger===0?hours:0;
    life.hunger=Math.max(0,life.hunger-hours*cfg.hungerPerHour);
    life.wellness=Math.max(0,life.wellness-hours*cfg.wellnessPerHour-starvingHours*cfg.starvingWellnessPerHour);
  }
  life.at=now;
  if(state.active&&!dead&&life.wellness<=cfg.hospitalThreshold){state.location='HOSPITAL';state.jailedUntil=0;}
  return applyCityLifeView(state,life,policy);
}
export function applyCityLifeView(state,life,policy){
  state.hunger=Math.ceil(life.hunger);state.wellness=Math.ceil(life.wellness);
  state.death=life.death?{...life.death}:null;state.deadUntil=life.death&&!life.death.resolved?life.death.until:0;
  state.hospitalRequired=!state.deadUntil&&life.wellness<=policy.life.hospitalThreshold;
  state.bag={...(life.bags[policy.mode]||{})};
  return state;
}
export function markCityDeath(state,life,killer,now,location){
  life.death={at:now,until:now+CITY_DEATH_MS,killerId:killer.userId,killerName:killer.nickname,location,resolved:false};life.at=now;
  state.health=0;state.location='HOSPITAL';state.jailedUntil=0;state.wanted=0;state.protectedUntil=0;
  state.nextActionAt=Math.max(state.nextActionAt,life.death.until);state.nextMoveAt=0;
}

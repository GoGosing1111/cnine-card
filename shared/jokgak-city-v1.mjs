export const CITY_VERSION = '20261009-v1';
export const CITY_SHIFT_MS = 6 * 60 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;
export const CITY_RULES = Object.freeze({ maxHealth:100, defeatDamage:25, regenPerMinute:5, attackCooldownMs:15000, moveCooldownMs:3000, healCooldownMs:30000, inspectCooldownMs:10000, arrestMs:60000, targetProtectionMs:20000, rejoinCooldownMs:60000, pageSize:10 });
export const CITY_ROLES = Object.freeze([
  {code:'CITIZEN',name:'시민',color:'#c8ff6b',icon:'person',detail:'도시를 자유롭게 이동하며 현재 PVP 편성으로 교전합니다.'},
  {code:'BEGGAR',name:'거지',color:'#cdbfa3',icon:'bag',detail:'골목과 시장을 누비는 도시의 생존자. 이동과 교전에 참여합니다.'},
  {code:'POLICE',name:'경찰',color:'#83beff',icon:'shield',detail:'검문으로 상대 편성을 확인하고 수배자를 제압해 60초간 구금합니다.'},
  {code:'NURSE',name:'간호사',color:'#ffa8c1',icon:'cross',detail:'같은 장소의 체류자 체력 25 회복 · 재사용 30초.'},
  {code:'DOCTOR',name:'의사',color:'#7ce6d0',icon:'medical',detail:'같은 장소의 체류자 체력 50 회복 · 재사용 30초.'},
  {code:'GANG',name:'갱단',color:'#c2a0ff',icon:'swords',detail:'도시의 세력 다툼에 뛰어듭니다. 선제공격 시 수배가 누적됩니다.'},
  {code:'VANDAL',name:'반달',color:'#ffb282',icon:'bolt',detail:'거리의 교전에 참여합니다. 수배 상태에서는 경찰의 체포 대상입니다.'}
]);
export const CITY_PLACES = Object.freeze([
  {id:'POLICE',name:'경찰서',district:'공공 지구',icon:'shield',x:19,y:22,shape:'10,8 28,8 30,28 26,30 9,28',labelX:19,labelY:29,detail:'검문과 체포의 중심. 구금된 수배자가 이곳으로 이송됩니다.'},
  {id:'HOSPITAL',name:'병원',district:'공공 지구',icon:'cross',x:50,y:19,shape:'42,5 58,5 60,26 43,27',labelX:50,labelY:27,detail:'3분 사망 대기가 끝나면 이곳에서 부활합니다. 진료로 도시 체력과 건강을 회복하세요.'},
  {id:'DEPARTMENT',name:'백화점',district:'상업 지구',icon:'store',x:79,y:20,shape:'68,8 87,8 91,24 86,29 69,28',labelX:79,labelY:29,detail:'환하게 빛나는 유리 아트리움. 상업 지구의 만남과 교전 장소.'},
  {id:'POST',name:'우체국',district:'공공 지구',icon:'mail',x:17,y:44,shape:'4,33 25,34 28,50 26,57 4,55',labelX:17,labelY:55,detail:'배송 차량이 모이는 물류 거점. 이곳에 체류 중인 인원을 확인하세요.'},
  {id:'MARKET',name:'시장',district:'상업 지구',icon:'market',x:47,y:46,shape:'38,34 50,33 55,47 54,54 42,56 37,46',labelX:48,labelY:55,detail:'낮과 밤이 없는 도시의 중심. 사람들을 만나고 대상을 선택하세요.'},
  {id:'HOME',name:'집',district:'주거 지구',icon:'home',x:77,y:44,shape:'68,33 88,32 88,48 85,56 69,55',labelX:78,labelY:55,detail:'도시 생활이 시작되는 주거 지구. 체류 중에는 이곳에서도 교전할 수 있습니다.'},
  {id:'DOCK',name:'항구 창고',district:'항만 지구',icon:'warehouse',x:24,y:74,shape:'9,61 34,63 38,85 26,90 8,84',labelX:24,labelY:84,detail:'컨테이너와 오래된 창고 사이로 이어지는 항만 구역.'},
  {id:'ALLEY',name:'뒷골목',district:'유흥 지구',icon:'bolt',x:47,y:75,shape:'40,60 54,59 55,86 40,88',labelX:47,labelY:84,detail:'네온이 비추는 좁은 거리. 교전 이후 수배와 체력을 확인하세요.'},
  {id:'SHOP',name:'도시 상점',district:'상업 지구',icon:'bag',x:61,y:44,shape:'56,34 64,33 65,55 56,56',labelX:61,labelY:40,detail:'도시락·비타민·구급품을 구매하고 휴대합니다. 도시 안에서 필요할 때 사용하세요.'},
  {id:'RESTAURANT',name:'식당',district:'유흥 지구',icon:'meal',x:62,y:72,shape:'56,61 66,60 69,81 57,87',labelX:64,labelY:72,detail:'따뜻한 한 끼로 배고픔과 건강을 회복하는 심야 식당입니다.'}
]);
export const cityRole = code => CITY_ROLES.find(role=>role.code===code) || CITY_ROLES[0];
export const cityPlace = id => CITY_PLACES.find(place=>place.id===id);
export function cityShift(now=Date.now()) {
  const id=Math.floor((now+KST_MS)/CITY_SHIFT_MS), startsAt=id*CITY_SHIFT_MS-KST_MS;
  return {id,startsAt,endsAt:startsAt+CITY_SHIFT_MS};
}
export function cityHealth(row,now=Date.now(),rules=CITY_RULES) {
  const max=rules.maxHealth??100;
  if(!row)return max;
  if(Number(row.epoch)!==cityShift(now).id)return max;
  return Math.min(max,Math.max(0,Number(row.health)||0)+Math.floor(Math.max(0,now-Number(row.health_at))/60000)*rules.regenPerMinute);
}
export function cityState(row,role,now=Date.now(),rules=CITY_RULES) {
  if(!row)return null;
  const current=Number(row.epoch)===cityShift(now).id;
  return {userId:Number(row.user_id),nickname:row.nickname||'',active:Number(row.active)===1,role,location:row.location,health:cityHealth(row,now,rules),maxHealth:rules.maxHealth??100,wanted:current?Number(row.wanted):0,
    jailedUntil:current?Number(row.jailed_until):0,nextActionAt:Number(row.next_action_at),nextMoveAt:Number(row.next_move_at),protectedUntil:current?Number(row.protected_until):0,revision:Number(row.revision)};
}

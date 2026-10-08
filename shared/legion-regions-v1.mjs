// Region equipment and enemy identities are independent from deployment policy.
// All numeric balance values below are review defaults; the server snapshots CMS policy.
export const LEGION_REGIONS_VERSION = 1;
export const LEGION_REGIONS_KEY = 'legion_hunt_regions_v1';
export const LEGION_REGION_ART = '/assets/ui/legion-regions-v1/';
export const REGION_EQUIPMENT_SLOTS = Object.freeze(['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY']);
const slotNames = {WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구'};
const definitions = [
  ['coast','검은 돛의 해안','BLACK SAIL COAST','#6bc8d1','폭풍이 삼킨 해안, 난파선 아래에서 군단이 밀려온다.','포대와 본체의 협공 · 보호막과 생존력',
    ['작살게','칼지느러미 어인','익사한 해적'],'난파왕','난파왕','체력 · 보호막 · 피해 경감',
    ['흑조의 작살총','WEAPON','HARPOON','보호막을 공격할 때 피해 증가'],
    {hpPercent:8},{shieldPercent:12,damageReductionPercent:5}],
  ['desert','유리 사막','GLASS DESERT','#e7bd6b','빛을 머금은 모래바다, 갑각이 열리는 순간을 노려라.','갑각 개방 · 보스 집중 화력',
    ['수정 전갈','모래 잠복충','유리등 도마뱀'],'태양을 삼킨 전갈','유리 사냥꾼','방어 관통 · 보스 피해',
    ['태양송곳','WEAPON','SUNPIERCER','보스에게 가하는 피해 증가'],
    {penetrationPoints:4},{bossDamagePercent:10}],
  ['theatre','끝나지 않는 대극장','THE ENDLESS THEATRE','#d48bba','막이 오를 때마다 강해지는 인형들의 마지막 공연.','공연 막 전환 · 빠른 처치',
    ['태엽 무용수','가면 광대','줄인형 병사'],'얼굴 없는 단장','마리오네트','공격 속도 · 연속 타격',
    ['단장의 가면','ACCESSORY','DIRECTOR_MASK','일정 횟수의 기본공격마다 추가 타격'],
    {speedPercent:5},{echoEvery:5,echoPercent:20}],
  ['viscera','거수의 뱃속','WITHIN THE COLOSSUS','#8dc6a4','살아 있는 벽과 기생 군단 사이, 끝까지 버텨라.','기생체 흡수 · 지속 피해와 회복',
    ['흡수충','갑각 기생체','산성 포자낭'],'기생 여왕','포식자','체력 회복 · 지속전 생존력',
    ['여왕의 생체갑','TOP','QUEEN_CARAPACE','기본공격 적중 시 제한된 체력 회복'],
    {hpPercent:6},{leechPercent:3,damageReductionPercent:3}],
  ['sky','역천 제도','INVERTED ARCHIPELAGO','#9eafff','구름 위의 단절된 섬, 낙뢰와 급습을 넘어 전진하라.','날개 폭격 · 급습 후 취약 구간',
    ['폭풍 맹금','부유 갑충','낙뢰 정령'],'천공 포식조','천공 추격자','치명타 · 순간 화력',
    ['낙뢰의 깃','ACCESSORY','THUNDER_FEATHER','치명타 기본공격에 추가 피해'],
    {criticalChancePoints:3},{criticalDamagePoints:15}]
];
export const LEGION_REGIONS = Object.freeze(definitions.map(([id,name,english,accent,description,counter,names,boss,setName,setRole,unique,two,four],index)=>Object.freeze({
  id,name,english,accent,description,counter,index,
  background:`${LEGION_REGION_ART}${id}/background-v1.webp`,
  monsters:names.map((name,i)=>Object.freeze({id:`${id}-${i}`,name,sprite:`${LEGION_REGION_ART}${id}/monster-${i+1}-v1.webp`,power:[1,1.12,.9][i],height:[245,265,250][i],role:['ASSAULT','ARMORED','SUPPORT'][i]})),
  boss:Object.freeze({id:`${id}-boss`,name:boss,sprite:`${LEGION_REGION_ART}${id}/boss-v1.webp`,height:410,power:1}),
  setId:`HUNT_${id.toUpperCase()}`,setName,setRole,two:Object.freeze(two),four:Object.freeze(four),
  unique:Object.freeze({name:unique[0],slot:unique[1],effect:unique[2],description:unique[3]})
})));
export const REGION_DIFFICULTIES = Object.freeze([
  ['normal','보통',650000,12000000,105,0,7,150000,'H·S 성장 구간','지역의 기본 패턴',.2,15,8,.3,5],
  ['hard','어려움',2000000,65000000,120,8,6,150000,'S 완성~Z 성장 구간','정예와 보스 패턴 강화',.3,20,12,.5,7],
  ['nightmare','악몽',5000000,180000000,140,16,5,135000,'Z 완성~X 성장 구간','광역 정리와 집중 화력',.4,25,18,.8,10],
  ['inferno','지옥',8500000,400000000,160,24,4,120000,'X 완성~오버로드 구간','강한 연속 공격과 생존력',.5,30,25,1.2,14],
  ['calamity','재앙',14000000,950000000,185,32,3,120000,'8천만 슈트·완성된 덱 기준','최상위 패턴과 전투 압박',.6,40,35,1.8,20]
].map(([id,name,power,bossPower,attack,shield,forced,bossLimitMs,recommendation,description,stonePercent,eliteStonePercent,setPercent,uniquePercent,bossStones],index)=>Object.freeze({
  id,name,index,power,bossPower,attack,shield,forced,repeat:1,limitMs:900000,huntDurationMs:900000-bossLimitMs,bossLimitMs,recommendation,description,
  loot:Object.freeze({stonePercent,eliteStonePercent,eliteSetPercent:setPercent/5,bossSetPercent:setPercent,bossUniquePercent:uniquePercent,bossStones,lifetimeSeconds:12})
})));
export const REGION_EQUIPMENT = Object.freeze(LEGION_REGIONS.flatMap(region=>[
  ...REGION_EQUIPMENT_SLOTS.map((slot,index)=>Object.freeze({
    code:`${region.setId}_${slot}`,regionId:region.id,setId:region.setId,kind:'SET',name:`${region.setName} ${slotNames[slot]}`,slot,
    rarity:'LEGENDARY',totalPower:[100000,70000,65000,50000,60000][index],
    image:`${LEGION_REGION_ART}${region.id}/equipment-${index+1}-v1.webp`,description:`${region.name} 전용 장비 · ${region.setName} 2/4세트`,
  })),
  Object.freeze({code:`${region.setId}_UNIQUE`,regionId:region.id,setId:null,kind:'UNIQUE',name:region.unique.name,slot:region.unique.slot,rarity:'MYTHIC',
    totalPower:region.unique.slot==='WEAPON'?145000:100000,image:`${LEGION_REGION_ART}${region.id}/equipment-6-v1.webp`,effect:region.unique.effect,description:region.unique.description})
]));
export const regionById=id=>LEGION_REGIONS.find(row=>row.id===id)||null;
export const regionalDifficulty=id=>REGION_DIFFICULTIES.find(row=>row.id===id)||null;
export const regionalEquipment=code=>REGION_EQUIPMENT.find(row=>row.code===code)||null;
export function legionRegionDefaults(){
  return {schemaVersion:1,revision:0,mode:'TEST',difficulties:REGION_DIFFICULTIES.map(d=>({id:d.id,power:d.power,bossPower:d.bossPower,attack:d.attack,shield:d.shield,forced:d.forced,loot:{...d.loot}})),
    regions:LEGION_REGIONS.map(r=>({id:r.id,enabled:true})),testUserIds:[]};
}
export function regionEquipmentEffects(codes=[]){
  const unique=[...new Set(codes)],counts=new Map(),effects={},sets=[],uniques=[];
  const add=values=>{for(const [key,value] of Object.entries(values))effects[key]=(effects[key]||0)+value;};
  for(const code of unique){const item=regionalEquipment(code);if(!item)continue;if(item.setId)counts.set(item.setId,(counts.get(item.setId)||0)+1);else uniques.push(item.effect);}
  for(const region of LEGION_REGIONS){const count=counts.get(region.setId)||0;if(count>=2){add(region.two);if(count>=4)add(region.four);sets.push({id:region.setId,name:region.setName,count,active:count>=4?4:2});}}
  if(uniques.includes('HARPOON'))add({shieldDamagePercent:12});
  if(uniques.includes('SUNPIERCER'))add({bossDamagePercent:8});
  if(uniques.includes('DIRECTOR_MASK'))add({uniqueEchoEvery:6,uniqueEchoPercent:25});
  if(uniques.includes('QUEEN_CARAPACE'))add({leechPercent:2});
  if(uniques.includes('THUNDER_FEATHER'))add({criticalExtraPercent:8});
  return {schemaVersion:1,effects,sets,uniques};
}

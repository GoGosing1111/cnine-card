import manifest from '../assets/ui/tower-monsters-20261022/manifest.json' with {type:'json'};
import upper from '../assets/ui/tower-monsters-20261124/manifest.json' with {type:'json'};

// Tower presentation owns this roster. Shared hunt/CMS monster identities and
// every combat/economy field stay intact; historical PNGs remain available.
export const TOWER_MONSTER_VERSION=manifest.version;
export const TOWER_MONSTERS=Object.freeze(manifest.sprites.map(row=>Object.freeze(row)));
const byId=new Map(TOWER_MONSTERS.map(row=>[row.monsterId,row]));
const upperByKey = new Map(upper.sprites.map(row => [row.key, Object.freeze({
  ...row, battleSprite:row.image, footAnchor:upper.footAnchor, version:upper.version
})]));
const upperFloors = new Map();
for (const {first, last, regular} of upper.cohorts) {
  const normal = upperByKey.get(regular);
  const leader = Object.freeze({...normal, name:normal.name + ' 우두머리'});
  for (let floor = first; floor <= last; floor++) {
    upperFloors.set(floor, {normal, guardian:upperByKey.get(upper.guardians[floor]) ?? leader});
  }
}
export function towerMonsterArt(id, floor = 0, guardian = false) {
  const art = upperFloors.get(Number(floor));
  return art ? (guardian ? art.guardian : art.normal) : byId.get(Number(id)) ?? null;
}
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
export function presentTowerMonsters(data){
 function visit(value,key='',inheritedFloor=0,guardianIndex=28){
  if(!value||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(row=>visit(row,key,inheritedFloor,guardianIndex));
  const instance=String(value.id??value.instanceId??'').match(/^(?:B:\d+:ENCOUNTER:)?TOWER:(\d+):(\d+)$/);
  const floor=Number(instance?.[1]??value.floorNo??(value.mode==='TOWER'?value.tier:undefined)??inheritedFloor);
  const last=value.continuousEncounter?.total??guardianIndex;
  const out=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,k,floor,last)]));
  const cardId=String(value.cardId||'').match(/^MONSTER:(\d+)$/)?.[1];
  const id=value.linked_battle_monster_id||value.monsterId||value.monster_id||cardId||(['monster','monsters','operatingFloor'].includes(key)?value.id:null);
  if(!id)return out;
  const guardian=instance ? Number(instance[2])===last : ['floor','monster','operatingFloor'].includes(key)||value.boss===true||own(value,'monsterName')||own(value,'monster_name');
  const art=towerMonsterArt(id,floor,guardian);if(!art)return out;
  if(['monsterName','monster_name','monsterImage','monster_image'].some(k=>own(value,k))){
   for(const k of ['monsterName','monster_name'])if(own(value,k))out[k]=art.name;
   for(const k of ['monsterImage','monster_image'])if(own(value,k))out[k]=art.image;
   return out;
  }
  const elite=value.elite===true||/^정예 /.test(String(value.name||value.title||''));
  const name=(elite?'정예 ':'')+art.name;
  for(const k of ['name','title'])if(own(value,k))out[k]=name;
  if(own(value,'displayName'))out.displayName=name+(String(value.displayName).match(/ \d+$/)?.[0]||'');
  for(const k of ['image','image_url','imageUrl','imageBattle','battleImage','sourceArt','originalCardArt'])if(own(value,k))out[k]=art.image;
  out.battleSprite=art.battleSprite;out.towerMonsterVersion=art.version??TOWER_MONSTER_VERSION;
  out.projectVMonsterArt={scope:'BATTLE_ENGINE_ONLY',kind:'TOWER_ABYSS_SD',name,primaryUrl:art.battleSprite,pngFallbackUrl:art.battleSprite,footAnchor:art.footAnchor,objectFit:'contain',objectPosition:'50% 100%',artFacing:-1};
  return out;
 }
 return visit(data);
}

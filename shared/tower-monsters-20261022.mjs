import manifest from '../assets/ui/tower-monsters-20261022/manifest.json' with {type:'json'};

// Tower presentation owns this roster. Shared hunt/CMS monster identities and
// every combat/economy field stay intact; historical PNGs remain available.
export const TOWER_MONSTER_VERSION=manifest.version;
export const TOWER_MONSTERS=Object.freeze(manifest.sprites.map(row=>Object.freeze(row)));
const byId=new Map(TOWER_MONSTERS.map(row=>[row.monsterId,row]));
export const towerMonsterArt=id=>byId.get(Number(id))||null;
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
export function presentTowerMonsters(data){
 function visit(value,key=''){
  if(!value||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(row=>visit(row,key));
  const out=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,k)]));
  const cardId=String(value.cardId||'').match(/^MONSTER:(\d+)$/)?.[1];
  const id=value.linked_battle_monster_id||value.monsterId||value.monster_id||cardId||(['monster','monsters','operatingFloor'].includes(key)?value.id:null);
  const art=towerMonsterArt(id);if(!art)return out;
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
  out.battleSprite=art.battleSprite;out.towerMonsterVersion=TOWER_MONSTER_VERSION;
  out.projectVMonsterArt={scope:'BATTLE_ENGINE_ONLY',kind:'TOWER_ABYSS_SD',name,primaryUrl:art.battleSprite,pngFallbackUrl:art.battleSprite,footAnchor:art.footAnchor,objectFit:'contain',objectPosition:'50% 100%',artFacing:-1};
  return out;
 }
 return visit(data);
}

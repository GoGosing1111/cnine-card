import {mercenaryRandomInt} from './_mercenary_draw_accounting.js';

// Base odds per eligible result, without equipment, collection or event multipliers.
const thresholds=Object.freeze({LEGION:6,APOCALYPSE:6,NOX:200});
const codes=['SCAR','M14'].flatMap(weapon=>[1,2,3].map(chapter=>weapon+'_BLUEPRINT_CHAPTER_'+chapter));

export function drawBlueprintDrop(source,randomInt=mercenaryRandomInt){
  return randomInt(10000)<thresholds[source]?codes[randomInt(codes.length)]:null;
}

export function blueprintDropItem(code,eventId){
  if(!codes.includes(code))return null;
  const [weapon,,,chapter]=code.split('_');
  return {type:'INVENTORY_ITEM',code,ref:code,name:weapon+' 설계도 '+chapter+'장',
    image:'/assets/items/'+weapon.toLowerCase()+'-blueprint-chapter-'+chapter+'-v1.webp',
    quantity:1,eventId};
}

export async function activeBlueprintDrop(env,code,eventId){
  if(!code)return null;
  const active=await env.DB.prepare('SELECT 1 FROM inventory_items WHERE code=? AND is_active=1').bind(code).first();
  return active?blueprintDropItem(code,eventId):null;
}

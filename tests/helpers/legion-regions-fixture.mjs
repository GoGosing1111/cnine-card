import {REGION_EQUIPMENT} from '../../shared/legion-regions-v1.mjs';
export async function seedRegionalCatalog(f){
  for(const [n,item] of REGION_EQUIPMENT.entries())await f.DB.prepare('INSERT INTO character_equipment_items(id,code,name,rarity,image_url,is_active,is_public) VALUES(?,?,?,?,?,1,1)').bind(100+n,item.code,item.name,item.rarity,item.image).run();
  await f.DB.prepare("INSERT INTO inventory_items VALUES('EQUIPMENT_POLISH_STONE','연마석','SPECIAL','preview/equipment-polish-premium-v1/assets/polishing-stone-v1.png',1)").run();
}

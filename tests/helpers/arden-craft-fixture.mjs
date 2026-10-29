import {equipmentFixture} from './workshop-equipment-fixture.mjs';
import {saveEquipmentCraftRecipe,executeEquipmentCraft,equipmentCraftAccountState} from '../../functions/_workshop_equipment_craft.js';
import {PARTS,draftFor} from '../../scripts/ops/arden-craft-20261029.mjs';
export const ardenCatalog=PARTS.flatMap((part,i)=>[
 {id:43+i,code:'EMPEROR_'+part,name:['엠퍼러 슈트','엠퍼러 레깅스','엠퍼러 슈즈','엠퍼러 듀얼디스크'][i],slot:['TOP','BOTTOM','SHOES','ACCESSORY'][i],image_url:'assets/items/'+['emperor-suit-v1.png','emperor-leggings-v1.png','emperor-shoes-v1.png','emperor-dual-disk-v1.png'][i],rarity:'MYTHIC',is_active:1,is_public:1},
 {id:117+i,code:'ARDEN_'+part,name:['아르덴 아머','아르덴 그리브','아르덴 부츠','아르덴 듀얼디스크'][i],slot:['TOP','BOTTOM','SHOES','ACCESSORY'][i],image_url:'preview/mythic-emperor-successor-v1/assets/mythic-'+['armor','pants','boots','dual-disk'][i]+'-fantasy-v5.png',rarity:'MYTHIC',is_active:1,is_public:1}
]);
export async function configureArdenFixture(f,{register=true}={}){
 for(const e of ardenCatalog)await f.p('INSERT INTO character_equipment_items(id,code,name,slot,rarity,image_url,total_power,pve_power,pvp_power) VALUES(?,?,?,?,?,?,400000,360000,40000)',e.id,e.code,e.name,e.slot,e.rarity,e.image_url).run();
 await f.p("INSERT INTO inventory_items(code,name,category,image_url) VALUES('ARDEN_ENERGY','아르덴 에너지','MATERIAL','assets/items/arden-energy-v1.webp')").run();
 await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'ARDEN_ENERGY',1000,1000)").run();
 await f.p('UPDATE users SET coin=1000000000000000 WHERE id=7').run();
 await f.p("DELETE FROM cnine_user_inventory WHERE user_id=7 AND item_code='MASTER_STAR'").run();
 for(const [id,equipmentId,level,uid] of [...PARTS.map((_,i)=>[201+i,43+i,15,7]),[205,43,10,7],[206,43,14,7],[207,43,0,7],[208,43,15,8],[209,43,15,7],[210,43,15,7]]){
  await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type) VALUES(?,?,?,'ARDEN_QA')",id,uid,equipmentId).run();
  await f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(?,?,?,11)',id,uid,level).run();
 }
 await f.p("INSERT INTO user_equipment_loadout(user_id,slot,instance_id) VALUES(7,'TOP',209)").run();
 if(f.pg)await f.pg.exec("SELECT setval(pg_get_serial_sequence('user_equipment_instances','id'),210)");
 f.arden=[];
 if(register)for(const part of PARTS)f.arden.push(await saveEquipmentCraftRecipe(f.env,f.user,draftFor(part,ardenCatalog).draft));
 f.ardenCraft=(requestId,part=0,instanceId=String(201+part),randomInt=()=>9999,user=f.user)=>f.deps.withUserMutationLock(f.env,user.id,'workshop/equipment-craft',()=>executeEquipmentCraft(f.env,user,{requestId:'qa-arden-craft-'+requestId,recipeId:f.arden[part],instanceId},{randomInt}));
 f.ardenState=async()=>equipmentCraftAccountState(f.env,f.user,await f.recipes());
 return f;
}
export async function ardenFixture(t,postgres=false,options={}){return configureArdenFixture(await equipmentFixture(t,postgres),options);}

import {forgeAdvancedDraft,FORGE_ADVANCED_KEY} from '../../shared/equipment-forge-advanced-v1.mjs';
import {equipmentFixture,equipmentDraft} from './workshop-equipment-fixture.mjs';
import {enableEquipmentRepairFixture} from './workshop-equipment-repair-fixture.mjs';
import {saveEquipmentCraftRecipe} from '../../functions/_workshop_equipment_craft.js';
import {P90_REQUIREMENTS as P} from '../../scripts/ops/eastern-p90-requirements-20261119.mjs';

export async function p90Fixture(t,postgres=true){
  const f=await equipmentFixture(t,postgres);await enableEquipmentRepairFixture(f);
  const advanced=forgeAdvancedDraft();advanced.steps.forEach((row,i)=>row.powerBonusPercent=[150,200,300,500,900][i]);await f.setting(FORGE_ADVANCED_KEY,advanced);
  for(const [id,code,name,image,power] of [
    [40,'EQ_1788486888336','東方軍火商(동방무기상)','gilded-dragon-antimateriel-rifle-mythic-v1.png',468000],
    [41,'EQ_1788486929132','東方軍火商(동방무기상)','gilded-dragon-ar-mythic-v1.png',468000],
    [53,'EASTERN_WEAPON_DRAFT_01','P90 · 東方軍火商(동방무기상)','eastern-weapons-gold-silver-v1/weapon-01-512.png',910000]]){
    await f.p("INSERT INTO character_equipment_items(id,code,name,slot,rarity,image_url,total_power,pve_power,pvp_power) VALUES(?,?,?,'WEAPON','MYTHIC',?,?,?,?)",id,code,name,'/assets/items/'+image,power,power*.9,power*.1).run();
  }
  await f.p('UPDATE user_equipment_instances SET equipment_id=CASE WHEN id=5 THEN 41 ELSE 40 END').run();
  await f.p('UPDATE equipment_forge_states_v1 SET level=CASE WHEN instance_id=3 THEN 14 ELSE 15 END').run();
  for(const [id,item] of [[7,40],[8,41],[9,41],[10,103]]){
    await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type) VALUES(?,7,?,'QA')",id,item).run();
    await f.p('INSERT INTO equipment_forge_states_v1 VALUES(?,7,15,11)',id).run();
  }
  if(postgres)await f.pg.exec("SELECT setval(pg_get_serial_sequence('user_equipment_instances','id'),10)");
  await f.p('UPDATE users SET coin=4000000000000000 WHERE id=7').run();
  await f.p("UPDATE cnine_user_inventory SET quantity=8000000000,unseen_quantity=8000000000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
  await f.p("UPDATE cnine_user_inventory SET quantity=10,unseen_quantity=10 WHERE user_id=7 AND item_code='PINGDU_REPAIR_COUPON'").run();
  for(const m of P.materials){
    await f.p("INSERT INTO inventory_items(code,name,category,image_url) VALUES(?,?,'MATERIAL',?)",m.code,'비밀무기 설계도 '+m.sort/10+'장','/assets/items/secret-weapon-blueprint-chapter-'+m.sort/10+'-v1.webp').run();
    await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,20,20)',m.code).run();
  }
  const draft={...equipmentDraft(),id:f.recipeId,code:P.code,name:'P90 · 동방무기상 제작',description:P.description,outputRef:'53',coinCost:P.coinCost,masterStarCost:P.masterStarCost,materials:P.materials.map(m=>({itemCode:m.code,quantity:m.quantity})),equipmentCraft:{...P.policy,revision:1}};
  await saveEquipmentCraftRecipe(f.env,f.user,draft);
  return {...f,draft};
}

import {ensureForgeRepairCatalog} from '../../functions/_forge_repair_catalog.js';
export async function enableEquipmentRepairFixture(f){
  await ensureForgeRepairCatalog(f.env);
  await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'PINGDU_REPAIR_COUPON',2,2)").run();
  await f.setting('equipment_forge_public_settings_v1',{schemaVersion:1,revision:1,publicVisible:true,executionMode:'ON',notice:'ISOLATED REPAIR QA'});
}

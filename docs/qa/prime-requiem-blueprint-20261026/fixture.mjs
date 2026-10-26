import {equipmentFixture} from '../../../tests/helpers/workshop-equipment-fixture.mjs';
import {ensurePrimeMaterialCatalog} from '../../../functions/_mercenary_prime_material.js';
import {MATERIAL} from './register.mjs';
export async function blueprintFixture(t){
 const f=await equipmentFixture(t);
 await f.p('ALTER TABLE inventory_items ADD COLUMN updated_at TEXT').run();
 await ensurePrimeMaterialCatalog(f.env);
 await f.p('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1)',MATERIAL.code,MATERIAL.name,MATERIAL.subtitle,MATERIAL.description,MATERIAL.category,MATERIAL.rarity,MATERIAL.image,MATERIAL.sortOrder).run();
 return f;
}

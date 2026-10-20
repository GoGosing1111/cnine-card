import {jointFixture} from './joint-db.mjs';
import {RANK_POTIONS} from '../../shared/rank-exp-potion-v1.mjs';
import {ensureJointTransactionSchema} from '../../functions/_joint_transactions.js';
export async function potionFixture(t,{postgres=false}={}){
 const f=await jointFixture(t,{postgres});await ensureJointTransactionSchema(f.env);
 for(const item of RANK_POTIONS){
  await f.p('INSERT INTO inventory_items(code,name,rarity,image_url,category,is_active) VALUES(?,?,?,?,?,1)',item.code,item.name,item.rarity,item.image,item.category).run();
  await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,5,5)',item.code).run();
 }
 return {...f,stock:async multiplier=>Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?',RANK_POTIONS.find(x=>x.multiplier===multiplier).code).first()).quantity)};
}

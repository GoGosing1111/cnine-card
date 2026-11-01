import {readFileSync} from 'node:fs';
import {lootFixture} from './loot-shop-db.mjs';
import {planPepeguRental} from '../../scripts/ops/pepegu-ranked-rental-20261101.mjs';
import {validateRankedShopPolicy} from '../../shared/ranked-shop-policy-v1.mjs';
import {emptyPetCmsDocument} from '../../shared/pet-cms-v1.mjs';
import {ensurePetPotentialItem} from '../../functions/_pet_potential.js';
const approved=JSON.parse(readFileSync(new URL('../../docs/qa/pet-pepegu-20261101/verify.json',import.meta.url)));
export async function pepeguRentalFixture(t,{postgres='pipeline'}={}){
 const f=await lootFixture(t,{postgres}),cms={revision:43,audit:[],document:{...emptyPetCmsDocument(),pets:[approved.heukgu,approved.pepegu[0]]}},plan=planPepeguRental(cms,validateRankedShopPolicy(f.shopPolicy));
 await f.setting('pet_cms_preparation_v1',{...cms,revision:44,document:plan.document});await f.setting('ranked_shop_policy_v1',plan.policy);
 await f.p("INSERT INTO inventory_items(code,name,rarity,image_url) VALUES('RANKED_COIN','랭크전 코인','SPECIAL','assets/items/ranked-coin-20261101.webp')").run();
 await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'RANKED_COIN',12000,12000),(8,'RANKED_COIN',12000,12000)").run();
 await ensurePetPotentialItem(f.env);
 return {...f,plan,product:plan.product,cms:{...cms,revision:44,document:plan.document}};
}

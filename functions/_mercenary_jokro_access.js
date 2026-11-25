import {JOKRO_CODE,JOKRO_OWNER_ID} from '../shared/mercenary-jokro-v1.mjs';
import {readLimitedShardCraftOwners} from './_mercenary_craft_access.js';
import {readIssuedMercenaryOwners} from './_mercenary_pack_issuance.js';
import {readAuctionMercenaryOwners} from './_auction_user_access.js';

// Pack issuance, crafting and auction transfers can each prove ownership.
export async function readJokroPackOwners(env,userIds){
 const ids=[...new Set(userIds.map(Number))].filter(id=>Number.isSafeInteger(id)&&id>0&&id!==JOKRO_OWNER_ID);
 if(!ids.length)return new Set();
 const owners=await readIssuedMercenaryOwners(env,JOKRO_CODE,ids);
 const candidates=await env.DB.prepare(`SELECT DISTINCT user_id FROM mercenary_card_acquisitions_v1 WHERE mercenary_code=? AND acquisition_id LIKE 'JOKRO:%' AND user_id IN (${ids.map(()=>'?').join(',')})`).bind(JOKRO_CODE,...ids).all();
 const craftIds=candidates.results.map(r=>Number(r.user_id)).filter(id=>!owners.has(id));
 if(craftIds.length){
  const crafted=await env.DB.prepare(`SELECT DISTINCT l.user_id FROM workshop_craft_logs_v1668 l
   JOIN workshop_recipes_v1668 r ON r.id=l.recipe_id AND r.code='WORKSHOP_JOKRO' AND r.output_type='MERCENARY' AND r.output_ref=l.output_ref
   JOIN workshop_craft_receipts_v1668 c ON c.request_id=l.request_id AND c.user_id=l.user_id AND c.recipe_id=l.recipe_id AND c.status='COMPLETED'
   JOIN mercenary_card_acquisitions_v1 a ON a.acquisition_id=('JOKRO:' || CAST(l.user_id AS TEXT) || ':' || l.request_id) AND a.user_id=l.user_id AND a.mercenary_code=l.output_ref
   WHERE l.output_type='MERCENARY' AND l.output_ref=? AND l.output_quantity=1 AND l.success=1 AND l.user_id IN (${craftIds.map(()=>'?').join(',')})`).bind(JOKRO_CODE,...craftIds).all();
  for(const row of crafted.results)owners.add(Number(row.user_id));
 }
 for(const id of await readLimitedShardCraftOwners(env,JOKRO_CODE,ids.filter(id=>!owners.has(id))))owners.add(id);
 for(const id of await readAuctionMercenaryOwners(env,JOKRO_CODE,ids.filter(id=>!owners.has(id))))owners.add(id);
 return owners;
}

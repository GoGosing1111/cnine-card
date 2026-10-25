import {LIMITED_SHARD_CRAFTS} from '../shared/mercenary-limited-shard-craft-v1.mjs';

// Prove entitlement with the successful ledger, completed receipt and matching
// acquisition. A holding or an unfinished receipt alone is never sufficient.
export async function readLimitedShardCraftOwners(env,code,userIds){
 const definition=LIMITED_SHARD_CRAFTS.find(d=>d.code===code);
 const ids=[...new Set(userIds.map(Number))].filter(id=>Number.isSafeInteger(id)&&id>0);
 if(!definition||!ids.length)return new Set();
 const candidates=await env.DB.prepare(`SELECT DISTINCT user_id FROM mercenary_card_acquisitions_v1 WHERE mercenary_code=? AND acquisition_id LIKE ? AND user_id IN (${ids.map(()=>'?').join(',')})`).bind(code,definition.prefix+':%',...ids).all();
 const eligible=candidates.results.map(r=>Number(r.user_id));if(!eligible.length)return new Set();
 const rows=await env.DB.prepare(`SELECT DISTINCT l.user_id FROM workshop_craft_logs_v1668 l
  JOIN workshop_recipes_v1668 r ON r.id=l.recipe_id AND r.code=? AND r.output_type='MERCENARY' AND r.output_ref=l.output_ref
  JOIN workshop_craft_receipts_v1668 c ON c.request_id=l.request_id AND c.user_id=l.user_id AND c.recipe_id=l.recipe_id AND c.status='COMPLETED'
  JOIN mercenary_card_acquisitions_v1 a ON a.acquisition_id=(? || ':' || CAST(l.user_id AS TEXT) || ':' || l.request_id) AND a.user_id=l.user_id AND a.mercenary_code=l.output_ref
  WHERE l.output_type='MERCENARY' AND l.output_ref=? AND l.output_quantity=1 AND l.success=1 AND l.user_id IN (${eligible.map(()=>'?').join(',')})`).bind(definition.recipeCode,definition.prefix,code,...eligible).all();
 return new Set(rows.results.map(r=>Number(r.user_id)));
}

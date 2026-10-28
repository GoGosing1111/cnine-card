import {JINMU_CODE,JINMU_OWNER_ID,JINMU_PACK_SERVER_LIMIT} from '../shared/mercenary-jinmu-v1.mjs';
import {readLimitedShardCraftOwners} from './_mercenary_craft_access.js';
import {sssCubeStockCode} from '../shared/sss-miracle-cube-stock-v1.mjs';

// The original exclusive grant stays valid. Other accounts require a real,
// completed Halloween pack or SSS cube issuance; a stray holding or recalled grant is not
// an entitlement. This is read-only and never grants or restores a card.
export async function readJinmuPackOwners(env,userIds){
 const ids=[...new Set(userIds.map(Number))].filter(id=>Number.isSafeInteger(id)&&id>0&&id!==JINMU_OWNER_ID);
 if(!ids.length)return new Set();
 const rows=await env.DB.prepare(`SELECT DISTINCT i.user_id FROM mercenary_limited_issues_v1 i
 JOIN mercenary_limited_stock_v1 s ON s.code=i.code AND (s.stock_limit IN (3,4,${JINMU_PACK_SERVER_LIMIT}) OR s.code='${sssCubeStockCode(JINMU_CODE)}') AND i.serial BETWEEN 1 AND s.issued
 JOIN mercenary_card_acquisitions_v1 a ON a.acquisition_id=i.acquisition_id AND a.user_id=i.user_id AND a.mercenary_code='${JINMU_CODE}'
 JOIN joint_operations_v1 o ON o.request_id=i.request_id AND o.user_id=i.user_id AND o.kind IN ('MERCENARY_HALLOWEEN_OPEN','SSS_MIRACLE_CUBE_OPEN') AND o.status='COMPLETED'
 WHERE (i.code=? OR (i.code=? AND o.kind='SSS_MIRACLE_CUBE_OPEN')) AND i.serial<=s.stock_limit AND i.user_id IN (${ids.map(()=>'?').join(',')})`).bind(JINMU_CODE,sssCubeStockCode(JINMU_CODE),...ids).all();
 const owners=new Set(rows.results.map(r=>Number(r.user_id)));
 for(const id of await readLimitedShardCraftOwners(env,JINMU_CODE,ids.filter(id=>!owners.has(id))))owners.add(id);
 return owners;
}

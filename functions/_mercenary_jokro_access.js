import {JOKRO_CODE,JOKRO_OWNER_ID} from '../shared/mercenary-jokro-v1.mjs';

// A holding alone is not a pack entitlement. Validate the completed opening,
// matching acquisition and one of the three issued serials, just as for Jinmu.
export async function readJokroPackOwners(env,userIds){
 const ids=[...new Set(userIds.map(Number))].filter(id=>Number.isSafeInteger(id)&&id>0&&id!==JOKRO_OWNER_ID);
 if(!ids.length)return new Set();
 const rows=await env.DB.prepare(`SELECT DISTINCT i.user_id FROM mercenary_limited_issues_v1 i
 JOIN mercenary_limited_stock_v1 s ON s.code=i.code AND s.stock_limit=3 AND i.serial BETWEEN 1 AND s.issued
 JOIN mercenary_card_acquisitions_v1 a ON a.acquisition_id=i.acquisition_id AND a.user_id=i.user_id AND a.mercenary_code=i.code
 JOIN joint_operations_v1 o ON o.request_id=i.request_id AND o.user_id=i.user_id AND o.kind='MERCENARY_HALLOWEEN_OPEN' AND o.status='COMPLETED'
 WHERE i.code=? AND i.serial<=3 AND i.user_id IN (${ids.map(()=>'?').join(',')})`).bind(JOKRO_CODE,...ids).all();
 return new Set(rows.results.map(r=>Number(r.user_id)));
}

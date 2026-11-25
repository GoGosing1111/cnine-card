import {HALLOWEEN_RERUN_LIMITS,halloweenRerunStockKey} from '../shared/mercenary-halloween-pack-v1.mjs';
import {isHalloweenStockLimit} from '../shared/mercenary-halloween-pool-v3.mjs';
import {sssCubeStockCode} from '../shared/sss-miracle-cube-stock-v1.mjs';

export async function readIssuedMercenaryOwners(env,code,ids){
 const cube=sssCubeStockCode(code);
 const {results}=await env.DB.prepare(`SELECT DISTINCT i.user_id,i.code,
   s.stock_limit-COALESCE(r.issued,0) AS original_limit
  FROM mercenary_limited_issues_v1 i
  JOIN mercenary_limited_stock_v1 s ON s.code=i.code AND i.serial BETWEEN 1 AND s.issued AND i.serial<=s.stock_limit
  JOIN mercenary_card_acquisitions_v1 a ON a.acquisition_id=i.acquisition_id AND a.user_id=i.user_id AND a.mercenary_code=?
  JOIN joint_operations_v1 o ON o.request_id=i.request_id AND o.user_id=i.user_id AND o.status='COMPLETED'
  LEFT JOIN mercenary_limited_stock_v1 r ON r.code=?
  WHERE ((i.code=? AND o.kind IN ('MERCENARY_HALLOWEEN_OPEN','SSS_MIRACLE_CUBE_OPEN')
          AND (r.code IS NULL OR (r.stock_limit=? AND r.issued BETWEEN 0 AND r.stock_limit)))
      OR (i.code=? AND o.kind='SSS_MIRACLE_CUBE_OPEN'))
    AND i.user_id IN (${ids.map(()=>'?').join(',')})`)
  .bind(code,halloweenRerunStockKey(code),code,HALLOWEEN_RERUN_LIMITS[code],cube,...ids).all();
 // The rerun extends the original serial ledger by one for each new copy issued.
 // Dedicated cube stock has its own serials and never uses the Halloween quota.
 const owners=new Set();
 for(const row of results){
  if(row.code===cube||isHalloweenStockLimit(code,Number(row.original_limit)))owners.add(Number(row.user_id));
 }
 return owners;
}

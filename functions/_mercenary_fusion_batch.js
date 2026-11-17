import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

// Called inside the fusion's account lock and atomic consumption transaction.
// Every roll retains its acquisition ID and intermediate copy count. Only the
// database round trips are grouped; probabilities and per-roll receipts stay exact.
export function fusionBatchAcquisitionStatements(DB,{userId,results,ids,createdAt}){
  const p=(sql,...values)=>DB.prepare(sql).bind(...values),token=crypto.randomUUID();
  const codes=[...new Set(results.map(r=>r.mercenaryCode))];
  const list=[p('SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE')];
  list.push(jointGuard(DB,token,`EXISTS(SELECT 1 FROM mercenary_draw_config_v1 WHERE id=1) AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements_text(CAST(? AS JSONB)) AS c(code)
    JOIN mercenary_draw_config_v1 d ON d.id=1
    WHERE COALESCE(CAST(d.payload_json::jsonb -> 'cardRules' -> 'cardWeights' ->> c.code AS BIGINT),1)=0)`,[JSON.stringify(codes)]));
  for(let offset=0;offset<results.length;offset+=200){
    const rows=results.slice(offset,offset+200).map((r,i)=>({id:ids[offset+i],code:r.mercenaryCode,position:i}));
    list.push(p(`WITH grants AS MATERIALIZED (
      SELECT id,code,ROW_NUMBER() OVER(PARTITION BY code ORDER BY position) AS ordinal
      FROM jsonb_to_recordset(CAST(? AS JSONB)) AS g(id TEXT,code TEXT,position INTEGER)
    ), totals AS MATERIALIZED (SELECT code,COUNT(*) AS quantity FROM grants GROUP BY code),
    acquired AS (
      INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
      SELECT ?,code,quantity,quantity-1,?,? FROM totals
      ON CONFLICT(user_id,mercenary_code) DO UPDATE SET
        total_copies=user_mercenary_cards_v1.total_copies+excluded.total_copies,
        duplicate_count=user_mercenary_cards_v1.duplicate_count+excluded.total_copies,
        last_obtained_at=excluded.last_obtained_at
      RETURNING user_id,mercenary_code,total_copies
    )
    INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at)
    SELECT g.id,a.user_id,g.code,CASE WHEN a.total_copies-t.quantity+g.ordinal>1 THEN 1 ELSE 0 END,
      a.total_copies-t.quantity+g.ordinal,a.total_copies-t.quantity+g.ordinal-1,?
    FROM grants g JOIN totals t ON t.code=g.code JOIN acquired a ON a.mercenary_code=g.code`,
    JSON.stringify(rows),userId,createdAt,createdAt,createdAt));
  }
  list.push(p(`UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN
    (SELECT COUNT(*) FROM mercenary_card_acquisitions_v1 a
      JOIN jsonb_array_elements_text(CAST(? AS JSONB)) AS expected(id) ON a.acquisition_id=expected.id
      WHERE a.user_id=?)=? THEN 1 ELSE 0 END WHERE token=?`,JSON.stringify(ids),userId,results.length,token));
  list.push(jointGuardEnd(DB,token));
  return list;
}

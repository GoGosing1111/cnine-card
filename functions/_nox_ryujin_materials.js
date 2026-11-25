import {mercenaryRandomInt} from './_mercenary_draw_accounting.js';

export const NOX_RYUJIN_MATERIALS = [
  {code:'RYUJIN_NECKLACE', name:'류진의 목걸이', image:'/assets/items/ryujin-necklace-v1.webp'},
  {code:'RYUJIN_BOOTS', name:'류진의 신발', image:'/assets/items/ryujin-boots-v1.webp'},
  {code:'RYUJIN_MASK', name:'류진의 가면', image:'/assets/items/ryujin-mask-v1.webp'}
];

export function drawNoxRyujinMaterial(chanceBps, randomInt = mercenaryRandomInt) {
  if (randomInt(10000) >= chanceBps) return null;
  return NOX_RYUJIN_MATERIALS[randomInt(NOX_RYUJIN_MATERIALS.length)];
}

// The weekly payout and room version are locked by the enclosing clear transaction.
export async function grantNoxRyujinMaterials(q, payouts, chanceBps, roomId) {
  const picks = [];
  for (const {id, used} of payouts) {
    if (used === null) continue;
    const item = drawNoxRyujinMaterial(chanceBps);
    if (item) picks.push({id, code:item.code});
  }
  const drops = new Map();
  if (!picks.length) return drops;
  const granted = await q(`WITH inventory_grant AS (
    INSERT INTO cnine_user_inventory AS inventory(user_id,item_code,quantity,unseen_quantity)
    SELECT pick.id, item.code, 1, 1 FROM jsonb_to_recordset($1::jsonb) AS pick(id bigint,code text)
    JOIN inventory_items AS item ON item.code=pick.code AND item.is_active=1
    ORDER BY pick.id
    ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=inventory.quantity+1,
      unseen_quantity=inventory.unseen_quantity+1,updated_at=CURRENT_TIMESTAMP
    RETURNING user_id,item_code,quantity
  )
  INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
  SELECT user_id,item_code,1,quantity,'NOX_RAID_RYUJIN_MATERIAL','NOX_RAID',$2 FROM inventory_grant
  RETURNING user_id::text AS id,item_code`, [JSON.stringify(picks),roomId]);
  for (const {id, item_code} of granted) {
    const item = NOX_RYUJIN_MATERIALS.find(material => material.code === item_code);
    drops.set(id, {...item, type:'INVENTORY_ITEM', ref:item.code, quantity:1, eventId:roomId+':'+id});
  }
  return drops;
}

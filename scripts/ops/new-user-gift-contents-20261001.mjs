import { ensureNewUserGift, newUserGiftStatus } from '../../functions/_new_user_gift.js';

// Explicit contents replacement only. Never issues a box or opens/grants rewards.
// Each unopened V1 receipt uses the same locked, hash-checked conversion as the UI.
export async function refreshIssuedNewUserGiftContents(env) {
  await ensureNewUserGift(env);
  const { results } = await env.DB.prepare(`SELECT r.user_id FROM new_user_gift_receipts_v1 r
    JOIN users u ON u.id=r.user_id WHERE r.status='ISSUED'
    AND r.manifest_json::jsonb->>'version'='1' ORDER BY r.user_id`).all();
  const receipts = [];
  for (const row of results) {
    const status = await newUserGiftStatus(env, row.user_id);
    receipts.push({userId:Number(row.user_id),status:status.receipt.status,version:status.rewards.version,
      cardLevels:status.rewards.cardLevels,cardCount:status.rewards.cards.length,
      equipment:status.rewards.equipment.map(e=>e.code)});
  }
  return {updated:receipts.filter(r=>r.status==='ISSUED'&&r.version===2).length,receipts};
}

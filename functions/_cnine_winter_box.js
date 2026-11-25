import {CNINE_WINTER_BOX as box, CNINE_STREAMER_SHARD as shard, WINTER_BOX_CONTENTS} from '../shared/cnine-winter-box-v1.mjs';
import {coinCreditLimit} from '../shared/coin-integer-v1.mjs';
import {ensureRuntimeFoundation} from './_runtime_foundation.js';
import {ensureSxBodyCoreCatalog} from './_battle_suit_materials.js';
import {ensureForgeScrollCatalog} from './_forge_scroll_catalog.js';
import {grantCnineGiftBox} from './_cnine_streamer_box.js';
import {runJointOperation, jointInventoryChange} from './_joint_transactions.js';
import {jointGuard, jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';

const catalogKey = 'cnine_winter_box_catalog_v1';

export function ensureCnineWinterBoxCatalog(env) {
  return ensureRuntimeFoundation(env, catalogKey, [catalogKey], async () => {
    await ensureForgeScrollCatalog(env);
    await ensureSxBodyCoreCatalog(env);
    const insert = (item, subtitle, category, sort) => env.DB.prepare(
      "INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,'SPECIAL',?,?,1) ON CONFLICT(code) DO NOTHING"
    ).bind(item.code, item.name, subtitle, item.description, category, item.image, sort);
    await env.DB.batch([
      insert(box, 'CNINE WINTER BOX', 'GIFT_BOX', 46),
      insert(shard, 'CNINE STREAMER SHARD', 'MATERIAL', 47),
      env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING").bind(catalogKey)
    ]);
  });
}

export function grantCnineWinterBox(env, admin, body) {
  return grantCnineGiftBox(env, admin, body, box, ensureCnineWinterBoxCatalog);
}

export async function openCnineWinterBox(env, user, {requestId, count=1}) {
  if (count !== 1) throw jointError('WINTER_BOX_COUNT', '씨나인 겨울박스는 한 번에 1개씩 개봉할 수 있습니다.', 400);
  await ensureCnineWinterBoxCatalog(env);
  const db = env.DB;
  const {plan, replayed} = await runJointOperation(env, user, {
    requestId, kind:'CNINE_WINTER_BOX_OPEN', input:{itemCode:box.code, count},
    prepare:async () => {
      const owned = await db.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id, box.code).first();
      if (!(Number(owned?.quantity) >= 1)) throw jointError('WINTER_BOX_EMPTY', '보유한 씨나인 겨울박스가 없습니다.', 409);
      return {rewards:Object.fromEntries(WINTER_BOX_CONTENTS.map(({code,quantity}) => [code, quantity]))};
    },
    statements:async ({rewards}) => {
      const {COIN:coins, ...inventory} = rewards;
      const items = Object.entries(inventory);
      const token = crypto.randomUUID();
      const capacity = items.map(() => '(item_code=? AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))').join(' OR ');
      const limits = items.flatMap(([code, quantity]) => [code, Number.MAX_SAFE_INTEGER-quantity, Number.MAX_SAFE_INTEGER-quantity]);
      return [
        jointGuard(db, token, `EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=0 AND coin<=?)
          AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND (${capacity}))`,
          [user.id, coinCreditLimit(coins), user.id, ...limits]),
        ...jointInventoryChange(db, user.id, box.code, -1, 'CNINE_WINTER_BOX_OPEN', requestId),
        ...items.flatMap(([code, quantity]) => jointInventoryChange(db, user.id, code, quantity, 'CNINE_WINTER_BOX_REWARD', requestId)),
        db.prepare('UPDATE users SET coin=coin+CAST(? AS BIGINT) WHERE id=?').bind(coins, user.id),
        db.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?').bind(coins, box.code+':'+requestId, user.id),
        jointGuardEnd(db, token)
      ];
    }
  });
  return {ok:true, requestId, replayed, itemCode:box.code, count, rewards:plan.rewards};
}

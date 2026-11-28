import {ensureLootShopSchema,LOOT_SHOP_KEY,pigCoinBalance} from '../../functions/_loot_shop.js';
import {LOOT_SHOP_DEFAULTS} from '../../shared/loot-shop-policy-v1.mjs';
import {RAID_VICTORY_ITEMS} from '../../shared/hideout-defense-v1.mjs';

export async function prepareRaidWallet(f){
  await ensureLootShopSchema(f.env);
  await f.setting(LOOT_SHOP_KEY,LOOT_SHOP_DEFAULTS);
}

export async function raidBalances(f,id){
  const quantities=[];
  for(const item of RAID_VICTORY_ITEMS){
    const row=await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',id,item.code).first();
    quantities.push(Number(row?.quantity||0));
  }
  return [...quantities,await pigCoinBalance(f.env,id)];
}

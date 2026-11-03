import test from 'node:test';import assert from 'node:assert/strict';
import {lootFixture} from './helpers/loot-shop-db.mjs';
import {prepareAuctionTicketShop} from '../shared/auction-user-policy-v1.mjs';
import {validateLootShopPolicy,lootPurchaseMaximum} from '../shared/loot-shop-policy-v1.mjs';
import {validateRankedShopPolicy} from '../shared/ranked-shop-policy-v1.mjs';
import {purchaseLootProduct,lootShopState} from '../functions/_loot_shop.js';
import {purchaseLootProduct as rankedPurchase,lootShopState as rankedState,LOOT_SHOP_KEY as RANKED_KEY} from '../functions/_ranked_shop.js';
for(const postgres of [false,true])for(const shop of ['LOOT','RANKED'])test(`${postgres?'PostgreSQL':'SQLite'} ${shop}: ticket bulk100/unlimited, exact price, failure/replay, previous policies intact`,async t=>{
 const f=await lootFixture(t,{postgres}),price=shop==='LOOT'?500:300;
 await f.p("INSERT INTO inventory_items(code,name,rarity,image_url) VALUES('AUCTION_HOST_TICKET','경매 개최 티켓','SPECIAL','/assets/items/auction-host-ticket-20261103-v1.png')").run();
 await f.p('UPDATE pig_coin_wallets_v1 SET balance=100000 WHERE user_id=7').run();
 if(shop==='RANKED'){await f.p("INSERT INTO inventory_items(code,name,rarity,image_url) VALUES('RANKED_COIN','랭크전 코인','SPECIAL','/ranked.webp')").run();await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'RANKED_COIN',100000,0)").run();}
 const policy=prepareAuctionTicketShop(f.shopPolicy,shop),ticket=policy.products.at(-1);ticket.enabled=true;ticket.visible=true;
 const validate=shop==='LOOT'?validateLootShopPolicy:validateRankedShopPolicy;assert.deepEqual(validate(policy).products.slice(0,-1),f.shopPolicy.products);assert.throws(()=>validate({...policy,products:[...policy.products.slice(0,-1),{...ticket,id:'another_bundle'}]}));
 if(shop==='LOOT')await f.setShop(validate(policy));else await f.setting(RANKED_KEY,validate(policy));
 const purchase=shop==='LOOT'?purchaseLootProduct:rankedPurchase,state=shop==='LOOT'?lootShopState:rankedState,product=(await state(f.env,f.user)).products.find(p=>p.id===ticket.id);assert.equal(product.remaining,null);assert.equal(product.canBuy,true);assert.equal(lootPurchaseMaximum(product,100000),100);
 const body={requestId:crypto.randomUUID(),productId:ticket.id,quantity:100};f.fail('INSERT INTO inventory_logs');await assert.rejects(purchase(f.env,f.user,body));f.fail('');assert.equal(Number((await f.p("SELECT COALESCE(SUM(quantity),0) n FROM cnine_user_inventory WHERE user_id=7 AND item_code='AUCTION_HOST_TICKET'").first()).n),0);
 const bought=await purchase(f.env,f.user,body);assert.equal(bought.totalPrice,100*price);assert.equal((await purchase(f.env,f.user,body)).replayed,true);await purchase(f.env,f.user,{...body,requestId:crypto.randomUUID(),quantity:1});assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='AUCTION_HOST_TICKET'").first()).quantity),101);assert.equal((await state(f.env,f.user)).products.find(p=>p.id===ticket.id).remaining,null);
 await assert.rejects(purchase(f.env,f.user,{...body,requestId:crypto.randomUUID(),quantity:101}));
});

import test from 'node:test';import assert from 'node:assert/strict';
import {userAuctionFixture} from './helpers/auction-user-fixture-20261103.mjs';
import {AUCTION_DURATION_MS,AUCTION_MAX_BID,AUCTION_QUICK_BIDS,auctionProceeds,prepareAuctionTicketShop} from '../shared/auction-user-policy-v1.mjs';
const coin=(f,id)=>f.row(`SELECT coin FROM users WHERE id=${id}`).coin;
const tickets=(f,id)=>f.row(`SELECT quantity FROM cnine_user_inventory WHERE user_id=${id} AND item_code='AUCTION_HOST_TICKET'`).quantity;
test('confirmed prices, 5 exact quick bids, 20% fee and pure shop preparation preserve existing sales',()=>{
 assert.deepEqual(AUCTION_QUICK_BIDS.map(x=>x.amount),[1e7,1e11,1e12,1e13,1e14]);assert.equal(AUCTION_DURATION_MS,7200000);
 assert.deepEqual(auctionProceeds(100_000_000_000_003),{gross:100_000_000_000_003,fee:20_000_000_000_000,net:80_000_000_000_003});
 for(const [shop,price] of [['LOOT',500],['RANKED',300]]){const before={salesEnabled:true,products:[{id:'old',price:7}]},next=prepareAuctionTicketShop(before,shop);assert.equal(next.products[1].price,price);assert.equal(next.products[1].enabled,false);assert.equal(next.salesEnabled,true);assert.deepEqual(before,{salesEnabled:true,products:[{id:'old',price:7}]});}
});
test('one active auction, FIFO queue and a full 2 hours from actual activation',async t=>{
 const f=await userAuctionFixture(t),a=await f.host(1),b=await f.host(2),c=await f.host(3);
 assert.equal(a.lot.status,'ACTIVE');assert.equal(b.lot.status,'QUEUED');assert.equal(c.lot.status,'QUEUED');assert.equal(b.lot.endsMs,null);
 f.advance(AUCTION_DURATION_MS+300000);const state=await f.service.state(f.user(1));assert.equal(state.active.id,b.lot.id);assert.equal(state.active.endsMs-f.now(),AUCTION_DURATION_MS);assert.equal(state.queue[0].id,c.lot.id);
 assert.equal(f.row("SELECT COUNT(*) n FROM auction_user_lots_v1 WHERE status='ACTIVE'").n,1);
});
test('existing legacy auction blocks promotion without shortening reserved duration',async t=>{const f=await userAuctionFixture(t);f.setLegacy(true);const a=await f.host(1);assert.equal(a.lot.status,'QUEUED');assert.equal((await f.service.state(f.user(1))).active,null);f.advance(9e6);f.setLegacy(false);assert.equal((await f.service.state(f.user(1))).active.endsMs,f.now()+AUCTION_DURATION_MS);});
test('hosting retry is identical once, mismatched replay fails, no ticket means no escrow',async t=>{
 const f=await userAuctionFixture(t),rid=f.requestId(),a=await f.host(1,'ITEM',2,{requestId:rid});
 assert.equal((await f.host(1,'ITEM',2,{requestId:rid})).replayed,true);assert.equal(tickets(f,1),9);
 await assert.rejects(f.host(1,'ITEM',3,{requestId:rid}),/다른 내용/);
 f.sql.exec("UPDATE cnine_user_inventory SET quantity=0 WHERE user_id=2 AND item_code='AUCTION_HOST_TICKET'");
 await assert.rejects(f.host(2),/바뀌었습니다/);assert.equal(f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='POTION'").quantity,100);assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_lots_v1').n,1);assert.ok(a.lot.id);
});
test('injected ticket/log/lot failures rollback all stock, ticket and receipts',async t=>{
 const f=await userAuctionFixture(t);for(const text of ['INSERT INTO inventory_logs','INSERT INTO auction_user_lots_v1']){f.faults.sql=text;await assert.rejects(f.host(1,'ITEM',3),/injected failure/);assert.equal(tickets(f,1),10);assert.equal(f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='POTION'").quantity,100);assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_lots_v1').n,0);}f.faults.sql='';
});
test('100조 debit, exact seller 80조, loser refund and settlement replay leave no duplicate',async t=>{
 const f=await userAuctionFixture(t),a=await f.host(1,'ITEM',3),rid=f.requestId();
 await f.service.bid(f.user(2),{lotId:a.lot.id,amount:AUCTION_MAX_BID,requestId:rid});assert.equal((await f.service.bid(f.user(2),{lotId:a.lot.id,amount:AUCTION_MAX_BID,requestId:rid})).replayed,true);
 await f.service.bid(f.user(3),{lotId:a.lot.id,amount:1e12,requestId:f.requestId()});f.advance(AUCTION_DURATION_MS);await f.service.tick();await f.service.tick();
 assert.equal(coin(f,1),580e12);assert.equal(coin(f,2),400e12);assert.equal(coin(f,3),500e12);assert.equal(f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='POTION'").quantity,103);assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_settlements_v1').n,1);assert.equal(f.row('SELECT fee FROM auction_user_settlements_v1').fee,20e12);
});
test('self bid, queued bid, too large/fractional amount and insufficient funds fail without payment',async t=>{
 const f=await userAuctionFixture(t),a=await f.host(1),b=await f.host(3);
 await assert.rejects(f.service.bid(f.user(1),{lotId:a.lot.id,amount:1,requestId:f.requestId()}),/본인/);
 await assert.rejects(f.service.bid(f.user(2),{lotId:b.lot.id,amount:1,requestId:f.requestId()}),/입찰 가능/);
 for(const amount of [0,-1,1.5,1e14+1,Number.MAX_SAFE_INTEGER])await assert.rejects(f.service.bid(f.user(2),{lotId:a.lot.id,amount,requestId:f.requestId()}));
 f.sql.exec('UPDATE users SET coin=0 WHERE id=2');await assert.rejects(f.service.bid(f.user(2),{lotId:a.lot.id,amount:1,requestId:f.requestId()}));assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_bid_receipts_v1').n,0);
});
test('queued cancellation returns goods and unused ticket once; active cancellation forbidden',async t=>{
 const f=await userAuctionFixture(t),a=await f.host(1),b=await f.host(2,'ITEM',3);await assert.rejects(f.service.cancel(f.user(1),a.lot.id),/시작 전/);
 await f.service.cancel(f.user(2),b.lot.id);assert.equal((await f.service.cancel(f.user(2),b.lot.id)).replayed,true);assert.equal(tickets(f,2),10);assert.equal(f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='POTION'").quantity,100);
});
test('unsold returns goods, consumes used ticket and refunds below-start bids',async t=>{const f=await userAuctionFixture(t),a=await f.host(1,'ITEM',3,{startPrice:100});await f.service.bid(f.user(2),{lotId:a.lot.id,amount:50,requestId:f.requestId()});f.advance(AUCTION_DURATION_MS);await f.service.tick();assert.equal(coin(f,2),500e12);assert.equal(tickets(f,1),9);assert.equal(f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='POTION'").quantity,100);});
for(const kind of ['CARD','MERCENARY','PET','EQUIPMENT','VEHICLE','MASTER_STAR'])test(`${kind}: actual ownership transfer preserves both accounts' growth`,async t=>{
 const f=await userAuctionFixture(t),before=JSON.stringify([f.sql.prepare('SELECT * FROM user_mercenary_levels_v1').all(),f.sql.prepare("SELECT * FROM app_meta WHERE key LIKE 'pet_potentials%' OR key LIKE 'mercenary_experience%' ORDER BY key").all(),f.sql.prepare('SELECT user_id,breakthrough_level,breakthrough_fail_count FROM user_cards ORDER BY user_id').all()]);
 const a=await f.host(1,kind,kind==='MERCENARY'?3:1);await f.service.bid(f.user(2),{lotId:a.lot.id,amount:100,requestId:f.requestId()});f.advance(AUCTION_DURATION_MS);await f.service.tick();
 const after=JSON.stringify([f.sql.prepare('SELECT * FROM user_mercenary_levels_v1').all(),f.sql.prepare("SELECT * FROM app_meta WHERE key LIKE 'pet_potentials%' OR key LIKE 'mercenary_experience%' ORDER BY key").all(),f.sql.prepare('SELECT user_id,breakthrough_level,breakthrough_fail_count FROM user_cards ORDER BY user_id').all()]);assert.equal(after,before);
 const owned=await f.catalog(f.user(2));assert.ok(owned.some(x=>x.kind===kind));if(kind==='MERCENARY')assert.equal(owned.find(x=>x.kind===kind).quantity,6);if(kind==='EQUIPMENT')assert.equal(f.row('SELECT id FROM user_equipment_instances WHERE user_id=2').id,1001);
});
test('equipped last copies, enhanced equipment and rental-only pets cannot be sold',async t=>{
 const f=await userAuctionFixture(t);f.sql.exec("INSERT INTO pve_decks VALUES(1,'[\"C001\"]');INSERT INTO user_mercenary_loadout_v1 VALUES(1,'V-971');INSERT INTO equipment_forge_states_v1 VALUES(1001,1,15)");
 for(const [kind,q] of [['CARD',3],['MERCENARY',3],['EQUIPMENT',1]])await assert.rejects(f.host(1,kind,q));
 f.sql.prepare('UPDATE app_meta SET value=? WHERE key=?').run(JSON.stringify({revision:2,pets:{'PET-HEUKGU':0}}),'pet_collection_v1:1');await assert.rejects(f.host(1,'PET',1));assert.equal(tickets(f,1),10);
});
test('notice is once per auction/account across repeated reads; no queue or expired popup',async t=>{
 const f=await userAuctionFixture(t),a=await f.host(1),b=await f.host(2);assert.equal((await f.service.claimNotice(f.user(3),b.lot.id)).show,false);
 assert.equal((await f.service.claimNotice(f.user(2),a.lot.id)).show,true);assert.equal((await f.service.claimNotice(f.user(2),a.lot.id)).show,false);assert.equal((await f.service.claimNotice(f.user(3),a.lot.id)).show,true);
 f.advance(AUCTION_DURATION_MS);assert.equal((await f.service.claimNotice(f.user(1),a.lot.id)).show,false);await f.service.tick();assert.equal((await f.service.claimNotice(f.user(3),b.lot.id)).show,true);
});
test('simultaneous creates cannot consume the last ticket twice or create 2 active lots',async t=>{
 const f=await userAuctionFixture(t);f.sql.exec("UPDATE cnine_user_inventory SET quantity=1 WHERE user_id=1 AND item_code='AUCTION_HOST_TICKET'");
 const results=await Promise.allSettled([f.host(1),f.host(1)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(tickets(f,1),0);assert.equal(f.row("SELECT COUNT(*) n FROM auction_user_lots_v1 WHERE status='ACTIVE'").n,1);
});
test('settlement failure preserves escrow, bidder payment and seller balance for retry',async t=>{const f=await userAuctionFixture(t),a=await f.host(1);await f.service.bid(f.user(2),{lotId:a.lot.id,amount:100,requestId:f.requestId()});f.advance(AUCTION_DURATION_MS);f.faults.sql='INSERT INTO auction_user_settlements_v1';await assert.rejects(f.service.tick(),/injected/);assert.equal(coin(f,1),500e12);assert.equal(f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='POTION'").quantity,100);f.faults.sql='';await f.service.tick();assert.equal(coin(f,1),500e12+80);});
test('vehicle reacquisition preserves return custody without blocking FIFO and claims exactly once',async t=>{
 const f=await userAuctionFixture(t),a=await f.host(1,'VEHICLE'),b=await f.host(2);assert.equal(a.lot.asset.instance,undefined);
 f.sql.exec("INSERT INTO user_garage_vehicles VALUES(1,1,'OTHER','new','later')");f.advance(AUCTION_DURATION_MS);await f.service.tick();
 const state=await f.service.state(f.user(1));assert.equal(state.active.id,b.lot.id);assert.equal(state.returns.length,1);assert.equal(state.returns[0].asset.instance,undefined);
 await assert.rejects(f.service.claimReturn(f.user(1),a.lot.id),/안전 보관/);f.sql.exec('DELETE FROM user_garage_vehicles WHERE user_id=1 AND garage_id=1');
 await f.service.claimReturn(f.user(1),a.lot.id);assert.equal((await f.service.claimReturn(f.user(1),a.lot.id)).replayed,true);assert.equal(f.row('SELECT source_id FROM user_garage_vehicles WHERE user_id=1').source_id,'original');
});
test('disabled policy prevents new hosts but drains existing auctions and refunds normally',async t=>{
 const f=await userAuctionFixture(t);await f.host(1);f.sql.exec("UPDATE app_meta SET value='{\"version\":1,\"enabled\":false}' WHERE key='auction_user_policy_v1'");await assert.rejects(f.host(2),/일시 중지/);f.advance(AUCTION_DURATION_MS);await f.service.tick();assert.equal(f.row("SELECT COUNT(*) n FROM auction_user_lots_v1 WHERE status='UNSOLD'").n,1);
});

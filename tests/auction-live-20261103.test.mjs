import test from 'node:test';import assert from 'node:assert/strict';
import {auctionLiveFixture} from './helpers/auction-live-fixture-20261103.mjs';
import {readPackageCoinAccounting,requirePredictionCoins,reconcilePackageCoinLogs} from '../functions/_package_coin_accounting.js';
import {readAuctionMercenaryOwners} from '../functions/_auction_user_access.js';
import {auctionSettlementAccounting} from '../functions/_auction_user_accounting.js';
import {auctionMercenarySelected} from '../functions/_auction_user_assets.js';
import {createLiveAuctionService} from '../functions/_auction_user_routes.js';
const body=f=>({kind:'ITEM',ref:'POTION',quantity:3,startPrice:1,requestId:f.requestId()});
const seedRestricted=(f,id,amount)=>f.sql.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('support_package_coin_v1:'+id,JSON.stringify({version:1,revision:0,cursor:0,restricted:amount,auctionReserved:{},precredited:null}));
test('CMS OWNER authorization, strict fields and origins, configuration CAS and blocked raw host',async t=>{
 const f=await auctionLiveFixture(t);assert.equal((await f.route(2,'admin/state')).status,403);assert.equal((await f.route(1,'admin/state')).status,200);
 assert.equal((await f.route(2,'host',{...body(f),sourceKind:'SYSTEM'})).status,400);assert.equal((await f.route(2,'host',body(f),{origin:'https://other.example'})).status,403);
 const policy={revision:0,enabled:true,operatorEnabled:true,blockedAssets:[{kind:'ITEM',ref:'POTION'}]};assert.equal((await f.route(1,'admin/policy',policy)).status,200);assert.equal((await f.route(1,'admin/policy',policy)).status,409);
 assert.equal((await f.route(2,'host',body(f))).status,409);assert.equal((await f.route(1,'admin/host',body(f))).status,409);assert.equal(f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='AUCTION_HOST_TICKET'").quantity,10);
 assert.equal((await f.route(1,'admin/policy',{...policy,revision:1,blockedAssets:[]})).status,200);assert.equal((await f.route(2,'host',body(f))).status,200);
});
test('operator creates in same FIFO without tickets or owned debit; cancellation and supply never pay OWNER',async t=>{
 const f=await auctionLiveFixture(t),user=await f.service.host(f.user(3),body(f)),input=body(f),system=await f.service.host(f.user(1),input,{system:true});assert.equal(system.lot.status,'QUEUED');assert.equal(system.lot.sourceKind,'SYSTEM');
 assert.equal((await f.service.host(f.user(1),input,{system:true})).replayed,true);assert.equal(f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='POTION'").quantity,100);assert.equal(f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='AUCTION_HOST_TICKET'").quantity,10);
 const extra=await f.service.host(f.user(1),body(f),{system:true});await f.service.cancel(f.user(1),extra.lot.id,{operator:true});assert.equal(f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='POTION'").quantity,100);
 f.advance(7200001);await f.service.tick();assert.equal((await f.service.state(f.user(2))).active.id,system.lot.id);seedRestricted(f,2,1000);await f.service.bid(f.user(2),{lotId:system.lot.id,amount:1000,requestId:f.requestId()});f.advance(7200001);await f.service.tick();await f.service.tick();assert.equal(f.user(1).coin,500e12);assert.equal(f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='POTION'").quantity,103);assert.deepEqual((await readPackageCoinAccounting(f.env,2)).state.auctionReserved,{});assert.equal(f.row("SELECT COUNT(*) n FROM admin_logs WHERE action_type='AUCTION_OPERATOR_HOST'").n,2);
});
test('nonpackage seller receives restricted source, exact fee, resale origin and loser refunds',async t=>{
 const f=await auctionLiveFixture(t);seedRestricted(f,2,803);seedRestricted(f,3,500);const a=await f.service.host(f.user(1),body(f));
 await f.service.bid(f.user(2),{lotId:a.lot.id,amount:1000,requestId:f.requestId()});await f.service.bid(f.user(3),{lotId:a.lot.id,amount:499,requestId:f.requestId()});f.advance(7200001);await f.service.tick();
 const seller=await readPackageCoinAccounting(f.env,1),buyer=await readPackageCoinAccounting(f.env,2),loser=await readPackageCoinAccounting(f.env,3);assert.equal(seller.restricted,643);assert.equal(seller.total,500e12+800);assert.equal(seller.available,500e12+157);assert.throws(()=>requirePredictionCoins(seller,seller.available+1),/패키지/);assert.deepEqual(buyer.state.auctionReserved,{});assert.equal(loser.restricted,500);assert.deepEqual(loser.state.auctionReserved,{});
 assert.equal((await readPackageCoinAccounting(f.env,1)).restricted,643);assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_transfers_v1').n,1);
});
test('settlement failure rolls back source ledger, stock and payment; retry settles exactly once',async t=>{
 const f=await auctionLiveFixture(t);seedRestricted(f,2,1000);const a=await f.service.host(f.user(1),body(f));await f.service.bid(f.user(2),{lotId:a.lot.id,amount:1000,requestId:f.requestId()});f.advance(7200001);
 f.faults.sql='INSERT INTO coin_logs';await assert.rejects(f.service.tick(),/injected/);f.faults.sql='';assert.equal(f.row("SELECT value FROM app_meta WHERE key='support_package_coin_v1:1'"),undefined);assert.equal(f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='POTION'").quantity,100);
 await f.service.tick();await f.service.tick();assert.equal(f.user(1).coin,500e12+800);assert.equal((await readPackageCoinAccounting(f.env,1)).restricted,800);assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_settlements_v1').n,1);
});
test('wallet/log changed after accounting snapshot fails closed; all affected IDs lock in numeric order',async t=>{
 const f=await auctionLiveFixture(t);seedRestricted(f,2,1000);const a=await f.service.host(f.user(3),body(f));await f.service.bid(f.user(2),{lotId:a.lot.id,amount:1000,requestId:f.requestId()});f.advance(7200001);let mutate=true;
 const service=createLiveAuctionService(f.env,{...f.deps,settlementAccounting:async(...args)=>{const value=await auctionSettlementAccounting(...args);if(mutate){mutate=false;f.sql.exec('UPDATE users SET coin=coin+1 WHERE id=3');}return value;}});
 await assert.rejects(service.tick(),/바뀌었습니다/);assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_settlements_v1').n,0);f.locks.length=0;await service.tick();assert.deepEqual(f.locks,[2,3]);
 const closed=createLiveAuctionService(f.env,{...f.deps,withUserMutationLock:async()=>{throw Error('lock unavailable');}});await assert.rejects(closed.host(f.user(1),body(f)),/lock unavailable/);
});
test('CMS BGM saves 100조, volume and ordering atomically; stale writes and invalid rules preserve catalog',async t=>{
 const f=await auctionLiveFixture(t);f.sql.prepare("INSERT INTO auction_bgm_rules_v1554 VALUES(1,0,10000000,10000000,'/track.mp3#av=65',40,0)").run();const first=await f.route(1,'admin/bgm');assert.equal(first.body.rules[0].bgmUrl,'/track.mp3#av=65');
 const next={revision:0,rules:[...first.body.rules,{minBid:1e14,maxBid:1e14,bgmUrl:'/trillion.mp3#av=30',duration:55}]};f.faults.sql='INSERT INTO admin_logs';assert.equal((await f.route(1,'admin/bgm',next)).status,503);f.faults.sql='';assert.equal(f.row('SELECT COUNT(*) n FROM auction_bgm_rules_v1554').n,1);
 assert.equal((await f.route(1,'admin/bgm',next)).status,200);assert.equal((await f.route(1,'admin/bgm',next)).status,409);assert.equal((await f.route(1,'admin/bgm',{revision:1,rules:[{minBid:0,maxBid:1,bgmUrl:'javascript:alert(1)',duration:4}]})).status,400);assert.equal(f.row('SELECT COUNT(*) n FROM auction_bgm_rules_v1554').n,2);
});
test('dual PVE/PVP second member is protected; superseded legacy selection can be sold',async t=>{
 const f=await auctionLiveFixture(t);f.sql.exec("UPDATE user_mercenary_cards_v1 SET total_copies=1,duplicate_count=0 WHERE user_id=1; INSERT INTO user_mercenary_loadout_v1 VALUES(1,'V-111')");const dual={version:2,PVE:{mercenaryCodes:['V-111','V-971'],revision:1},PVP:{mercenaryCodes:[],revision:1}};f.sql.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('mercenary_dual_loadout_v2:1',JSON.stringify(dual));
 await assert.rejects(f.service.host(f.user(1),{...body(f),kind:'MERCENARY',ref:'V-971',quantity:1}),/편성/);assert.equal(auctionMercenarySelected({mercenary_code:'V-971'},null,{...dual,PVE:{mercenaryCodes:['V-111'],revision:2}},null,'V-971'),false);
 f.sql.prepare('UPDATE app_meta SET value=? WHERE key=?').run(JSON.stringify({...dual,PVE:{mercenaryCodes:['V-111'],revision:2}}),'mercenary_dual_loadout_v2:1');assert.equal((await f.service.host(f.user(1),{...body(f),kind:'MERCENARY',ref:'V-971',quantity:1})).ok,true);
});
test('verified paid mercenary transfer grants current holder access; proof/settlement/holdings must agree',async t=>{
 const f=await auctionLiveFixture(t),a=await f.service.host(f.user(1),{...body(f),kind:'MERCENARY',ref:'V-971',quantity:1});await f.service.bid(f.user(2),{lotId:a.lot.id,amount:10,requestId:f.requestId()});f.advance(7200001);await f.service.tick();assert.deepEqual([...await readAuctionMercenaryOwners(f.env,'V-971',[2])],[2]);
 f.sql.exec("UPDATE auction_user_transfers_v1 SET provenance_json='{}'");assert.equal((await readAuctionMercenaryOwners(f.env,'V-971',[2])).size,0);
});
test('legacy numeric auction reservation/refund remains exact',()=>{const empty={version:1,revision:0,cursor:0,restricted:100,auctionReserved:{},precredited:null};assert.deepEqual(reconcilePackageCoinLogs(empty,[{id:1,change_amount:-80,reason:'경매 #37 누적 입찰'},{id:2,change_amount:80,reason:'경매 #37 유찰·차순위 환급'}]),{...empty,cursor:2});});

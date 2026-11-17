import test from 'node:test';
import assert from 'node:assert/strict';
import {auctionLiveFixture} from './helpers/auction-live-fixture-20261103.mjs';
import {handleAuction} from '../functions/_auction.js';
import {requireAuctionSecondVerification} from '../functions/_auction_user_access.js';

const errorCode='AUCTION_SECOND_VERIFICATION_REQUIRED';
test('unverified accounts cannot read or mutate any user auction route, including forged client flags and paid retries',async t=>{
 const f=await auctionLiveFixture(t);
 const lot=await f.host(1),bid={lotId:lot.lot.id,amount:100,requestId:f.requestId()};
 await f.service.bid(f.user(2),bid);f.sql.exec('DELETE FROM user_second_verifications WHERE user_id=2');f.advance(7200001);
 const before=f.sql.prepare('SELECT total_changes() n').get().n;
 const cases=[['state'],['catalog'],['lobby'],['bgm-events?lotId='+lot.lot.id],['host',{kind:'ITEM',ref:'POTION',quantity:1,startPrice:1,requestId:f.requestId()}],['bid',bid],['cancel',{lotId:lot.lot.id}],['return',{lotId:lot.lot.id}],['notice',{lotId:lot.lot.id}]];
 for(const [action,body]of cases){const r=await f.route(2,action,body,{'x-second-verified':'true'});assert.equal(r.status,403,action);assert.equal(r.body.code,errorCode,action);}
 assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);assert.equal(f.row('SELECT status FROM auction_user_lots_v1').status,'ACTIVE');
});
test('PLAYDK and legacy WAGO verification allow normal state and bid; removal takes effect on the very next request',async t=>{
 const f=await auctionLiveFixture(t),lot=await f.host(1);
 for(const provider of ['PLAYDK','WAGO']){f.sql.prepare('UPDATE user_second_verifications SET provider=? WHERE user_id=2').run(provider);assert.equal((await f.route(2,'state')).status,200);assert.equal((await f.route(2,'bid',{lotId:lot.lot.id,amount:10,requestId:f.requestId()})).status,200);}
 f.sql.exec('DELETE FROM user_second_verifications WHERE user_id=2');assert.equal((await f.route(2,'state')).body.code,errorCode);
 f.sql.exec("INSERT INTO user_second_verifications VALUES(2,'PLAYDK')");assert.equal((await f.route(2,'state')).status,200);
});
test('fresh account state overrides a cached ACTIVE session; timed and indefinite bans deny access',async t=>{
 const f=await auctionLiveFixture(t);
 for(const [status,until]of [['BANNED',null],['ACTIVE','9999-12-31 23:59:59']]){f.sql.prepare('UPDATE users SET status=?,banned_until=? WHERE id=2').run(status,until);const r=await f.route(2,'state');assert.equal(r.status,403);assert.equal(r.body.code,'AUCTION_ACCOUNT');}
 f.sql.exec("UPDATE users SET status='ACTIVE',banned_until='2000-01-01 00:00:00' WHERE id=2");assert.equal((await f.route(2,'state')).status,200);
});
test('operators also need second verification; database verification outage fails closed before any service work',async t=>{
 const f=await auctionLiveFixture(t);f.sql.exec('DELETE FROM user_second_verifications WHERE user_id=1');assert.equal((await f.route(1,'admin/state')).body.code,errorCode);
 f.faults.sql='user_second_verifications';const r=await f.route(2,'bid',{lotId:'anything',amount:100,requestId:f.requestId()});assert.equal(r.status,503);assert.equal(f.row('SELECT count(*) n FROM coin_logs').n,0);
});
test('legacy auction endpoints reject unverified users before schema/settlement/body processing',async t=>{
 const f=await auctionLiveFixture(t);f.sql.exec('DELETE FROM user_second_verifications WHERE user_id=2');
 for(const path of ['auction/state','auction/events','auction/bid','auction/bid-event','auction/schedule-event','auction/chat','auction/admin/state']){
  const request=new Request('https://example.test/api/'+path,{method:path.endsWith('state')||path.endsWith('events')?'GET':'POST'});
  const r=await handleAuction({path,request,env:f.env,deps:{...f.deps,authenticate:async()=>f.user(2),readBody:()=>{throw Error('body should not be read');}}});assert.equal(r.status,403);assert.equal((await r.json()).code,errorCode);
 }
 assert.equal(f.row("SELECT count(*) n FROM sqlite_master WHERE name='auction_locks_v1553'").n,0);
});
test('access check uses a single indexed lookup without any mutation',async t=>{
 const f=await auctionLiveFixture(t),queries=[],original=f.env.DB.prepare;f.env.DB.prepare=text=>{queries.push(text);return original(text);};
 await requireAuctionSecondVerification(f.env,f.user(2));assert.equal(queries.length,1);assert.match(queries[0],/WHERE u.id=\?/);assert.match(queries[0],/v.user_id=u.id/);
});

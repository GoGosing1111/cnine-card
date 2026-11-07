import test from 'node:test';
import assert from 'node:assert/strict';
import {userAuctionFixture} from './helpers/auction-user-fixture-20261103.mjs';
import {inspectBgmGuide,exactBgmRange,findBgmRule} from '../js/auction-user-v1.mjs';
const insert=(f,id,min,max,url,order=id)=>f.sql.prepare('INSERT INTO auction_bgm_rules_v1554 VALUES(?,0,?,?,?,?,?)').run(id,min,max,url,54,order);
const bid=(f,lot,amount,id=f.requestId())=>f.service.bid(f.user(2),{lotId:lot,amount,requestId:id});
test('the reported amount and rounded display do not trigger the exact 188,888 rule; looking up any track costs nothing',async t=>{
 const f=await userAuctionFixture(t);insert(f,1,188888,188888,'assets/effects/18888.mp4#av=25');insert(f,2,57590,57590,'assets/오직조은_5759.mp3');
 const {lot}=await f.host(1),{bgmGuide}=await f.service.state(f.user(2)),balance=f.user(2).coin;
 assert.equal(exactBgmRange(bgmGuide[0]),'188,888코인');for(const n of [188880,188900]){const lookup=inspectBgmGuide(bgmGuide,String(n));assert.match(lookup.message,/발동 없음/);assert.match(lookup.message,/188,888코인/);}
 assert.equal(inspectBgmGuide(bgmGuide,'188,888').rows[0].name,'18888');assert.match(inspectBgmGuide(bgmGuide,'18888').message,/발동 없음/);assert.equal(inspectBgmGuide(bgmGuide,'오직조은').rows[0].minBid,57590);
 assert.equal(f.user(2).coin,balance);assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_bid_receipts_v1').n,0);
 const non=await bid(f,lot.id,188880);assert.equal(non.bgm,null);const yes=await bid(f,lot.id,188888);assert.equal(yes.bgm.name,'18888');
 assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_bgm_events_v1').n,1);
});
test('guide prediction follows actual range endpoints, sort priority, specific minima, and blank winners',async t=>{
 const f=await userAuctionFixture(t);insert(f,1,500000,999999,'/broad.mp3',5);insert(f,2,600000,700000,'/narrow.mp3',5);insert(f,3,650000,650000,' ',0);insert(f,4,1100000,0,'/open.mp3',9);
 const {lot}=await f.host(1),{bgmGuide}=await f.service.state(f.user(2));
 assert.equal(exactBgmRange(bgmGuide.find(r=>r.name==='broad')),'500,000 ~ 999,999코인');
 for(const n of [499999,500000,600000,650000,700000,700001,999999,1000000,1100000]){const preview=findBgmRule(bgmGuide,n),paid=await bid(f,lot.id,n);assert.equal(preview?.name??null,paid.bgm?.name??null,String(n));}
});
test('a queued bid immediately returns its committed slot; a retry reads the same slot without another debit',async t=>{
 const f=await userAuctionFixture(t);insert(f,1,188888,188888,'/18888.mp4');const {lot}=await f.host(1);const now=f.now(),first=await bid(f,lot.id,188888);
 const id=f.requestId(),next=await bid(f,lot.id,188888,id);assert.equal(first.bgm.startsMs,now);assert.equal(next.bgm.startsMs,now+54000);assert.equal(next.bgm.endsMs,now+108000);assert.equal(next.bgm.lotEndsMs,lot.endsMs);
 const balance=f.user(2).coin;f.advance(2500);const again=await bid(f,lot.id,188888,id);assert(again.replayed);assert.deepEqual(again.bgm,next.bgm);assert.equal(again.serverNow,now+2500);assert.equal(f.user(2).coin,balance);
 assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_bgm_events_v1').n,2);
});

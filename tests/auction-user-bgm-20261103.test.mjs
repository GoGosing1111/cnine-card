import test from 'node:test';
import assert from 'node:assert/strict';
import {userAuctionFixture} from './helpers/auction-user-fixture-20261103.mjs';
import {auctionAudioSource} from '../js/auction-user-bgm-v1.mjs';

function rule(f,{id=1,min=100,max=100,url='/existing/song.mp3#av=65',duration=40,order=0,auction=0}={}){
 f.sql.prepare('INSERT INTO auction_bgm_rules_v1554 VALUES(?,?,?,?,?,?,?)').run(id,auction,min,max,url,duration,order);
}
const events=f=>f.sql.prepare('SELECT * FROM auction_user_bgm_events_v1 ORDER BY sequence').all();
const bid=(f,lotId,amount,extra={})=>f.service.bid(f.user(2),{lotId,amount,requestId:f.requestId(),...extra});

test('preserves all 80 existing shared guide entries and leaves the original music catalog unchanged',async t=>{
 const f=await userAuctionFixture(t);
 for(let i=1;i<=80;i++)rule(f,{id:i,min:i*100,max:i*100,url:`/existing/${i===1?'%EB%85%B8%EB%9E%98_%EC%A0%9C%EB%AA%A9':i}.mp3#av=65`,order:i-1});
 rule(f,{id:81,min:1,max:0,url:'/non-shared.mp3',auction:42,order:-1});
 const before=f.sql.prepare('SELECT * FROM auction_bgm_rules_v1554 ORDER BY id').all(),a=await f.host(1);
 const guide=(await f.service.state(f.user(2))).bgmGuide;
 assert.equal(guide.length,80);assert.equal(guide[0].name,'노래 제목');assert.equal(guide[79].minBid,8000);assert.equal(guide[79].order,80);
 await bid(f,a.lot.id,100);f.advance(7200001);await f.service.tick();
 assert.deepEqual(f.sql.prepare('SELECT * FROM auction_bgm_rules_v1554 ORDER BY id').all(),before);
});

test('matches THIS additional bid, never the cumulative balance or the new quick-button tiers',async t=>{
 const f=await userAuctionFixture(t);rule(f);const a=await f.host(1);
 await bid(f,a.lot.id,50);await bid(f,a.lot.id,50);assert.equal(events(f).length,0);
 await bid(f,a.lot.id,100,{message:'기존 금액의 노래'});const first=events(f)[0];
 assert.equal(first.amount,100);assert.equal(first.bgm_url,'/existing/song.mp3#av=65');assert.equal(first.message,'기존 금액의 노래');
 for(const amount of [1e7,1e11,1e12,1e13,1e14])await bid(f,a.lot.id,amount);
 assert.deepEqual(events(f),[first]);assert.equal(f.row('SELECT total FROM auction_user_bidders_v1 WHERE user_id=2').total,200+1e7+1e11+1e12+1e13+1e14);
});

test('keeps inclusive bounds, shared-only lookup, existing overlap priority and unbounded maximum',async t=>{
 const f=await userAuctionFixture(t);
 rule(f,{id:1,min:100,max:200,url:'/broad.mp3',order:2});
 rule(f,{id:2,min:150,max:200,url:'/narrow.mp3',order:2});
 rule(f,{id:3,min:175,max:175,url:'/first.mp3',order:1});
 rule(f,{id:4,min:1000,max:0,url:'/open.mp3',order:3});
 rule(f,{id:5,min:0,max:0,url:'/ignored.mp3',order:-1,auction:4});
 const a=await f.host(1);
 for(const amount of [99,100,149,150,175,200,201,1000,1e14])await bid(f,a.lot.id,amount);
 assert.deepEqual(events(f).map(e=>[e.amount,e.bgm_url]),[[100,'/broad.mp3'],[149,'/broad.mp3'],[150,'/narrow.mp3'],[175,'/first.mp3'],[200,'/narrow.mp3'],[1000,'/open.mp3'],[1e14,'/open.mp3']]);
});

test('blank winning rule suppresses presentation and preserves duration and 40-character message rules',async t=>{
 const f=await userAuctionFixture(t);rule(f,{id:1,url:' ',order:0});rule(f,{id:2,url:'/must-not-fall-through.mp3',order:1});
 rule(f,{id:3,min:200,max:200,duration:100});rule(f,{id:4,min:300,max:300,duration:0});
 const a=await f.host(1);await bid(f,a.lot.id,100);assert.equal(events(f).length,0);
 await bid(f,a.lot.id,200,{message:'  '+ '별'.repeat(45)+'  '});await bid(f,a.lot.id,300);
 assert.deepEqual(events(f).map(e=>e.duration_seconds),[60,1]);assert.equal(events(f)[0].message,'별'.repeat(40));
});

test('music receipt is atomic with payment: rollback, retry, duplicate receipt and rejected bids',async t=>{
 const f=await userAuctionFixture(t);rule(f);const a=await f.host(1),b=await f.host(3),before=f.user(2).coin,body={lotId:a.lot.id,amount:100,requestId:f.requestId(),message:'한 번만'};
 f.faults.sql='INSERT INTO auction_user_bgm_events_v1';await assert.rejects(f.service.bid(f.user(2),body),/injected failure/);f.faults.sql='';
 assert.equal(f.user(2).coin,before);assert.equal(events(f).length,0);assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_bid_receipts_v1').n,0);assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_bidders_v1').n,0);
 await f.service.bid(f.user(2),body);assert.equal((await f.service.bid(f.user(2),body)).replayed,true);assert.equal(f.user(2).coin,before-100);assert.equal(events(f).length,1);
 await assert.rejects(f.service.bid(f.user(1),{...body,requestId:f.requestId()}));
 await assert.rejects(bid(f,b.lot.id,100));
 f.sql.prepare('UPDATE users SET coin=0 WHERE id=2').run();await assert.rejects(bid(f,a.lot.id,100));assert.equal(events(f).length,1);
});

test('one server schedule reaches every viewer in order, supports cursors and expires on lot change',async t=>{
 const f=await userAuctionFixture(t);rule(f,{duration:10});const a=await f.host(1),b=await f.host(3),start=f.now();
 await bid(f,a.lot.id,100);await bid(f,a.lot.id,100);f.advance(3000);await bid(f,a.lot.id,100);
 const first=await f.service.bgmEvents({lotId:a.lot.id}),second=await f.service.bgmEvents({lotId:a.lot.id});assert.deepEqual(first,second);
 assert.deepEqual(first.events.map(e=>[e.startsMs,e.endsMs]),[[start,start+10000],[start+10000,start+20000],[start+20000,start+30000]]);
 assert.equal((await f.service.bgmEvents({lotId:a.lot.id,after:first.events[0].sequence})).events.length,2);
 assert.equal((await f.service.bgmEvents({lotId:b.lot.id})).events.length,0);
 await assert.rejects(f.service.bgmEvents({lotId:a.lot.id,after:-1}));
 f.advance(8000);assert.equal((await f.service.bgmEvents({lotId:a.lot.id})).events.length,2);
 f.advance(7200000);await f.service.tick();assert.equal((await f.service.bgmEvents({lotId:a.lot.id})).events.length,0);assert.equal((await f.service.state(f.user(2))).active.id,b.lot.id);
});

test('competing payments cannot publish overlapping or unpaid music events',async t=>{
 const f=await userAuctionFixture(t);rule(f,{duration:10});const a=await f.host(1),start=f.now(),before=f.user(2).coin;
 const bodies=Array.from({length:3},()=>({lotId:a.lot.id,amount:100,requestId:f.requestId()}));
 const results=await Promise.allSettled(bodies.map(body=>f.service.bid(f.user(2),body)));
 for(let i=0;i<results.length;i++)if(results[i].status==='rejected')await f.service.bid(f.user(2),bodies[i]);
 assert.equal(f.user(2).coin,before-300);assert.equal(events(f).length,3);
 assert.deepEqual(events(f).map(e=>[e.starts_ms,e.ends_ms]),[[start,start+10000],[start+10000,start+20000],[start+20000,start+30000]]);
});

test('audio source retains existing file, query parameters, per-song volume and default volume',()=>{
 assert.deepEqual(auctionAudioSource('assets\\music\\song.mp3#av=65',12,'https://game.example/auction'),{url:'https://game.example/assets/music/song.mp3?auctionAudio=12',volume:.65});
 assert.deepEqual(auctionAudioSource('/song.mp3?rev=4#av=0',13,'https://game.example/auction'),{url:'https://game.example/song.mp3?rev=4&auctionAudio=13',volume:0});
 assert.equal(auctionAudioSource('/song.mp3',1,'https://game.example/').volume,.25);
 assert.equal(auctionAudioSource('/song.mp3#av=150',1,'https://game.example/').volume,1);
 assert.equal(auctionAudioSource('data:audio/wav;base64,AAA#av=50',1,'https://game.example/').url,'data:audio/wav;base64,AAA');
});

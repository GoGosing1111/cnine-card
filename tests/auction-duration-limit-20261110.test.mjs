import test from 'node:test';
import assert from 'node:assert/strict';
import {auctionLiveFixture} from './helpers/auction-live-fixture-20261103.mjs';
import {AUCTION_LISTING_WINDOW_MS} from '../shared/auction-user-policy-v1.mjs';

const post = (f, id, fields={}, route='host') => f.route(id, route, {
  kind:'ITEM', ref:'POTION', quantity:1, startPrice:1, requestId:f.requestId(), ...fields
});
const inventory = (f,id) => f.sql.prepare('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=? ORDER BY item_code').all(id);

test('both host routes validate duration and preserve legacy requests and per-lot FIFO durations',async t=>{
  const f=await auctionLiveFixture(t);
  for (const durationMinutes of [0,31,90,121,null,'30',0.5]) {
    for (const route of ['host','admin/host']) assert.equal((await post(f,1,{durationMinutes},route)).status,400);
  }
  assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_lots_v1').n,0);
  const requestId=f.requestId(),first=await post(f,2,{durationMinutes:30,requestId});
  assert.equal(first.status,200);
  assert.equal(first.body.lot.endsMs-first.body.lot.startedMs,30*60_000);
  assert.equal((await post(f,2,{durationMinutes:30,requestId})).body.replayed,true);
  assert.equal((await post(f,2,{durationMinutes:60,requestId})).status,409);
  const second=await post(f,1,{durationMinutes:60},'admin/host');
  const legacyRequest=f.requestId(),third=await post(f,3,{requestId:legacyRequest});
  assert.equal(second.body.lot.endsMs,null);
  assert.equal((await post(f,3,{requestId:legacyRequest,durationMinutes:120})).body.replayed,true);
  assert.equal(third.body.lot.durationMinutes,120);
  f.advance(30*60_000-1);
  assert.equal((await f.route(2,'state')).body.active.id,first.body.lot.id);
  f.advance(90_000);
  for(const [lot,minutes] of [[second.body.lot,60],[third.body.lot,120]]){
    const {active}= (await f.route(2,'state')).body;
    assert.equal(active.id,lot.id);assert.equal(active.startedMs,f.now());assert.equal(active.endsMs-f.now(),minutes*60_000);
    f.advance(minutes*60_000);
  }
});

test('rolling 24 hours is market-wide, counts listings including cancellations and counts a bundle once',async t=>{
  const f=await auctionLiveFixture(t);
  const first=await post(f,2,{quantity:12,durationMinutes:30});
  f.advance(60_000);
  const old=await post(f,1,{},'admin/host');assert.equal(old.status,200);
  assert.equal((await f.route(1,'admin/cancel',{lotId:old.body.lot.id})).status,200);
  for(let i=2;i<10;i++)assert.equal((await post(f,3)).status,200);
  const before=inventory(f,2);
  for(const [id,route] of [[2,'host'],[1,'admin/host']]){
    const full=await post(f,id,{},route);assert.equal(full.status,409);assert.equal(full.body.code,'AUCTION_ITEM_LIMIT');
  }
  assert.deepEqual(inventory(f,2),before);
  assert.equal((await post(f,2,{kind:'MASTER_STAR',ref:'MASTER_STAR'})).status,200);
  f.advance(AUCTION_LISTING_WINDOW_MS-60_000-1);
  assert.equal((await post(f,2)).body.code,'AUCTION_ITEM_LIMIT');
  f.advance(1);
  assert.equal((await post(f,2)).status,200);
  assert.equal((await post(f,2)).body.code,'AUCTION_ITEM_LIMIT');
  assert.equal(f.row("SELECT status FROM auction_user_lots_v1 WHERE id='"+first.body.lot.id+"'").status,'UNSOLD');
});

test('legacy, user and system equipment instances of the same model share one quota',async t=>{
  const f=await auctionLiveFixture(t);
  const userGear={kind:'EQUIPMENT',ref:'1001'},systemGear={kind:'EQUIPMENT',ref:'40'};
  const registered=await post(f,1,userGear);
  assert.equal(registered.status,200);
  const lot=registered.body.lot,raw=JSON.parse(f.sql.prepare('SELECT asset_json FROM auction_user_lots_v1 WHERE id=?').get(lot.id).asset_json);
  delete raw.policyRef;
  f.sql.prepare('UPDATE auction_user_lots_v1 SET asset_json=? WHERE id=?').run(JSON.stringify(raw),lot.id);
  for(let n=1;n<10;n++)assert.equal((await post(f,1,systemGear,'admin/host')).status,200);
  f.sql.exec("INSERT INTO user_equipment_instances VALUES(1002,2,40,'ADMIN','original2','receipt2','old')");
  f.assets.push({...f.assets.find(x=>x.kind==='EQUIPMENT'),ref:'1002'});
  assert.equal((await post(f,2,{...userGear,ref:'1002'})).body.code,'AUCTION_ITEM_LIMIT');
  assert.equal(f.row('SELECT user_id FROM user_equipment_instances WHERE id=1002').user_id,2);
  assert.equal((await post(f,1,{kind:'VEHICLE',ref:'1'},'admin/host')).status,200);
});

test('concurrent tenth listing is committed once and its receipt can be retried at the limit',async t=>{
  const f=await auctionLiveFixture(t);
  for(let i=0;i<9;i++)assert.equal((await post(f,1,{},'admin/host')).status,200);
  const requests=[{id:2,requestId:f.requestId()},{id:3,requestId:f.requestId()}];
  const replies=await Promise.all(requests.map(r=>post(f,r.id,{requestId:r.requestId})));
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
  assert.equal(f.row('SELECT COUNT(*) n FROM auction_user_lots_v1').n,10);
  assert.equal(f.row("SELECT COUNT(*) n FROM inventory_logs WHERE reason='AUCTION_HOST'").n,1);
  const winner=requests[replies.findIndex(r=>r.status===200)];
  assert.equal((await post(f,winner.id,{requestId:winner.requestId})).body.replayed,true);
});

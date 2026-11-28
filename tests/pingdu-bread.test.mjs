import test from 'node:test';
import assert from 'node:assert/strict';
import {breadFixture} from './fixtures/pingdu-bread-v1.mjs';
import {CNINE_WATCH_STREAMERS,SOOP_WATCH_PREFIX} from '../functions/_soop_watch.js';
import {breadOdds,percentUnits,RATE_TOTAL,scaleFixedRates,STARTER_REWARDS} from '../shared/pingdu-bread-odds.mjs';

const day = '2026-01-31', item = (code,quantity=1,chance=10000) => ({code,quantity,chance});
async function ok(responsePromise) {
  const response = await responsePromise, data = await response.json();
  assert.equal(response.status,200,JSON.stringify(data)); return data;
}
async function setup(t) {
  const f=await breadFixture(); t.after(()=>f.close());
  f.review=()=>ok(f.call('admin:review',{day,userId:1},f.owner));
  f.catalog=()=>ok(f.call('admin:catalog',null,f.owner));
  f.policy=async (items,revision)=>
    ok(f.call('admin:pool',{items,revision:revision ?? (await f.catalog()).config.revision},f.owner));
  f.state=()=>ok(f.call('state',null,f.player,{day}));
  return f;
}
test('verified KST activities and per-member lookups use account bindings and never grant on lookup',async t=>{
  const f=await setup(t);
  assert.equal((await f.call('state',null,null,{day})).status,401);
  assert.equal((await f.call('admin:accounts',null,f.player,{day})).status,403);
  assert.equal((await f.http('events/pingdu-bread/review',f.player,{body:{day},origin:'https://foreign.example'})).status,403);
  assert.equal((await f.call('review',{day:'2026-02-31'})).status,400);
  const a=await ok(f.call('review',{day,userId:2,posts:999999,seconds:999999}));
  assert.equal(a.posts,3); assert.equal(a.seconds,7261); assert.equal(a.granted,0);
  const [board,watch]=f.calls.map(call=>call[1]);
  assert.equal(board.userUuid,'bread-1'); assert.deepEqual(board.boardSlugs,['skm']);
  assert.deepEqual(watch.userSoopIds,['viewer-1']); assert.equal(watch.dateGte,day); assert.equal(watch.dateLt,'2026-02-01');
  assert.deepEqual(watch.streamerIds,CNINE_WATCH_STREAMERS.map(member=>member.id));
  assert.equal((await f.review()).revision,a.revision);
  const member=await ok(f.call('member',{day,memberId:CNINE_WATCH_STREAMERS[0].id}));
  assert.equal(member.seconds,120);
  assert.equal((await f.call('member',{day,memberId:'unknown'})).status,400);
  const stranger=await ok(f.call('state',null,{id:2,role:'USER',nickname:'눈송이'},{day,userId:1}));
  assert.equal(stranger.day,null); assert.equal(stranger.balance,0);
  const list=await ok(f.call('admin:accounts',null,f.owner,{day,search:'겨울'}));
  assert.deepEqual(list.rows.map(row=>row.userId),[1]); assert.equal(list.rows[0].activity.posts,3);
});
test('only reviewed activity can be settled once, each bun keeps its original pool and a replay returns the same item',async t=>{
  const f=await setup(t), activity=await f.review();
  const args={userId:1,day,quantity:2,revision:activity.revision,poolRevision:null};
  assert.equal((await f.call('admin:settle',args,f.owner)).status,409);
  assert.equal((await f.call('admin:pool',{revision:(await f.catalog()).config.revision,items:[item('MASTER_STAR',2,5000)]},f.owner)).status,400);
  const config=await f.policy([item('MASTER_STAR',7)]);
  args.poolRevision=config.revision;
  assert.equal((await f.call('admin:settle',args,f.player)).status,403);
  assert.equal((await f.call('admin:settle',{...args,revision:'old'},f.owner)).status,409);
  const both=await Promise.all([ok(f.call('admin:settle',args,f.owner)),ok(f.call('admin:settle',args,f.owner))]);
  assert.equal(both[0].granted,2); assert.equal(both[1].settledAt,both[0].settledAt);
  assert.equal((await f.call('admin:settle',{...args,quantity:3},f.owner)).status,409);
  await f.policy([item('SUIT_CORE_8',5)],config.revision);
  assert.equal((await f.state()).items[0].code,'MASTER_STAR');
  const a={requestId:crypto.randomUUID()};
  const [receipt,replay]=await Promise.all([ok(f.call('open',a)),ok(f.call('open',a))]);
  assert.deepEqual(receipt,replay); assert.equal(receipt.reward.code,'MASTER_STAR'); assert.equal(receipt.reward.quantity,7);
  assert.equal(receipt.balance,1); await ok(f.call('open',{requestId:crypto.randomUUID()}));
  assert.equal((await f.call('open',{requestId:crypto.randomUUID()})).status,409);
  const state=await f.state(); assert.equal(state.balance,0); assert.equal(state.history.length,2); assert.equal(state.grants.length,1);
  const logs=await f.row("SELECT COUNT(*) AS n FROM admin_logs WHERE action_type='PINGDU_BREAD_SETTLE'");
  assert.equal(Number(logs.n),1);
  const inv=await f.row("SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='MASTER_STAR'");
  assert.equal(Number(inv.quantity),14); assert.equal(Number(inv.unseen_quantity),14);
});

test('fixed rates and weighted automatic rows cover all integer outcomes exactly, including rounding and 0%',()=>{
  const fixed=p=>({code:'FIXED',quantity:1,mode:'fixed',fixedUnits:percentUnits(p)});
  const auto=w=>({code:'AUTO',quantity:1,mode:'auto',weight:w});
  const odds=breadOdds([fixed('7.000001'),auto(1),auto(1),auto(1)]);
  assert.deepEqual(odds.map(row=>row.units),[7000001,31000000,31000000,30999999]);
  assert.deepEqual(breadOdds([fixed(100),auto(2)]).map(row=>row.units),[RATE_TOTAL,0]);
  assert.deepEqual(breadOdds([fixed(0),auto(3),auto(1)]).map(row=>row.units),[0,75000000,25000000]);
  assert.deepEqual(scaleFixedRates([3000000,2000000]),[60000000,40000000]);
  assert.throws(()=>breadOdds([fixed(70),fixed(40),auto(1)]));
  assert.throws(()=>breadOdds([fixed(20),fixed(40)]));
  assert.throws(()=>breadOdds([auto(0)]));
  assert.throws(()=>percentUnits('0.0000001'));
  assert.throws(()=>scaleFixedRates([0,0]));
  assert.equal(breadOdds(STARTER_REWARDS).reduce((n,row)=>n+row.units,0),RATE_TOTAL);
});
test('full live catalog supports a new arbitrary inventory item, duplicate quantity tiers and server-owned rates and identity',async t=>{
  const f=await setup(t),{catalog,config}=await f.catalog();
  const publicTable=await ok(f.call('rewards',null,null));
  assert.equal(publicTable.items.length,7); assert(publicTable.items.every(row=>row.name && row.quantity && !Object.hasOwn(row,'weight')));
  assert.equal(config.items.length,7); assert.equal(config.items[0].units,35000000);
  assert(catalog.some(row=>row.code==='FUTURE_GAME_ITEM')); assert(catalog.some(row=>row.code==='INACTIVE_GAME_ITEM'&&!row.active));
  const active={code:'FUTURE_GAME_ITEM',quantity:4,mode:'auto',weight:1,units:0,name:'위조 이름'};
  const impossible={code:'INACTIVE_GAME_ITEM',quantity:1,mode:'auto',weight:1};
  for (const entry of [impossible,{...impossible,code:'UNREGISTERED'}]) assert.equal((await f.call('admin:pool',{revision:config.revision,items:[entry]},f.owner)).status,400);
  const policy=await f.policy([active,{...active,quantity:9,mode:'fixed',fixedUnits:0}],config.revision);
  assert.deepEqual(policy.items.map(i=>i.units),[RATE_TOTAL,0]); assert.equal(policy.items[0].name,'새로 등록한 아이템');
  assert.equal((await f.call('admin:pool',{revision:config.revision,items:[active]},f.owner)).status,409);
  const reviewed=await f.review();
  await ok(f.call('admin:settle',{day,userId:1,quantity:1,revision:reviewed.revision,poolRevision:policy.revision},f.owner));
  await f.policy([item('MASTER_STAR')],policy.revision);
  const opened=await ok(f.call('open',{requestId:crypto.randomUUID()}));
  assert.equal(opened.reward.code,'FUTURE_GAME_ITEM'); assert.equal(opened.reward.quantity,4);
});
test('provider outages, missing consent, zero activity and changed binding remain distinguishable',async t=>{
  const f=await setup(t), p=await f.policy([item('MASTER_STAR')]);
  f.provider.getWatchRanking=async()=>{throw Error('provider offline')};
  f.provider.getDailyPostCount=async input=>({...input,timezone:'Asia/Seoul',count:0});
  const a=await f.review(); assert.equal(a.watchStatus,'UNAVAILABLE'); assert.equal(a.seconds,null); assert.equal(a.posts,0);
  assert.equal((await f.call('admin:settle',{day,userId:1,quantity:1,revision:a.revision,poolRevision:p.revision},f.owner)).status,409);
  f.provider.getDailyPostCount=async input=>({...input,timezone:'Asia/Seoul',count:5});
  const b=await ok(f.call('admin:review',{day,userId:2},f.owner)); assert.equal(b.watchStatus,'UNLINKED'); assert.equal(b.posts,5);
  await f.pg.query("UPDATE user_second_verifications SET provider_user_id='different' WHERE user_id=2");
  assert.equal((await f.call('admin:settle',{day,userId:2,quantity:1,revision:b.revision,poolRevision:p.revision},f.owner)).status,409);
  const changed=await ok(f.call('admin:review',{day,userId:2},f.owner));
  assert.notEqual(changed.revision,b.revision);
  await ok(f.call('admin:settle',{day,userId:2,quantity:1,revision:changed.revision,poolRevision:p.revision},f.owner));
  await f.pg.query('DELETE FROM app_meta WHERE key=$1',[SOOP_WATCH_PREFIX+'1']);
  assert.equal((await f.review()).watchStatus,'UNLINKED');
});
test('failed audits and failed item receipts roll back the whole grant or opening; same request recovers',async t=>{
  const f=await setup(t),activity=await f.review(),p=await f.policy([item('MASTER_STAR')]);
  const body={day,userId:1,quantity:1,revision:activity.revision,poolRevision:p.revision};
  f.fault('INSERT INTO admin_logs');
  assert.equal((await f.call('admin:settle',body,f.owner)).status,503);
  f.fault(null); assert.equal((await f.state()).balance,0); await ok(f.call('admin:settle',body,f.owner));
  const open={requestId:crypto.randomUUID()};
  f.fault('INSERT INTO pingdu_bread_opens_v1'); assert.equal((await f.call('open',open)).status,503);
  f.fault(null); assert.equal((await f.state()).balance,1);
  assert.equal(Number((await f.row("SELECT COUNT(*) AS n FROM inventory_logs WHERE reference_type='PINGDU_BREAD'")).n),0);
  await ok(f.call('open',open)); assert.equal((await f.state()).balance,0);
});

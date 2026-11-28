import test from 'node:test';
import assert from 'node:assert/strict';
import {breadFixture} from './fixtures/pingdu-bread-v1.mjs';
import {CNINE_WATCH_STREAMERS,SOOP_WATCH_PREFIX} from '../functions/_soop_watch.js';
import {breadOdds,percentUnits,RATE_TOTAL,scaleFixedRates,STARTER_REWARDS,BREAD_COIN_MAX,BREAD_STAR_MAX} from '../shared/pingdu-bread-odds.mjs';

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
  assert.equal(publicTable.items.length,12); assert(publicTable.items.every(row=>row.name && row.quantity && !Object.hasOwn(row,'weight')));
  assert.equal(config.items.length,12); assert.equal(config.items[0].units,8000000);
  assert.equal(catalog.filter(row=>row.code==='COIN').length,1);
  assert(publicTable.items.some(row=>row.code==='COIN' && row.quantity===BREAD_COIN_MAX && row.units===500000));
  assert(publicTable.items.some(row=>row.code==='MASTER_STAR' && row.quantity===BREAD_STAR_MAX && row.units===1000000));
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

test('coin and star tiers accept the exact caps; a wallet opening and its bigint ledger commit and replay together',async t=>{
  const f=await setup(t), activity=await f.review();
  for (const [code,max] of [['COIN',BREAD_COIN_MAX],['MASTER_STAR',BREAD_STAR_MAX]]) {
    const p=await f.policy([item(code,max)]);
    assert.equal(p.items[0].quantity,max);
    assert.equal((await f.call('admin:pool',{items:[item(code,max+1)],revision:p.revision},f.owner)).status,400);
  }
  const config=await f.policy([item('COIN',BREAD_COIN_MAX)]);
  await ok(f.call('admin:settle',{day,userId:1,quantity:1,revision:activity.revision,poolRevision:config.revision},f.owner));
  const request={requestId:crypto.randomUUID()}, max=9223372036854775807n, before=max-BigInt(BREAD_COIN_MAX);
  await f.pg.query('UPDATE users SET coin=$1 WHERE id=1',[(before+1n).toString()]);
  assert.equal((await f.call('open',request)).status,409);
  assert.equal((await f.state()).balance,1);
  await f.pg.query('UPDATE users SET coin=$1 WHERE id=1',[before.toString()]);
  f.fault('INSERT INTO coin_logs');
  assert.equal((await f.call('open',request)).status,503);
  f.fault(null);
  assert.equal((await f.row('SELECT coin::text AS coin FROM users WHERE id=1')).coin,before.toString());
  const receipts=await Promise.all([ok(f.call('open',request)),ok(f.call('open',request))]);
  assert.deepEqual(receipts[0],receipts[1]); assert.equal(receipts[0].reward.quantity,BREAD_COIN_MAX);
  assert.equal(receipts[0].balance,0);
  const logs=await f.pg.query('SELECT change_amount::text AS amount,balance_after::text AS balance,reason FROM coin_logs');
  assert.deepEqual(logs.rows,[{amount:String(BREAD_COIN_MAX),balance:max.toString(),reason:'PINGDU_BREAD:'+request.requestId}]);
  assert.equal((await f.row('SELECT coin::text AS coin FROM users WHERE id=1')).coin,max.toString());
  assert.equal(Number((await f.row("SELECT COUNT(*) AS n FROM cnine_user_inventory WHERE item_code='COIN'")).n),0);
  const next='2026-02-01',star=await f.policy([item('MASTER_STAR',BREAD_STAR_MAX)]);
  const checked=await ok(f.call('admin:review',{day:next,userId:1},f.owner));
  await ok(f.call('admin:settle',{day:next,userId:1,quantity:1,revision:checked.revision,poolRevision:star.revision},f.owner));
  await ok(f.call('open',{requestId:crypto.randomUUID()}));
  assert.equal(Number((await f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='MASTER_STAR'")).quantity),BREAD_STAR_MAX);
});

const rules={postsPerBread:2, minutesPerBread:60, dailyCap:10};
test('existing default pools gain currency tiers while a custom live table keeps the operator odds',async t=>{
  const original=[
    ['MASTER_STAR',1_000_000,35],['ARMOR_ENHANCEMENT_SCROLL',1,25],['WEAPON_ENHANCEMENT_SCROLL',1,18],
    ['RANK_EXP_POTION_2X_60M',1,12],['CNINE_STREAMER_SHARD',1,7],['SUIT_CORE_8',1,2],['CNINE_WINTER_BOX',1,1]
  ].map(([code,quantity,weight])=>({code,quantity,mode:'auto',weight,units:weight*1e6}));
  for (const custom of [false,true]) {
    const f=await setup(t);
    const items=custom?[{...original[0],quantity:BREAD_STAR_MAX+1,units:100_000_000,weight:1}]:original;
    const legacy={revision:'old-pool',items};
    await f.pg.query("INSERT INTO app_meta(key,value) VALUES('pingdu_bread_pool_v1',$1),('pingdu_bread_pool_snapshot:old-pool',$2)",[JSON.stringify(legacy),JSON.stringify(items)]);
    const {config,catalog}=await f.catalog();
    assert.notEqual(config.revision,legacy.revision);
    if (custom) assert.deepEqual(config.items,[{...items[0],quantity:BREAD_STAR_MAX}]);
    else assert.deepEqual(config.items.map(row=>row.quantity),STARTER_REWARDS.map(row=>row.quantity));
    assert(catalog.some(row=>row.code==='COIN' && row.active));
    assert.deepEqual(JSON.parse((await f.row("SELECT value FROM app_meta WHERE key='pingdu_bread_pool_snapshot:old-pool'")).value),items);
  }
});
async function preview(f,previousId=null,overrides={}) {
  const body={day,id:crypto.randomUUID(),previousId,rules,...overrides};
  let run=await ok(f.call('admin:batch-start',body,f.owner));
  assert.equal((await ok(f.call('admin:batch-start',body,f.owner))).id,run.id);
  while (run.counts.pending || run.counts.checking) run=await ok(f.call('admin:batch-step',{day:body.day,id:run.id},f.owner));
  return run;
}
const confirmation=run=>({day:run.day,id:run.id,accounts:run.counts.ready,amount:run.amount});
test('one owner confirmation settles the full population atomically, excludes paid/changed/failed accounts, and resumes safely',async t=>{
  const f=await setup(t), config=(await f.catalog()).config;
  await f.pg.exec(`INSERT INTO users(id,status,coin,nickname) SELECT n,'ACTIVE',0,'회원'||n FROM generate_series(3,27) n;
    INSERT INTO user_second_verifications SELECT n,'PLAYDK','bread-'||n FROM generate_series(3,27) n;`);
  let outage=true;
  f.provider.getDailyPostCount=async input=>{
    if (input.userUuid==='bread-3' && outage) throw Error('offline');
    return {...input,timezone:'Asia/Seoul',count:input.userUuid==='bread-4'?0:3};
  };
  async function single(userId) {
    const r=await ok(f.call('admin:review',{day,userId},f.owner));
    return ok(f.call('admin:settle',{day,userId,quantity:7,revision:r.revision,poolRevision:config.revision},f.owner));
  }
  await single(2);
  const start={day,rules,id:crypto.randomUUID(),previousId:null};
  assert.equal((await f.call('admin:batch-start',start,f.player)).status,403);
  assert.equal((await f.call('admin:batch-start',{...start,rules:{...rules,minutesPerBread:0}},f.owner)).status,400);
  const run=await ok(f.call('admin:batch-start',start,f.owner));
  assert.equal(run.total,27); assert.equal(run.counts.previous,1);
  assert.equal((await f.call('admin:batch-pay',confirmation(run),f.owner)).status,409);
  const step={day,id:run.id};
  await Promise.all([ok(f.call('admin:batch-step',step,f.owner)),ok(f.call('admin:batch-step',step,f.owner))]);
  let resumed=(await ok(f.call('admin:batch',null,f.owner,{day}))).batch;
  assert(resumed.counts.pending>0 && resumed.counts.pending<26);
  while (resumed.counts.pending || resumed.counts.checking) resumed=await ok(f.call('admin:batch-step',step,f.owner));
  assert.equal(resumed.counts.ready,24); assert.equal(resumed.amount,26);
  assert.equal(resumed.counts.held,1); assert.equal(resumed.held[0].userId,3); assert.equal(resumed.counts.zero,1);
  assert.equal((await f.state()).balance,0);
  const body=confirmation(resumed);
  assert.equal((await f.call('admin:batch-pay',{...body,amount:9999},f.owner)).status,409);
  assert.equal((await f.call('admin:batch-pay',body,f.player)).status,403);
  await single(6);
  await f.pg.query("UPDATE user_second_verifications SET provider_user_id='new-5' WHERE user_id=5");
  f.fault('PINGDU_BREAD_BATCH');
  assert.equal((await f.call('admin:batch-pay',body,f.owner)).status,503);
  f.fault(null);
  assert.equal((await f.state()).balance,0); assert.equal((await f.row('SELECT COUNT(*)::int AS n FROM pingdu_bread_days_v1 WHERE settled_at IS NOT NULL')).n,2);
  const [paid,replay]=await Promise.all([ok(f.call('admin:batch-pay',body,f.owner)),ok(f.call('admin:batch-pay',body,f.owner))]);
  assert.deepEqual(paid,replay); assert.equal(paid.counts.paid,22); assert.equal(paid.paidAmount,24);
  assert.equal(paid.counts.previous,2); assert.equal(paid.counts.held,2); assert.equal((await f.state()).balance,3);
  assert.equal((await f.row("SELECT COUNT(*)::int AS n FROM admin_logs WHERE action_type='PINGDU_BREAD_BATCH'")).n,1);
  outage=false;
  const retry=await preview(f,run.id);
  assert.equal(retry.counts.previous,24); assert.equal(retry.counts.held,0); assert.equal(retry.counts.ready,2);
  assert.equal((await f.call('admin:batch-pay',body,f.owner)).status,409);
  const final=await ok(f.call('admin:batch-pay',confirmation(retry),f.owner));
  assert.equal(final.counts.paid,2); assert.equal(final.paidAmount,2); assert.equal((await f.state()).balance,3);
});
test('batch rules, stale reward configurations and expired review leases are enforced server-side',async t=>{
  const f=await setup(t);
  const run=await ok(f.call('admin:batch-start',{day,id:crypto.randomUUID(),previousId:null,rules:{...rules,dailyCap:1}},f.owner));
  await f.pg.query("UPDATE pingdu_bread_batch_entries_v1 SET status='checking',lease='expired',lease_until=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE run_id=$1",[run.id]);
  const done=await ok(f.call('admin:batch-step',{day,id:run.id},f.owner));
  assert.equal(done.counts.ready,2); assert.equal(done.amount,2);
  await f.policy([item('MASTER_STAR',BREAD_STAR_MAX)]);
  assert.equal((await f.call('admin:batch-pay',confirmation(done),f.owner)).status,409);
  assert.equal((await f.state()).balance,0);
  assert.deepEqual((await ok(f.call('admin:batch',null,f.owner,{day:'2026-02-01'}))).defaults,{...rules,dailyCap:1});
});

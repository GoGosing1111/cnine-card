import test from 'node:test';
import assert from 'node:assert/strict';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {readyLichClear,lichFinishingAction} from './helpers/lich-clear-fixture.mjs';
import {lichWeeklyReward,lichRewardWeek} from '../functions/_raid_lich_rewards.js';

test('weekly reset is Monday midnight KST, including year rollover',()=>{
  assert.equal(lichRewardWeek(Date.parse('2026-10-04T14:59:59.999Z')).weekKey,'2026-09-28');
  assert.deepEqual(lichRewardWeek(Date.parse('2026-10-04T15:00:00.000Z')),{weekKey:'2026-10-05',startsAt:'2026-10-04T15:00:00.000Z',resetsAt:'2026-10-11T15:00:00.000Z'});
  assert.equal(lichRewardWeek(Date.parse('2027-01-03T15:00:00.000Z')).weekKey,'2027-01-04');
});
for(const postgres of [false,true])test('seven weekly rewards per account; mixed eligibility, snapshot, replay and next week '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const h=await lichLiveFixture({postgres});t.after(()=>h.close());let last;
  await h.run("UPDATE cnine_user_inventory SET quantity=8,unseen_quantity=8 WHERE user_id=1 AND item_code='LICH_KING_ENTRY_TICKET'");
  for(let i=1;i<=7;i++){
    last=await readyLichClear(h);
    // A settings save after departure must not alter this clear's reward.
    await h.configure({coinReward:7,masterStarReward:9,petEssenceReward:11});
    const clear=await h.call('action',{body:last.body});assert.equal(clear.status,200,JSON.stringify(clear.body));
    assert.deepEqual(clear.body.state.clearReward,{status:'GRANTED',granted:true,petEssence:5,masterStars:1000,coin:1000000000,
      weeklyReward:{...lichRewardWeek(),limit:7,used:i,remaining:7-i},settingsRevision:clear.body.state.clearReward.settingsRevision});
    assert.equal((await h.call('action',{body:last.body})).status,200);
    await h.call('status?roomId='+last.roomId,{user:2});
  }
  const eighth=await readyLichClear(h,{members:[1,2,6]});
  const result=await h.call('action',{body:eighth.body});assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.state.status,'CLEAR');assert.equal(result.body.state.clearReward.status,'WEEKLY_LIMIT');
  assert.equal(result.body.state.petEssenceReward.granted,false);
  assert.equal((await h.call('status?roomId='+eighth.roomId,{user:6})).body.state.clearReward.granted,true);
  for(const [uid,times]of [[1,7],[2,7],[3,7],[6,1]]){
    assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=?',uid)).coin),times*1000000000);
    for(const [code,amount]of [['MASTER_STAR',1000],['PET_ESSENCE',5]])assert.equal(Number((await h.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',uid,code)).quantity),times*amount);
  }
  assert.equal((await h.all('SELECT * FROM coin_logs')).length,22);
  const lobby=await h.call('status');assert.equal(lobby.body.weeklyReward.remaining,0);
  assert.equal((await lichWeeklyReward(h.env,1,Date.parse(lichRewardWeek().resetsAt))).remaining,7);
  // Historical replay still cannot pay again in a later week.
  await h.call('action',{body:last.body});assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),7000000000);
});

for(const postgres of [false,true])test('late payout failure rolls back room, every balance, quota and receipt '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const h=await lichLiveFixture({postgres});t.after(()=>h.close());const {roomId,body}=await readyLichClear(h);
  h.inject('INSERT INTO coin_logs');assert.equal((await h.call('action',{body})).status,503);h.inject('');
  assert.equal((await h.one('SELECT status FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).status,'ACTIVE');
  assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),0);
  assert.equal((await h.all("SELECT * FROM cnine_user_inventory WHERE item_code IN ('MASTER_STAR','PET_ESSENCE')")).length,0);
  assert.equal((await lichWeeklyReward(h.env,1)).used,0);
  assert.equal((await h.call('action',{body})).body.state.clearReward.granted,true);
});

test('legacy paid clears count, old in-flight rooms retain amounts, TEST and disabled rewards do not consume quota',async t=>{
  const h=await lichLiveFixture();t.after(()=>h.close());
  for(let i=0;i<7;i++){
    const roomId='legacy-'+i,room={finishedAt:Date.now(),petEssenceSettlement:{status:'GRANTED'}};
    await h.call('feature');
    await h.run("INSERT INTO raid_lich_rooms_v1(room_id,host_id,host_name,status,state_json,created_at,expires_at) VALUES(?,1,'legacy','CLEAR',?,?,?)",roomId,JSON.stringify(room),Date.now(),Date.now());
    await h.run("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reference_type,reference_id) VALUES(1,'PET_ESSENCE',5,5,'LICH_RAID_CLEAR',?)",roomId);
  }
  assert.equal((await lichWeeklyReward(h.env,1)).used,7);
  const old=await readyLichClear(h);
  const room=JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',old.roomId)).state_json);
  delete room.clearRewardPolicy;await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),old.roomId);
  const clear=await h.call('action',{body:old.body});assert.equal(clear.body.state.clearReward.status,'WEEKLY_LIMIT');
  const other=(await h.call('status?roomId='+old.roomId,{user:2})).body.state.clearReward;
  assert.equal(other.petEssence,5);assert.equal(other.coin,0);assert.equal(other.masterStars,0);
  for(const settings of [{mode:'TEST'},{petEssenceEnabled:false,coinReward:0,masterStarReward:0}]){
    const next=await readyLichClear(h,{settings});assert.equal((await h.call('action',{body:next.body})).body.state.clearReward.status,'DISABLED');
  }
  assert.equal((await lichWeeklyReward(h.env,2)).used,1);
});

test('concurrent clears reserve the final weekly slot once and still settle eligible teammates',async t=>{
  const h=await lichLiveFixture({postgres:true});t.after(()=>h.close());
  await h.run("UPDATE cnine_user_inventory SET quantity=7,unseen_quantity=7 WHERE user_id=1 AND item_code='LICH_KING_ENTRY_TICKET'");
  for(let i=0;i<6;i++){const b=await readyLichClear(h);assert.equal((await h.call('action',{body:b.body})).status,200);}
  const first=await readyLichClear(h),roomId='LK-'+crypto.randomUUID();
  // Model two delayed room settlements for the same users; ordinary admission
  // prevents dual membership, but settlement must enforce the cap independently.
  const row=await h.one('SELECT * FROM raid_lich_rooms_v1 WHERE room_id=?',first.roomId),room=JSON.parse(row.state_json);room.id=roomId;
  await h.run('INSERT INTO raid_lich_rooms_v1(room_id,host_id,host_name,status,state_json,version,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',roomId,1,'parallel','ACTIVE',JSON.stringify(room),row.version,row.created_at,row.expires_at);
  const second=await lichFinishingAction(h,roomId,2);
  const results=await Promise.all([h.call('action',{body:first.body}),h.call('action',{body:second,user:2})]);
  for(const r of results)assert.equal(r.status,200,JSON.stringify(r.body));
  assert.deepEqual(results.map(r=>r.body.state.clearReward.status).sort(),['GRANTED','WEEKLY_LIMIT']);
  assert.equal((await lichWeeklyReward(h.env,1)).used,7);
  assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),7000000000);
});

test('CMS defaults are backwards compatible; amounts and fixed cap are validated',async t=>{
  const h=await lichLiveFixture();t.after(()=>h.close());
  const settings=(await h.call('admin/raid/lich/settings')).body.settings;
  assert.equal(settings.masterStarReward,0);assert.equal(settings.coinReward,0);assert.equal(settings.weeklyRewardLimit,7);
  for(const change of [{coinReward:-1},{coinReward:1.5},{coinReward:1000000000001},{masterStarReward:-1},{masterStarReward:100000001},{weeklyRewardLimit:4}])assert.equal((await h.configure(change)).status,400);
  assert.equal((await h.configure({coinReward:1000000000000,masterStarReward:100000000})).status,200);
  assert.equal((await h.call('admin/raid/lich/settings',{user:2,body:{settings}})).status,403);
});

for(const postgres of [false,true])test('existing three-use accounts gain four slots without resetting settings or counters '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const h=await lichLiveFixture({postgres});t.after(()=>h.close());
  const configured=await h.configure({mode:'ON',coinReward:123,masterStarReward:456,petEssenceReward:9});
  const oldSettings={...configured.body.settings,weeklyRewardLimit:3};
  const raw=JSON.stringify(oldSettings),key='raid_lich_weekly_v1:'+lichRewardWeek().weekKey+':1';
  const counter=JSON.stringify({count:3,roomId:'previously-paid',token:'existing-receipt'});
  await h.run('UPDATE app_meta SET value=? WHERE key=?',raw,'raid_lich_settings_v1');
  await h.run('INSERT INTO app_meta(key,value) VALUES(?,?)',key,counter);
  const settings=await h.call('admin/raid/lich/settings');
  assert.equal(settings.status,200);assert.deepEqual(settings.body.settings,{...oldSettings,weeklyRewardLimit:7});
  const status=await h.call('status');
  assert.equal(status.status,200);assert.equal(status.body.feature.mode,'ON');
  assert.deepEqual(status.body.weeklyReward,{...lichRewardWeek(),limit:7,used:3,remaining:4});
  assert.equal((await h.one('SELECT value FROM app_meta WHERE key=?','raid_lich_settings_v1')).value,raw);
  assert.equal((await h.one('SELECT value FROM app_meta WHERE key=?',key)).value,counter);
  // A CMS tab opened before this release may still submit the old fixed limit.
  const saved=await h.call('admin/raid/lich/settings',{body:{settings:oldSettings}});
  assert.equal(saved.status,200);assert.deepEqual(saved.body.settings,{...oldSettings,revision:oldSettings.revision+1,weeklyRewardLimit:7});
  const next=await readyLichClear(h),clear=await h.call('action',{body:next.body});
  assert.equal(clear.status,200);assert.equal(clear.body.state.clearReward.granted,true);
  assert.deepEqual(clear.body.state.clearReward.weeklyReward,{...lichRewardWeek(),limit:7,used:4,remaining:3});
});

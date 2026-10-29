import test from 'node:test';
import assert from 'node:assert/strict';
import {madaraLiveFixture} from './helpers/madara-live-fixture.mjs';
import {MADARA_TICKET,validateMadaraSettings,defaultMadaraSettings} from '../functions/_raid_madara_live.js';
import {prepareMadaraRewards} from '../functions/_raid_madara_rewards.js';
const setup=async(t,options)=>{const h=await madaraLiveFixture(options);t.after(()=>h.close());return h;};
const balance=async(h,user=1)=>Number((await h.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',user,MADARA_TICKET))?.quantity||0);
test('CMS defaults TEST, excludes normal and ADMIN users, saves ON/OFF and rejects stale settings',async t=>{
  const h=await setup(t);assert.equal((await h.call('feature')).body.mode,'TEST');
  for(const user of [2,5]){assert.equal((await h.call('feature',{user})).body.visible,false);assert.equal((await h.call('lobby',{user})).status,403);assert.equal((await h.call('admin/raid/madara/settings',{user})).status,403);}
  assert.equal((await h.call('admin/raid/madara/test-users?q=2')).body.users[0].id,2);
  assert.equal((await h.configure()).status,200);assert.equal((await h.call('lobby',{user:2})).status,200);
  const old=(await h.call('admin/raid/madara/settings')).body.settings;
  assert.equal((await h.configure({mode:'ON',bossCombatPower:880000,enrageSeconds:480,mechanicTimePercent:150,entryTicketCost:2})).status,200);
  assert.equal((await h.call('feature',{user:4})).body.visible,true);
  assert.equal((await h.call('admin/raid/madara/settings',{body:{settings:old}})).status,409);
  assert.equal((await h.configure({mode:'OFF'})).status,200);assert.equal((await h.command('create')).status,423);
  assert.equal((await h.configure({testUserIds:[99999]})).status,400);
  for(const changes of [{bossCombatPower:NaN},{entryTicketCost:-1},{enrageSeconds:0},{weeklyRewardLimit:0},{coinReward:1e15},{rewardsEnabled:'true'}])assert.throws(()=>validateMadaraSettings({...defaultMadaraSettings(),...changes}));
});

test('PostgreSQL: existing migrated indexes do not require table ownership to load or save CMS',async t=>{
  const h=await setup(t,{postgres:true});await h.configure({bossCombatPower:880000});
  await h.env.DB.execSchema([
    'CREATE ROLE madara_runtime',
    'GRANT USAGE, CREATE ON SCHEMA public TO madara_runtime',
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO madara_runtime',
    'SET ROLE madara_runtime'
  ]);
  await assert.rejects(h.env.DB.execSchema(['CREATE INDEX IF NOT EXISTS idx_madara_lobby_v1 ON raid_madara_rooms_v1(status,expires_at,created_at)']),/must be owner/);
  // A cold isolate has no prior schema marker; that must still be a read check.
  h.env.RUNTIME_DB_CACHE_SCOPE={};
  const loaded=await h.call('admin/raid/madara/settings');assert.equal(loaded.status,200,JSON.stringify(loaded.body));
  assert.equal(loaded.body.settings.mode,'TEST');assert.equal(loaded.body.settings.bossCombatPower,880000);
  assert.equal((await h.configure({bossCombatPower:990000})).status,200);
  assert.equal((await h.call('admin/raid/madara/settings')).body.settings.bossCombatPower,990000);
  assert.equal((await h.call('feature')).body.mode,'TEST');
  assert.equal((await h.call('admin/raid/madara/settings',{user:5})).status,403);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: Free entry room, membership and receipt are atomic, retry creates once`,async t=>{
  const h=await setup(t,{postgres});await h.configure({mode:'ON',entryTicketCost:2});const requestId=h.uid();
  h.inject('INSERT INTO raid_madara_receipts');assert.equal((await h.call('create',{body:{requestId,role:'WARDEN'}})).status,503);h.inject('');
  assert.equal(await balance(h),5);assert.equal(Number((await h.one('SELECT COUNT(*) n FROM raid_madara_rooms_v1')).n),0);
  const [a,b]=await Promise.all([h.call('create',{body:{requestId,role:'WARDEN'}}),h.call('create',{body:{requestId,role:'WARDEN'}})]);
  assert.equal(a.status,200,JSON.stringify(a.body));assert.equal(b.body.roomId,a.body.roomId);assert.equal(await balance(h),5);
  assert.equal(Number((await h.one('SELECT COUNT(*) n FROM inventory_logs')).n),0);
  assert.equal((await h.command('create',{},3)).status,200);
  assert.equal((await h.command('create')).body.code,'MADARA_ALREADY_JOINED');
  assert.equal((await h.call('join',{body:{requestId,roomId:a.body.roomId,role:'RESCUE'}})).body.code,'MADARA_REQUEST_CONFLICT');
});
test('TEST free entry, real account names/decks, recovery, host transfer and pre-start kick',async t=>{
  const h=await setup(t),roomId=await h.party();assert.equal(await balance(h),5);
  const lobby=await h.call('lobby');assert.equal(lobby.body.account.roomId,roomId);assert.equal(lobby.body.account.cost,0);
  assert.equal((await h.command('start',{roomId})).body.code,'NOT_READY');
  assert.equal((await h.command('kick',{roomId,targetId:'3'},2)).status,403);
  assert.equal((await h.command('kick',{roomId,targetId:'3'})).status,200);
  assert.equal((await h.command('join',{roomId,role:'RESCUE'},3)).status,403);
  assert.equal((await h.call('state?roomId='+roomId,{user:3})).body.code,'MADARA_KICKED');
  assert.equal((await h.command('join',{roomId,role:'RESCUE'},6)).status,200);
  assert.equal((await h.command('leave',{roomId})).status,200);
  assert.equal((await h.call('state?roomId='+roomId,{user:2})).body.state.hostId,'2');
  assert.equal(await balance(h,2),2);
});
test('all roles must ready; saved formation is refreshed and participant cannot act for someone else',async t=>{
  const h=await setup(t),roomId=await h.party();
  for(const user of [1,2,3])assert.equal((await h.command('ready',{roomId,ready:true},user)).status,200);
  await h.configure({testUserIds:[2]});assert.equal((await h.command('start',{roomId})).body.code,'MADARA_MEMBER_ACCESS');await h.configure();
  const started=await h.command('start',{roomId});assert.equal(started.status,200,JSON.stringify(started.body));assert.equal(started.body.payload.reviewOnly,false);
  const own=(await h.call('state?roomId='+roomId+'&payload=1',{user:2})).body;assert.equal(own.state.me.id,'2');assert.equal(own.state.me.role,'ASSAULT');assert.equal(own.payload.cards.length,5);
  assert.equal(own.state.endsAt-own.state.startedAt,360000);
  assert.equal((await h.command('action',{roomId,actorId:'1',action:'HEAL',token:own.state.challenge.id},2)).status,403);
  assert.equal((await h.command('kick',{roomId,targetId:'2'})).body.code,'ROOM_STARTED');
  await h.configure({mode:'OFF'});assert.equal((await h.command('action',{roomId,action:'HEAL',token:own.state.challenge.id})).status,423);
  assert.equal((await h.command('leave',{roomId})).status,200,'closing the gate must not trap membership');
  assert.equal(Number((await h.one('SELECT COUNT(*) n FROM raid_madara_active_v1')).n),0);
});
test('concurrent joins never overbook six slots; a user cannot reserve two parties',async t=>{
  const h=await setup(t);await h.configure({mode:'ON',entryTicketCost:0});const roomId=(await h.command('create')).body.roomId;
  const users=[2,3,6,7,8];const joins=await Promise.all(users.map(user=>h.command('join',{roomId,role:'ASSAULT'},user)));
  for(let i=0;i<joins.length;i++)if(joins[i].status!==200)assert.equal((await h.command('join',{roomId,role:'ASSAULT'},users[i])).status,200);
  assert.equal((await h.call('state?roomId='+roomId)).body.state.members.length,6);
  assert.equal((await h.command('join',{roomId,role:'RESCUE'},4)).body.code,'ROOM_FULL');assert.equal((await h.command('create',{},2)).body.code,'MADARA_ALREADY_JOINED');
  assert.equal(await balance(h,2),2);
});
test('expired lobby frees reservations, settings snapshot controls timing, and foreign or forged input is rejected',async t=>{
  const h=await setup(t);await h.configure({enrageSeconds:600,mechanicTimePercent:150});const roomId=(await h.command('create')).body.roomId;
  const raw=JSON.parse((await h.one('SELECT state_json FROM raid_madara_rooms_v1 WHERE room_id=?',roomId)).state_json);assert.equal(raw.settings.enrageSeconds,600);assert.equal(raw.settings.mechanicTimePercent,150);
  raw.lobbyEndsAt=Date.now()-1;await h.run('UPDATE raid_madara_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(raw),roomId);
  assert.equal((await h.call('lobby')).body.account.roomId,null);
  assert.equal((await h.call('create',{body:{requestId:h.uid(),role:'WARDEN'},origin:'https://foreign.invalid'})).status,403);
  assert.equal((await h.call('create',{body:{requestId:h.uid(),role:'WARDEN',deck:{cards:[]}}})).status,400);
  assert.equal((await h.call('feature',{user:999})).status,401);
  assert.equal((await h.call('state?roomId='+roomId,{user:4})).status,403);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: clear rewards rollback together, TEST never grants, weekly limit counts one multi-item clear`,async t=>{
  const h=await setup(t,{postgres});await h.configure();
  const room={id:'REWARD-QA',status:'CLEAR',releaseMode:'ON',finishedAt:Date.now(),members:[{id:'1'},{id:'2'}],rewardPolicy:{enabled:true,coin:500000000000,masterStars:20,petEssence:3,weeklyLimit:1}};
  const testRoom={...structuredClone(room),releaseMode:'TEST'};const disabled=await prepareMadaraRewards(h.env,{status:'ACTIVE'},testRoom);assert.equal(disabled.statements.length,0);assert.equal(testRoom.clearRewards['1'].granted,false);
  const plan=await prepareMadaraRewards(h.env,{status:'ACTIVE'},room);h.inject('INSERT INTO coin_logs');await assert.rejects(h.env.DB.batch(plan.statements));h.inject('');
  assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),0);assert.equal((await h.one("SELECT value FROM app_meta WHERE key LIKE 'raid_madara_weekly_v1:%'")),null);
  await h.env.DB.batch(plan.statements);assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),500000000000);
  assert.equal(Number((await h.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='MASTER_STAR'")).quantity),20);
  const second={...structuredClone(room),id:'REWARD-QA-2'};delete second.clearRewards;const limited=await prepareMadaraRewards(h.env,{status:'ACTIVE'},second);assert.equal(limited.statements.length,0);assert.equal(second.clearRewards['1'].status,'WEEKLY_LIMIT');
  assert.equal((await prepareMadaraRewards(h.env,{status:'ACTIVE'},room)).statements.length,0);
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: final strike commits the room, clear receipt and party rewards once after a failed transaction`,async t=>{
  const h=await setup(t,{postgres});await h.configure({mode:'ON',entryTicketCost:0,rewardsEnabled:true,coinReward:500000000000,masterStarReward:20,petEssenceReward:3});
  const roomId=await h.party();for(const user of [1,2,3])assert.equal((await h.command('ready',{roomId,ready:true},user)).status,200);
  assert.equal((await h.command('start',{roomId})).status,200);
  // A persisted final damage window isolates settlement from the separately covered five-phase encounter.
  const room=JSON.parse((await h.one('SELECT state_json FROM raid_madara_rooms_v1 WHERE room_id=?',roomId)).state_json);
  room.phase=4;room.step='DAMAGE';room.boss.hp=1;room.challenge.kind='FINAL';room.challenge.tasks=[];room.challenge.deadline=Date.now()+30000;room.challenge.damageBy={};room.challenge.lastStrike={};
  await h.run('UPDATE raid_madara_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);
  const input={requestId:h.uid(),roomId,action:'STRIKE',token:room.challenge.id};
  h.inject('INSERT INTO coin_logs');assert.equal((await h.call('action',{body:input})).status,503);h.inject('');
  assert.equal((await h.one('SELECT status FROM raid_madara_rooms_v1 WHERE room_id=?',roomId)).status,'ACTIVE');
  assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),0);
  assert.equal(Number((await h.one('SELECT COUNT(*) n FROM raid_madara_active_v1')).n),3);
  const cleared=await h.call('action',{body:input});assert.equal(cleared.status,200,JSON.stringify(cleared.body));assert.equal(cleared.body.state.status,'CLEAR');assert.equal(cleared.body.state.clearReward.coin,500000000000);
  assert.equal((await h.call('action',{body:input})).status,200);
  assert.equal(Number((await h.one('SELECT COUNT(*) n FROM coin_logs')).n),3);
  assert.equal(Number((await h.one('SELECT COUNT(*) n FROM raid_madara_active_v1')).n),0);
  for(const user of [1,2,3]){assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=?',user)).coin),500000000000);assert.equal((await h.call('lobby',{user})).body.weeklyReward.used,1);}
});

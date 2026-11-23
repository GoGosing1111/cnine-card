import test from 'node:test';import assert from 'node:assert/strict';
import {noxFixture,NOX_DECK} from './helpers/nox-live-fixture.mjs';
import {defaultNoxSettings,NOX_ENTRY_COINS,NOX_CREATE_COINS,NOX_CLIENT_VERSION} from '../functions/_raid_nox_live.js';
import {createNoxRoom,addNoxMember,readyNoxMember,startNoxRoom,tickNoxRoom,actNoxRoom,NOX_RULES,noxView} from '../functions/_raid_nox.js';
import {nearestNoxNote,noxRhythmTime,noxNoteY} from '../js/nox-input-v1.mjs';
import {noxTrack} from '../shared/nox-raid-chart-v1.mjs';
import {noxClearKey} from '../functions/_milestone_trophies.js';
test('closed default; TEST allowlist, OWNER exception, ADMIN denial and OFF block',async t=>{const h=await noxFixture(t);assert.equal(defaultNoxSettings().mode,'OFF');for(const [user,visible]of [[1,true],[2,true],[4,false],[5,false]])assert.equal((await h.call('feature',{user})).body.visible,visible);assert.equal((await h.command('create',{size:3},4)).status,403);assert.equal((await h.call('admin/raid/nox/settings',{user:5})).status,403);await h.configure({mode:'OFF'});assert.equal((await h.command('create',{size:3})).status,423);assert.equal((await h.call('feature',{user:0})).status,401);});
test('waiting-room list admits authorised players and omits practice, full, started, expired and other-mode rooms',async t=>{
  const h=await noxFixture(t);
  const result=await h.command('create',{difficulty:'HELL',size:3});
  const id=result.body.roomId;
  const practice=await h.command('practice',{difficulty:'NORMAL'},2);
  assert.equal(practice.status,200);
  const list=user=>h.call('rooms',{user});
  assert.equal((await list(0)).status,401);
  assert.equal((await list(4)).status,403);
  assert.deepEqual((await list(3)).body.rooms,[{id,difficulty:'HELL',size:3,members:1,host:result.body.state.members[0].name}]);
  assert.equal((await h.command('join',{roomId:id},3)).status,200);
  assert.equal((await list(3)).body.rooms[0].members,2);
  await h.command('leave',{roomId:practice.body.roomId},2);
  assert.equal((await h.command('join',{roomId:id},2)).status,200);
  assert.deepEqual((await list(3)).body.rooms,[]);
  for(const user of [1,2,3])assert.equal((await h.command('ready',{roomId:id,ready:true,acceptedCoins:'0'},user)).status,200);
  assert.equal((await h.command('start',{roomId:id})).status,200);
  assert.deepEqual((await list(3)).body.rooms,[]);
  const other=await h.command('create',{size:6,difficulty:'NORMAL'},6);
  assert.equal(other.status,200);
  await h.pg.query('UPDATE raid_nox_rooms_v1 SET expires_at=$1 WHERE room_id=$2',[Date.now()-1,other.body.roomId]);
  assert.deepEqual((await list(3)).body.rooms,[]);
  const previous=await h.command('create',{size:6,difficulty:'NORMAL'},7);
  assert.equal(previous.status,200);
  await h.configure({mode:'ON'});
  const official=await h.command('create',{difficulty:'HELL',size:6,acceptedCreateCoins:NOX_CREATE_COINS},8);
  assert.equal(official.status,200);
  assert.deepEqual((await list(4)).body.rooms.map(room=>room.id),[official.body.roomId]);
  await h.configure({mode:'OFF'});
  assert.equal((await list(3)).status,423);
});
test('TEST entry is free for 3 and 6; exact roster and PVE payload; no wallets or ledgers change',async t=>{const h=await noxFixture(t);for(const size of [3,6]){const {roomId,ids}=await h.party(size);const start=await h.command('start',{roomId});assert.equal(start.status,200,JSON.stringify(start));assert.equal(start.body.state.status,'ACTIVE');assert.equal(start.body.state.entryCoins,'0');assert.equal(start.body.state.bossMaxHp,size===3?18000000:12000000);assert.equal((await h.one('SELECT count(*)::int n FROM raid_nox_entry_fees_v1 WHERE room_id=$1 AND coins=0',[roomId])).n,size);assert.equal((await h.one('SELECT count(*)::int n FROM coin_logs')).n,0);for(const id of ids)await h.command('leave',{roomId},id);}});
test('ON charges only the host 10T when creating, then 3T per player when starting',async t=>{
  const h=await noxFixture(t);
  await h.configure({mode:'ON'});
  const {roomId,ids}=await h.party(3);
  assert.deepEqual(await h.all('SELECT user_id::int,change_amount::text FROM coin_logs'),[{user_id:1,change_amount:'-10000000000000'}]);
  const body={requestId:h.uid(),clientVersion:NOX_CLIENT_VERSION,roomId};
  const [first,replay]=await Promise.all([h.call('start',{body}),h.call('start',{body})]);
  assert.equal(first.status,200,JSON.stringify(first));
  assert.equal(first.body.state.entryCoins,'3000000000000');
  assert.equal(replay.status,200);
  for(const id of ids){
    const hostFee=id===1?BigInt(NOX_CREATE_COINS):0n;
    assert.equal((await h.one('SELECT coin::text coin FROM users WHERE id=$1',[id])).coin,(999999999999999999n-BigInt(NOX_ENTRY_COINS)-hostFee).toString());
  }
  assert.equal((await h.one('SELECT count(*)::int n FROM coin_logs')).n,4);
  assert.equal((await h.command('start',{roomId})).status,409);
  assert.equal((await h.one('SELECT count(*)::int n FROM coin_logs')).n,4);
  assert.equal((await h.call('start',{body:{...body,roomId:'0123456789'}})).body.code,'NOX_REQUEST_CONFLICT');
});
test('an already prepared official lobby starts at 3T even with an older 50T quote',async t=>{
  const h=await noxFixture(t);
  await h.configure({mode:'ON'});
  const {roomId}=await h.party(3);
  const previousFee='50000000000000',newFee='3000000000000';
  await h.changeRoom(roomId,room=>{
    room.entryCoins=previousFee;
    for(const member of room.members)member.acceptedCoins=previousFee;
  });
  const {body}=await h.call('state?roomId='+roomId);
  assert.equal(body.state.entryCoins,newFee);
  assert(body.state.members.every(member=>member.ready));
  assert.equal((await h.command('ready',{roomId,ready:true,acceptedCoins:previousFee},2)).body.code,'NOX_FEE_CONSENT');
  assert.equal((await h.command('ready',{roomId,ready:true,acceptedCoins:newFee},2)).status,200);
  await h.pg.query('UPDATE users SET coin=$1 WHERE id=2',[newFee]);
  const started=await h.command('start',{roomId});
  assert.equal(started.status,200,JSON.stringify(started));
  assert.equal(started.body.state.entryCoins,newFee);
  assert.equal((await h.one('SELECT coin::text FROM users WHERE id=2')).coin,'0');
  assert.deepEqual(await h.all('SELECT coins::text FROM raid_nox_entry_fees_v1 WHERE room_id=$1',[roomId]),Array.from({length:3},()=>({coins:newFee})));
});
test('creation checks the chosen difficulty and exact 10T fee before committing a single debit',async t=>{
  const h=await noxFixture(t);
  await h.configure({mode:'ON'});
  const body={size:3,difficulty:'HELL',acceptedCreateCoins:NOX_CREATE_COINS,requestId:h.uid(),clientVersion:NOX_CLIENT_VERSION};
  assert.equal((await h.call('create',{body:{...body,difficulty:'HARD'}})).body.code,'DIFFICULTY');
  assert.equal((await h.call('create',{body:{...body,acceptedCreateCoins:'5000000000000'}})).body.code,'NOX_CREATE_FEE_CONSENT');
  assert.equal((await h.call('create',{body:{...body,clientVersion:4}})).body.code,'NOX_CLIENT_UPDATE');
  await h.pg.query('UPDATE users SET coin=9999999999999 WHERE id=1');
  assert.equal((await h.call('create',{body})).body.code,'NOX_CREATE_COINS');
  await h.pg.query('UPDATE users SET coin=10000000000000 WHERE id=1');
  h.failAt('INSERT INTO raid_nox_receipts_v1');
  assert.equal((await h.call('create',{body})).status,503);
  h.failAt('');
  assert.equal((await h.one('SELECT coin::text FROM users WHERE id=1')).coin,'10000000000000');
  assert.equal((await h.one('SELECT count(*)::int n FROM coin_logs')).n,0);
  assert.equal((await h.one('SELECT count(*)::int n FROM raid_nox_rooms_v1')).n,0);
  const [first,replay]=await Promise.all([h.call('create',{body}),h.call('create',{body})]);
  assert.equal(first.status,200,JSON.stringify(first));
  assert.equal(replay.body.roomId,first.body.roomId);
  assert.equal(replay.body.state.difficulty,'HELL');
  assert.equal((await h.one('SELECT coin::text FROM users WHERE id=1')).coin,'0');
  assert.equal((await h.one('SELECT count(*)::int n FROM coin_logs')).n,1);
  const roomId=first.body.roomId;
  assert.equal((await h.command('join',{roomId,difficulty:'NORMAL'},2)).status,400);
  assert.equal((await h.command('join',{roomId},2)).body.state.difficulty,'HELL');
});
test('entry consent, insufficient balance and failure after debit roll back the whole party start',async t=>{
  const h=await noxFixture(t);
  await h.configure({mode:'ON'});
  const creation=await h.command('create',{size:3,acceptedCreateCoins:NOX_CREATE_COINS});
  assert.equal(creation.status,200,JSON.stringify(creation));
  const {roomId}=creation.body;
  assert.equal((await h.command('ready',{roomId,ready:true,acceptedCoins:'0'})).body.code,'NOX_FEE_CONSENT');
  await h.command('leave',{roomId});
  const party=await h.party(3);
  await h.pg.query('UPDATE users SET coin=0 WHERE id=3');
  assert.equal((await h.command('start',{roomId:party.roomId})).body.code,'NOX_COINS');
  assert.equal((await h.one('SELECT count(*)::int n FROM coin_logs')).n,2);
  await h.pg.query('UPDATE users SET coin=999999999999999999 WHERE id=3');
  h.failAt('INSERT INTO coin_logs');
  assert.equal((await h.command('start',{roomId:party.roomId})).status,503);
  h.failAt('');
  assert.equal((await h.one('SELECT coin::text FROM users WHERE id=1')).coin,(999999999999999999n-2n*BigInt(NOX_CREATE_COINS)).toString());
  assert.equal((await h.one('SELECT count(*)::int n FROM raid_nox_entry_fees_v1')).n,0);
  assert.equal((await h.one('SELECT status FROM raid_nox_rooms_v1 WHERE room_id=$1',[party.roomId])).status,'LOBBY');
  assert.equal((await h.command('start',{roomId:party.roomId})).status,200);
});
test('TEST to ON cannot silently bill or admit free public joiners; OFF still allows leaving',async t=>{const h=await noxFixture(t);const {roomId}=await h.party(3);await h.configure({mode:'ON'});assert.equal((await h.command('start',{roomId})).body.code,'NOX_MODE_CHANGED');assert.equal((await h.command('join',{roomId},4)).body.code,'NOX_MODE_CHANGED');assert.equal((await h.one('SELECT count(*)::int n FROM coin_logs')).n,0);await h.configure({mode:'OFF'});assert.equal((await h.command('leave',{roomId})).status,200);});
test('removed/suspended member, stale CMS revision, foreign state and forged card parameters denied',async t=>{const h=await noxFixture(t),settings=(await h.call('admin/raid/nox/settings')).body.settings;const {roomId}=await h.party(3);await h.configure({testUserIds:[2,6,7,8]});assert.equal((await h.command('start',{roomId})).body.code,'NOX_MEMBER_ACCESS');assert.equal((await h.call('admin/raid/nox/settings',{body:{settings}})).body.code,'NOX_SETTINGS_CONFLICT');assert.equal((await h.call('state?roomId='+roomId,{user:6})).status,403);assert.equal((await h.command('create',{size:3,cards:NOX_DECK},6)).status,400);assert.equal((await h.call('create',{body:{size:3},origin:'https://foreign.invalid'})).status,403);});
test('six simultaneous musical inputs merge without lost hits, replay conflicts or duplicate event sequence',async t=>{const h=await noxFixture(t),{roomId,ids}=await h.party(6);await h.command('start',{roomId});const at=Date.now()-100;const room=await h.changeRoom(roomId,r=>{r.clock=at-10;r.startedAt=at-5000;r.challenge.startsAt=at-5000;r.challenge.musicStartAt=at-r.challenge.chart[0].at;r.challenge.deadline=at+30000;});const bodies=ids.map(()=>({roomId,seq:1,challengeId:room.challenge.id,inputs:[{lane:room.challenge.chart[0].lane,at}]}));const results=await Promise.all(ids.map((user,i)=>h.call('action',{user,body:bodies[i]})));for(const r of results)assert.equal(r.status,200,JSON.stringify(r));const stored=JSON.parse((await h.one('SELECT state_json FROM raid_nox_rooms_v1 WHERE room_id=$1',[roomId])).state_json);assert.ok(stored.members.every(m=>m.hits.length===1&&m.score===1));assert.equal(new Set(stored.events.map(e=>e.seq)).size,stored.events.length);assert.equal((await h.call('action',{user:2,body:bodies[1]})).status,200);assert.equal((await h.call('action',{user:2,body:{...bodies[1],inputs:[]}})).body.code,'REPLAY_CONFLICT');assert.equal((await h.call('action',{user:2,body:{...bodies[1],seq:2,inputs:[{lane:0,at:Date.now()+10000}]}})).status,400);});
test('clock-only polls do not persist room state; lobby expires and active binding can be reused',async t=>{const h=await noxFixture(t),{roomId}=await h.party(3);h.resetQueries();assert.equal((await h.call('state?roomId='+roomId)).status,200);assert.equal(h.queries().filter(q=>/^UPDATE|^INSERT|^DELETE/.test(q)).length,0);await h.changeRoom(roomId,r=>{r.lobbyEndsAt=Date.now()-1;});assert.equal((await h.command('create',{size:3})).status,200);});
test('practice is private, idempotent and free in both difficulties, including a persisted clear',async t=>{
  const h=await noxFixture(t),user=4;
  assert.equal((await h.command('practice',{difficulty:'NORMAL'},user)).status,403);
  await h.configure({mode:'ON'});
  await h.pg.query('UPDATE users SET coin=0 WHERE id=$1',[user]);
  assert.equal((await h.command('practice',{difficulty:'HARD'},user)).body.code,'DIFFICULTY');
  assert.equal((await h.command('practice',{difficulty:'NORMAL',size:3},user)).status,400);
  assert.equal((await h.command('create',{size:1,acceptedCreateCoins:NOX_CREATE_COINS},user)).body.code,'INVALID_ROOM');
  for(const difficulty of ['NORMAL','HELL']){
    const body={requestId:h.uid(),clientVersion:NOX_CLIENT_VERSION,difficulty};
    const [created,replay]=await Promise.all([h.call('practice',{user,body}),h.call('practice',{user,body})]);
    assert.equal(created.status,200,JSON.stringify(created));
    assert.equal(replay.body.roomId,created.body.roomId);
    const {roomId,state,payload}=created.body;
    assert.equal(state.practice,true);
    assert.equal(state.size,1);
    assert.equal(state.members.length,1);
    assert.equal(state.difficulty,difficulty);
    assert.equal(state.entryCoins,'0');
    assert.equal(state.release.createCoins,'0');
    assert.equal(state.release.rewardLocked,true);
    assert.equal(state.bossMaxHp,6000000);
    assert.equal(payload.cards.length,5);
    assert.equal((await h.command('join',{roomId},2)).body.code,'NOX_PRACTICE_PRIVATE');
    assert.equal((await h.call('state?roomId='+roomId,{user:2})).status,403);
    assert.equal((await h.command('start',{roomId},user)).body.code,'NOT_READY');
    assert.equal((await h.command('ready',{roomId,ready:true},user)).status,200);
    const started=await h.command('start',{roomId},user);
    assert.equal(started.status,200,JSON.stringify(started));
    assert.equal(started.body.state.status,'ACTIVE');
    assert.equal(started.body.state.feePaid,false);
    await h.changeRoom(roomId,room=>{
      const now=Date.now();
      room.round=3;room.stage='EXPOSED';room.lastAttackAt=now-1500;room.boss.hp=1;
      room.challenge={id:roomId+':3:EXPOSED',stage:'EXPOSED',startsAt:now-1500,deadline:now+5000};
    });
    const clear=await h.call('state?roomId='+roomId,{user});
    assert.equal(clear.body.state.status,'CLEAR');
    assert.equal(clear.body.state.reward,null);
    assert.equal((await h.call('state?roomId='+roomId,{user})).body.state.reward,null);
    assert.equal((await h.call('feature?weekly=1',{user})).body.weeklyReward.used,0);
  }
  assert.equal((await h.one('SELECT coin::text FROM users WHERE id=$1',[user])).coin,'0');
  for(const table of ['coin_logs','inventory_logs','cnine_user_inventory','raid_nox_entry_fees_v1']){
    assert.equal((await h.one('SELECT count(*)::int AS n FROM '+table)).n,0,table);
  }
  assert.equal(await h.one('SELECT key FROM app_meta WHERE key=$1',[noxClearKey(user)]),undefined);
  assert.equal((await h.one('SELECT count(*)::int AS n FROM raid_nox_rooms_v1')).n,2);
  await h.configure({mode:'OFF'});
  assert.equal((await h.command('practice',{difficulty:'NORMAL'},user)).status,423);
});
test('solo can clear each of the three mechanics and all three rounds in Normal and Hell',()=>{
  for(const difficulty of ['NORMAL','HELL']){
    const room=createNoxRoom({id:'0123456789',hostId:'1',size:1,practice:true,difficulty,now:0,seed:7});
    addNoxMember(room,{id:'1',cards:NOX_DECK});
    readyNoxMember(room,'1');
    startNoxRoom(room,'1',0);
    const player=room.members[0];
    const send=(inputs,now)=>actNoxRoom(room,'1',{seq:player.lastSequence+1,challengeId:room.challenge.id,inputs},now);
    for(let round=1;round<=3;round++){
      let challenge=room.challenge;
      assert.equal(room.round,round);
      assert.equal(player.role,round-1);
      assert.equal(challenge.travelMs,difficulty==='HELL'?800:1250);
      assert.equal(challenge.chart.length,Math.round(noxTrack(challenge.trackId).notes.length*(difficulty==='HELL'?1.75:1)));
      for(const {at,lane} of challenge.chart){
        const time=challenge.musicStartAt+at;
        send([{lane,at:time}],time);
      }
      tickNoxRoom(room,challenge.deadline);
      challenge=room.challenge;
      assert.equal(challenge.stage,'MEMORY');
      assert.equal(challenge.sequence.length,difficulty==='HELL'?5:3);
      send(challenge.sequence.map(lane=>({lane,at:challenge.revealEnd+30})),challenge.revealEnd+30);
      tickNoxRoom(room,challenge.deadline+NOX_RULES.receiptGraceMs);
      challenge=room.challenge;
      assert.equal(challenge.stage,'COOP');
      assert.equal(room.status,'ACTIVE');
      send([{lane:player.role,at:challenge.targetAt}],challenge.targetAt);
      tickNoxRoom(room,challenge.deadline+NOX_RULES.receiptGraceMs);
      assert.equal(room.stage,'EXPOSED');
      while(room.status==='ACTIVE'&&room.stage==='EXPOSED')tickNoxRoom(room,room.clock+1000);
    }
    assert.equal(room.status,'CLEAR',JSON.stringify(room.failure));
  }
});
test('three complete rounds clear in 3/6 players; shared 80/160ms, mines, cooperative receipt grace retained',()=>{for(const size of [3,6]){const r=createNoxRoom({id:'0123456789',hostId:'1',size,now:0,seed:7});for(let i=1;i<=size;i++){addNoxMember(r,{id:String(i),cards:NOX_DECK});readyNoxMember(r,String(i));}startNoxRoom(r,'1',0);const send=(m,inputs,now)=>actNoxRoom(r,m.id,{seq:m.lastSequence+1,challengeId:r.challenge.id,inputs},now);for(let round=1;round<=3;round++){let c=r.challenge;for(const n of c.chart){const at=c.musicStartAt+n.at;for(const m of r.members)send(m,[{lane:n.lane,at}],at);}tickNoxRoom(r,c.deadline);c=r.challenge;assert.equal(c.stage,'MEMORY');assert.equal(c.tiles.filter(t=>t.kind==='mine').length,27);assert.equal(noxView(r,'1').challenge.cues.length,3);for(const m of r.members)send(m,c.sequence.map(lane=>({lane,at:c.revealEnd+30})),c.revealEnd+300);tickNoxRoom(r,c.deadline+NOX_RULES.receiptGraceMs);c=r.challenge;for(const m of r.members)send(m,[{lane:m.role,at:c.targetAt}],c.targetAt+500);tickNoxRoom(r,c.deadline+NOX_RULES.receiptGraceMs);assert.equal(r.stage,'EXPOSED');while(r.status==='ACTIVE'&&r.stage==='EXPOSED')tickNoxRoom(r,r.clock+1000);}assert.equal(r.status,'CLEAR',JSON.stringify(r.failure));}
  for(const offset of [-150,0,150])for(const height of [110,550]){const age=noxRhythmTime(1000+offset,offset);assert.equal(noxNoteY(1000,age,height,40)+20,height);assert.equal(nearestNoxNote([{id:1,lane:0,at:1000}],new Set(),0,age).grade,'PERFECT');}assert.equal(nearestNoxNote([{id:1,lane:0,at:1000}],new Set(),0,1160).grade,'GOOD');assert.equal(nearestNoxNote([{id:1,lane:0,at:1000}],new Set(),0,1161),null);
});

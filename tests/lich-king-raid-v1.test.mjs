import test from 'node:test';
import assert from 'node:assert/strict';
import {createLichRoom,addLichMember,startLichRoom,tickLichRoom,actLichRoom,lichView,lichBattlePayload,LICH_RELEASE} from '../functions/_raid_lich_king.js';
import {REVIEW_DECK,REVIEW_BOSS} from '../preview/lich-king-raid-v1/fixture.mjs';
import {createLichPreviewServer} from '../preview/lich-king-raid-v1/server.mjs';

function harness({mode='COMMAND',powerScale=1}={}){
  const room=createLichRoom({id:'TESTROOM',hostId:'host',mode,cards:REVIEW_DECK,monster:REVIEW_BOSS,now:0,seed:11,powerScale});
  addLichMember(room,{id:'host',name:'정벌대',role:'ASSAULT'});
  let serial=0;
  const tick=ms=>tickLichRoom(room,room.clock+ms);
  const act=(action,target='',id='host',requestId='request_'+(++serial))=>actLichRoom(room,id,{requestId,challengeId:room.challenge.id,action,target},room.clock);
  const start=()=>{startLichRoom(room,'host',room.clock);tick(12000);};
  return {room,act,tick,start};
}
function solveMechanic(h){
  const {room,act,tick}=h,c=room.challenge;
  if(c.kind==='FINALE'){
    while(room.souls<3){act('RESCUE',c.ghostRune);tick(2500);}
    for(const rune of c.sequence)act('SEAL',rune);
    return;
  }
  if(c.kind==='CONVERGENCE'){
    act('RESCUE',c.ghostRune);tick(2500);act('RESCUE',c.ghostRune);tick(2500);
    for(const rune of c.sequence)act('SEAL',rune);
  }
  const transferAt=c.startedAt+(c.kind==='PLAGUE'?2000:6000);
  if(room.clock<transferAt)tick(transferAt-room.clock);
  act('TRANSFER',c.plagueRune);
  const castAt=c.startedAt+(c.kind==='PLAGUE'?7000:10000);
  if(room.clock<castAt)tick(castAt-room.clock);
  act('INTERRUPT');assert.equal(room.step,'EXPOSED');
}
function damageWindow(h){
  const {room,act,tick}=h;
  if(room.resources.heal>0&&room.fighters.some(f=>f.hp<f.maxHp*.6))act('HEAL');
  let actions=0;
  while(room.step==='EXPOSED'&&room.status==='ACTIVE'){
    act(room.resources.burst>0&&[1,3,6].includes(room.round)?'BURST':'STRIKE');actions++;
    if(room.step==='EXPOSED')tick(1200);
  }
  return actions;
}
test('fixed enemy power, five real catalog cards and distinct source art/SD stay review-only',()=>{
  const a=harness(),b=harness({powerScale:4});assert.equal(a.room.boss.maxHp,b.room.boss.maxHp);assert.equal(a.room.boss.attack,b.room.boss.attack);
  const payload=lichBattlePayload(a.room);assert.equal(payload.battleV2.teams.A.cards.length,5);
  assert.equal(payload.cards[1].image,REVIEW_DECK[1].image);assert.notEqual(payload.monster.image,payload.monster.battleSprite);
  assert.equal(payload.battleV2.teams.B.cards[0].projectVMonsterArt.primaryUrl,REVIEW_BOSS.battleSprite);
  assert.equal(LICH_RELEASE.mode,'OFF');assert.equal(LICH_RELEASE.rewardLocked,true);
  assert.throws(()=>createLichRoom({id:'x',hostId:'h',cards:REVIEW_DECK.slice(0,4),monster:REVIEW_BOSS}),/5장/);
});
test('perfect execution can clear every mandatory phase; resources and HP carry between rounds',()=>{
  const h=harness();h.start();const rounds=[];
  for(let i=0;i<7&&h.room.status==='ACTIVE';i++){
    solveMechanic(h);const actions=damageWindow(h);rounds.push({round:i+1,actions,hp:h.room.boss.hp,party:h.room.fighters.map(c=>Math.round(c.hp/c.maxHp*100))});
    if(h.room.step==='TRANSITION')h.tick(3000);
  }
  assert.equal(h.room.status,'CLEAR',JSON.stringify({rounds,failure:h.room.failure}));
  assert.equal(h.room.statistics.interrupts,6);assert.equal(h.room.resources.interrupt,1);
  assert.equal(h.room.statistics.transfers,6);assert.equal(h.room.souls,4);
  assert.equal(h.room.boss.hp,0);assert.equal(h.room.events.filter(e=>e.type==='RESULT'&&e.winner==='A').length,1);
});
test('correct mechanics with an underpowered deck fail the damage check',()=>{
  const h=harness({powerScale:.04});h.start();solveMechanic(h);damageWindow(h);
  assert.equal(h.room.status,'FAILED');assert.ok(['DPS_CHECK','COMBAT_LOSS'].includes(h.room.failure.code));assert.ok(h.room.boss.hp>0);
});
test('plague requires readable matching target and timing, not a success boolean',()=>{
  const h=harness();h.start();assert.throws(()=>h.act('TRANSFER',h.room.challenge.plagueRune),/2중첩/);
  h.tick(2000);h.act('TRANSFER','wrong');assert.equal(h.room.doom,1);assert.equal(h.room.challenge.plague,true);
  h.act('TRANSFER',h.room.challenge.plagueRune);assert.equal(h.room.challenge.plague,false);assert.equal(h.room.statistics.transfers,1);
  const failed=harness();failed.start();failed.tick(8000);assert.equal(failed.room.failure.code,'PLAGUE_SPREAD');
});
test('uninterrupted soul annihilation wipes the raid; decoys consume a scarce charge',()=>{
  const h=harness();h.start();h.act('INTERRUPT');assert.equal(h.room.resources.interrupt,6);assert.equal(h.room.challenge.interrupted,false);
  h.tick(2000);h.act('TRANSFER',h.room.challenge.plagueRune);h.tick(5000);assert.equal(h.room.challenge.cast,'SOUL_ANNIHILATION');
  h.tick(5000);assert.equal(h.room.status,'FAILED');assert.equal(h.room.failure.code,'ANNIHILATION');
});
test('prison protects the party and releases the plague at the server breath deadline',()=>{
  const h=harness();h.start();for(let i=0;i<2;i++){solveMechanic(h);damageWindow(h);h.tick(3000);}
  const before=h.room.fighters.map(c=>c.hp);assert.equal(h.room.challenge.prison,true);
  assert.throws(()=>h.act('TRANSFER',h.room.challenge.plagueRune),/감옥/);
  h.tick(6000);assert.equal(h.room.challenge.prison,false);assert.equal(h.room.challenge.breathResolved,true);
  assert.deepEqual(h.room.fighters.map(c=>c.hp),before);h.act('TRANSFER',h.room.challenge.plagueRune);
});
test('premature prison destruction causes actual party damage and two doom stacks',()=>{
  const h=harness();h.start();for(let i=0;i<2;i++){solveMechanic(h);damageWindow(h);h.tick(3000);}
  h.act('GUARD');h.act('SHATTER');h.tick(2000);h.act('TRANSFER',h.room.challenge.plagueRune);
  const before=h.room.fighters.reduce((s,c)=>s+c.hp,0);h.tick(4000);
  assert.equal(h.room.doom,2);assert.ok(h.room.fighters.reduce((s,c)=>s+c.hp,0)<before);assert.equal(h.room.resources.guard,0);
});
test('roles, stale windows, duplicate request IDs and terminal state cannot bypass rules',()=>{
  const h=harness({mode:'PARTY'});assert.throws(h.start,/각각/);
  addLichMember(h.room,{id:'ward',name:'봉인',role:'WARDEN'});addLichMember(h.room,{id:'rescue',name:'구출',role:'RESCUE'});h.start();
  h.tick(2000);assert.throws(()=>h.act('TRANSFER',h.room.challenge.plagueRune),/구출대/);
  const request={requestId:'repeat_req',challengeId:h.room.challenge.id,action:'CLEANSE'};
  actLichRoom(h.room,'rescue',request,h.room.clock);const resources=h.room.resources.cleanse;
  actLichRoom(h.room,'rescue',request,h.room.clock);assert.equal(h.room.resources.cleanse,resources);
  assert.throws(()=>actLichRoom(h.room,'rescue',{...request,action:'HEAL'},h.room.clock),/식별자/);
  assert.throws(()=>actLichRoom(h.room,'rescue',{...request,requestId:'new_req_1',challengeId:'old'},h.room.clock),/지난/);
  h.tick(210000);assert.equal(h.room.status,'FAILED');assert.throws(()=>h.act('STRIKE'),/진행 중/);
});
test('deadline advances without input or client clocks and rejects backwards time',()=>{
  const h=harness();h.start();assert.throws(()=>tickLichRoom(h.room,h.room.clock-1),/되돌릴/);
  h.tick(220000);assert.equal(h.room.failure.code,'ENRAGE');assert.equal(lichView(h.room,'host').release.mode,'OFF');
});
test('local HTTP authority isolates sessions, enforces roles and blocks cross-origin writes',async t=>{
  let now=1000;const server=createLichPreviewServer({clock:()=>now});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const post=async(route,data={},token='',extra={})=>{const r=await fetch(base+'/__lich/'+route,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...extra},body:JSON.stringify(data)});return {status:r.status,...await r.json()};};
  const a=await post('create',{mode:'PARTY',role:'ASSAULT',name:'leader'});assert.equal(a.status,200);
  const b=await post('join',{code:a.state.id,role:'WARDEN',name:'ward'});const c=await post('join',{code:a.state.id,role:'RESCUE',name:'rescue'});
  assert.equal((await post('start',{},b.token)).status,403);assert.equal((await post('start',{},a.token)).state.status,'ACTIVE');
  now+=14000;
  const poll=await fetch(base+'/__lich/state',{headers:{authorization:'Bearer '+c.token}}).then(r=>r.json());
  assert.equal((await post('action',{requestId:'http_req_1',challengeId:poll.state.challenge.id,action:'TRANSFER',target:poll.state.challenge.plagueRune},a.token)).status,403);
  const resolved=await post('action',{requestId:'http_req_2',challengeId:poll.state.challenge.id,action:'TRANSFER',target:poll.state.challenge.plagueRune},c.token);assert.equal(resolved.state.challenge.plague,false);
  assert.equal((await post('start',{},a.token,{origin:'https://untrusted.example'})).status,403);
  assert.equal((await fetch(base+'/__lich/state')).status,401);assert.equal((await fetch(base+'/.env')).status,403);
  assert.equal((await fetch(base+'/preview/lich-king-raid-v1/')).status,200);
});

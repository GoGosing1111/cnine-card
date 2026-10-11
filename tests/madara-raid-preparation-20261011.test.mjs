import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import {MADARA_RELEASE,MADARA_RUNES,createMadaraRoom,addMadaraMember,readyMadaraMember,startMadaraRoom,actMadaraRoom,tickMadaraRoom,madaraView,madaraBattlePayload} from '../functions/_raid_madara.js';
import {madaraReviewDeck,MADARA_REVIEW_BOSS} from '../preview/madara-raid-v1/fixture.mjs';
import {createMadaraPreviewServer} from '../preview/madara-raid-v1/server.mjs';
import {visibleDecisionChoice,decisionReady} from './helpers/madara-review-solver.mjs';

let request=0;
const roles=['WARDEN','ASSAULT','RESCUE'];
function setup(count=3,{mode='PARTY',strength='NORMAL',seed=51}={}) {
  const room=createMadaraRoom({id:'MADARA_TEST',hostId:'p0',monster:MADARA_REVIEW_BOSS,now:1000,mode,seed});
  for(let i=0;i<count;i++)addMadaraMember(room,{id:`p${i}`,name:`검수자 ${i}`,role:roles[i%3],deck:madaraReviewDeck(strength)});
  for(const m of room.members)readyMadaraMember(room,m.id);
  startMadaraRoom(room,'p0');return room;
}
function act(room,id,input,now=room.clock) {return actMadaraRoom(room,id,{requestId:`test-${String(++request).padStart(8,'0')}`,...input},now);}
const after = rune=>MADARA_RUNES[(MADARA_RUNES.indexOf(rune)+1)%4];
function correct(room,t) {
  if(t.decision)return visibleDecisionChoice(madaraView(room,t.ownerId).tasks.find(v=>v.id===t.id));
  const q=room.challenge;
  if(t.kind==='DISPEL')return q.signals[t.partnerId];
  if(t.kind==='SOUL')return after(q.signals[t.partnerId]);
  if(t.kind==='SUPPRESS')return q.orders[t.partnerId][0];
  if(t.kind==='CLONE')return q.orders[t.partnerId][t.index];
  if(t.kind==='CORE')return q.bindings[t.partnerId].at(-1);
  if(t.unordered)return t.answers.find(a=>!(t.selected||[]).includes(a));
  return t.answers[t.index];
}
function solvePass(room,{strikes=true,guard=true}={}) {
  if(guard&&room.challenge.gaze&&!room.challenge.gaze.guarded){const g=room.challenge.gaze;act(room,g.ownerId,{action:'GUARD',token:`${room.challenge.id}:gaze:${g.index}`});}
  for(const m of room.members){
    if(room.status!=='ACTIVE')break;
    let view=madaraView(room,m.id);
    if(m.role==='RESCUE'&&room.resources.heal&&room.fighters.some(f=>f.hp>0&&f.hp<f.maxHp*.55))act(room,m.id,{action:'HEAL',token:room.challenge.id});
    for(const visible of view.tasks.filter(t=>decisionReady(t,room.clock))){
      const t=room.challenge.tasks.find(x=>x.id===visible.id);
      act(room,m.id,{action:'TASK',taskId:t.id,token:visible.token,target:correct(room,t)});
    }
    if(strikes&&room.step==='DAMAGE'&&!(room.challenge.gaze?.ownerId===m.id&&room.clock>=room.challenge.gaze.activeAt)){
      try{act(room,m.id,{action:'STRIKE',token:room.challenge.id});}catch(e){if(!['COOLDOWN','SHARE_COMPLETE'].includes(e.code))throw e;}
    }
  }
}
function run(room,{until=()=>false,strikes=true}={}) {
  for(let i=0;i<1400&&room.status==='ACTIVE'&&!until(room);i++){solvePass(room,{strikes});tickMadaraRoom(room,room.clock+500);}
  return room;
}
for(const size of [3,4,5,6])test(`${size}-player parties complete all four mechanics and final overlap with their own V3 decks`,()=>{
  for(const seed of [51,802]){
    const room=run(setup(size,{seed}));
    assert.equal(room.status,'CLEAR',JSON.stringify(room.failure));assert.equal(room.boss.hp,0);assert.equal(room.phase,4);
    assert.equal(room.statistics.mistakes,0);assert.ok(room.statistics.tasks>=size*5);
    for(const id of room.initialMembers)assert.ok(room.challenge.damageBy[id]>0);
    assert.equal(new Set(room.fighters.map(f=>f.id)).size,size*5);
  }
});
test('party launch requires all roles and every member ready; late joins are rejected',()=>{
  const room=createMadaraRoom({id:'lobby',hostId:'a',monster:MADARA_REVIEW_BOSS});
  for(const id of ['a','b','c'])addMadaraMember(room,{id,role:'WARDEN',deck:madaraReviewDeck()});
  assert.throws(()=>startMadaraRoom(room,'a'),{code:'ROLES_REQUIRED'});
  room.members[1].role='ASSAULT';room.members[2].role='RESCUE';
  assert.throws(()=>startMadaraRoom(room,'a'),{code:'NOT_READY'});
  room.members.forEach(m=>readyMadaraMember(room,m.id));startMadaraRoom(room,'a');
  assert.throws(()=>addMadaraMember(room,{id:'d',role:'RESCUE',deck:madaraReviewDeck()}),{code:'ROOM_STARTED'});
});
test('private clues belong to their owner; only completed seals are shared',()=>{
  const room=setup(),warden=madaraView(room,'p0'),assault=madaraView(room,'p1');
  assert.match(warden.tasks[0].clue,/이동한 문양/);assert.equal(assault.challenge.signals.p0,undefined);
  assert.equal(JSON.stringify(assault).includes('expected'),false);assert.equal(assault.tasks.some(t=>t.clue===warden.tasks[0].clue),false);
  const t=room.challenge.tasks[0];
  for(let i=0;i<2;i++){tickMadaraRoom(room,t.trial.readyAt);const v=madaraView(room,'p0').tasks[0];act(room,'p0',{action:'TASK',taskId:t.id,token:v.token,target:visibleDecisionChoice(v)});}
  assert.equal(madaraView(room,'p1').challenge.signals.p0,t.sealHistory.at(-1));
});
test('ownership, stale input and idempotent retries cannot create a second mistake or consume the next step',()=>{
  const room=setup(),v=madaraView(room,'p0'),t=room.challenge.tasks[0];
  tickMadaraRoom(room,t.trial.readyAt);
  const input={requestId:'same-request-123',action:'TASK',taskId:t.id,token:v.tasks[0].token,target:visibleDecisionChoice(v.tasks[0])};
  assert.throws(()=>actMadaraRoom(room,'p1',input),{code:'NOT_OWNER'});
  assert.throws(()=>act(room,'p1',{actorId:'p0',...input}),{code:'NOT_OWNER'});
  actMadaraRoom(room,'p0',input);const tasks=room.statistics.tasks;
  assert.equal(actMadaraRoom(room,'p0',input).replayed,true);assert.equal(room.statistics.tasks,tasks);
  assert.equal(act(room,'p0',{...input,requestId:'other-request-123'}).ignored,true);assert.equal(room.strain,0);
  assert.throws(()=>actMadaraRoom(room,'p0',{...input,target:'different-target'}),{code:'REQUEST_CONFLICT'});
});
test('server expiry wins over a client-supplied clock, HP or success flag',()=>{
  const room=setup(),v=madaraView(room,'p0'),t=room.challenge.tasks[0];
  assert.throws(()=>act(room,'p0',{action:'TASK',taskId:t.id,token:v.tasks[0].token,target:t.answers[0],now:0,success:true,bossHp:0},room.challenge.deadline),{code:'NOT_ACTIVE'});
  assert.ok(['MECHANIC_TIMEOUT','STRAIN'].includes(room.failure.code));assert.equal(room.boss.hp,room.boss.maxHp);
});
test('fire preserves the marked barrier, blocks premature breaking without penalty, and resolves the second wave on server time',()=>{
  const room=run(setup(),{until:r=>r.phase===2}),q=room.challenge;
  const assault=madaraView(room,'p1').tasks.find(t=>t.kind==='BREAK');
  assert.throws(()=>act(room,'p1',{action:'TASK',taskId:assault.id,token:assault.token,target:assault.choices[0].id}),{code:'NOT_READY'});
  assert.equal(room.strain,0);solvePass(room);tickMadaraRoom(room,q.firstAt);
  for(let i=0;i<16;i++){solvePass(room);tickMadaraRoom(room,room.clock+500);}
  assert.equal(room.step,'MECHANIC');assert.ok(q.tasks.every(t=>t.done));
  tickMadaraRoom(room,q.secondAt);assert.equal(room.step,'DAMAGE');assert.equal(q.secondDone,true);
});
test('an unfinished second-wave barrier is a clear, deterministic failure',()=>{
  const room=run(setup(),{until:r=>r.phase===2});
  // Isolate the global fire deadline from the separately tested personal response deadlines.
  for(const t of room.challenge.tasks)t.trial.expiresAt=room.challenge.secondAt+1;
  tickMadaraRoom(room,room.challenge.secondAt);
  assert.equal(room.failure.code,'FIRE_BREACH');
});
test('clone reflection mistakes require reading a fresh pattern without advancing the task',()=>{
  const room=run(setup(),{until:r=>r.phase===1});
  const clone=room.challenge.tasks.find(t=>t.kind==='CLONE');
  tickMadaraRoom(room,clone.trial.readyAt);
  let view=madaraView(room,'p1').tasks.find(t=>t.kind==='CLONE');
  act(room,'p1',{action:'TASK',taskId:clone.id,token:view.token,target:view.choices.find(o=>o.reflected).id});
  assert.match(clone.feedback.reason,/반사/);assert.equal(room.strain,1);assert.equal(clone.index,0);
  tickMadaraRoom(room,clone.trial.readyAt);
  view=madaraView(room,'p1').tasks.find(t=>t.kind==='CLONE');act(room,'p1',{action:'TASK',taskId:clone.id,token:view.token,target:visibleDecisionChoice(view)});
  assert.equal(clone.index,1);
});
test('final gaze changes owner with advance warning and reflects only the marked actor after activation',()=>{
  const room=run(setup(),{until:r=>r.phase===4&&r.step==='DAMAGE'}),q=room.challenge,g=q.gaze;
  tickMadaraRoom(room,Math.max(room.clock,g.activeAt));
  const before=room.boss.hp,mistakes=room.statistics.mistakes;
  act(room,g.ownerId,{action:'STRIKE',token:q.id});
  assert.equal(room.boss.hp,before);assert.equal(room.statistics.mistakes,mistakes+1);
  const oldOwner=g.ownerId;tickMadaraRoom(room,g.endsAt);assert.notEqual(q.gaze.ownerId,oldOwner);
  assert.ok(q.gaze.activeAt>room.clock);
});
test('weak decks fail damage checks and one participant cannot spend another participant’s attack budget',()=>{
  const weak=run(setup(3,{strength:'LOW'}));assert.equal(weak.status,'FAILED');assert.equal(weak.failure.code,'DPS_TIMEOUT');
  const room=run(setup(),{until:r=>r.step==='DAMAGE'});
  for(let i=0;i<6;i++){try{act(room,'p0',{action:'STRIKE',token:room.challenge.id});}catch(e){assert.equal(e.code,'SHARE_COMPLETE');}tickMadaraRoom(room,room.clock+1200);}
  assert.equal(room.step,'DAMAGE');assert.ok(room.boss.hp>Math.round(room.boss.maxHp*.78));
});
test('refresh snapshots are JSON-persistable and preserve deadlines, role clues, damage and input receipts',()=>{
  const room=setup();solvePass(room);const restored=JSON.parse(JSON.stringify(room));
  assert.equal(JSON.stringify(madaraView(restored,'p0')),JSON.stringify(madaraView(room,'p0')));
  const done=run(restored);assert.equal(done.status,'CLEAR');
  const payload=madaraBattlePayload(done,'p0');assert.equal(payload.battleV2.teams.A.cards.length,5);
  assert.notEqual(payload.cards[0].image,payload.battleV2.teams.A.cards[0].battleSprite);
});
test('shared healing and revive spend once; a rejected burst leaves its personal charges unchanged',()=>{
  const room=setup(),t=room.challenge.tasks[0],v=madaraView(room,'p0').tasks[0];
  tickMadaraRoom(room,t.trial.readyAt);
  act(room,'p0',{action:'TASK',taskId:t.id,token:v.token,target:v.choices.find(o=>o.id!==visibleDecisionChoice(v)).id});
  const heal={requestId:'heal-unique-123',action:'HEAL',token:room.challenge.id};
  actMadaraRoom(room,'p2',heal);const hp=room.fighters.map(f=>f.hp);
  actMadaraRoom(room,'p2',heal);assert.equal(room.resources.heal,3);assert.deepEqual(room.fighters.map(f=>f.hp),hp);
  room.fighters.find(f=>f.ownerId==='p0').hp=0;room.souls=1;
  assert.equal(madaraView(room,'p2').members.find(m=>m.id==='p0').downCount,1);
  const revive={requestId:'revive-unique-123',action:'REVIVE',token:room.challenge.id,target:'p0'};
  actMadaraRoom(room,'p2',revive);actMadaraRoom(room,'p2',revive);assert.equal(room.resources.revive,0);assert.equal(room.souls,0);
  assert.equal(madaraView(room,'p2').members.find(m=>m.id==='p0').downCount,0);
  run(room,{until:r=>r.step==='DAMAGE'});
  while(madaraView(room,'p0').attackRemaining>0){tickMadaraRoom(room,Math.max(room.clock,madaraView(room,'p0').nextStrikeAt));act(room,'p0',{action:'STRIKE',token:room.challenge.id});tickMadaraRoom(room,room.clock+1200);}
  const charges=room.bursts.p0,last=room.challenge.lastStrike.p0;
  assert.throws(()=>act(room,'p0',{action:'BURST',token:room.challenge.id}),{code:'SHARE_COMPLETE'});
  assert.equal(room.bursts.p0,charges);assert.equal(room.challenge.lastStrike.p0,last);
});
test('live release remains hard OFF and no existing production entry point imports the preparation',async()=>{
  assert.equal(MADARA_RELEASE.runtimeEnabled,false);assert.equal(MADARA_RELEASE.rewardLocked,true);
  for(const file of ['index.html','js/app.js','functions/api/[[path]].js','wrangler.toml','service-worker.js'])assert.doesNotMatch(await readFile(new URL('../'+file,import.meta.url),'utf8'),/madara/i,file);
});
test('local HTTP denies foreign origins, host rebinding, unauthenticated state and filesystem escape; live APIs do not exist',async t=>{
  let now=1000;const server=createMadaraPreviewServer({clock:()=>now});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(route,body={},headers={})=>fetch(base+'/__madara/'+route,{method:'POST',headers:{origin:base,'content-type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post('create',{}, {origin:'https://foreign.invalid'})).status,403);
  const hostStatus=await new Promise((resolve,reject)=>{const req=http.get(base+'/__madara/health',{headers:{host:'foreign.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(hostStatus,403);
  assert.equal((await fetch(base+'/__madara/state')).status,401);
  assert.equal((await fetch(base+'/functions/_raid_madara.js')).status,403);
  assert.equal((await fetch(base+'/api/raid/madara/start')).status,403);
  const session=await(await post('session')).json();assert.ok(session.token);
  const auth={authorization:'Bearer '+session.token};
  const created=await(await post('create',{mode:'COMMAND',name:'로컬',requestId:'prepare-http-create-1'},auth)).json();assert.equal(created.state.members.length,3);
  await post('ready',{},auth);const started=await(await post('start',{},auth)).json();assert.equal(started.state.status,'ACTIVE');
  const actor=created.state.members[1].id;
  const other=await(await fetch(base+`/__madara/state?actor=${actor}&payload=1`,{headers:auth})).json();assert.equal(other.state.me.id,actor);assert.equal(other.payload.reviewOnly,true);
  now+=1800001;assert.equal((await fetch(base+'/__madara/state',{headers:auth})).status,404);
  assert.equal((await(await fetch(base+'/__madara/lobby',{headers:auth})).json()).account.tickets,2,'room expiry never resets the ticket ledger');
});

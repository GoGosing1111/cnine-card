import test from 'node:test';
import assert from 'node:assert/strict';
import {blackwingView,tickBlackwingRoom,actBlackwingRoom} from '../functions/_raid_blackwing.js';
import {openBlackwingScale} from '../functions/_raid_blackwing_scale.js';
import {battlefieldModel} from '../raid/blackwing/battlefield.mjs';
import {room,action,members,solveViews} from './helpers/blackwing-scale-scenario.mjs';

function finalScale(seed=101){
 const r=room(seed);r.phase=4;openBlackwingScale(r);
 const solution=solveViews(members.map(([id])=>blackwingView(r,id)))[0];
 for(const[id]of members)assert.equal(action(r,id,'PLACE',solution[id]).ok,true);
 return r;
}

test('existing phase planning durations remain unchanged and no confirmation still expires at 20 seconds',()=>{
 for(const[phase,ms]of [24000,22000,22000,22000,20000].entries()){
  const r=room();r.phase=phase;openBlackwingScale(r);assert.equal(r.challenge.scale.deadline-r.clock,ms);
 }
 const r=finalScale(),deadline=r.challenge.scale.deadline;
 tickBlackwingRoom(r,deadline-1);assert.equal(r.status,'ACTIVE');
 const token=blackwingView(r,'1').challenge.tokens.LOCK;
 assert.throws(()=>action(r,'1','LOCK',undefined,deadline,{token}),{code:'BLACKWING_NOT_ACTIVE'});
 assert.equal(r.failure.code,'SCALE_TIMEOUT');assert.equal(r.challenge.scale.firstLockAt,null);
});

for(const remaining of [3000,5000,6000])test(`first confirmation with ${remaining/1000}s left starts a full new 8s window`,()=>{
 const r=finalScale(),planningDeadline=r.challenge.scale.deadline,first=planningDeadline-remaining;
 const debtOpens=r.challenge.debt.opensAt,enrage=r.endsAt,pausedAt=r.challenge.scale.pausedAt;
 action(r,'1','LOCK',undefined,first);
 const view=blackwingView(r,'8');assert.equal(view.challenge.scale.lockDeadline,first+8000);
 assert.match(battlefieldModel(view,first).clock,/동시 확정 8\.0초/);
 tickBlackwingRoom(r,planningDeadline+1);assert.equal(r.status,'ACTIVE');assert.equal(r.strain,0);
 assert.ok(battlefieldModel(blackwingView(r,'8'),r.clock).clock.includes(((first+8000-r.clock)/1000).toFixed(1)+'초'));
 for(const[id]of members.slice(1))assert.equal(action(r,id,'LOCK',undefined,first+7999).ok,true);
 assert.equal(r.challenge.scale.done,true);assert.equal(r.statistics.scaleRounds,1);assert.equal(r.strain,0);
 assert.equal(r.challenge.debt.opensAt,debtOpens+r.clock-pausedAt);assert.equal(r.endsAt,enrage);
});

test('only the first valid confirmation starts the window; later inputs, retries and JSON restart cannot extend it',()=>{
 let r=finalScale();delete r.challenge.scale.positions['1'];
 assert.equal(action(r,'1','LOCK').code,'BLACKWING_SCALE_PLACE_REQUIRED');assert.equal(r.challenge.scale.firstLockAt,null);
 action(r,'1','PLACE',0);
 const first=r.challenge.scale.deadline-3000,token=blackwingView(r,'2').challenge.tokens.LOCK;
 const request={requestId:'confirm_window_retry_01',action:'LOCK',token};
 actBlackwingRoom(r,'2',request,first);const deadline=blackwingView(r,'1').challenge.scale.lockDeadline;
 actBlackwingRoom(r,'2',request,first+1000);
 action(r,'3','LOCK',undefined,first+2000);
 assert.equal(action(r,'2','PLACE',1,first+2500).code,'BLACKWING_SCALE_LOCKED');
 r=JSON.parse(JSON.stringify(r));tickBlackwingRoom(r,first+7000);
 assert.equal(r.status,'ACTIVE');assert.equal(r.strain,0);assert.equal(r.challenge.scale.locked.length,2);
 assert.equal(blackwingView(r,'1').challenge.scale.lockDeadline,deadline);assert.equal(deadline,first+8000);
});

test('late confirmation expires at exactly 8 seconds without granting another planning period or rewinding time',()=>{
 const r=finalScale(),first=r.challenge.scale.deadline-3000,cycle=r.challenge.scale.cycle;
 action(r,'1','LOCK',undefined,first);
 for(const[id]of members.slice(1,5))action(r,id,'LOCK',undefined,first+7999);
 assert.equal(r.strain,0);const token=blackwingView(r,'8').challenge.tokens.LOCK;
 assert.throws(()=>action(r,'8','LOCK',undefined,first+8000,{token}),{code:'BLACKWING_NOT_ACTIVE'});
 assert.equal(r.status,'FAILED');assert.equal(r.failure.code,'SCALE_TIMEOUT');assert.equal(r.strain,1);
 assert.equal(r.finishedAt,first+8000);assert.equal(r.challenge.scale.cycle,cycle);
 const event=r.combatLog.find(e=>e.type==='BLACKWING_SCALE');assert.match(event.reason,/8초.*참가자 8/);
 assert.equal(event.ownerId,undefined);assert.equal(r.statistics.scaleRounds||0,0);
 tickBlackwingRoom(r,first+9000);assert.equal(r.strain,1);
});

test('an incorrect late full-team submission ends the expired planning period; early mistakes keep only its remainder',()=>{
 for(const late of [false,true]){
  const r=finalScale(),deadline=r.challenge.scale.deadline;
  for(const[id]of members)action(r,id,'PLACE',0);
  const first=late?deadline-3000:r.clock;
  action(r,'1','LOCK',undefined,first);
  for(const[id]of members.slice(1))action(r,id,'LOCK',undefined,first+7000);
  assert.equal(r.strain,1);assert.equal(r.challenge.scale.deadline,deadline);
  assert.equal(r.status,late?'FAILED':'ACTIVE');
  if(late)assert.equal(r.combatLog.findLast(e=>e.cueKey==='FAILED').ownerId,undefined);
  if(!late){assert.equal(r.challenge.scale.firstLockAt,null);assert.equal(r.challenge.scale.locked.length,0);}
 }
});

test('the independent confirmation window does not extend the raid enrage deadline',()=>{
 const r=finalScale(),first=r.challenge.scale.deadline-3000;r.endsAt=first+4000;
 action(r,'1','LOCK',undefined,first);tickBlackwingRoom(r,r.endsAt);
 assert.equal(r.failure.code,'ENRAGE');assert.equal(r.finishedAt,first+4000);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createMadaraRoom,addMadaraMember,readyMadaraMember,startMadaraRoom,actMadaraRoom,tickMadaraRoom,madaraView} from '../functions/_raid_madara.js';
import {madaraReviewDeck,MADARA_REVIEW_BOSS} from '../preview/madara-raid-v1/fixture.mjs';
import {visibleDecisionChoice,decisionReady} from './helpers/madara-review-solver.mjs';
let seq=0;
function setup(size=3,seed=417){
  const r=createMadaraRoom({id:'DECISION_TEST',hostId:'p0',monster:MADARA_REVIEW_BOSS,now:1000,seed});
  for(let i=0;i<size;i++)addMadaraMember(r,{id:'p'+i,name:'대원'+i,role:['WARDEN','ASSAULT','RESCUE'][i%3],deck:madaraReviewDeck()});
  r.members.forEach(m=>readyMadaraMember(r,m.id));startMadaraRoom(r,'p0');return r;
}
const act=(r,id,input)=>actMadaraRoom(r,id,{requestId:'decisions-'+(++seq).toString().padStart(8,'0'),...input});
const input=t=>({action:'TASK',taskId:t.id,token:t.token,target:visibleDecisionChoice(t)});
function drive(r,until=()=>false,{paced=false}={}){
  const reactions={};
  for(let n=0;n<1800&&r.status==='ACTIVE'&&!until(r);n++){
    const gaze=r.challenge.gaze;if(gaze&&!gaze.guarded)act(r,gaze.ownerId,{action:'GUARD',token:r.challenge.id+':gaze:'+gaze.index});
    for(let i=0;i<r.members.length;i++){
      const m=r.members[i],v=madaraView(r,m.id);
      if(m.role==='RESCUE'&&r.resources.heal&&v.members.some(x=>x.hp>0&&x.hp<x.maxHp*.55))act(r,m.id,{action:'HEAL',token:r.challenge.id});
      if(paced&&r.clock<(reactions[m.id]||0))continue;
      const task=v.tasks.filter(t=>decisionReady(t,r.clock)).sort((a,b)=>a.decision.expiresAt-b.decision.expiresAt)[0];
      if(task){act(r,m.id,input(task));reactions[m.id]=r.clock+1800+(i%3)*300+200;}
      if(r.step==='DAMAGE'&&v.attackRemaining>0&&r.clock>=v.nextStrikeAt&&!(gaze?.ownerId===m.id&&r.clock>=gaze.activeAt))act(r,m.id,{action:'STRIKE',token:r.challenge.id});
    }
    tickMadaraRoom(r,r.clock+250);
  }
  return r;
}
test('every role can act independently at phase entry; another role cannot submit its private task',()=>{
  const r=setup();tickMadaraRoom(r,r.clock+600);
  for(const id of ['p1','p2']){const v=madaraView(r,id),t=v.tasks[0];assert.equal(t.blocked,'');assert.throws(()=>act(r,'p0',input(t)),{code:'NOT_OWNER'});act(r,id,input(t));assert.equal(madaraView(r,id).tasks[0].index,1);}
  assert.equal(madaraView(r,'p0').tasks[0].index,0);assert.equal(r.strain,0);
});
test('six-player private options never serialize expected answers or another actor’s private tasks',()=>{
  const r=setup(6);for(const m of r.members){const v=madaraView(r,m.id),raw=JSON.stringify(v);assert.doesNotMatch(raw,/"expected"|"trial"|"answers"|"rng"/);assert.ok(v.tasks.every(t=>t.id.includes(m.id)));}
  const a=madaraView(r,'p1').tasks[0],b=madaraView(r,'p4').tasks[0];assert.notDeepEqual([a.clue,a.choices],[b.clue,b.choices]);
});
test('rushing the exposure window fails once; retries and old held inputs cannot advance a replacement pattern',()=>{
  const r=drive(setup(),x=>x.phase===3),v=madaraView(r,'p1'),t=v.tasks[0];
  const command={requestId:'early-hit-once-001',...input(t)};
  actMadaraRoom(r,'p1',command);assert.equal(r.strain,1);assert.match(madaraView(r,'p1').tasks[0].feedback.reason,/열리기 전/);
  actMadaraRoom(r,'p1',command);assert.equal(r.strain,1);
  assert.equal(act(r,'p1',input(t)).ignored,true);assert.equal(madaraView(r,'p1').tasks[0].index,0);
  const fresh=madaraView(r,'p1').tasks[0];tickMadaraRoom(r,fresh.decision.readyAt);act(r,'p1',input(madaraView(r,'p1').tasks[0]));assert.equal(madaraView(r,'p1').tasks[0].index,1);
});
test('rescue requires choosing the unprotected urgent victim and an explicit timed intercept',()=>{
  const r=drive(setup(),x=>x.phase===3);tickMadaraRoom(r,r.clock+600);
  let t=madaraView(r,'p2').tasks[0];assert.equal(t.decision.type,'TRIAGE');
  const urgent=t.choices.filter(o=>!o.shielded).sort((a,b)=>a.impactAt-b.impactAt)[0];act(r,'p2',{...input(t),target:urgent.id});
  t=madaraView(r,'p2').tasks[0];assert.equal(t.decision.type,'INTERCEPT');assert.equal(t.done,false);assert.match(t.clue,new RegExp(urgent.label));
  tickMadaraRoom(r,t.decision.readyAt+2500);assert.equal(madaraView(r,'p2').tasks[0].done,false,'waiting alone never completes protection');
  act(r,'p2',input(madaraView(r,'p2').tasks[0]));assert.equal(madaraView(r,'p2').tasks[0].done,true);
});
test('missed response renews only that trial; recovery and reconnect never extend the phase deadline',()=>{
  const r=setup(),phaseDeadline=r.challenge.deadline,t=madaraView(r,'p2').tasks[0];
  tickMadaraRoom(r,t.decision.expiresAt);assert.equal(r.statistics.mistakes,1);
  const restored=JSON.parse(JSON.stringify(r)),v=madaraView(restored,'p2').tasks[0];assert.match(v.feedback.reason,/시간/);assert.equal(restored.challenge.deadline,phaseDeadline);assert.ok(v.decision.recoveryAt>r.clock);assert.equal(v.index,0);
  assert.throws(()=>act(restored,'p2',input(v)),{code:'NOT_READY'});assert.equal(restored.statistics.mistakes,1);
});
test('two-to-three-second player decisions plus 200ms delivery fit the draft windows for 3 and 6 players',()=>{
  for(const size of [3,6]){const r=drive(setup(size,812),()=>false,{paced:true});assert.equal(r.status,'CLEAR',JSON.stringify(r.failure));assert.equal(r.statistics.mistakes,0);assert.deepEqual(r.statistics.decisions,{WARDEN:12*size/3,ASSAULT:14*size/3,RESCUE:12*size/3});}
});

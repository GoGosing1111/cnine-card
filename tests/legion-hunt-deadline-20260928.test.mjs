import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gsap} from 'gsap';
import {playHuntTimeline} from '../preview/sustained-hunt-v2/source/HuntTimedPlayback.js';
import {createHuntSession,restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {LEGION_HUNT_REVIEW_FIXTURE} from '../shared/legion-hunt-review-fixture-v1.mjs';

after(()=>gsap.ticker.sleep());
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
const source=fs.readFileSync('preview/sustained-hunt-v2/source/HuntBattleEngine.js','utf8').replace(/^import .*;$/gm,'').replace('export class BattleEngine','class BattleEngine');
function harness(payload){
  const releases=[],calls=[],notified=[],states=[],banners=[];
  class Parent{
    cancelTimelines(){this.playbackEpoch++;this.skillChipPlayback?.cancel();this.firing=false;}
    syncFinalState(final){this.cancelTimelines();states.push(structuredClone(final));}
    playEvents(events){calls.push(...events);return new Promise(resolve=>releases.push(resolve));}
  }
  const Engine=vm.runInNewContext(source+';BattleEngine',{ScrapyardEngine:Parent,playHuntTimeline});
  const engine=new Engine();let clears=0;
  Object.assign(engine,{visible:true,playbackEpoch:1,audio:{enabled:()=>false},app:{ticker:{add(){},remove(){}}},
    huntPlaybackPlan:payload.huntPlayback,instances:new Map(payload.continuousEncounter.instances.map(row=>[row.id,row])),
    enemies:payload.continuousEncounter.initialIds.map(id=>({id})),seenKnockouts:new Set(),retiredIds:new Set(),defeatedCount:0,
    groundDrops:{clear(){clears++;}},combatantById:()=>null,
    bindMonster(row){this.enemies[row.slot]={id:row.id};},queueBanner:name=>banners.push(name),
    startAccountBattleUnitSustainedFire(){this.firing=true;}});
  const options={sequential:true,isPaused:()=>!!engine.huntPaused,afterEvent:event=>notified.push(event)};
  return {engine,calls,notified,states,banners,get clears(){return clears;},
    run:()=>engine.playEvents(payload.battleV2.result.timeline,options),
    close(){engine.cancelTimelines();releases.forEach(resolve=>resolve(true));}};
}
const make=()=>createHuntSession({...LEGION_HUNT_REVIEW_FIXTURE,seed:1731,now:()=>0});

test('full hunt backlog cannot delay the boss; the server checkpoint and every receipt survive exactly once',async()=>{
  const session=make(),payload=session.payload,events=payload.battleV2.result.timeline,h=harness(payload);
  // Skill animation assets are irrelevant to the pending ordinary-action
  // barrier; keep the real full-duration timestamps, identities and KO order.
  payload.battleV2.result.timeline=events.map(e=>e.type.startsWith('SKILL_CHIP_')?{...e,type:'WAIT'}:e);
  try{
    const done=h.run(),first=h.engine.skillChipPlayback;await first.ready;first.timeline.pause();await flush();
    assert.ok(first.pending.size>0);assert.ok(events.length>1000);
    first.clock.time=payload.huntPlayback.boss.combatAtMs/1000-.001;first.pump();await flush();
    assert.equal(h.banners.length,0,'never spawn ahead of server time');
    first.clock.time+=.001;first.pump();await flush();
    const boss=h.engine.skillChipPlayback;assert.notEqual(boss,first);await boss.ready;boss.timeline.pause();
    assert.equal(first.active,false);assert.equal(first.valid(),false,'late continuations are invalidated');
    assert.equal(h.banners.length,1);assert.deepEqual(h.states[0],payload.huntPlayback.boss.final);
    assert.equal(h.engine.huntRun.bossEntered,true);assert.equal(h.clears,0,'boss entry preserves existing ground drops');
    assert.equal(h.notified.at(-1).seq,payload.huntPlayback.boss.seq);
    assert.equal(boss.clock.time,payload.huntPlayback.boss.combatAtMs/1000);
    assert.equal(boss.timeline.timeScale(),1);assert.equal(h.engine.previewSpeed,1);
    const initialTime=boss.clock.time;boss.timeline.time(1,true);assert.ok(Math.abs(boss.clock.time-initialTime-1)<.0001,'boss phase remains 1x');
    boss.clock.time=899.999;boss.pump();await flush();assert.equal(h.engine.huntRun.deadlineReached,false);
    boss.clock.time=900;boss.pump();assert.equal(await done,true);
    assert.equal(h.engine.huntRun.deadlineReached,true);assert.equal(h.engine.firing,false);
    assert.equal(boss.active,false);assert.equal(boss.clock.time,900);
    assert.deepEqual(h.states.at(-1),payload.huntPlayback.final);
    assert.deepEqual(h.notified.map(e=>e.seq),events.map(e=>e.seq),'no duplicated or missing receipt');
    let now=0;const restored=restoreHuntSession(session.exportState(),{now:()=>now});restored.begin();
    now=900000;const receipt=restored.finish(h.notified.at(-1).seq);
    assert.equal(receipt.reason,'CLEAR','use the server outcome, never invent a timeout for a visual delay');
    assert.deepEqual(restored.finish(h.notified.at(-1).seq),receipt);
    assert.equal(receipt.picked,0,'catch-up alone never grants an item');
  }finally{h.close();}
});

test('pause freezes the deadline, resume finishes at zero, cancellation cannot respawn the boss',async()=>{
  const payload=make().payload;
  payload.battleV2.result.timeline=payload.battleV2.result.timeline.map(e=>e.type.startsWith('SKILL_CHIP_')?{...e,type:'WAIT'}:e);
  const h=harness(payload);
  try{
    const done=h.run(),phase=h.engine.skillChipPlayback;await phase.ready;phase.timeline.pause();
    h.engine.huntPaused=true;phase.clock.time=750;phase.pump();await flush();
    assert.equal(h.banners.length,0);assert.equal(phase.active,true);
    h.engine.huntPaused=false;phase.pump();await flush();
    const boss=h.engine.skillChipPlayback;await boss.ready;boss.timeline.pause();
    assert.equal(h.banners.length,1);
    h.engine.huntPaused=true;boss.clock.time=900;boss.pump();await flush();
    assert.equal(h.engine.huntRun.deadlineReached,false);
    h.engine.huntPaused=false;boss.pump();assert.equal(await done,true);
  }finally{h.close();}
  const cancelled=harness(payload);
  try{
    const done=cancelled.run(),phase=cancelled.engine.skillChipPlayback;await phase.ready;phase.timeline.pause();
    cancelled.engine.cancelTimelines();phase.clock.time=900;phase.pump();
    assert.equal(await done,false);assert.equal(cancelled.banners.length,0);assert.equal(cancelled.notified.length,0);assert.equal(cancelled.clears,1);
  }finally{cancelled.close();}
});

test('exact zero accepts only elapsed server receipts and returns the original time-limit result on retry',()=>{
  let now=0;
  const state={id:'deadline',policy:{id:'normal',huntDurationMs:750000},timeLimit:900000,eventTimes:[750000,900000],
    timeline:[{seq:2,combatAtMs:900000,type:'RESULT',winner:'B',reason:'TIME_LIMIT'}],outcome:{winner:'B',reason:'TIME_LIMIT'}};
  const session=restoreHuntSession(state,{now:()=>now});session.begin();
  now=899000;assert.throws(()=>session.finish(2),/HUNT_EVENT_NOT_REACHED/);
  now=900000;const receipt=session.finish(2);assert.equal(receipt.reason,'TIME_LIMIT');assert.equal(receipt.combatMs,900000);
  now+=10000;assert.deepEqual(session.finish(2),receipt);
});

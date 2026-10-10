import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {gsap} from 'gsap';
import {HuntBackgroundClock,HuntBattleSnapshot} from '../preview/sustained-hunt-v2/source/HuntBackgroundState.js';
import {playHuntTimeline} from '../preview/sustained-hunt-v2/source/HuntTimedPlayback.js';
import {createHuntSession,restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {LEGION_HUNT_REVIEW_FIXTURE} from '../shared/legion-hunt-review-fixture-v1.mjs';
import fs from 'node:fs';
import vm from 'node:vm';

after(()=>gsap.ticker.sleep());
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
function harness(payload){
  const notified=[],snapshots=[],pending=[];
  const engine={battleData:payload,visible:true,playbackEpoch:0,huntBackground:false,huntPaused:false,
    seenKnockouts:new Set(),defeatedCount:0,app:{ticker:{add(){},remove(){}}},audio:{enabled:()=>false},
    combatantById:()=>null,groundDrops:{expire(){}},
    playEvents:()=>new Promise(resolve=>pending.push(resolve)),
    startAccountBattleUnitSustainedFire(){this.firing=true;},
    cancelTimelines(){
      this.playbackEpoch++;this.skillChipPlayback?.cancel();this.firing=false;
      if(this.huntRun&&!this.huntRun.transitioning){this.huntRun.cancelled=true;this.huntRun.wake();}
      pending.splice(0).forEach(resolve=>resolve(false));
    },
    reconcileHuntState(final){this.cancelTimelines();snapshots.push(structuredClone(final));},
    reconcileHuntBackground(final){this.reconcileHuntState(final);},
    hide(){this.huntBackground=true;this.huntRun.background();},
    show(){this.huntBackground=false;this.huntRun.wake();},
    pause(paused){this.huntRun.pause(paused);this.huntPaused=paused;}
  };
  const events=payload.battleV2.result.timeline.map(e=>e.type.startsWith('SKILL_CHIP_')?{...e,type:'WAIT'}:e);
  return {engine,notified,snapshots,events,run:()=>playHuntTimeline(engine,events,{isPaused:()=>engine.huntPaused,afterEvent:e=>notified.push(e)},payload.huntPlayback)};
}

test('background time survives suspended callbacks and excludes explicit pauses',()=>{
  let now=1000;const clock=new HuntBackgroundClock(()=>now);
  clock.start(5000,false);now+=20000;assert.equal(clock.sample(),25000);
  clock.pause(true);now+=300000;assert.equal(clock.sample(),25000);
  clock.pause(false);now+=7000;assert.equal(clock.stop(),32000);
  now+=60000;assert.equal(clock.sample(),32000);
});

test('hiding during an unfinished action processes only elapsed receipts and resumes future combat',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const session=createHuntSession({...LEGION_HUNT_REVIEW_FIXTURE,seed:1731,now:()=>now}),h=harness(session.payload);
  const done=h.run();
  try{
    const first=h.engine.skillChipPlayback;await first.ready;first.timeline.pause();
    first.clock.time=2;h.engine.hide();await flush();
    assert.equal(first.valid(),false,'old impacts cannot change rebound monster slots');
    assert.equal(h.engine.huntRun.cancelled,false);
    now+=23000;h.engine.huntRun.wake();await flush();
    assert.equal(h.engine.huntRun.timeMs,25000);
    assert.deepEqual(h.notified.map(e=>e.seq),h.events.filter(e=>e.combatAtMs<=25000).map(e=>e.seq));
    assert.ok(h.notified.length<h.events.length,'tab hiding does not jump to RESULT');
    assert.equal(h.engine.huntRun.bossEntered,false);
    h.engine.show();await flush();
    const resumed=h.engine.skillChipPlayback;await resumed.ready;resumed.timeline.pause();
    assert.notEqual(resumed,first);assert.equal(resumed.clock.time,25);
    assert.equal(resumed.events[0].seq,h.notified.at(-1).seq+1);
    assert.equal(h.engine.firing,true);
    h.engine.hide();await flush();h.engine.pause(true);await flush();
    now+=60000;h.engine.huntRun.wake();await flush();assert.equal(h.engine.huntRun.timeMs,25000);
    h.engine.pause(false);await flush();now+=5000;h.engine.huntRun.wake();await flush();
    assert.equal(h.engine.huntRun.timeMs,30000);
    h.engine.cancelTimelines();assert.equal(await done,false);
    assert.equal(new Set(h.notified.map(e=>e.seq)).size,h.notified.length);
  }finally{h.engine.cancelTimelines();await done;}
});

test('a mobile freeze crossing boss and result consumes each server receipt once; settlement is idempotent',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const session=createHuntSession({...LEGION_HUNT_REVIEW_FIXTURE,seed:1731,now:()=>now});
  const server=restoreHuntSession(session.exportState(),{now:()=>now});server.begin();
  const h=harness(session.payload);h.engine.huntBackground=true;const done=h.run();
  try{
    await flush();now+=749000;h.engine.huntRun.wake();await flush();
    assert.equal(h.engine.huntRun.bossEntered,false);
    now+=1000;h.engine.huntRun.wake();await flush();assert.equal(h.engine.huntRun.bossEntered,true);
    assert.equal(h.notified.at(-1).seq,h.events.filter(e=>e.combatAtMs<=750000).at(-1).seq);
    now+=300000;h.engine.show();assert.equal(await done,true);
    assert.deepEqual(h.notified.map(e=>e.seq),h.events.map(e=>e.seq));
    assert.deepEqual(h.snapshots.at(-1),session.payload.huntPlayback.final);
    const receipt=server.finish(h.notified.at(-1).seq);
    assert.equal(receipt.reason,'CLEAR');assert.equal(receipt.picked,0,'background progress does not grant manual drops');
    assert.deepEqual(server.finish(h.notified.at(-1).seq),receipt);
  }finally{h.engine.cancelTimelines();await done;}
});

test('restoration uses exact generation, HP, shields and mercenary receipts',()=>{
  const state=new HuntBattleSnapshot({battleV2:{teams:{A:{cards:[{id:'A',hp:100,maxHp:100}],mercenaries:[{id:'M',hp:200,maxHp:200}]}}},continuousEncounter:{initialIds:['B1'],instances:[{id:'B1',slot:0,maxHp:50},{id:'B2',slot:0,maxHp:80}]}});
  state.record({type:'TURN',targetId:'A',targetHpAfter:40,targetMaxHp:120,targetShieldAfter:2,targetMaxShield:30,actorId:'M',actorShieldAfter:15,actorMaxShieldAfter:20});
  state.record({type:'KO',targetId:'B1'});
  state.record({type:'ENEMY_SPAWN',targetId:'B2',targetHpAfter:80,targetMaxHp:80});
  state.record({type:'TURN',targetId:'B1',targetHpAfter:0});
  state.record({type:'HEAL',targets:[{targetId:'M',hpAfter:180,maxHp:240}]});
  const restored=state.snapshot();
  assert.deepEqual(restored.A[0],{id:'A',hp:40,maxHp:120,shield:2,maxShield:30});
  assert.deepEqual(restored.B.map(r=>[r.id,r.hp]),[['B2',80]]);
  assert.deepEqual(restored.mercenaries.A[0],{id:'M',hp:180,maxHp:240,shield:15,maxShield:20});
});

test('hidden drops expire without a renderer tick; magnet receipts are counted once without loading an animation',async t=>{
  const source=fs.readFileSync('preview/sustained-hunt-v2/source/GroundDrops.js','utf8').replace(/^import .*;$/gm,'').replace('export class GroundDrops','class GroundDrops');
  const Drops=vm.runInNewContext(source+';GroundDrops',{Date}),expired=[],picked=[];
  let now=1000;t.mock.method(Date,'now',()=>now);
  const drops=Object.assign(Object.create(Drops.prototype),{engine:{huntBackground:true},rows:new Map(),absorbed:new Set(),onExpired:d=>expired.push(d.id),onPicked:r=>picked.push(r)});
  const row=id=>({drop:{id},deadline:2000,pending:false,button:{remove(){}},root:{destroy(){}}});
  drops.rows.set('manual',row('manual'));now=5000;drops.expire();drops.expire();
  assert.deepEqual(expired,['manual']);assert.equal(picked.length,0);
  const drop={id:'magnet',state:'CLAIMED'},receipt={automatic:true,picked:1,pendingRewards:true};
  await drops.add(drop,now,receipt);await drops.add(drop,now,receipt);
  assert.deepEqual(picked,[receipt]);assert.equal(drops.rows.size,0);
});

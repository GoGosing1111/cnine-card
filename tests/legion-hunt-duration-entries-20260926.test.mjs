import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {createHuntSession,restoreHuntSession,DIFFICULTIES} from '../preview/sustained-hunt-v2/session.mjs';
import {compactHuntTimeline} from '../preview/sustained-hunt-v2/timeline.mjs';
import {sustainedEncounterPlan} from '../functions/_sustained_encounter.js';

const shortFixture=async postgres=>{
  const f=await legionFixture({postgres});
  f.deps.createSession=options=>createHuntSession({...options,seed:1731,limitMs:1000});
  return f;
};
for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  test(dialect+': exactly two shared daily entries; preparation is free and failed/lost begin replies do not double-charge',async()=>{
    const f=await shortFixture(postgres);
    try{
      const entries=async()=>(await f.call('legion-hunt/bootstrap')).body.entries;
      const start=async difficulty=>{const r=await f.call('legion-hunt/start',{difficulty});assert.equal(r.status,200);return r.body.id;};
      const begin=id=>f.call('legion-hunt/begin',{id});
      assert.equal((await entries()).remaining,2);
      f.resetQueries();assert.equal((await f.call('legion-hunt/start',{difficulty:'normal',version:1})).body.code,'HUNT_CLIENT_UPDATE');
      assert.equal(f.queries.length,0,'stale 2x clients cannot consume entries');
      const unbegun=await start('normal');assert.equal((await entries()).used,0);
      await f.call('legion-hunt/cancel',{id:unbegun});assert.equal((await entries()).used,0);
      const id=await start('hard');f.fail('UPDATE app_meta');assert.equal((await begin(id)).status,503);f.fail('');
      assert.equal((await entries()).used,0);
      f.loseReply();assert.equal((await begin(id)).status,503);
      const retry=await begin(id);assert.equal(retry.status,200);assert.equal(retry.body.entries.used,1);
      assert.equal((await begin(id)).body.entries.remaining,1);
      await f.call('legion-hunt/cancel',{id});assert.equal((await entries()).used,1,'retreat does not refund an entry');
      const second=await start('inferno');assert.equal((await begin(second)).body.entries.used,2);
      assert.equal((await begin(second)).body.entries.used,2);
      assert.equal((await begin(id)).body.code,'HUNT_SESSION_EXPIRED');
      const reads=f.snapshotReads.length;f.resetQueries();
      const denied=await f.call('legion-hunt/start',{difficulty:'normal'});
      assert.equal(denied.body.code,'HUNT_DAILY_LIMIT');assert.equal(f.snapshotReads.length,reads);
      assert.equal(f.queries.length,1,'exhausted entries need one indexed read and no simulation');
      assert.equal((await entries()).remaining,0);
    }finally{await f.close();}
  });
  test(dialect+': concurrent begin CAS consumes one entry, resets at KST midnight, and never rewrites a prior-day receipt',async()=>{
    const f=await shortFixture(postgres);
    try{
      f.clock.now=Date.parse('2026-09-26T23:59:00+09:00');
      const id=(await f.call('legion-hunt/start',{difficulty:'normal'})).body.id;
      const results=await Promise.all([f.call('legion-hunt/begin',{id}),f.call('legion-hunt/begin',{id})]);
      assert.ok(results.some(r=>r.status===200));assert.ok(results.every(r=>[200,409].includes(r.status)));
      assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.used,1);
      f.clock.now=Date.parse('2026-09-26T23:59:59.999+09:00');
      assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.day,'2026-09-26');
      f.clock.now++;
      const fresh=(await f.call('legion-hunt/bootstrap')).body.entries;
      assert.equal(fresh.day,'2026-09-27');assert.equal(fresh.remaining,2);
      assert.equal(fresh.resetsAt,Date.parse('2026-09-28T00:00:00+09:00'));
      assert.equal((await f.call('legion-hunt/begin',{id})).body.entries.used,0,'old begin retry belongs to yesterday');
      const next=(await f.call('legion-hunt/start',{difficulty:'hard'})).body.id;
      assert.equal((await f.call('legion-hunt/begin',{id:next})).body.entries.used,1);
      f.clock.now+=31*60000;
      assert.equal((await f.call('legion-hunt/begin',{id:next})).body.code,'HUNT_SESSION_EXPIRED');
      assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.used,1,'expiry never resets the daily counter');
    }finally{await f.close();}
  });
}

test('every difficulty uses 15 minutes before the boss; strong accounts cannot acknowledge it at 2x speed',async()=>{
  const f=await legionFixture({withMercenary:true});
  try{
    const snapshot=(await f.call('legion-hunt/bootstrap')).body.loadout;
    for(const d of DIFFICULTIES){
      let now=1000;const start=performance.now(),s=createHuntSession({snapshot,difficulty:d.id,seed:1731,now:()=>now});
      const p=s.payload,t=p.battleV2.result.timeline,boss=t.find(e=>e.finalBoss),saved=s.exportState();
      assert.equal(d.huntDurationMs,900000);assert.equal(d.limitMs,900000+d.bossLimitMs);
      assert.equal(boss.combatAtMs,900000);assert.equal(t.filter(e=>e.finalBoss).length,1);assert.equal(t.at(-1).winner,'A');
      assert.ok(!t.some(e=>e.type==='RESULT'&&e.combatAtMs<900000));
      assert.ok(p.continuousEncounter.instances.length<=2161);assert.ok(t.length<40000);
      assert.ok(JSON.stringify(saved).length<400000,'bounded persisted state; no catalog or full timeline');
      s.begin();now+=450000;assert.throws(()=>s.finish(t.length),/HUNT_EVENT_NOT_REACHED/);
      const restored=restoreHuntSession(JSON.parse(JSON.stringify(s.exportState())),{now:()=>now});
      now=1000+Math.ceil(t.at(-1).combatAtMs)+1;
      assert.equal(restored.finish(t.length).reason,'CLEAR');
      console.log(JSON.stringify({difficulty:d.id,simulationMs:Math.round(performance.now()-start),events:t.length,instances:p.continuousEncounter.instances.length,stateBytes:JSON.stringify(saved).length}));
    }
  }finally{await f.close();}
});

test('final-boss despawn drains old hits and retires the exact generation without a knockout',async()=>{
  const source=fs.readFileSync('preview/sustained-hunt-v2/source/HuntBattleEngine.js','utf8').replace(/^import .*;$/gm,'').replace('export class BattleEngine','class BattleEngine');
  const Engine=vm.runInNewContext(source+';BattleEngine',{ScrapyardEngine:class{}}),engine=new Engine(),actor={id:'B:4:ENCOUNTER:OLD',root:{visible:true},setHp(value){this.hp=value;}};
  let drains=0,settled=0;
  Object.assign(engine,{playbackEpoch:1,visible:true,skillChipPlayback:{clock:{time:900}},retiredIds:new Set(),drainGeneration:async()=>{drains++;},combatantById:id=>id===actor.id?actor:null,settlePendingTails:()=>settled++});
  assert.equal(await engine.playEvents([{type:'ENEMY_DESPAWN',combatAtMs:900000,targetId:actor.id}],{timedInternal:true}),true);
  assert.equal(engine.combatClockRate,1);assert.equal(actor.hp,0);assert.equal(actor.root.visible,false);assert.equal(actor.battleActive,false);
  assert.equal(drains,1);assert.equal(settled,1);assert.ok(engine.retiredIds.has(actor.id));
});

test('hunt keeps animations and the combat clock at 1x even after delayed event delivery',async()=>{
  const source=fs.readFileSync('preview/sustained-hunt-v2/source/HuntBattleEngine.js','utf8').replace(/^import .*;$/gm,'').replace('export class BattleEngine','class BattleEngine');
  const forwarded=[];
  class Parent {
    async playEvents(events,options){forwarded.push({events,options,speed:this.previewSpeed,pace:this.paceScale,clock:this.combatClockRate});return true;}
  }
  const Engine=vm.runInNewContext(source+';BattleEngine',{ScrapyardEngine:Parent}),engine=new Engine();
  assert.equal(engine.previewSpeed,1);assert.equal(engine.paceScale,1);assert.equal(engine.combatClockRate,1);
  for(const time of [0,60,899]){
    engine.skillChipPlayback={clock:{time}};
    const events=[{type:'TURN',combatAtMs:0,seq:time+1}],options={timedInternal:true};
    assert.equal(await engine.playEvents(events,options),true);
    const actual=forwarded.at(-1);
    assert.equal(actual.events,events);assert.equal(actual.options,options);
    assert.deepEqual([actual.speed,actual.pace,actual.clock],[1,1,1]);
  }
  assert.equal(forwarded.length,3,'every delayed event is forwarded once without acceleration');
});

test('adjacent bullet compaction preserves exact damage and last HP, never crossing a KO, skill or instance',()=>{
  const hit=(seq,at,target='B:0:ENCOUNTER:1')=>({seq,type:'TURN',actorKind:'BATTLE_SUIT',actorId:'A:SUIT',targetId:target,damage:10,absorbed:2,targetHpAfter:100-seq*10,combatAtMs:at,combatGroup:seq});
  const source=[hit(1,0),hit(2,30),hit(3,105),{type:'SKILL_CHIP_CAST',combatAtMs:110},hit(5,120),hit(6,130,'B:0:ENCOUNTER:2'),{type:'KO',targetId:'B:0:ENCOUNTER:2',combatAtMs:135}];
  const rows=compactHuntTimeline(source);
  assert.equal(rows.length,6);assert.equal(rows[0].damage,20);assert.equal(rows[0].absorbed,4);
  assert.equal(rows[0].combatAtMs,30);assert.equal(rows[0].targetHpAfter,80);assert.equal(rows[0].shotCount,2);
  assert.equal(rows.reduce((a,e)=>a+(e.damage||0),0),source.reduce((a,e)=>a+(e.damage||0),0));
  assert.deepEqual(rows.map(e=>e.seq),[1,2,3,4,5,6]);assert.equal(source[0].damage,10);
});

test('timed refill rejects unsafe configuration and the final retreat never counts as a kill',()=>{
  assert.throws(()=>sustainedEncounterPlan({durationMs:10,templates:[],finalBoss:{}},[],12),/INVALID_SUSTAINED_ENCOUNTER/);
  const card={id:'B:0:ENCOUNTER:0',isMonster:true,side:'B',slot:0,hp:100,maxHp:100,speed:100,alive:true};
  const initial=Array.from({length:12},(_,slot)=>({...card,slot,id:'B:'+slot+':ENCOUNTER:0'}));
  const boss={...card,id:'B:4:ENCOUNTER:FINAL',isBoss:true},plan=sustainedEncounterPlan({durationMs:900000,templates:[card],finalBoss:boss},initial,12),events=[],enemies=initial.map(c=>({...c}));
  while(!plan.bossSpawned)plan.advance(plan.nextAt,enemies,(type,data)=>events.push({type,...data}));
  assert.equal(plan.instances.length,13);assert.equal(plan.defeated,0);assert.equal(enemies.length,1);
  assert.equal(events.filter(e=>e.type==='ENEMY_DESPAWN').length,12);assert.equal(events.at(-1).targetId,boss.id);
});

test('entry controller blocks an exhausted account; refresh alone cannot spend an entry',async()=>{
  const source=fs.readFileSync('js/legion-hunt-entry-v1.mjs','utf8');
  const calls=[],entered=[];
  const options={request:async path=>{calls.push(path);return {difficulties:[{id:'normal'}],loadout:{},entries:{remaining:0,limit:2}};},render(){},enter:x=>entered.push(x),dispose(){}};
  const controller=vm.runInNewContext(source.slice(source.indexOf('export function createHuntEntry'),source.indexOf('let active=null;')).replace('export function','function')+';createHuntEntry(options)',{options});
  await controller.refresh();controller.enter();assert.equal(entered.length,0);assert.deepEqual(calls,['legion-hunt/bootstrap']);
});

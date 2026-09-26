import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {chooseDropPosition,DIFFICULTIES,MONSTERS,BOSSES} from '../preview/sustained-hunt-v2/hunt-rules.mjs';
import {simulateBattleV2Preview,createPveBattleV2,createPvpBattleV2,buildFighter,buildMonsterFighter} from '../functions/_battle_v2_preview.js';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(f=>{const m=read('assets/ui/project-v/characters/'+f);return m.characters.map(c=>({...c,grade:m.rarity}));});
const equipment=read('assets/ui/project-v/account-battle-suits/manifest-v2.json');
const make=o=>createHuntSession({catalog,equipment,seed:1731,...o});
function rng(seed=7351){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function dropSession(options={}){
  let now=1000;const s=make({now:()=>now,random:rng(),...options});s.begin();now=301000;
  const kills=s.payload.battleV2.result.timeline.filter(e=>e.huntKill);
  const reveal=()=>{for(const e of kills){const r=s.reveal(e.seq);if(r.drop?.state==='GROUND')return r.drop;}throw Error('Fixture has no drop');};
  return {s,kills,reveal,setNow:v=>now=v,get now(){return now;}};
}
test('four fixed difficulties produce real clears and party elimination with the current engine',()=>{
  for(const seed of [1731,1732,1733]){
    assert.equal(make({seed,difficulty:'normal'}).diagnostics.outcome.winner,'A');
    const lose=make({seed,difficulty:'inferno'});assert.equal(lose.diagnostics.outcome.winner,'B');
    assert.equal(lose.payload.battleV2.result.timeline.filter(e=>e.type==='KO'&&e.targetId.startsWith('A:')).length,5);
  }
  const a=make({difficulty:'nightmare',party:'rookie'}),b=make({difficulty:'nightmare',party:'veteran'});
  assert.equal(a.diagnostics.outcome.winner,'B');assert.equal(b.diagnostics.outcome.winner,'A');
  assert.deepEqual(a.payload.continuousEncounter.instances.map(m=>m.maxHp),b.payload.continuousEncounter.instances.map(m=>m.maxHp));
});
test('wave barriers retain one battle and introduce two mid-bosses and one final guardian',()=>{
  const s=make(),rows=s.payload.continuousEncounter.instances,t=s.payload.battleV2.result.timeline,map=new Map(rows.map(r=>[r.id,r])),dead=new Set();
  assert.equal(rows.length,37);assert.equal(new Set(rows.map(r=>r.id)).size,37);assert.equal(rows.filter(r=>r.boss).length,3);
  assert.equal(MONSTERS.length+BOSSES.length,10);
  for(const e of t){
    if(e.type==='KO')dead.add(e.targetId);
    if(e.type==='ENEMY_SPAWN'){const r=map.get(e.targetId);assert.ok(rows.filter(p=>p.stage<r.stage).every(p=>dead.has(p.id)));}
  }
  assert.equal(t.filter(e=>e.type==='RESULT').length,1);
  assert.equal(t.filter(e=>e.huntKill&&e.boss).length,3);
  assert.ok(!t.some(e=>/HUNT_THUNDER|GREATBLADE|SWORDRAIN|TWINBLADES/.test(e.chipCode||'')));
  assert.ok(t.some(e=>e.chipCode==='SKILL_CHIP_HELICOPTER_AIRSTRIKE'));
});
test('canonical combat clock can fail the expedition on time rather than HP ratio',()=>{
  const s=make({difficulty:'hard',limitMs:1500});
  assert.deepEqual(s.diagnostics.outcome.winner,'B');assert.equal(s.diagnostics.outcome.reason,'TIME_LIMIT');
  assert.ok(s.diagnostics.outcome.combatMs<=1500);
});
test('kills never grant inventory; only an unexpired authenticated point claim grants once',()=>{
  const {s,reveal}=dropSession();const d=reveal();
  assert.deepEqual(s.diagnostics.inventory,[]);
  assert.throws(()=>s.claim({dropId:d.id,token:'bad',...d.position}),/INVALID_DROP_CLAIM/);
  assert.throws(()=>s.claim({dropId:d.id,token:d.token,x:0,y:0}),/DROP_POSITION_MISMATCH/);
  const args={dropId:d.id,token:d.token,...d.position},first=s.claim(args);
  assert.equal(first.inventory[0].quantity,1);assert.deepEqual(s.claim(args),first);
  assert.equal(s.diagnostics.inventory[0].quantity,1);
  assert.equal(s.reveal(d.seq).drop.id,d.id);
});
test('expiry, stop, foreign session and nonexistent kills cannot award an item',()=>{
  const c=dropSession(),d=c.reveal(),args={dropId:d.id,token:d.token,...d.position};
  const other=dropSession().s;assert.throws(()=>other.claim(args),/INVALID_DROP_CLAIM/);
  c.setNow(c.now+10000);assert.throws(()=>c.s.claim(args),/DROP_EXPIRED/);
  const r=c.s.finish(d.seq);assert.equal(r.picked,0);assert.equal(r.missed,1);assert.deepEqual(r.inventory,[]);
  assert.deepEqual(c.s.finish(d.seq),r);
  assert.throws(()=>c.s.reveal(d.seq),/HUNT_NOT_ACTIVE/);
  const active=dropSession().s;assert.throws(()=>active.reveal(0),/HUNT_DROP_REQUIRES_KILL/);assert.throws(()=>active.reveal(999999),/INVALID_HUNT_ACK/);
});
test('future acknowledgements are time-gated and probability is rolled only once',()=>{
  let clock=0,rolls=0;const s=make({now:()=>clock,random:()=>{rolls++;return .999;}});
  const e=s.payload.battleV2.result.timeline.find(e=>e.huntKill&&e.combatAtMs>1000);
  assert.throws(()=>s.reveal(e.seq),/HUNT_NOT_ACTIVE/);s.begin();
  assert.throws(()=>s.reveal(e.seq),/HUNT_EVENT_NOT_REACHED/);clock=300000;
  assert.equal(s.reveal(e.seq).drop,null);assert.equal(s.reveal(e.seq).drop,null);assert.equal(rolls,1);
});

test('delayed old reveals cannot bank missed drops and retries retain their original expiry',()=>{
  const c=dropSession(),first=c.kills[0],later=c.kills[1];
  c.s.reveal(later.seq);assert.throws(()=>c.s.reveal(first.seq),/HUNT_STALE_DROP_EVENT/);
  const d=dropSession(),item=d.reveal(),expiresAt=item.expiresAt;
  d.setNow(expiresAt+1);const retry=d.s.reveal(item.seq).drop;
  assert.equal(retry.id,item.id);assert.equal(retry.expiresAt,expiresAt);assert.equal(retry.state,'EXPIRED');
});
test('continuous random field positions avoid the last two drop points and overlapping targets',()=>{
  const random=rng(),points=[];
  for(let i=0;i<100;i++){
    const p=chooseDropPosition(random,points,points.slice(-3));assert.ok(p);
    assert.ok(p.x>=.09&&p.x<=.91&&p.y>=.12&&p.y<=.86);
    assert.ok(points.slice(-2).every(q=>Math.hypot((p.x-q.x)*1.4,p.y-q.y)>.28));
    assert.ok(points.slice(-3).every(q=>Math.abs(p.x-q.x)>.24||Math.abs(p.y-q.y)>.18));points.push(p);
  }
  assert.ok(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))>.7);
});
test('outcomes distinguish clear, defeat, time limit and early retreat; only picked items survive',()=>{
  for(const [difficulty,limitMs,reason] of [['normal',undefined,'CLEAR'],['inferno',undefined,'DEFEAT'],['hard',1500,'TIME_LIMIT']]){
    let clock=0;const s=make({difficulty,limitMs,now:()=>clock});s.begin();clock=300000;
    const r=s.finish(s.payload.battleV2.result.timeline.length);assert.equal(r.reason,reason);assert.equal(r.picked,0);assert.deepEqual(r.inventory,[]);
  }
  const {s,reveal}=dropSession(),d=reveal();s.claim({dropId:d.id,token:d.token,...d.position});
  const r=s.finish(d.seq);assert.equal(r.reason,'RETREAT');assert.equal(r.picked,1);assert.equal(r.liveRewards,false);
});
test('bounded encounter extension rejects invalid capacity and malformed waves',()=>{
  const a=Array.from({length:5},(_,i)=>buildFighter({id:i,power:10000},i,'A',null,'PVE'));
  const b=buildMonsterFighter({id:1,battle_power:10000}),r={...buildMonsterFighter({id:2,battle_power:10000}),id:'B:0:ENCOUNTER:NEXT'};
  assert.throws(()=>simulateBattleV2Preview({teamA:a,teamB:[b],reinforcements:[r],encounterCapacity:13}),/INVALID_ENCOUNTER_LIMITS/);
  assert.throws(()=>simulateBattleV2Preview({teamA:a,teamB:[b],reinforcements:[{...r,encounterWave:-1}]}),/INVALID_REINFORCEMENT_MONSTER/);
});
test('legacy PVE and PVP outputs remain byte-equivalent to the latest operation base',async()=>{
  const file=path.resolve('functions/.hunt-v2-baseline-'+process.pid+'.mjs');
  fs.writeFileSync(file,execFileSync('git',['show','0d67ae862a1f9763605ad7323e889acf5d51ad41:functions/_battle_v2_preview.js']));
  try{
    const baseline=await import(pathToFileURL(file).href);
    const cards=['ATTACK','DEFENSE','HP','SPEED','DEFENSE'].map((type,i)=>({id:i+1,power:50000+i*7000,power_type:type,rarity:'FUR'}));
    for(let seed=1;seed<=12;seed++){
      const pve={cards,monster:{id:5,battle_power:350000,is_boss:1},seed};
      assert.deepEqual(createPveBattleV2(pve),baseline.createPveBattleV2(pve));
      const pvp={attackerCards:cards,defenderCards:cards.map(c=>({...c,id:c.id+10,power:c.power+4000})),seed};
      assert.deepEqual(createPvpBattleV2(pvp),baseline.createPvpBattleV2(pvp));
    }
  }finally{fs.unlinkSync(file);}
});
test('preview bundle includes the latest canonical engine and playback, with no old hunt runtime',()=>{
  const build=read('preview/sustained-hunt-v2/engine-build.json');
  assert.equal(build.engineBase,'0d67ae862a1f9763605ad7323e889acf5d51ad41');assert.deepEqual(build.legacyHuntInputs,[]);
  assert.ok(build.commonInputs.some(f=>f.endsWith('/BattleEngine.js')));assert.ok(build.commonInputs.some(f=>f.endsWith('/BattleSuitSkillChipPlayback.js')));
  const source=fs.readFileSync('preview/sustained-hunt-v2/source/HuntBattleEngine.js','utf8');
  assert.ok(!source.includes('gsap.globalTimeline'));assert.ok(source.includes('ensureEnemyCapacity'));
  for(const f of [...MONSTERS,...BOSSES].map(r=>r.sprite))assert.ok(fs.existsSync('.'+f));
});

test('pausing longer than the bullet-drain timeout resumes safely, but an active stall still fails',async()=>{
  const source=fs.readFileSync('preview/sustained-hunt-v2/source/HuntBattleEngine.js','utf8').replace(/^import .*;$/gm,'').replace('export class BattleEngine','class BattleEngine');
  let clock=0;const callbacks=[],context={ScrapyardEngine:class{},performance:{now:()=>clock},setTimeout:fn=>callbacks.push(fn)};
  vm.runInNewContext(source+'\nthis.HuntEngine=BattleEngine;',context);
  const engine=Object.create(context.HuntEngine.prototype);
  const run={active:true};Object.assign(engine,{playbackEpoch:1,accountBattleUnitFireRun:run,accountBattleUnitDamageQueue:[{}],huntPaused:true});
  let finished=false;const draining=engine.waitForAccountBattleUnitDamageQueueDrain(6000).then(value=>{finished=true;return value;});
  clock=60000;callbacks.shift()();await Promise.resolve();assert.equal(finished,false);
  engine.huntPaused=false;clock+=1000;callbacks.shift()();await Promise.resolve();assert.equal(finished,false);
  engine.accountBattleUnitDamageQueue=[];clock+=40;callbacks.shift()();assert.equal(await draining,true);
  engine.accountBattleUnitDamageQueue=[{}];const stalled=engine.waitForAccountBattleUnitDamageQueueDrain(6000);
  clock+=6040;callbacks.shift()();assert.equal(await stalled,false);
  engine.huntPaused=true;const cancelled=engine.waitForAccountBattleUnitDamageQueueDrain(6000);
  engine.playbackEpoch++;clock+=40;callbacks.shift()();assert.equal(await cancelled,true);
});

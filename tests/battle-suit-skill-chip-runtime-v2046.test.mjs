import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import test,{after} from 'node:test';
import {Container,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {createPveBattleV2,simulateBattleV2Preview,buildBattleSuitFighter} from '../functions/_battle_v2_preview.js';
import {SKILL_CHIP_CLOCK,SKILL_CHIP_CATALOG,createSkillChipSchedule,splitSkillChipDamage,normalizeSkillChipCodes,skillChipCombatEventMs} from '../shared/battle-suit-skill-chips.mjs';
import {BattleSuitSkillChipPlayback,isSkillChipTimeline} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {SkillChipFX} from '../preview/battle-suit-skill-chip-v1/source/SkillChipFX.js';
import {SkillChipAudio} from '../preview/battle-suit-skill-chip-v1/source/SkillChipAudio.js';
after(()=>gsap.ticker.sleep());
const [ROCKET,HELI]=SKILL_CHIP_CATALOG.map(chip=>chip.code);
const cards=['HP','DEFENSE','DEFENSE','ATTACK','SPEED'].map((power_type,i)=>({id:`CHIP-${i}`,title:`CHIP ${i}`,power_type,power:400000}));
const suit={code:'BATTLE_SUIT_03',pvePower:300000,weapon:{code:'EQ_1785427638137'}};
const monster={id:68,battle_power:300000,is_boss:1,pve_hp_percent:1200,pve_attack_percent:100,pve_shield_percent:300};
const options={cards,battleSuit:{...suit,skillChips:[ROCKET,HELI]},monster,seed:2011};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('each game owns a deduplicated 3s / 15s schedule; simultaneous casts are stable',()=>{
  assert.deepEqual(normalizeSkillChipCodes([ROCKET,'INVALID',ROCKET,HELI,null]),[ROCKET,HELI]);
  const schedule=createSkillChipSchedule([HELI,ROCKET,ROCKET]);
  const casts=Array.from({length:12},()=>schedule.take());
  assert.deepEqual(casts.map(c=>c.atMs),[3000,6000,9000,12000,15000,15000,18000,21000,24000,27000,30000,30000]);
  assert.equal(casts[4].chip.code,ROCKET);assert.equal(casts[5].chip.code,HELI);
  assert.equal(createSkillChipSchedule([ROCKET]).take().activation,1);
  assert.equal(createSkillChipSchedule([]).take(),null);
});
test('four helicopter hits conserve the single x5 total, including integer remainder',()=>{
  for(const damage of [0,1,3,4,5,505,10000000000]){
    const parts=splitSkillChipDamage(damage,4);
    assert.equal(parts.reduce((a,b)=>a+b,0),damage);
    assert.ok(Math.max(...parts)-Math.min(...parts)<=1);
  }
  for(const count of [0,9,1.5])assert.throws(()=>splitSkillChipDamage(50,count));
});
test('server casts at exact combat intervals and applies damage only at approved explosion frames',()=>{
  const battle=createPveBattleV2(options),timeline=battle.result.timeline;
  const casts=timeline.filter(e=>e.type==='SKILL_CHIP_CAST'),hits=timeline.filter(e=>e.type==='SKILL_CHIP_HIT');
  assert.ok(casts.length>=12&&casts.some(e=>e.chipCode===HELI));
  for(const event of casts){
    assert.equal(event.combatAtMs,event.activation*event.intervalMs);
    assert.equal(event.calculatedDamage,Math.round(event.baseDamage*event.damageMultiplier));
    const impacts=hits.filter(hit=>hit.castId===event.castId);
    for(const hit of impacts){
      assert.equal(hit.combatAtMs,event.combatAtMs+event.impactOffsetsMs[hit.hitIndex]);
      assert.ok(hit.damage>=0&&hit.absorbed>=0&&Number.isSafeInteger(hit.damage+hit.absorbed));
    }
    const sum=impacts.reduce((n,e)=>n+e.damage+e.absorbed,0);
    assert.ok(sum<=event.calculatedDamage,'overkill never exceeds the calculated skill total');
    if(impacts.length===event.impactOffsetsMs.length&&impacts.at(-1).targetHpAfter>0)assert.equal(sum,event.calculatedDamage);
    if(event.dodge)assert.equal(sum,0);
  }
  const total=hits.reduce((n,e)=>n+e.damage+e.absorbed,0),breakdown=battle.result.damageBreakdown;
  assert.equal(breakdown.skillChips,total);
  assert.equal(breakdown.total,breakdown.cards+breakdown.battleSuit+breakdown.skillChips+breakdown.ultimate);
  assert.equal(battle.result.supports.A[0].damageDealt,breakdown.battleSuit+total);
  assert.equal(battle.teams.A.cards.length,5);assert.equal(battle.result.final.A.length,5);
  assert.ok(timeline.every(e=>e.combatClock===SKILL_CHIP_CLOCK&&Number.isFinite(e.combatAtMs)));
  assert.ok(timeline.slice(1).every((e,i)=>e.combatAtMs>=timeline[i].combatAtMs));
  assert.ok(hits.every(e=>e.combatAtMs<=timeline.at(-1).combatEndedAtMs));
});
test('same seed and loadout replay identically; the following battle starts at activation one',()=>{
  const first=createPveBattleV2(options),second=createPveBattleV2(options);
  assert.deepEqual(second,first);
  assert.equal(second.result.timeline.find(e=>e.type==='SKILL_CHIP_CAST').activation,1);
});
test('no suit, invalid chips, and zero-power suits cannot generate skill damage',()=>{
  for(const battleSuit of [null,{...suit,pvePower:0,skillChips:[ROCKET]},{...suit,skillChips:['INVALID']},{...suit,skillChips:[]}]){
    const result=createPveBattleV2({...options,battleSuit});
    assert.ok(!result.result.timeline.some(e=>e.type.startsWith('SKILL_CHIP')||e.combatClock));
    assert.equal(result.result.damageBreakdown.skillChips,0);
  }
});
test('a short battle does not invent a last-second rocket or helicopter',()=>{
  const battle=createPveBattleV2({...options,ultimateDamage:100000000000});
  assert.equal(battle.result.winner,'A');
  assert.ok(!battle.result.timeline.some(e=>e.type.startsWith('SKILL_CHIP')));
});
test('legacy no-chip winners, RNG stream, action count, shot cadence and every HP snapshot are unchanged',async()=>{
  const source=execFileSync('git',['show','8dade82d:functions/_battle_v2_preview.js'],{encoding:'utf8',maxBuffer:2*1024*1024});
  const baseline=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  for(const seed of [1,17,2011,98765])for(const apocalypse of [false,true]){
    const input={...options,seed,battleSuit:suit,monster:{...monster,...(apocalypse?{pve_difficulty:'APOCALYPSE'}:{})},bossUltimatePercent:28};
    const before=baseline.createPveBattleV2(input).result,now=createPveBattleV2(input).result;
    assert.deepEqual(now.timeline,before.timeline);assert.deepEqual(now.final,before.final);
    assert.equal(now.actions,before.actions);assert.equal(now.winner,before.winner);
    assert.equal(now.damageBreakdown.total,before.damageBreakdown.total);
  }
});
test('PVP does not enable the PVE chip clock even if a support object contains chips',()=>{
  const normal=createPveBattleV2(options);
  const fighter=normal.teams.A.cards[0];
  const support=buildBattleSuitFighter({...suit,skillChips:[ROCKET]},1);
  const result=simulateBattleV2Preview({teamA:[{...fighter,alive:true},support],teamB:[{...fighter,id:'B:0:PVP',side:'B',alive:true}],maxActions:20,seed:1});
  assert.ok(!result.timeline.some(e=>e.combatClock||e.type.startsWith('SKILL_CHIP')));
});
test('combat budgets use presentation milliseconds and never the legacy speed gauge',()=>{
  assert.equal(skillChipCombatEventMs({type:'TURN',actorKind:'BATTLE_SUIT'}),0);
  assert.ok(skillChipCombatEventMs({type:'TURN'})>500);
  assert.ok(skillChipCombatEventMs({type:'BOSS_ULTIMATE',hits:[{},{},{},{},{}]})>3000);
});

function mockEngine(){
  const root=new Container();root.position.set(1000,600);
  const target={id:'B:0:MONSTER:68',root,hp:100,serverMaxHp:100,shield:20};
  return {visible:true,playbackEpoch:1,paceScale:1,mobile:false,audio:{enabled:()=>false},target,
    combatLayer:new Container(),effectLayer:new Container(),stage:new Container(),camera:{base:{x:0,y:0}},enemies:[target],
    accountBattleUnit:{muzzlePoint:()=>({x:400,y:500})},combatantById:id=>id===target.id?target:null,
    eventHpPercent:(_target,value)=>value,syncTargetHp:(target,value)=>{target.hp=value;},syncTargetShield:(target,value)=>{target.shield=value;},
    showAccountBattleUnitDamage(){},updateStatus(){},playEvents:async()=>{}};
}
function mockTextures(){return {frames:Array.from({length:24},()=>new Texture({source:Texture.EMPTY.source})),...Object.fromEntries(['helicopter','rotor','rocket','exhaust','smoke','dust','cinder','flash'].map(name=>[name,Texture.EMPTY]))};}
function replayEvents(){
  return [
    {type:'SKILL_CHIP_CAST',chipCode:ROCKET,combatAtMs:15000},
    {type:'SKILL_CHIP_CAST',chipCode:HELI,combatAtMs:15000},
    {type:'SKILL_CHIP_HIT',chipCode:ROCKET,combatAtMs:15360,damage:10,targetHpAfter:90,targetShieldAfter:0},
    ...[15610,15830,16050,16270].map((combatAtMs,i)=>({type:'SKILL_CHIP_HIT',chipCode:HELI,combatAtMs,damage:5,targetHpAfter:85-i*5,targetShieldAfter:0})),
    {type:'RESULT',combatAtMs:17000}
  ].map((e,i)=>({...e,combatClock:SKILL_CHIP_CLOCK,combatGroup:i,combatGroupDurationMs:0,targetId:'B:0:MONSTER:68'}));
}
test('live clock displays both simultaneous skills, four separate hits, then releases all owned FX',async t=>{
  t.mock.method(SkillChipFX,'preload',async()=>mockTextures());
  const engine=mockEngine();let renderTick=null;
  engine.app={ticker:{add(fn,_context,priority){renderTick=fn;assert.equal(priority,-10);},remove(fn){assert.equal(fn,renderTick);renderTick=null;}}};
  const playback=new BattleSuitSkillChipPlayback(engine,replayEvents());
  const run=playback.play();await flush();playback.timeline.pause();
  assert.ok(isSkillChipTimeline(replayEvents()));
  playback.timeline.time(15,true);playback.pump();assert.equal(playback.casts,2);assert.equal(playback.fx.size,2);
  playback.timeline.time(15.7,true);playback.pump();
  assert.equal(playback.hits,2);assert.equal(engine.target.hp,85);
  const rocket=playback.fx.get(ROCKET).fx;
  assert.equal(rocket.blasts[0].first.y,engine.target.root.y,'the live explosion remains exactly on the target sole');
  engine.target.root.y+=100;renderTick();
  assert.equal(rocket.blasts[0].first.y,engine.target.root.y,'a late actor transform is sampled before the next Pixi frame, even while paused');
  playback.timeline.time(16.28,true);playback.pump();assert.equal(playback.hits,5);assert.equal(engine.target.hp,70);
  playback.timeline.time(playback.endMs/1000,true);await playback.finish();
  assert.equal(await run,true);assert.equal(playback.active,false);assert.equal(playback.fx.size,0);
  assert.equal(engine.combatLayer.children.length,0);assert.equal(engine.effectLayer.children.length,0);
  assert.equal(renderTick,null,'the extra pre-render hook must be removed on completion');
});
test('slow card animation pauses the shared clock without replaying a chip twice',async t=>{
  t.mock.method(SkillChipFX,'preload',async()=>mockTextures());
  const engine=mockEngine();let release;
  engine.playEvents=()=>new Promise(resolve=>{release=resolve;});
  const events=[{type:'TURN',combatAtMs:0,combatGroup:0,combatGroupDurationMs:500},{type:'TURN',combatAtMs:500,combatGroup:1,combatGroupDurationMs:500},{type:'RESULT',combatAtMs:1000,combatGroup:2,combatGroupDurationMs:0}].map(e=>({...e,combatClock:SKILL_CHIP_CLOCK}));
  const playback=new BattleSuitSkillChipPlayback(engine,events),run=playback.play();await flush();playback.timeline.pause();
  playback.timeline.time(.7,true);playback.pump();assert.equal(playback.waiting,true);assert.equal(playback.clock.time,.5);
  release();await flush();assert.equal(playback.waiting,false);assert.equal(playback.index,2);
  playback.cancel();release();assert.equal(await run,false);assert.equal(playback.casts,0);
});
test('closing during first texture decode settles immediately and cannot start a stale next-game clock',async t=>{
  let release;
  t.mock.method(SkillChipFX,'preload',()=>new Promise(resolve=>{release=resolve;}));
  const engine=mockEngine(),playback=new BattleSuitSkillChipPlayback(engine,replayEvents());
  const run=playback.play();playback.cancel();engine.playbackEpoch++;
  assert.equal(await run,false);release(mockTextures());await flush();
  assert.equal(playback.casts,0);assert.equal(playback.timeline,null);assert.equal(engine.effectLayer.children.length,0);
});
test('late ordinary impacts cannot restore pre-chip HP or shield and a later heal remains authoritative',()=>{
  const engine=mockEngine(),playback=new BattleSuitSkillChipPlayback(engine,[]);
  playback.remember({targetId:engine.target.id,targetHpAfter:20,targetShieldAfter:0});
  assert.equal(playback.currentHp(engine.target,80),20);assert.equal(playback.currentShield(engine.target,20),0);
  playback.remember({type:'REGEN',targetId:engine.target.id,hpAfter:60});
  assert.equal(playback.currentHp(engine.target,20),60);
  playback.cancel();assert.equal(playback.currentHp(engine.target,80),80);
});
test('event revisions prevent a delayed old card callback from replacing a newer chip or heal snapshot',()=>{
  const engine=mockEngine(),playback=new BattleSuitSkillChipPlayback(engine,[]),targetId=engine.target.id;
  playback.remember({seq:20,targetId,targetHpAfter:20,targetShieldAfter:0});
  playback.remember({seq:10,targetId,targetHpAfter:90,targetShieldAfter:50});
  assert.equal(playback.currentHp(engine.target,100),20);assert.equal(playback.currentShield(engine.target,50),0);
  playback.remember({seq:21,type:'REGEN',targetId,hpAfter:60});
  playback.remember({seq:20,targetId,targetHpAfter:20});
  assert.equal(playback.currentHp(engine.target,20),60);playback.cancel();
});
test('raid QTE holds the same game clock in event order, skips rejected branches, and settles at the final timestamp',async t=>{
  t.mock.method(SkillChipFX,'preload',async()=>mockTextures());
  const engine=mockEngine(),seen=[];let release;
  engine.playEvents=async events=>seen.push(...events.map(e=>e.type));
  const events=[
    {type:'TURN',combatClock:SKILL_CHIP_CLOCK,combatAtMs:0,combatGroup:0,combatGroupDurationMs:500},
    {type:'RAID_QTE_SEQUENCE'},
    {type:'REGEN',combatClock:SKILL_CHIP_CLOCK,combatAtMs:0,combatGroup:0,combatGroupDurationMs:500},
    {type:'RESULT',combatClock:SKILL_CHIP_CLOCK,combatAtMs:1000,combatGroup:1,combatGroupDurationMs:0},
    {type:'RAID_QTE_MASH'},
    {type:'BOSS_ULTIMATE',qteCondition:'ANY_FAILURE',targetId:engine.target.id,targetHpAfter:0},
    {type:'RESULT',qteCondition:'ALL_SUCCESS'}
  ].map((e,i)=>({...e,seq:i+1}));
  const playback=new BattleSuitSkillChipPlayback(engine,events,{beforeEvent:async event=>{
    if(event.type==='RAID_QTE_SEQUENCE'){seen.push('QTE_START');await new Promise(resolve=>{release=resolve;});seen.push('QTE_END');return null;}
    if(event.type==='RAID_QTE_MASH'){seen.push('MASH');return null;}
    if(event.qteCondition==='ANY_FAILURE')return null;
    return event;
  }});
  const run=playback.play();await flush();
  assert.equal(playback.holds,1);assert.equal(playback.timeline.paused(),true);
  assert.deepEqual(seen,['TURN','QTE_START']);assert.equal(playback.clock.time,0);
  release();await flush();playback.timeline.pause();playback.pump();await flush();
  assert.deepEqual(seen,['TURN','QTE_START','QTE_END','REGEN']);
  playback.timeline.time(1,true);playback.pump();await flush();await flush();
  assert.equal(await run,true);assert.deepEqual(seen,['TURN','QTE_START','QTE_END','REGEN','RESULT','MASH','RESULT']);
  assert.equal(playback.snapshots.get(engine.target)?.hp,undefined,'a failed conditional branch never changes HP');
});
test('live adapter batches the full server clock and cancel/reset stops the clock',async()=>{
  const [adapter,engine]=await Promise.all([readFile(new URL('../js/battle-v3-live.js',import.meta.url),'utf8'),readFile(new URL('../preview/project-v-v3/source/battle/BattleEngine.js',import.meta.url),'utf8')]);
  assert.match(adapter,/playEvents\(timedEvents, \{ beforeEvent: prepareEvent \}\)/);assert.match(adapter,/durationMs \* 2 \+ 15000/);
  const timed=adapter.slice(adapter.indexOf('if (timedSkillChips && !destroyed)'),adapter.indexOf('const finalState = payload?.battleV2?.result?.final'));
  assert.match(timed,/await stopAccountBattleUnitContinuousFire\(\{ drain: true \}\)/);
  assert.match(engine,/this\.skillChipPlayback\?\.cancel\(\)/);
  assert.match(engine,/currentHp\(target,value\)/);
});
test('simultaneous audio schedules append voices instead of cutting off the other chip',()=>{
  const audio=new SkillChipAudio();let stops=0;audio.stop=()=>{stops++;};
  audio.schedule('missile');audio.schedule('airstrike',0,1,{append:true});
  assert.equal(stops,1);
});

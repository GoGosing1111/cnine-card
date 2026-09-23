import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Container,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {SKILL_CHIP_CLOCK,skillChipByCode,skillChipDamage,splitSkillChipDamage,createSkillChipSchedule} from '../shared/battle-suit-skill-chips.mjs';
import {BattleSuitSkillChipPlayback} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {OctaSeekerFX} from '../preview/battle-suit-octaseeker-v1/source/OctaSeekerFX.js';
import {OctaSeekerAudio} from '../preview/battle-suit-octaseeker-v1/source/OctaSeekerAudio.js';
import {ARRIVAL_ORDER,SEQUENCE} from '../preview/battle-suit-octaseeker-v1/source/sequence.mjs';
const CODE='SKILL_CHIP_OCTA_SEEKER',HELI='SKILL_CHIP_HELICOPTER_AIRSTRIKE',chip=skillChipByCode(CODE);
after(()=>gsap.ticker.sleep());
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const textures=()=>({flight:Array.from({length:24},()=>new Texture({source:Texture.EMPTY.source})),
  impact:Array.from({length:24},()=>new Texture({source:Texture.EMPTY.source})),smoke:Texture.EMPTY,dust:Texture.EMPTY,flash:Texture.EMPTY,cinder:Texture.EMPTY});
function engine(mobile=false){
  const root=new Container();root.position.set(1000,600);
  const target={id:'enemy-1',root,hp:100,serverMaxHp:100,battleActive:true};
  return {mobile,visible:true,playbackEpoch:1,paceScale:1,audio:{enabled:()=>false},target,enemies:[target],
    combatLayer:new Container(),effectLayer:new Container(),stage:new Container(),camera:{base:{x:0,y:0}},
    accountBattleUnit:{muzzlePoint:()=>({x:400,y:500})},combatantById:id=>id===target.id?target:null,
    eventHpPercent:(_target,value)=>value,syncTargetHp:(t,v)=>{t.hp=v},syncTargetShield(){},
    showAccountBattleUnitDamage(){},updateStatus(){},playEvents:async()=>{}};
}
function events(count=8){
  return [{type:'SKILL_CHIP_CAST',combatAtMs:17000},...chip.impactOffsetsMs.slice(0,count).map((at,i)=>({type:'SKILL_CHIP_HIT',combatAtMs:17000+at,hitIndex:i,damage:10,targetHpAfter:count===1?0:90-i*10})),
    {type:'RESULT',combatAtMs:21000}].map((e,i)=>({...e,chipCode:CODE,castId:CODE+':1',targetId:'enemy-1',seq:i+1,combatClock:SKILL_CHIP_CLOCK,combatGroup:i,combatGroupDurationMs:0}));
}
test('approved total is exactly helicopter x2, not per-hit x2, with independent 17s cadence',()=>{
  assert.equal(chip.damageMultiplier,skillChipByCode(HELI).damageMultiplier*2);
  assert.equal(chip.intervalMs,17000);assert.equal(chip.impactOffsetsMs.length,8);
  assert.deepEqual(chip.impactOffsetsMs,SEQUENCE.impacts.map(t=>Math.round(t*1000)));
  for(const base of [0,1,3,101,9999,10000000000]){
    const total=skillChipDamage(base,CODE);assert.equal(total,skillChipDamage(base,HELI)*2);
    assert.equal(splitSkillChipDamage(total,8).reduce((a,b)=>a+b,0),total);
  }
  const schedule=createSkillChipSchedule([CODE,CODE]);
  assert.deepEqual([schedule.take().atMs,schedule.take().atMs,schedule.take().atMs],[17000,34000,51000]);
  assert.equal(createSkillChipSchedule([CODE]).take().activation,1);
});
test('server applies eight fixed-target impacts and conserves x10 total for normal and apocalypse shields',()=>{
  let complete=0,pierce=0;
  for(const apocalypse of [false,true])for(const seed of [1,2011,17]){
    const cards=['HP','DEFENSE','DEFENSE','ATTACK','SPEED'].map((power_type,i)=>({id:`OCTA-${i}`,rarity:'FUR',power_type,power:400000}));
    const input={cards,battleSuit:{code:'BATTLE_SUIT_03',pvePower:300000,weapon:{code:'EQ_1785427638137'},skillChips:[CODE]},
      monster:{id:68,battle_power:10000000,is_boss:1,pve_hp_percent:1200,pve_attack_percent:1,pve_shield_percent:10000,pve_speed_percent:1,...(apocalypse?{pve_difficulty:'APOCALYPSE'}:{})},seed};
    const battle=createPveBattleV2(input),result=battle.result,casts=result.timeline.filter(e=>e.type==='SKILL_CHIP_CAST');
    assert.ok(casts.length>0);assert.equal(battle.teams.A.cards.length,5);
    assert.deepEqual(createPveBattleV2(input).result,result);
    for(const cast of casts){
      assert.equal(cast.combatAtMs,cast.activation*17000);assert.equal(cast.calculatedDamage,cast.baseDamage*10);
      const hits=result.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===cast.castId);
      for(const hit of hits){assert.equal(hit.targetId,cast.targetId);assert.equal(hit.hitCount,8);assert.equal(hit.combatAtMs,cast.combatAtMs+chip.impactOffsetsMs[hit.hitIndex]);if(hit.apocalypsePierce)pierce++;}
      const total=hits.reduce((n,e)=>n+e.damage+e.absorbed,0);assert.ok(total<=cast.calculatedDamage);
      if(hits.length===8&&hits.at(-1).targetHpAfter>0){complete++;assert.equal(total,cast.calculatedDamage);}
      assert.equal(cast.critical,false,'existing non-critical skill-hit policy is unchanged');
    }
    assert.equal(result.damageBreakdown.skillChips,result.timeline.filter(e=>e.type==='SKILL_CHIP_HIT').reduce((n,e)=>n+e.damage+e.absorbed,0));
  }
  assert.ok(complete>0&&pierce>0,JSON.stringify({complete,pierce}));
});
test('live Pixi effects wait for server hits, map arrival indices and preserve fatal collision without retargeting',()=>{
  for(const mobile of [false,true]){
    const e=engine(mobile),fx=new OctaSeekerFX(e,textures(),()=>{},{serverDriven:true});
    try{
      fx.bindTarget(e.target.id);fx.render(1.6);assert.equal(fx.collisionPoints.size,0);assert.ok(fx.blasts.every(b=>!b.first.visible));
      fx.scheduleImpact(0,2);fx.render(1.7);assert.equal(fx.collisionPoints.size,0);
      assert.equal(fx.confirmImpact(0,2),true);fx.render(2.01);assert.equal(fx.collisionPoints.size,1);
      assert.equal(fx.blasts[ARRIVAL_ORDER.indexOf(0)].first.y,600);
      assert.equal(fx.confirmImpact(0,2.1),false,'duplicate presentation cannot move the explosion');
      e.target.hp=0;e.target.battleActive=false;e.target.id='replacement';e.target.root.position.set(1200,700);
      assert.equal(fx.confirmImpact(1,2.1),false);fx.render(2.1);
      assert.equal(fx.rockets.filter(r=>r.body.visible).length,0);assert.equal(fx.collisionPoints.size,1);
      assert.equal(fx.blasts[0].first.y,600);fx.render(4);assert.ok(fx.sprites.every(s=>!s.visible));
    }finally{fx.destroy()}
  }
});
test('real playback dispatches eight confirmed impacts once and cleans up; lethal first hit cancels the remaining seven',async t=>{
  t.mock.method(OctaSeekerFX,'preload',async()=>textures());
  for(const count of [8,1]){
    const e=engine(),p=new BattleSuitSkillChipPlayback(e,events(count)),run=p.play();await flush();p.timeline.pause();
    p.timeline.time(17,true);p.pump();assert.equal(p.fx.size,1);
    const fx=p.fx.values().next().value.fx;assert.equal(fx.serverDriven,true);assert.equal(fx.timeline.paused(),true);
    p.timeline.time(17.34,true);p.pump();assert.equal(fx.diagnostics().activeRockets,8);
    for(let i=0;i<count;i++){p.timeline.time(17+chip.impactOffsetsMs[i]/1000+.002,true);p.pump();assert.equal(p.hits,i+1);}
    assert.equal(fx.collisionPoints.size,count);assert.equal(p.hits,count);
    if(count===1){assert.equal(e.target.hp,0);p.render();assert.equal(fx.diagnostics().activeRockets,0);}
    p.timeline.time(21,true);p.pump();await flush();assert.equal(await run,true);
    assert.equal(e.combatLayer.children.length,0);assert.equal(e.effectLayer.children.length,0);
    assert.equal(p.octaTextures,null);assert.equal(Texture.EMPTY.destroyed,false);
  }
});
test('late octa texture decode cannot attach a stale battle effect after cancellation',async t=>{
  let resolve;t.mock.method(OctaSeekerFX,'preload',()=>new Promise(r=>{resolve=r}));
  const e=engine(),p=new BattleSuitSkillChipPlayback(e,events()),run=p.play();p.cancel();e.playbackEpoch++;
  assert.equal(await run,false);const loaded=textures();resolve(loaded);await flush();
  assert.ok([...loaded.flight,...loaded.impact].every(t=>t.destroyed));assert.equal(e.effectLayer.children.length,0);assert.equal(p.timeline,null);
});
test('shared audio preserves launch/impact phases, shifted server timings and simultaneous legacy sounds',()=>{
  const a=new OctaSeekerAudio();
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){}});
  const node=()=>({gain:param(),pan:param(),playbackRate:param(),connect(t){return t},disconnect(){},start(){},stop(){}});
  a.context={currentTime:10,state:'running',outputLatency:.04,getOutputTimestamp:()=>({contextTime:9.96,performanceTime:performance.now()}),createBufferSource:node,createGain:node,createStereoPanner:node};a.master=node();a.ready=true;
  for(const speed of [.25,.5,1,1.3,2]){
    a.schedule('octaseeker',0,speed,{phase:'launch'});assert.equal(a.sources.size,1);assert.equal(a.syncRecords.length,0);
    for(let i=0;i<8;i++){
      const at=SEQUENCE.impacts[i]+.4;
      a.schedule('octaseeker',0,speed,{append:true,phase:'impact',indices:[i],impactTimes:new Map([[i,at]])});
      assert.equal(a.syncRecords.at(-1).visualImpact,at);assert.ok(Math.abs(a.syncRecords.at(-1).predictedOutputPeakDeltaMs)<1);
    }
    assert.equal(a.sources.size,10);assert.equal(a.syncRecords.length,8);
    a.schedule('airstrike',0,speed,{append:true,phase:'launch'});assert.equal(a.sources.size,11);
    a.stop();assert.equal(a.sources.size,0);
  }
});
test('shipped consumers and lobby loader contain the new approved runtime',async()=>{
  const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
  for(const path of ['preview/project-v-v3/project-v-pixi-battle.bundle.js','pve-v3/battle.bundle.js','preview/scrapyard-v3-v1/battle.bundle.js','preview/cow-room-v3-v1/battle.bundle.js','preview/infinite-tower-v3-v1/battle.bundle.js']){
    const source=await read(path);assert.match(source,/SKILL_CHIP_OCTA_SEEKER/);assert.match(source,/20260924-octaseeker-v1/);
  }
  assert.match(await read('js/app.js'),/octaseeker=20260924/);
  assert.match(await read('js/battle-v3-live.js'),/20260924-octaseeker-v1/);
});

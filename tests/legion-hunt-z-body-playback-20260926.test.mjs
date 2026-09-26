import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {Container,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleSuitSkillChipPlayback} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {ZBodyThunderFX} from '../preview/project-v-v3/source/battle/ZBodyThunderFX.js';
import {SKILL_CHIP_CLOCK} from '../shared/battle-suit-skill-chips.mjs';
import {Z_BODY_AREA_SKILL as SKILL} from '../shared/z-body-area-skill.mjs';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
after(()=>gsap.ticker.sleep());
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

test('hunt visual catch-up cannot accelerate the 15-minute boss clock; ordinary battles retain their speed',async()=>{
  for(const combatClockRate of [undefined,1]){
    const seen=[],engine={visible:true,playbackEpoch:1,paceScale:3,combatClockRate,audio:{enabled:()=>false},combatantById:()=>null,playEvents:async events=>seen.push(...events)};
    const events=[{seq:1,type:'ENEMY_SPAWN',combatGroup:1,combatClock:SKILL_CHIP_CLOCK,combatAtMs:900000,finalBoss:true}];
    const playback=new BattleSuitSkillChipPlayback(engine,events,{sequential:true});
    playback.play();await playback.ready;playback.timeline.pause();
    try{
      assert.equal(playback.rate,combatClockRate??3);assert.equal(playback.timeline.timeScale(),combatClockRate??3);
      playback.timeline.time(899,true);playback.pump();await flush();assert.equal(seen.length,0);
      playback.timeline.time(900,true);playback.pump();await flush();assert.equal(seen.length,1);
    }finally{playback.cancel();}
  }
});

test('Z area contact applies all twelve deaths together without waiting behind its own body lock',async()=>{
  const targets=Array.from({length:12},(_,i)=>({id:`B:${i}:ENCOUNTER:first`,root:new Container(),battleActive:true,hp:100}));
  const sword={intrinsicArea:true,unit:{stopIdle(){}},cancel(){},pose(){}};
  const ticks=new Set(),receipts=[],fades=[],completed=[];
  const engine={visible:true,playbackEpoch:1,paceScale:1,audio:{enabled:()=>false},
    backgroundLayer:new Container(),effectLayer:new Container(),accountBattleUnit:{swordAnimation:sword},accountBattleUnitDamageQueue:[],
    accountBattleUnitFireRun:{active:true},accountBattleUnitDamageEventCount:0,accountBattleUnitDamageTotal:0,
    app:{ticker:{add:fn=>ticks.add(fn),remove:fn=>ticks.delete(fn)}},combatantById:id=>targets.find(t=>t.id===id),
    eventHpPercent:(_t,hp)=>hp,syncTargetHp:(t,hp)=>{t.hp=engine.skillChipPlayback?.currentHp(t,hp)??hp;},syncTargetShield(){},
    showAccountBattleUnitDamage:(_t,r)=>receipts.push(r.damage),updateStatus(){},
    triggerAccountBattleUnitBallisticHit(){},
    applyAccountBattleUnitSwordReceipts:BattleEngine.prototype.applyAccountBattleUnitSwordReceipts,
    queueAccountBattleUnitDamageShot:BattleEngine.prototype.queueAccountBattleUnitDamageShot,
    isAccountBattleUnitDamageEvent:e=>e.type==='TURN',
    playEvents:async([event])=>{
      const target=engine.combatantById(event.targetId);
      if(event.type==='TURN')await engine.queueAccountBattleUnitDamageShot(target,{authoritative:true,authoritativeEvent:event,damage:event.damage,targetHp:event.targetHpAfter,monotonicHp:true});
      if(event.type==='KO')await new Promise(resolve=>fades.push(()=>{target.root.visible=false;resolve();}));
    },
    waitForAccountBattleUnitDamageQueueDrain:async()=>{assert.fail('area hit must not wait for the cast body to release');}};
  engine.battleSuitSkillEffectFactories=new Map([[SKILL.code,{create:(e,event,hits)=>new ZBodyThunderFX(e,{blade:Array(12).fill(Texture.EMPTY),ground:Array(12).fill(Texture.EMPTY)},event,hits)}]]);
  const events=[
    {type:'SKILL_CHIP_CAST',combatAtMs:0,chipCode:SKILL.code,castId:'area',targetId:targets[0].id,targetIds:targets.map(t=>t.id)},
    ...targets.map(target=>({type:'TURN',combatAtMs:100,targetId:target.id,damage:10,targetHpAfter:90})),
    ...targets.flatMap(target=>[
      {type:'SKILL_CHIP_HIT',combatAtMs:1080,chipCode:SKILL.code,castId:'area',targetId:target.id,hitIndex:0,damage:90,targetHpAfter:0},
      {type:'KO',combatAtMs:1080,targetId:target.id}
    ]),{type:'RESULT',combatAtMs:1100}
  ].map((e,i)=>({...e,seq:i+1,combatGroup:i,combatClock:SKILL_CHIP_CLOCK}));
  // Match the server: each contact target's HIT + KO shares its own group.
  for(let i=13;i<events.length-1;i+=2)events[i+1].combatGroup=events[i].combatGroup;
  const playback=engine.skillChipPlayback=new BattleSuitSkillChipPlayback(engine,events,{sequential:true,afterEvent:e=>completed.push(e.seq)});
  const done=playback.play();await playback.ready;playback.timeline.pause();
  try{
    playback.timeline.time(.1,true);playback.pump();await flush();
    assert.equal(engine.accountBattleUnitDamageQueue.length,0);
    assert.ok(targets.every(t=>t.hp===90),'normal receipts land during the cast without queuing a second body motion');
    assert.equal(engine.accountBattleUnitDamageTotal,120);
    playback.timeline.time(1.08,true);playback.pump();await flush();
    assert.equal(playback.hits,0,'launch waits until the collision lane is ready');
    playback.timeline.time(2.16,true);playback.pump();await flush();
    assert.equal(playback.hits,12);assert.ok(targets.every(t=>t.hp===0));
    assert.equal(fades.length,12,'all twelve KO fades start before any previous fade completes');
    const fx=playback.fx.get('area').fx;
    playback.timeline.time(2.5,true);playback.render();
    assert.ok(fx.blades.every(pair=>pair.some(sprite=>sprite.visible)),'all five launched blades finish even when the opening contact kills every target');
    assert.equal(receipts.reduce((sum,n)=>sum+n,0),1200,'normal and area damage are preserved exactly once');
    playback.timeline.time(4.4,true);for(const tick of ticks)tick();
    assert.equal(Boolean(sword.externalCast),false);assert.equal(playback.fx.size,0);
    assert.equal(engine.effectLayer.children.length,0,'FX expire even while generation retirement is pending');
    fades.forEach(release=>release());await flush();playback.pump();await flush();
    assert.equal(await done,true);assert.equal(ticks.size,0);
    assert.deepEqual(completed,events.map(e=>e.seq),'receipts still publish in original server order');
  }finally{playback.cancel();}
});

test('saved Z-BODY without chips generates approved whole-field casts in a 12-enemy hunt',async()=>{
  const f=await legionFixture();
  try{
    const deck=f.getDeck();Object.assign(deck.characterBonus,{battleSuitPve:3000000,pve:4117360});
    Object.assign(deck.characterBonus.equippedBattleSuit,{code:'BATTLE_SUIT_Z_BODY',name:'Z-BODY',skillChips:[]});f.setDeck(deck);
    const response=await f.call('legion-hunt/start',{difficulty:'hard'});assert.equal(response.status,200);
    const timeline=response.body.payload.battleV2.result.timeline,casts=timeline.filter(e=>e.type==='SKILL_CHIP_CAST');
    assert.ok(casts.some(c=>c.targetIds.length>5));
    for(const cast of casts){assert.equal(cast.chipCode,SKILL.code);assert.equal(cast.targeting,'ALL_LIVING_ENEMIES');assert.equal(cast.damageMultiplier,SKILL.damageMultiplier);}
    assert.ok(timeline.some(e=>e.type==='SKILL_CHIP_HIT'&&e.chipCode===SKILL.code&&e.damage>0));
  }finally{await f.close();}
});

test('the saved helicopter chip and Z intrinsic skill cast independently and both target the whole field',async()=>{
  const f=await legionFixture(),helicopter='SKILL_CHIP_HELICOPTER_AIRSTRIKE';
  try{
    const deck=f.getDeck();Object.assign(deck.characterBonus.equippedBattleSuit,{code:'BATTLE_SUIT_Z_BODY',name:'Z-BODY',skillChips:[helicopter]});f.setDeck(deck);
    const response=await f.call('legion-hunt/start',{difficulty:'hard'});assert.equal(response.status,200);
    assert.deepEqual(response.body.payload.equippedBattleSuit.skillChips,[helicopter],'latest saved chip loadout survives the account adapter');
    const events=response.body.payload.battleV2.result.timeline;
    for(const code of [helicopter,SKILL.code]){
      const casts=events.filter(e=>e.type==='SKILL_CHIP_CAST'&&e.chipCode===code);
      assert.ok(casts.length>0);assert.equal(casts[0].combatAtMs,15000);
      assert.equal(casts[0].targeting,'ALL_LIVING_ENEMIES');assert.ok(casts[0].targetIds.length>5);
      for(const cast of casts){
        assert.equal(cast.calculatedDamage,cast.targets.reduce((n,t)=>n+t.calculatedDamage,0));
        for(const target of cast.targets)assert.equal(target.calculatedDamage,Math.round(target.baseDamage*5));
      }
      const hits=events.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===casts[0].castId);
      assert.ok(new Set(hits.map(h=>h.targetId)).size>5,'front and rear enemies receive independent server receipts');
      assert.ok(hits.every(h=>h.damageSource===(code===helicopter?'BATTLE_SUIT_SKILL_CHIP':'BATTLE_SUIT_INTRINSIC_SKILL')));
    }
  }finally{await f.close();}
});

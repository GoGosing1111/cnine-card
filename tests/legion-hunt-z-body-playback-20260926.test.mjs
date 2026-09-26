import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {Container,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleSuitSkillChipPlayback} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {ZBodyThunderFX} from '../preview/project-v-v3/source/battle/ZBodyThunderFX.js';
import {SKILL_CHIP_CLOCK} from '../shared/battle-suit-skill-chips.mjs';
import {Z_BODY_AREA_SKILL as SKILL} from '../shared/z-body-area-skill.mjs';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
after(()=>gsap.ticker.sleep());
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

test('continuous Z cast starts its body clock before queued normal hits can block the first area impact',async()=>{
  const target={id:'B:0:ENCOUNTER:first',root:new Container(),battleActive:true,hp:100};
  const sword={unit:{stopIdle(){}},cancel(){},pose(){}};
  const ticks=new Set(),receipts=[];let drain;
  const engine={visible:true,playbackEpoch:1,paceScale:1,audio:{enabled:()=>false},
    backgroundLayer:new Container(),effectLayer:new Container(),accountBattleUnit:{swordAnimation:sword},accountBattleUnitDamageQueue:[],
    app:{ticker:{add:fn=>ticks.add(fn),remove:fn=>ticks.delete(fn)}},combatantById:id=>id===target.id?target:null,
    eventHpPercent:(_t,hp)=>hp,syncTargetHp:(t,hp)=>{t.hp=hp;},syncTargetShield(){},
    showAccountBattleUnitDamage:(_t,r)=>receipts.push(r.damage),updateStatus(){},
    isAccountBattleUnitDamageEvent:e=>e.type==='TURN',
    playEvents:async events=>{if(events[0].type==='TURN')engine.accountBattleUnitDamageQueue.push(events[0]);},
    waitForAccountBattleUnitDamageQueueDrain:()=>new Promise(resolve=>{drain=()=>{engine.accountBattleUnitDamageQueue=[];resolve(true);};})};
  engine.battleSuitSkillEffectFactories=new Map([[SKILL.code,{create:(e,event,hits)=>new ZBodyThunderFX(e,{blade:Array(12).fill(Texture.EMPTY),ground:Array(12).fill(Texture.EMPTY)},event,hits)}]]);
  const events=[
    {type:'SKILL_CHIP_CAST',combatAtMs:0,chipCode:SKILL.code,castId:'area',targetId:target.id,targetIds:[target.id]},
    {type:'TURN',combatAtMs:100,targetId:target.id,damage:10,targetHpAfter:90},
    {type:'SKILL_CHIP_HIT',combatAtMs:1080,chipCode:SKILL.code,castId:'area',targetId:target.id,hitIndex:0,damage:90,targetHpAfter:0},
    {type:'KO',combatAtMs:1080,targetId:target.id},{type:'RESULT',combatAtMs:1100}
  ].map((e,i)=>({...e,seq:i+1,combatGroup:i,combatClock:SKILL_CHIP_CLOCK}));
  const playback=new BattleSuitSkillChipPlayback(engine,events,{sequential:true});
  const done=playback.play();await playback.ready;playback.timeline.pause();
  try{
    playback.timeline.time(.1,true);playback.pump();await flush();
    playback.timeline.time(1.08,true);playback.pump();await flush();
    assert.equal(playback.waiting,true,'confirmed killing area hit waits for earlier normal hit');
    playback.timeline.time(3,true);for(const tick of ticks)tick();
    assert.equal(Boolean(sword.externalCast),false,'cast must release the body even while event dispatch is waiting');
    assert.equal(target.hp,100,'no area receipt is applied early');
    drain();await flush();playback.timeline?.pause();
    playback.timeline.time(6,true);playback.pump();await flush();
    assert.equal(await done,true);assert.deepEqual(receipts,[90]);assert.equal(target.hp,0);
    assert.equal(engine.effectLayer.children.length,0);assert.equal(ticks.size,0);
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

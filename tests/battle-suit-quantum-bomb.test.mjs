import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {Container, Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {buildBattleSuitFighter,buildFighter,buildMonsterFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {CHIP,SEQUENCE} from '../preview/battle-suit-quantum-bomb-v1/sequence.mjs';
import {QuantumBombFX} from '../preview/battle-suit-quantum-bomb-v1/QuantumBombFX.js';
import {BattleSuitSkillChipPlayback} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {BOMBARDMENT_CHIPS,SKILL_CHIP_CLOCK,createSkillChipSchedule,skillChipByCode} from '../shared/battle-suit-skill-chips.mjs';
after(()=>gsap.ticker.sleep());

test('old combat snapshots schedule only the first of helicopter airstrike and quantum bomb',()=>{
  const rocket='SKILL_CHIP_ROCKET_LAUNCHER', octa='SKILL_CHIP_OCTA_SEEKER';
  for(const [first,second] of [BOMBARDMENT_CHIPS,[...BOMBARDMENT_CHIPS].reverse()]){
    const fighter=buildBattleSuitFighter({code:'BATTLE_SUIT_01',pvePower:300000,skillChips:[first,rocket,second,octa]});
    assert.deepEqual(fighter.skillChips,[first,rocket,octa]);
    const schedule=createSkillChipSchedule([first,rocket,second,octa]);
    const fired=new Set(Array.from({length:40},()=>schedule.take().chip.code));
    assert.deepEqual(fired,new Set([first,rocket,octa]));
  }
});

test('the opening bomb hits each living enemy once at 900 ms, with the full per-target coefficient',()=>{
  assert.equal(CHIP.damageMultiplier,5*skillChipByCode(BOMBARDMENT_CHIPS[0]).damageMultiplier);
  const ally=buildFighter({id:'ALLY',power:400000,power_type:'HP'},0,'A',null,'PVE');
  const suit=buildBattleSuitFighter({code:'BATTLE_SUIT_03',pvePower:300000,skillChips:[CHIP.code]});
  const enemies=Array.from({length:4},(_,i)=>({...buildMonsterFighter({id:i+1,battle_power:300000}),
    id:'B:'+i,slot:i,row:i<2?'FRONT':'BACK',hp:1e10,maxHp:1e10,attack:1,alive:i!==3}));
  const result=simulateBattleV2Preview({teamA:[ally,suit],teamB:enemies,maxActions:90,seed:2011});
  const casts=result.timeline.filter(e=>e.type==='SKILL_CHIP_CAST'&&e.chipCode===CHIP.code);
  const opening=casts[0];
  assert.equal(opening.combatAtMs,0);assert.deepEqual(opening.targetIds.toSorted(),['B:0','B:1','B:2']);
  const hits=result.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===opening.castId);
  assert.deepEqual(hits.map(e=>e.targetId).toSorted(),opening.targetIds.toSorted());
  for(const hit of hits){
    assert.equal(hit.hitCount,1);assert.equal(hit.hitIndex,0);assert.equal(hit.combatAtMs,900);
    assert.equal(hit.damage+hit.absorbed,Math.round(hit.baseDamage*25));
  }
  assert.ok(hits.some(e=>e.damage+e.absorbed>0));
  const schedule=createSkillChipSchedule([CHIP.code,CHIP.code]);
  assert.deepEqual([schedule.take().atMs,schedule.take().atMs,schedule.take().atMs],[0,30000,60000]);
});

const frames=n=>Array.from({length:n},()=>new Texture({source:Texture.EMPTY.source}));
const textures=()=>({flight:frames(8),impact:frames(24),flash:Texture.EMPTY,dust:Texture.EMPTY,smoke:Texture.EMPTY,cinder:Texture.EMPTY,exhaust:Texture.EMPTY});
function engine(){
  const enemies=[['a',800,480],['b',1040,560]].map(([id,x,y])=>{
    const root=new Container();root.position.set(x,y);return {id,root,battleActive:true};
  });
  return {enemies,combatLayer:new Container(),effectLayer:new Container(),visible:true,playbackEpoch:1,paceScale:1,
    audio:{enabled:()=>false},combatantById:id=>enemies.find(a=>a.id===id),
    eventHpPercent:(_target,hp)=>hp,syncTargetHp:(target,hp)=>{target.hp=hp;},syncTargetShield(){},
    showAccountBattleUnitDamage(){},updateStatus(){},playEvents:async()=>{}};
}
test('straight drop stays on the cast footprint and multiple receipts share one explosion',async t=>{
  const loaded=textures();t.mock.method(QuantumBombFX,'preload',async()=>loaded);
  const e=engine(),base={chipCode:CHIP.code,castId:'bomb:1',combatClock:SKILL_CHIP_CLOCK,combatGroupDurationMs:0};
  const cast={...base,type:'SKILL_CHIP_CAST',targetId:'a',targetIds:['a','b'],combatAtMs:0,seq:1,combatGroup:0};
  const hits=e.enemies.map(({id},i)=>({...base,type:'SKILL_CHIP_HIT',targetId:id,combatAtMs:900,seq:i+2,
    combatGroup:i+1,hitIndex:0,damage:40,targetHpAfter:60,targetMaxHp:100}));
  const p=new BattleSuitSkillChipPlayback(e,[cast,...hits]),done=p.play();
  try{
    await p.ready;p.timeline.pause();
    const fx=p.fx.get(cast.castId).fx;assert.equal(fx.timeline,undefined);
    const ys=[];
    for(const at of [.35,.52,.70,.82]){
      p.timeline.time(at,true);p.pump();
      assert.equal(fx.capsule.visible,true);assert.equal(fx.capsule.x,920);ys.push(fx.capsule.y);
      assert.equal(fx.cloud.visible,false);assert.equal(p.hits,0);
    }
    assert.deepEqual(ys,ys.toSorted((a,b)=>a-b));
    e.enemies[0].root.x=1400;
    for(const at of [.9,.94,1.1]){p.timeline.time(at,true);p.pump();}
    assert.equal(p.hits,2);assert.equal(fx.capsule.visible,false);assert.equal(fx.cloud.visible,true);
    assert.equal(fx.cloud.x,920);assert.equal(fx.cloud.y,520);
    assert.equal(e.effectLayer.children.length,1);assert.ok(e.enemies.every(a=>a.hp===60));
    assert.equal(fx.confirmImpact(0,1.6,hits[1]),false);
    p.timeline.time(SEQUENCE.duration+.2,true);p.pump();
    assert.equal(await done,true);assert.equal(e.effectLayer.children.length,0);assert.equal(e.combatLayer.children.length,0);
    assert.ok([...loaded.impact,...loaded.flight].every(frame=>frame.destroyed));
  }finally{p.cancel();}
});

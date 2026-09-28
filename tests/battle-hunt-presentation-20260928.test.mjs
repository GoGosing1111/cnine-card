import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Container,Sprite,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleAnimation} from '../preview/project-v-v3/source/battle/BattleAnimation.js';
import {BattleSuitSkillChipPlayback} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {SKILL_CHIP_CLOCK} from '../shared/battle-suit-skill-chips.mjs';
after(()=>gsap.ticker.sleep());
const flush=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
function wave(events){
 const calls=[],releases=[],notified=[];
 const engine={visible:true,playbackEpoch:1,combatClockRate:1,parallelEncounterTransitions:true,continuousAreaPlayback:true,audio:{enabled:()=>false},
  combatantById:()=>null,app:{ticker:{add(){},remove(){}}},playEvents:async([e])=>{calls.push(e.type+':'+e.targetId);if(e.type!=='RESULT')await new Promise(resolve=>releases.push(resolve));}};
 const rows=events.map((e,i)=>({...e,seq:i+1,combatClock:SKILL_CHIP_CLOCK,combatAtMs:e.combatAtMs||0,combatGroup:e.combatGroup||0}));
 const playback=new BattleSuitSkillChipPlayback(engine,rows,{sequential:true,afterEvent:e=>notified.push(e.seq)});
 return {playback,calls,releases,notified,rows};
}
test('twelve same-time hunt reinforcements enter together, without a twelve-animation queue',async()=>{
 const h=wave([...Array.from({length:12},(_,i)=>({type:'ENEMY_SPAWN',targetId:'new-'+i})),{type:'RESULT',combatGroup:1}]);
 h.playback.play();await h.playback.ready;h.playback.timeline.pause();
 try{
  await flush();assert.equal(h.calls.length,12,'all slots enter within the same arrival window');
  assert.ok(h.calls.every(c=>c.startsWith('ENEMY_SPAWN:')),'result waits for arrivals');
  h.releases.forEach(resolve=>resolve());await flush();assert.equal(h.calls.at(-1),'RESULT:undefined');
  assert.deepEqual(h.notified,h.rows.map(e=>e.seq));
 }finally{h.playback.cancel();h.releases.forEach(resolve=>resolve());}
});
test('final boss waits for all minion retirements, then appears once before subsequent damage',async()=>{
 const h=wave([...Array.from({length:12},(_,i)=>({type:'ENEMY_DESPAWN',targetId:'old-'+i})),
  {type:'ENEMY_SPAWN',targetId:'FINAL',boss:true},{type:'TURN',targetId:'FINAL',combatGroup:1,combatAtMs:1}]);
 h.playback.play();await h.playback.ready;h.playback.timeline.pause();
 try{
  await flush();assert.equal(h.calls.length,12);assert.ok(h.calls.every(c=>c.startsWith('ENEMY_DESPAWN:')));
  h.releases.slice(0,11).forEach(resolve=>resolve());await flush();assert.equal(h.calls.length,12);
  h.releases[11]();await flush();assert.equal(h.calls.at(-1),'ENEMY_SPAWN:FINAL');
  h.playback.timeline.time(.1,true);h.playback.pump();await flush();assert.equal(h.calls.length,13,'damage cannot overtake arrival');
  h.releases[12]();await flush();assert.equal(h.calls.at(-1),'TURN:FINAL');
 }finally{h.playback.cancel();h.releases.forEach(resolve=>resolve());}
});
test('result rendering holds the finished corpse pose while stopping all actor loops',()=>{
 const source=fs.readFileSync('preview/project-v-v3/source/battle/BattleEngine.js','utf8');
 const methods=Function('CHARACTER_STATE','return ({'+source.slice(source.indexOf('  stopPresentation(){'),source.indexOf('  async setVisible(next){')).replace('  completePlayback(){',',completePlayback(){')+'});')({DEAD:'DEAD'});
 const actor=()=>{
  const view=new Container(),main=new Sprite(Texture.EMPTY);view.addChild(main);
  const c={view,mainSprite:main,fullSpriteMode:true,team:'ENEMY',hp:0,state:'DEAD',neutralAvatarPose:{x:0,y:0,rotation:0,mainSprite:{x:0,y:0,scaleX:1,scaleY:1}},restoreNeutralAvatarPose(){view.position.set(0,0);view.rotation=0;view.alpha=1;main.scale.set(1);}};
  c.animationAdapter=c.animationController=new BattleAnimation(c);c.animationAdapter.setState('DEAD');return c;
 };
 const dead=actor(),alive=actor();alive.hp=100;alive.state='IDLE';alive.animationAdapter.setState('IDLE');
 let renders=0,stops=0;const engine={...methods,characters:[dead,alive],cancelTimelines(){},app:{stop(){stops++;},render(){renders++;}}};
 try{
  engine.completePlayback();
  assert.ok(dead.view.rotation>1,'dead actor must be lying down, not frozen at the upright first frame');
  assert.ok(dead.view.alpha<=.31);assert.equal(dead.hp,0);assert.equal(dead.state,'DEAD');
  const rotation=dead.view.rotation;engine.completePlayback();assert.equal(dead.view.rotation,rotation);
  assert.equal(renders,2);assert.equal(stops,2);assert.equal(engine.visible,false);assert.equal(engine.requestedVisible,false);
  assert.equal(dead.animationAdapter.timeline.isActive(),false);assert.equal(alive.animationAdapter.timeline.isActive(),false);
 }finally{dead.animationAdapter.kill();alive.animationAdapter.kill();}
});

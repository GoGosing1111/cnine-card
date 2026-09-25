import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Container,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {ZBodyThunderFX,thunderFrame} from '../preview/z-body-thunder-v3/source/ZBodyThunderFX.js';
import {BattleSuitSkillChipPlayback} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {Z_BODY_AREA_SKILL as SKILL} from '../shared/z-body-area-skill.mjs';
import {takeSwordBatch} from '../preview/project-v-v3/source/battle/ZBodySwordModel.mjs';
import assets from '../preview/z-body-thunder-v3/assets.json' with {type:'json'};
import fixtures from '../preview/z-body-thunder-v3/fixtures.json' with {type:'json'};
after(()=>gsap.ticker.sleep());
const mockTextures=()=>({blade:Array(12).fill(Texture.EMPTY),ground:Array(12).fill(Texture.EMPTY)});
function rig(){
  const targets=fixtures.multi.battleV2.teams.B.cards.map((row,i)=>{
    const root=new Container();root.position.set(900+i*100,400+i*40);
    return {id:row.id,root,battleActive:true,hp:100,shield:10};
  });
  const ticks=new Set(),labels=[];
  const sword={unit:{stopIdle(){}},cancel(){},pose(frame){this.frame=frame;}};
  const engine={visible:true,playbackEpoch:1,paceScale:1,audio:{enabled:()=>false},
    backgroundLayer:new Container(),effectLayer:new Container(),combatLayer:new Container(),
    app:{ticker:{add:fn=>ticks.add(fn),remove:fn=>ticks.delete(fn)}},accountBattleUnit:{swordAnimation:sword},
    combatantById:id=>targets.find(t=>t.id===id),eventHpPercent:(_t,hp)=>hp,
    syncTargetHp:(t,hp)=>{t.hp=hp;},syncTargetShield:(t,value)=>{t.shield=value;},
    showAccountBattleUnitDamage:(target,options)=>labels.push({id:target.id,...options}),updateStatus(){},playEvents:async()=>{}};
  engine.battleSuitSkillEffectFactories=new Map([[SKILL.code,{create:(e,event,hits)=>new ZBodyThunderFX(e,mockTextures(),event,hits)}]]);
  return {engine,targets,ticks,labels,sword};
}
test('24 frames have preserved generated sources, real alpha, unique pixels and transparent cell gutters',async()=>{
  for(const [key,spec] of Object.entries(assets.atlases)){
    const data=await readFile(new URL('..'+spec.url,import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'),spec.sha256);
    const raw=await sharp(data).raw().toBuffer({resolveWithObject:true});
    assert.equal(raw.info.channels,4);assert.equal(raw.info.width,4*spec.frameWidth);
    assert.equal(new Set(spec.frames.map(f=>f.sha256)).size,12);
    const source=await readFile(new URL('../preview/z-body-thunder-v3/'+spec.source.file,import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'),spec.source.sha256);
    let transparent=0,opaque=0;
    for(let y=0;y<raw.info.height;y++)for(let x=0;x<raw.info.width;x++){
      const alpha=raw.data[(y*raw.info.width+x)*4+3];
      if(!alpha)transparent++;if(alpha>240)opaque++;
      if(x%spec.frameWidth===0||y%spec.frameHeight===0)assert.equal(alpha,0,key+' cell gutter');
    }
    assert.ok(transparent>raw.info.width*raw.info.height*.4);assert.ok(opaque>1000);
  }
});
test('contact uses authored frame five / four and every frame is independently sampled',()=>{
  assert.equal(thunderFrame('blade',299).index,3);assert.equal(thunderFrame('blade',300).index,4);
  assert.equal(thunderFrame('ground',339).index,2);assert.equal(thunderFrame('ground',340).index,3);
  assert.equal(thunderFrame('blade',-1),null);assert.equal(thunderFrame('blade',9999),null);
});
test('actual shared GSAP playback conserves all 25 receipts and clears body lock and effect layers',async()=>{
  const r=rig(),p=new BattleSuitSkillChipPlayback(r.engine,fixtures.multi.review.castEvents),done=p.play();
  await p.ready;p.timeline.pause();
  p.clock.time=0;p.pump();assert.equal(r.sword.externalCast,p.fx.values().next().value.fx);
  for(const ms of SKILL.impactOffsetsMs){p.timeline.time(ms/1000,true);p.pump();}
  assert.equal(p.hits,25);
  assert.equal(r.labels.length,25);
  assert.equal(r.labels.reduce((s,l)=>s+l.damage,0),fixtures.multi.review.expectedDamage);
  assert.equal(new Set(r.labels.map(l=>l.id)).size,5);
  p.timeline.time(3.3,true);p.pump();await done;
  assert.equal(r.ticks.size,0);assert.equal(r.sword.externalCast,null);assert.equal(r.sword.frame,'01');
  assert.equal(r.engine.backgroundLayer.children.length,0);assert.equal(r.engine.effectLayer.children.length,0);
});
test('pause and rate changes follow one clock; cancel and slot reuse never confirm a new collision',async()=>{
  const r=rig();let paused=false;
  const p=new BattleSuitSkillChipPlayback(r.engine,fixtures.multi.review.castEvents,{isPaused:()=>paused});
  const done=p.play();await p.ready;p.timeline.pause();p.pump();
  const fx=p.fx.values().next().value.fx;
  paused=true;p.syncPause();assert.equal(p.timeline.paused(),true);
  r.engine.paceScale=2;paused=false;p.syncPause();p.pump();assert.equal(p.timeline.timeScale(),2);
  p.timeline.pause();
  const target=r.targets[0],id=target.id;target.id='replacement';
  assert.equal(fx.confirmImpact(0,1.08,{targetId:id}),false);
  fx.render(2);assert.equal(fx.confirmed.size,0);
  p.cancel();assert.equal(await done,false);
  assert.equal(r.labels.length,0);assert.equal(r.sword.externalCast,null);assert.equal(r.ticks.size,0);
});
test('ordinary Z receipts use only dash while an intrinsic area skill is installed',()=>{
  const t={id:'target'},entries=[{target:t,options:{damage:12}},{target:t,options:{damage:34}}];
  assert.equal(takeSwordBatch([...entries],1,true).mode,'dash');
  assert.equal(takeSwordBatch([...entries],1).mode,'area','old comparison presentation is still available');
});

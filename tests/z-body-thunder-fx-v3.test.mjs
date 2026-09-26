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
  assert.ok(thunderFrame('blade',1509).alpha<.001,'the last frame fades before removal');
  assert.ok(thunderFrame('ground',1899).alpha<.001);
});

test('a delayed Z collision keeps anticipation hidden until ready, then plays through contact and every tail',async()=>{
  const r=rig(),cast=fixtures.multi.review.castEvents.find(e=>e.type==='SKILL_CHIP_CAST');
  const hit=fixtures.multi.review.castEvents.find(e=>e.type==='SKILL_CHIP_HIT');
  let release;
  r.engine.playEvents=async()=>new Promise(resolve=>{release=resolve;});
  const rows=[{...cast,combatAtMs:0},{type:'KO',combatAtMs:100,combatClock:cast.combatClock,combatGroupDurationMs:100},
    {...hit,combatAtMs:1080}].map((e,i)=>({...e,seq:i+1,combatGroup:i}));
  const p=new BattleSuitSkillChipPlayback(r.engine,rows,{sequential:true});p.play();await p.ready;p.timeline.pause();
  const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
  try{
    p.timeline.time(.1,true);p.pump();await flush();
    p.timeline.time(8,true);p.pump();p.render();
    const fx=p.fx.get(cast.castId).fx;
    assert.equal(p.hits,0);assert.ok([...fx.field,...fx.blades.flat()].every(s=>!s.visible),'no fixed intermediate frame during the preceding action');
    release();await flush();p.pump();
    p.timeline.time(8.85,true);p.pump();assert.ok(fx.blades[0].some(s=>s.visible));assert.equal(p.hits,0);
    p.timeline.time(9.08,true);p.pump();assert.equal(p.hits,1);assert.equal(fx.confirmed.get(0),1.08);
    const positions=fx.points.map(p=>({...p}));r.targets.forEach(t=>{t.root.visible=false;t.id+=':replacement';t.root.x+=500;});
    const seen=Array.from({length:5},()=>new Set());
    for(let ms=9100;ms<12000;ms+=10){p.timeline.time(ms/1000,true);p.render();if(fx.destroyed)break;fx.diagnostics().bladeFrames.forEach((f,i)=>{if(f!==null)seen[i].add(f);});}
    assert.ok(seen.every(frames=>frames.has(11)),'all five blades reach the authored final frame');
    assert.deepEqual(fx.points,positions);assert.equal(r.labels.length,1,'cosmetic follow-through never creates receipts');
    assert.equal(fx.destroyed,true);assert.equal(r.sword.externalCast,null);
  }finally{p.cancel();}
});
test('actual shared GSAP playback conserves all 25 receipts and clears body lock and effect layers',async()=>{
  const r=rig(),p=new BattleSuitSkillChipPlayback(r.engine,fixtures.multi.review.castEvents),done=p.play();
  await p.ready;p.timeline.pause();
  p.clock.time=0;p.pump();assert.equal(r.sword.externalCast,p.fx.values().next().value.fx);
  for(let ms=10;ms<=5000&&p.active;ms+=10){p.timeline.time(ms/1000,true);p.pump();}
  assert.equal(p.hits,25);
  assert.equal(r.labels.length,25);
  assert.equal(r.labels.reduce((s,l)=>s+l.damage,0),fixtures.multi.review.expectedDamage);
  assert.equal(new Set(r.labels.map(l=>l.id)).size,5);
  await done;
  assert.equal(r.ticks.size,0);assert.equal(r.sword.externalCast,null);assert.equal(r.sword.frame,'01');
  assert.equal(r.engine.backgroundLayer.children.length,0);assert.equal(r.engine.effectLayer.children.length,0);
});

test('a Z cast whose targets are finished by helicopter still completes its visuals without damage',async()=>{
  const r=rig(),cast=fixtures.multi.review.castEvents.find(e=>e.type==='SKILL_CHIP_CAST');
  const p=new BattleSuitSkillChipPlayback(r.engine,[{...cast,combatAtMs:0}],{sequential:true}),done=p.play();
  await p.ready;p.timeline.pause();
  try{
    const fx=p.fx.get(cast.castId).fx;
    p.timeline.time(1.6,true);p.pump();assert.ok(fx.blades.every(pair=>pair.some(s=>s.visible)));
    assert.equal(r.labels.length,0);assert.equal(p.hits,0);
    p.timeline.time(3.3,true);p.pump();assert.equal(await done,true);assert.equal(r.sword.externalCast,null);
  }finally{p.cancel();}
});

test('helicopter may start first without skipping or freezing Z body preparation',()=>{
  const r=rig(),rows=fixtures.multi.review.castEvents,cast=rows.find(e=>e.type==='SKILL_CHIP_CAST');
  const fx=new ZBodyThunderFX(r.engine,mockTextures(),cast,rows.filter(e=>e.type==='SKILL_CHIP_HIT'));
  try{
    fx.render(5);assert.equal(r.sword.frame,'01');assert.equal(r.sword.timeMs,0);
    const lead=fx.impactLeadSeconds(0);fx.scheduleImpact(0,5+lead);
    fx.render(5.1);assert.ok(Math.abs(r.sword.timeMs-100)<.001,'body starts at the first pose after readiness');
    assert.ok(fx.blades.every(pair=>pair.every(s=>!s.visible)));
    fx.render(5+lead-.1);assert.ok(fx.blades[0].some(s=>s.visible));
    assert.equal(fx.confirmed.size,0);
  }finally{fx.destroy();}
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

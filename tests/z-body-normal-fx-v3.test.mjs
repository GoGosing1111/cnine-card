import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {ZBodySwordAnimation} from '../preview/project-v-v3/source/battle/ZBodySwordAnimation.js';
import {ZBodyNormalFX,normalFrame} from '../preview/z-body-thunder-v3/source/ZBodyNormalFX.js';
import {takeSwordBatch} from '../preview/project-v-v3/source/battle/ZBodySwordModel.mjs';
import assets from '../preview/z-body-thunder-v3/normal-assets.json' with {type:'json'};
after(()=>gsap.ticker.sleep());
const sha=b=>createHash('sha256').update(b).digest('hex');
function rig(){
  const engine=Object.create(BattleEngine.prototype),ticks=new Set();
  Object.assign(engine,{backgroundLayer:new Container(),effectLayer:new Container(),simpleTimelines:new Set(),pendingTails:new Map(),visible:true,playbackEpoch:1,paceScale:1,
    app:{ticker:{add:f=>ticks.add(f),remove:f=>ticks.delete(f)}}});
  const root=new Container();root.position.set(100,600);root.baseX=100;root.baseY=600;root.scale.set(.5);
  const unit={root,bodySprite:new Sprite(),weaponSprite:new Sprite(),nameHud:new Container(),view:new Container(),stopIdle(){}};
  const textures=Object.fromEntries([['attack',16],['cast',12],['blade',8],['ground',9],['dashwake',12],['dashcut',8]].map(([key,n])=>[key,Array.from({length:n},()=>new Texture({source:Texture.WHITE.source,frame:new Rectangle(0,0,1,1)}))]));
  const fxTextures=Object.fromEntries(['wake','slash','impact','surge'].map(key=>[key,Array.from({length:12},()=>new Texture({source:Texture.WHITE.source,frame:new Rectangle(0,0,1,1)}))]));
  for(const [key,frames] of Object.entries(fxTextures))textures['normal'+key]=frames;
  for(const key of ['blade','ground'])textures['thunder'+key]=Array.from({length:12},()=>new Texture({source:Texture.WHITE.source,frame:new Rectangle(0,0,1,1)}));
  const sword=new ZBodySwordAnimation(engine,unit,textures);
  const target={id:'enemy-1',root:new Container()};target.root.position.set(900,500);target.root.baseX=900;target.root.baseY=500;
  return {engine,unit,sword,target,ticks,fxTextures,close(){sword.destroy();assert.equal(engine.battleSuitSkillEffectFactories.size,0);}};
}
test('48 normal frames preserve generated alpha, original hashes and non-bleeding atlas cells',async()=>{
  for(const spec of Object.values(assets.atlases)){
    const data=await readFile(new URL('..'+spec.url,import.meta.url)),meta=await sharp(data).metadata();
    assert.equal(sha(data),spec.sha256);assert.equal(meta.width,2048);assert.equal(meta.height,1536);assert.ok(meta.hasAlpha);
    assert.equal(sha(await readFile(new URL('../preview/z-body-thunder-v3/'+spec.source.file,import.meta.url))),spec.source.sha256);
    const hashes=[];
    for(let i=0;i<12;i++){
      const raw=await sharp(data).extract({left:i%4*512,top:Math.floor(i/4)*512,width:512,height:512}).raw().toBuffer();
      let visible=0,partial=0;
      for(let y=0;y<512;y++)for(let x=0;x<512;x++){
        const a=raw[(y*512+x)*4+3];if(a)visible++;if(a>0&&a<255)partial++;
        if(x<3||x>=509||y<3||y>=509)assert.equal(a,0);
      }
      assert.ok(visible>100);assert.ok(partial>100);hashes.push(sha(raw));
    }
    assert.equal(new Set(hashes).size,12);
  }
});
test('authored slash peak and impact peak coincide with the unchanged 245 ms receipt',async()=>{
  assert.equal(normalFrame('slash',244).index,3);assert.equal(normalFrame('slash',245).index,4);
  assert.equal(normalFrame('impact',244).index,1);assert.equal(normalFrame('impact',245).index,2);
  const r=rig(),hits=[],rows=[{target:r.target,options:{damage:123}},{target:r.target,options:{damage:456}}];
  try{
    assert.ok(r.sword.dashFX instanceof ZBodyNormalFX);assert.equal(r.sword.intrinsicArea,true);assert.equal(r.engine.battleSuitSkillEffectFactories.size,1);
    const done=r.sword.play(takeSwordBatch([...rows],1,true),e=>hits.push(...e)),tl=r.sword.timeline;tl.pause();
    tl.totalTime(.13);assert.ok(r.sword.dashFX.pairs.wake[0].visible);assert.equal(r.sword.dashFX.pairs.slash[0].visible,false);
    assert.ok(r.sword.dashFX.pairs.surge[0].visible);assert.equal(r.sword.dashFX.ghosts.length,5);
    tl.totalTime(.244);assert.equal(hits.length,0);tl.totalTime(.245);assert.deepEqual(hits,rows);
    assert.equal(r.sword.dashFX.pairs.slash[0].texture,r.fxTextures.slash[4]);assert.equal(r.sword.dashFX.pairs.impact[0].texture,r.fxTextures.impact[2]);
    assert.equal(r.unit.bodySprite.scale.x,r.unit.bodySprite.scale.y);
    tl.totalTime(.64);assert.equal(await done,true);assert.equal(r.sword.dashFX.front.visible,false);
    assert.equal(r.engine.simpleTimelines.size,0);assert.equal(r.ticks.size,0);assert.equal(r.unit.root.x,100);
  }finally{r.close();}
});
test('pause, slow/fast playback and cancellation retain the shared clock with no late damage',async()=>{
  const r=rig(),hits=[];
  try{
    const done=r.sword.play(takeSwordBatch([{target:r.target,options:{damage:123}}],0,true),e=>hits.push(...e)),tl=r.sword.timeline;
    tl.pause().totalTime(.13);r.engine.accountBattleUnitIsPaused=()=>true;
    for(const pace of [.25,2]){r.engine.paceScale=pace;for(const tick of r.ticks)tick();assert.equal(tl.timeScale(),pace);assert.ok(tl.paused());assert.equal(r.sword.dashFX.lastMs,130);}
    r.sword.cancel();assert.equal(await done,false);assert.equal(hits.length,0);assert.equal(r.ticks.size,0);assert.equal(r.engine.simpleTimelines.size,0);assert.equal(r.sword.dashFX.back.visible,false);
  }finally{r.close();}
});
test('reused enemy slots and a replaced session cannot receive the old basic hit',async()=>{
  for(const invalidate of [r=>r.target.id='new-enemy',r=>r.target.root.visible=false,r=>r.engine.playbackEpoch++]){
    const r=rig(),hits=[];
    try{
      const done=r.sword.play(takeSwordBatch([{target:r.target,options:{damage:3}}],0,true),e=>hits.push(...e)),tl=r.sword.timeline;
      tl.pause();invalidate(r);tl.totalTime(.64);await done;assert.equal(hits.length,0);
    }finally{r.close();}
  }
});

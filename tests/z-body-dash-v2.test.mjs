import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {Z_SWORD,takeSwordBatch,swordPose,swordContactStop} from '../preview/project-v-v3/source/battle/ZBodySwordModel.mjs';
import {DASH_V2_SEQUENCE,fastDashBatch} from '../preview/project-v-v3/source/battle/ZBodyDashProfile.mjs';
import assets from '../assets/ui/project-v/account-battle-suits/z-dash-v2/manifest.json' with {type:'json'};
import {ZBodySwordAnimation} from '../preview/project-v-v3/source/battle/ZBodySwordAnimation.js';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const sha=data=>createHash('sha256').update(data).digest('hex');
function rig(){
  const engine=Object.create(BattleEngine.prototype),ticks=new Set();
  Object.assign(engine,{backgroundLayer:new Container(),effectLayer:new Container(),simpleTimelines:new Set(),pendingTails:new Map(),visible:true,playbackEpoch:1,paceScale:1,
    app:{ticker:{add:f=>ticks.add(f),remove:f=>ticks.delete(f)}}});
  const root=new Container();root.position.set(100,600);root.baseX=100;root.baseY=600;root.scale.set(.5);
  const unit={root,bodySprite:new Sprite(),weaponSprite:new Sprite(),nameHud:new Container(),view:new Container(),stopIdle(){}};
  const textures=Object.fromEntries([['attack',16],['cast',12],['blade',8],['ground',9],['dashwake',12],['dashcut',8]].map(([key,n])=>[key,Array.from({length:n},()=>new Texture({source:Texture.WHITE.source,frame:new Rectangle(0,0,1,1)}))]));
  const sword=new ZBodySwordAnimation(engine,unit,textures);
  const target={id:'enemy-1',root:new Container()};target.root.position.set(900,500);target.root.baseX=900;target.root.baseY=500;
  return{engine,unit,sword,target,ticks,textures,close(){sword.destroy();gsap.ticker.sleep();}};
}
test('20 genuine-alpha authored frames are distinct, padded, and preserve generated masters',async()=>{
  for(const [key,spec] of Object.entries(assets.atlases)){
    const data=await readFile(path.join(root,spec.url)),meta=await sharp(data).metadata();
    assert.equal(meta.width,2048);assert.equal(meta.height,spec.rows*512);assert.ok(meta.hasAlpha);assert.equal(sha(data),spec.sha256);
    assert.equal(sha(await readFile(path.join(root,spec.source.file))),spec.source.sha256);
    const hashes=[];
    for(let i=0;i<spec.frames.length;i++){
      const pixels=await sharp(data).extract({left:i%4*512,top:Math.floor(i/4)*512,width:512,height:512}).raw().toBuffer();
      let clear=0,partial=0,visible=0;
      for(let y=0;y<512;y++)for(let x=0;x<512;x++){
        const alpha=pixels[(y*512+x)*4+3];
        if(!alpha)clear++;else{visible++;if(alpha<255)partial++;}
        if(x<3||x>=509||y<3||y>=509)assert.equal(alpha,0,key+' '+i+' edge bleed');
      }
      assert.ok(clear>512*512*.35);assert.ok(visible>100);assert.ok(partial>100);hashes.push(sha(pixels));
    }
    assert.equal(new Set(hashes).size,spec.frames.length);
  }
});
test('dash accelerates to 245 ms contact and returns at 640 ms, without changing body scale',()=>{
  assert.equal(swordPose(DASH_V2_SEQUENCE,245).frame,'07');
  assert.equal(swordPose(DASH_V2_SEQUENCE,190).travel,1);
  assert.equal(swordPose(DASH_V2_SEQUENCE,540).travel,0);
  assert.equal(DASH_V2_SEQUENCE.durationMs,640);
  assert.ok(Math.abs(Z_SWORD.bodyScale*592-278*1.4*(479-40)/512)<.001);
  const entries=[{target:{id:'x'},options:{damage:91}}],batch=takeSwordBatch([...entries],0),fast=fastDashBatch(batch);
  assert.equal(fast.entries,batch.entries);assert.equal(fast.impacts[0].entry,entries[0]);assert.equal(batch.impacts[0].atMs,245);
});
test('actual GSAP controller synchronizes dash frame, cut frame, contact and final cleanup',async()=>{
  const r=rig(),rows=Array.from({length:3},(_,i)=>({target:r.target,options:{damage:100+i}})),hits=[];
  try{
    const done=r.sword.play(takeSwordBatch([...rows],0),e=>hits.push(...e)),tl=r.sword.timeline;tl.pause();
    tl.totalTime(.135);assert.equal(r.sword.frame,'D3');assert.equal(r.sword.dashFX.lastMs,135);assert.equal(r.sword.dashFX.back.visible,true);
    tl.totalTime(.244);assert.equal(hits.length,0);
    tl.totalTime(.245);assert.deepEqual(hits,rows);assert.equal(r.sword.frame,'07');
    assert.equal(r.sword.dashFX.cut[0].texture,r.textures.dashcut[3]);
    const stop=swordContactStop({x:900,y:400},Z_SWORD.bodyScale*.5);
    assert.ok(Math.abs(r.unit.root.x-stop.x)<.001);assert.ok(Math.abs(r.unit.root.y-stop.y)<.001);
    tl.totalTime(.35);assert.equal(hits.length,3);assert.equal(r.unit.bodySprite.scale.x,r.unit.bodySprite.scale.y);
    tl.totalTime(.64);assert.equal(await done,true);assert.equal(r.sword.frame,'01');
    assert.equal(r.unit.root.x,100);assert.equal(r.unit.root.y,600);
    assert.equal(r.sword.dashFX.front.visible,false);assert.equal(r.engine.simpleTimelines.size,0);assert.equal(r.ticks.size,0);
  }finally{r.close();}
});
test('pause, 2x speed and cancel affect the same motion/FX clock and leave no residue',async()=>{
  const r=rig(),hits=[];
  try{
    const done=r.sword.play(takeSwordBatch([{target:r.target,options:{damage:1}}],0),e=>hits.push(...e)),tl=r.sword.timeline;
    tl.pause().totalTime(.135);r.engine.accountBattleUnitIsPaused=()=>true;r.engine.paceScale=2;
    for(const tick of r.ticks)tick();
    assert.equal(tl.paused(),true);assert.equal(tl.timeScale(),2);assert.equal(r.sword.dashFX.lastMs,r.sword.timeMs);
    r.sword.cancel();assert.equal(await done,false);assert.equal(hits.length,0);assert.equal(r.sword.dashFX.back.visible,false);
    assert.equal(r.unit.root.x,100);assert.equal(r.engine.simpleTimelines.size,0);assert.equal(r.ticks.size,0);
  }finally{r.close();}
});
test('recycled targets and retired playback epochs never receive a late hit',async()=>{
  for(const invalidate of [r=>r.target.id='replacement',r=>r.engine.playbackEpoch++,r=>r.target.root.visible=false]){
    const r=rig(),hits=[];
    try{
      const done=r.sword.play(takeSwordBatch([{target:r.target,options:{damage:1}}],0),e=>hits.push(...e)),tl=r.sword.timeline;
      tl.pause();invalidate(r);tl.totalTime(.64);await done;assert.equal(hits.length,0);
    }finally{r.close();}
  }
});
test('approved AOE still plants at 740 ms, strikes at its original five times and has no dash FX',async()=>{
  const r=rig(),hits=[],rows=Array.from({length:5},(_,i)=>({id:i,target:r.target,options:{damage:i+1}}));
  try{
    const done=r.sword.play(takeSwordBatch([...rows],1),e=>hits.push(...e)),tl=r.sword.timeline;tl.pause().totalTime(.74);
    assert.equal(r.sword.frame,'M07');assert.equal(r.sword.dashFX.front.visible,false);
    Z_SWORD.impactsMs.forEach((ms,i)=>{tl.totalTime(ms/1000);assert.equal(r.sword.frame,'M09');assert.equal(hits.length,i+1);});
    tl.totalTime(3);assert.equal(await done,true);assert.deepEqual(hits,rows);assert.equal(r.sword.front.visible,false);
  }finally{r.close();}
});
test('legacy comparison uses the original 810/1695 ms timing and no new dash effect',async()=>{
  const r=rig(),hits=[];
  try{
    r.sword.dashProfile='legacy';
    const done=r.sword.play(takeSwordBatch([{target:r.target,options:{damage:1}}],0),e=>hits.push(...e)),tl=r.sword.timeline;
    tl.pause().totalTime(.8);assert.equal(hits.length,0);tl.totalTime(.81);assert.equal(hits.length,1);
    assert.equal(r.sword.dashFX.front.visible,false);tl.totalTime(1.695);assert.equal(await done,true);
  }finally{r.close();}
});
test('repeat and interruption conserve all mixed-target receipts and release every timeline',async()=>{
  const r=rig(),hits=[];
  try{
    const another={id:'enemy-2',root:new Container()};another.root.baseX=800;another.root.baseY=480;
    const rows=Array.from({length:157},(_,i)=>({id:i,target:i%9<5?r.target:another,options:{damage:i+1}})),queue=[...rows];
    let action=0;
    while(queue.length){
      const batch=takeSwordBatch(queue,action++),done=r.sword.play(batch,e=>hits.push(...e));
      r.sword.timeline.pause().totalTime(batch.mode==='area'?3:.64);await done;
      assert.equal(r.engine.simpleTimelines.size,0);assert.equal(r.ticks.size,0);assert.equal(r.sword.dashFX.front.visible,false);
    }
    // Simultaneous AOE contacts group by target. Global interleaving may differ,
    // but each target must retain its own receipt order and every identity once.
    assert.deepEqual(hits.map(e=>e.id).sort((a,b)=>a-b),rows.map(e=>e.id));
    for(const target of [r.target,another])assert.deepEqual(hits.filter(e=>e.target===target).map(e=>e.id),rows.filter(e=>e.target===target).map(e=>e.id));
    assert.equal(hits.reduce((n,e)=>n+e.options.damage,0),rows.reduce((n,e)=>n+e.options.damage,0));
    for(let i=0;i<20;i++){
      const done=r.sword.play(takeSwordBatch([rows[0]],0),()=>assert.fail('cancelled hit'));
      r.sword.timeline.pause().totalTime(.135);r.sword.cancel();assert.equal(await done,false);
    }
    assert.equal(r.engine.simpleTimelines.size,0);assert.equal(r.ticks.size,0);assert.equal(r.unit.root.x,100);
  }finally{r.close();}
});

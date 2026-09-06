import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Container,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import sharp from 'sharp';
import {SEQUENCES,explosionFrame,cueAt} from '../preview/battle-suit-skill-chip-v1/source/sequence.js';
import {SkillChipFX} from '../preview/battle-suit-skill-chip-v1/source/SkillChipFX.js';
import {SkillChipAudio} from '../preview/battle-suit-skill-chip-v1/source/SkillChipAudio.js';
const base=new URL('../preview/battle-suit-skill-chip-v1/',import.meta.url);
after(()=>gsap.ticker.sleep());

test('two deterministic sequences finish with no visible explosion; reference timings preserved',()=>{
  assert.deepEqual(SEQUENCES.airstrike.impacts,[.61,.83,1.05,1.27]);
  assert.deepEqual(SEQUENCES.missile.impacts,[.36]);
  for(const sequence of Object.values(SEQUENCES)){
    assert.ok(sequence.impacts.at(-1)+sequence.life<=sequence.duration);
    assert.equal(explosionFrame(-.001,sequence.life),null);
    assert.equal(explosionFrame(sequence.life,sequence.life),null);
    let previous=0;
    for(let i=0;i<100;i++){const frame=explosionFrame(sequence.life*i/100,sequence.life);assert.ok(frame.index>=previous);assert.ok(frame.index>=0&&frame.next<24);assert.ok(frame.alpha>=0&&frame.alpha<=1);previous=frame.index;}
    assert.match(cueAt(sequence.key,sequence.duration),/재생 완료/);
  }
});

function mockEngine(){
  const root=new Container();root.position.set(1100,620);
  return {mobile:false,combatLayer:new Container(),effectLayer:new Container(),stage:new Container(),camera:{base:{x:800,y:410}},enemies:[{battleActive:true,root}],accountBattleUnit:{muzzlePoint:()=>({x:580,y:490})}};
}
function mockTextures(){return {frames:Array(24).fill(Texture.EMPTY),...Object.fromEntries(['helicopter','rotor','rocket','exhaust','smoke','dust','cinder','flash'].map(name=>[name,Texture.EMPTY]))}}
test('rocket launcher grounds its blast at the sole without moving the approved projectile or airstrike',async()=>{
  assert.equal(SEQUENCES.missile.label,'로켓런처');
  const html=await readFile(new URL('index.html',base),'utf8');
  assert.match(html,/data-skill="missile"[^\n]+<strong>로켓런처<\/strong>/);
  for(const mobile of [false,true]){
    const engine=mockEngine();engine.mobile=mobile;
    const fx=new SkillChipFX(engine,mockTextures()),unitScale=mobile?.78:1;
    try{
      fx.select('airstrike');fx.seek(.7);
      const airstrikePoints=fx.getPoints();
      assert.equal(fx.blasts[0].first.y,606-76*unitScale);
      const airstrikeState=fx.sprites.map(s=>s.visible?[s.x,s.y,s.width,s.height,s.rotation,s.alpha]:null);
      fx.select('missile');
      assert.deepEqual(fx.getPoints(),{source:{x:580,y:490},foot:{x:1100,y:606},hit:{x:1100,y:558},blast:{x:1100,y:620}});
      assert.equal(fx.getPoints().hit.y-airstrikePoints.hit.y,30);
      fx.seek(.24);
      assert.ok(fx.rocket.visible);assert.equal(fx.rocket.x,840);assert.equal(fx.rocket.y,524);
      fx.seek(.4);
      assert.equal(fx.blasts[0].first.y,620);assert.equal(fx.blasts[0].second.y,620);
      assert.equal(fx.blasts[0].flash.y,620-20*unitScale);assert.equal(fx.blasts[0].dust.y,620);
      assert.equal(fx.blasts[0].light.y,620);
      fx.select('airstrike');fx.seek(.7);
      assert.deepEqual(fx.sprites.map(s=>s.visible?[s.x,s.y,s.width,s.height,s.rotation,s.alpha]:null),airstrikeState);
    }finally{fx.destroy();}
  }
});

test('every rocket explosion frame keeps its measured contact row on the moving target sole',async()=>{
  const origins=JSON.parse(await readFile(new URL('assets/textures/explosion-origins.json',base),'utf8'));
  for(const mobile of [false,true]){
    const engine=mockEngine();engine.mobile=mobile;
    const fx=new SkillChipFX(engine,mockTextures()),root=engine.enemies[0].root;
    try{
      fx.select('missile');
      for(let i=0;i<96;i++){
        root.position.set(1100+i*2,620+i);
        const time=.36+1.84*i/96;fx.seek(time);
        const frame=explosionFrame(fx.time-.36,1.84),blast=fx.blasts[0];
        for(const [sprite,index] of [[blast.first,frame.index],[blast.second,frame.next]]){
          assert.ok(sprite.visible);assert.equal(sprite.x,root.x);assert.equal(sprite.y,root.y);
          assert.equal(sprite.anchor.y,origins[index].y);
        }
        if(blast.dust.visible)assert.equal(blast.dust.y,root.y);
        if(blast.light.visible)assert.equal(blast.light.y,root.y);
        assert.equal(fx.getPoints().hit.y,root.y-62);
      }
    }finally{fx.destroy();}
  }
});

test('50 alternating seeks/replays keep a single effect timeline and a bounded sprite pool',()=>{
  const engine=mockEngine(),fx=new SkillChipFX(engine,mockTextures());
  const count=fx.sprites.length;
  for(let i=0;i<50;i++){
    fx.select(i%2?'missile':'airstrike');fx.seek(fx.sequence.impacts[0]+.2);
    assert.ok(fx.diagnostics().visible>0);fx.play();fx.pause();
    fx.seek(fx.sequence.duration);assert.equal(fx.diagnostics().visible,0);
    assert.equal(fx.diagnostics().sprites,count);assert.equal(fx.diagnostics().ownedTimelines,1);
  }
  fx.destroy();assert.equal(engine.combatLayer.children.length,0);assert.equal(engine.effectLayer.children.length,0);
});
test('reverse seek reconstructs the exact same missile frame; camera returns to canonical base',()=>{
  const engine=mockEngine(),fx=new SkillChipFX(engine,mockTextures());
  fx.select('missile');fx.seek(.25);
  const state=()=>fx.sprites.map(s=>s.visible?[true,s.x,s.y,s.width,s.height,s.rotation,s.alpha]:[false]);
  const first=state();fx.seek(2);fx.seek(.25);assert.deepEqual(state(),first);
  fx.lastShake={x:3,y:2};engine.stage.position.set(803,412);fx.pause();
  assert.equal(engine.stage.x,800);assert.equal(engine.stage.y,410);fx.destroy();
});
test('live renderer, art adapters and grade frames are reused without live registration',async()=>{
  const html=await readFile(new URL('battle.html',base),'utf8'),source=await readFile(new URL('source/skill-chip-lab.src.js',base),'utf8');
  for(const name of ['project-v-battle-art-adapter-v1','project-v-tier-battle-art-adapter-v1','project-v-monster-battle-art-adapter-v1','project-v-unassigned-battle-fallback-v1','battle-v3-live'])assert.ok(html.includes(`/js/${name}.js`));
  for(const name of ['card','battle-v3-live','zenith-v1','superstar-v1','faker-card-v1'])assert.ok(html.includes(`/css/${name}.css`));
  assert.match(source,/ProjectVBattleV3Live\.createRenderer/);
  assert.match(source,/\.\.\/\.\.\/project-v-v3\/source\/project-v-pixi-battle\.src\.js/);
  assert.doesNotMatch(source,/\/api\/|localStorage\.setItem|sessionStorage\.setItem|playAccountBattleUnitShot|\.setHp\(/);
  const css=await readFile(new URL('preview.css',base),'utf8');assert.doesNotMatch(css,/\.battle-v3-roster|\.card-frame|\.battle-v3-dock/);
  for(const path of ['../index.html','../js/app.js','../js/character-loadout-v2.js','../functions/api/[[path]].js']){
    assert.doesNotMatch(await readFile(new URL(path,import.meta.url),'utf8'),/battle-suit-skill-chip-v1|SkillChipLab/);
  }
});
test('GPU assets contain real alpha; atlas is exactly 24 square frames',async()=>{
  const data=await readFile(new URL('assets/generated/explosion-atlas.png',base));
  const m=await sharp(data).metadata();assert.equal(m.hasAlpha,true);assert.equal(m.width/6,m.height/4);
  const stats=await sharp(data).stats();assert.equal(stats.channels[3].min,0);assert.ok(stats.channels[3].max>200);
  const origins=JSON.parse(await readFile(new URL('assets/textures/explosion-origins.json',base),'utf8'));assert.equal(origins.length,24);
  for(const pivot of origins){assert.ok(pivot.y>.5&&pivot.y<1);assert.ok(pivot.edgeAlphaMax<=4);}
  for(const name of ['helicopter','rotor','rocket','exhaust','smoke','dust','cinder','flash','explosion-atlas'])assert.equal((await sharp(await readFile(new URL(`assets/textures/${name}.webp`,base))).metadata()).hasAlpha,true);
});
test('recording provenance is byte-locked; no test oscillator or procedural audio',async()=>{
  for(const [file,hash] of [['helicopter-187681-cc0.mp3','CEEF20913CB66BD0C8DDE703976D3F3ED7B36A95CAEC550496A20211D02A360B'],['explosion-182797-cc0.mp3','7C5C8204D55D9127C19B389CDEE2AE415CD78523EB132883497D2D5D0C5CD890']]){
    assert.equal(createHash('sha256').update(await readFile(new URL(`assets/audio/${file}`,base))).digest('hex').toUpperCase(),hash);
  }
  const source=await readFile(new URL('source/SkillChipAudio.js',base),'utf8');assert.doesNotMatch(source,/createOscillator|Math\.random|createPeriodicWave/);assert.match(source,/getOutputTimestamp/);
});
test('audio pauses release every scheduled source; compensated impact peaks agree at all speeds',()=>{
  const audio=new SkillChipAudio();
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){}});
  const node=()=>({gain:param(),pan:param(),playbackRate:param(),connect(target){return target},disconnect(){},start(){},stop(){}});
  audio.context={currentTime:10,state:'running',baseLatency:.01,outputLatency:.04,getOutputTimestamp:()=>({contextTime:9.96,performanceTime:performance.now()}),createBufferSource:node,createGain:node,createStereoPanner:node};
  audio.master=node();audio.ready=true;
  for(const key of Object.keys(SEQUENCES))for(const speed of [.25,.5,1,2]){
    audio.schedule(key,0,speed);assert.ok(audio.sources.size>0);
    assert.equal(audio.syncRecords.length,SEQUENCES[key].impacts.length);
    for(const sync of audio.syncRecords)assert.ok(Math.abs(sync.predictedOutputPeakDeltaMs)<1);
    audio.stop();assert.equal(audio.sources.size,0);
  }
  audio.setEnabled(false);audio.schedule('airstrike');assert.equal(audio.sources.size,0);
});

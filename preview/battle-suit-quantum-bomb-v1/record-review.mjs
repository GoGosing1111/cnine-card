import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {buildBattleSuitFighter,buildFighter,buildMonsterFighter,simulateBattleV2Preview} from '../../functions/_battle_v2_preview.js';
import {CHIP} from './sequence.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=fileURLToPath(new URL('./review/',import.meta.url));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--mute-audio','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const metrics={};
function openingCast(ids){
  const ally=buildFighter({id:'ALLY',power:80000,power_type:'HP'},0,'A',null,'PVE');
  const suit=buildBattleSuitFighter({code:'BATTLE_SUIT_01',pvePower:300000,skillChips:[CHIP.code]});
  const enemies=ids.map((id,slot)=>({...buildMonsterFighter({id,battle_power:300000}),id,slot,hp:4500000,maxHp:4500000}));
  const {timeline}=simulateBattleV2Preview({teamA:[ally,suit],teamB:enemies,maxActions:8,seed:2011});
  const cast=timeline.find(event=>event.type==='SKILL_CHIP_CAST'&&event.chipCode===CHIP.code);
  return timeline.filter(event=>event.castId===cast.castId);
}
try {
  for(const [name,width,height] of [['desktop',1440,940],['mobile',390,844]]) {
    const page=await browser.newPage({viewport:{width,height},hasTouch:name==='mobile'});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
    await page.goto('http://127.0.0.1:8791/preview/battle-suit-quantum-bomb-v1/');
    await page.waitForFunction(()=>window.SkillChipLab?.fx);
    const canvas=page.frameLocator('#battle-frame').locator('canvas').first();
    for(const [phase,t] of [['drop',.76],['blast',1.34]]){
      await page.evaluate(t=>{const l=window.SkillChipLab;l.seek(t);l.engine.app.renderer.render(l.engine.app.stage);},t);
      await canvas.screenshot({path:path.join(out,name+'-'+phase+'.png')});
    }
    metrics[name]=await page.evaluate(()=>{
      const l=window.SkillChipLab,{engine:e,fx}=l;
      const targets=e.enemies.filter(a=>a.root.visible&&a.battleActive!==false);
      const {x,y,radiusX,radiusY}=fx.formation(targets);
      const stage=e.app.renderer.screen, toScreen=p=>e.effectLayer.toGlobal(p);
      const shockWidth=toScreen({x:x+fx.ring.width/2,y}).x-toScreen({x:x-fx.ring.width/2,y}).x;
      const extent=Object.fromEntries(['left','top','right','bottom'].map(k=>[k,Math.round(fx.cloud.getBounds()[k])]));
      const coversEveryTarget=targets.every(({root})=>((root.x-x)/radiusX)**2+((root.y-y)/radiusY)**2<=1);
      l.seek(.55);const firstX=fx.capsule.x,firstY=fx.capsule.y;l.seek(.80);
      const vertical=fx.capsule.x===firstX&&fx.capsule.y>firstY, axis=Math.abs(fx.capsule.x-x);
      l.seek(fx.sequence.duration);
      return {targets:targets.length,coversEveryTarget,vertical,axis,cloudBounds:extent,canvas:[stage.width,stage.height],
        shockWidthPercent:Math.round(100*shockWidth/stage.width),cleared:!fx.cloud.visible&&!fx.capsule.visible&&!fx.ring.visible,
        noOverflow:document.documentElement.scrollWidth<=innerWidth};
    });
    const m=metrics[name];
    assert.ok(m.targets===3&&m.coversEveryTarget&&m.vertical&&m.axis===0&&m.cleared&&m.noOverflow,JSON.stringify(m));
    if(name==='desktop'){
      const ids=await page.evaluate(()=>window.SkillChipLab.engine.enemies.filter(a=>a.root.visible&&a.battleActive!==false).map(a=>a.id));
      const events=openingCast(ids);
      const capture=await page.evaluate(async events=>{
        const lab=window.SkillChipLab, engine=lab.engine;
        lab.seek(0);
        const hits=events.filter(event=>event.type==='SKILL_CHIP_HIT');
        for(const hit of hits){
          const target=engine.combatantById(hit.targetId);
          engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter+hit.damage,hit.targetMaxHp));
        }
        let paused=true;
        const completed=engine.playEvents(events,{isPaused:()=>paused});
        const playback=engine.skillChipPlayback;
        await playback.ready;
        playback.syncPause();
        const audio=playback.audio;
        if(!audio.ready||!audio.enabled)throw Error('전투 효과음을 준비할 수 없습니다.');
        const stream=engine.app.canvas.captureStream(60),dest=audio.context.createMediaStreamDestination();
        audio.master.disconnect(audio.context.destination);
        audio.master.connect(dest);stream.addTrack(dest.stream.getAudioTracks()[0]);
        const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:8500000});
        const chunks=[];
        recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        const stopped=new Promise(resolve=>recorder.onstop=resolve);
        const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        recorder.start();await delay(300);paused=false;playback.syncPause();
        if(!await completed)throw Error('전투 재생이 중단되었습니다.');
        await delay(380);recorder.stop();await stopped;
        stream.getTracks().forEach(t=>t.stop());
        const video=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
        return {video,casts:playback.casts,hits:playback.hits,hpSynchronized:hits.every(hit=>
          Math.abs(engine.combatantById(hit.targetId).hp-hit.targetHpAfter/hit.targetMaxHp*100)<.01)};
      },events);
      assert.ok(capture.casts===1&&capture.hits===ids.length&&capture.hpSynchronized);
      m.playback={casts:capture.casts,hits:capture.hits,hpSynchronized:capture.hpSynchronized};
      execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-y','-i','pipe:0','-vf',
        'pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k',
        '-movflags','+faststart',path.join(out,'quantum-bomb.mp4')],{input:Buffer.from(capture.video,'base64'),windowsHide:true});
    }
    assert.deepEqual(errors,[]);
    await page.close();
  }
} finally {await browser.close();}
await writeFile(path.join(out,'checks.json'),JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify(metrics));

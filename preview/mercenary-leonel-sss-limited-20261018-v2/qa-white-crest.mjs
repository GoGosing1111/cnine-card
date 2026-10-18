import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {MODES} from './motion.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=new URL('qa/white-crest-20261019/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const results=[];
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text().slice(0,500));});
  await page.goto('http://127.0.0.1:8997/preview/mercenary-leonel-sss-limited-20261018-v2/',{waitUntil:'networkidle',timeout:60000});
  await page.waitForFunction(()=>window.LeonelPreview||document.getElementById('status').textContent.startsWith('준비 실패'),null,{timeout:60000});
  assert(await page.evaluate(()=>!!window.LeonelPreview),await page.locator('#status').textContent());
  const moments=[['idle',.3],['attack',MODES.attack.contacts[0]],['skill',MODES.skill.contacts[1]],['ultimate',MODES.ultimate.physicalContacts[0]],['ultimate',2.65]];
  const samples=[];
  for(const [mode,time]of moments){
   const d=await page.evaluate(({mode,time})=>{const {fx}=window.LeonelPreview;fx.setMode(mode);fx.seek(time);return{...fx.diagnostics(),sword:fx.whiteRig.current,neon:fx.whiteRig.glow.enabled,aura:fx.whiteRig.swordAura.some(s=>s.visible)};},{mode,time});
   assert(d.neon&&d.aura);assert(d.groundError<1e-6);if(mode!=='idle'&&time!==2.65)assert(d.bladeContact.intersects,mode+' blade contact '+JSON.stringify(d.bladeContact));
   await page.waitForTimeout(80);await page.locator('.battle-viewport').screenshot({path:fileURLToPath(new URL(label+'-'+mode+'-'+time+'.png',out))});samples.push(d);
  }
  const repeated=await page.evaluate(()=>{const f=window.LeonelPreview.fx;f.cutInState.shown=false;f.setMode('ultimate');f.seek(.6);const first=f.screenLayer.visible;f.setMode('attack');f.seek(.3);f.setMode('ultimate');f.seek(.6);return{first,second:f.screenLayer.visible};});
  assert.deepEqual(repeated,{first:true,second:false});
  const continuity=await page.evaluate(()=>{
   const f=window.LeonelPreview.fx;f.setMode('idle');f.seek(1.37);const before=f.ambientPhase,poseBefore=structuredClone(f.whiteRig.current);f.setMode('attack');const entry=f.whiteRig.current;const startPhase=f.ambientPhase;
   let min=Infinity,max=0,maxGround=0;for(const mode of ['idle','attack','dash','skill','ultimate']){f.setMode(mode);for(let t=0;t<=({idle:4,attack:.7,dash:1.25,skill:1.55,ultimate:4.25}[mode]);t+=1/60){f.seek(t);const b=f.whiteRig.blade(),n=Math.hypot(b.tip.x-b.start.x,b.tip.y-b.start.y);min=Math.min(min,n);max=Math.max(max,n);maxGround=Math.max(maxGround,f.groundError);}}
   f.setMode('attack');f.seek(.7);const a=f.whiteRig.current;f.setMode('idle');f.seek(0);const b=f.whiteRig.current;
   f.whiteRig.updateAura(0);const startAura=f.whiteRig.swordAura.map(s=>[s.texture.uid,s.alpha]);f.whiteRig.updateAura(4);const endAura=f.whiteRig.swordAura.map(s=>[s.texture.uid,s.alpha]);
   return{phaseError:Math.abs(before-startPhase),entryGripError:Math.hypot(poseBefore.x-entry.x,poseBefore.y-entry.y),recoveryGripError:Math.hypot(a.x-b.x,a.y-b.y),rigidSwordLengthRange:max-min,maxGround,loopAuraContinuous:JSON.stringify(startAura)===JSON.stringify(endAura),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert(continuity.phaseError<1e-6);assert(continuity.entryGripError<1e-6);assert(continuity.recoveryGripError<1e-6);assert(continuity.rigidSwordLengthRange<1e-6);assert(continuity.maxGround<1e-6);assert(continuity.loopAuraContinuous);assert.equal(continuity.overflow,false);
  const speeds=[];for(const speed of [.25,.5,1,2]){await page.evaluate(speed=>{const f=window.LeonelPreview.fx;f.setMode('skill');f.setSpeed(speed);f.play();},speed);await page.waitForTimeout(250);const at=await page.evaluate(()=>{const f=window.LeonelPreview.fx;f.pause();return f.time;});await page.waitForTimeout(70);assert.equal(await page.evaluate(()=>window.LeonelPreview.fx.time),at);assert(at>0);speeds.push({speed,advanced:at,pauseStable:true});}
  if(!process.argv.includes('--screens-only')){
   await page.evaluate(()=>{window.LeonelPreview.fx.cutInState.shown=false;document.getElementById('record').click();});
   await page.waitForFunction(()=>document.getElementById('record-status').textContent.includes('완료')||document.getElementById('record-status').textContent.includes('실패'),null,{timeout:40000});
   assert(!(await page.locator('#record-status').textContent()).includes('실패'));
   const base64=await page.evaluate(async()=>{const b=await fetch(document.getElementById('record-download').href).then(r=>r.blob());return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(b);});});
   await fs.writeFile(new URL(label+'-continuous.webm',out),Buffer.from(base64,'base64'));
  }
  const cleanup=await page.evaluate(()=>{const r=window.LeonelPreview;r.fx.cancel();const stopped=r.fx.diagnostics();r.dispose();return{stopped:stopped.registeredTimelines===0&&stopped.visibleEffects===0&&!stopped.cinematicVisible,rigDestroyed:r.fx.whiteRig.root.destroyed,timelines:r.engine.simpleTimelines.size};});
  assert(cleanup.stopped&&cleanup.rigDestroyed);assert.deepEqual(errors,[]);results.push({label,samples,repeated,continuity,speeds,cleanup,errors});await page.close();console.log(label+' white crest continuity PASS');
 }
 await fs.writeFile(new URL('report.json',out),JSON.stringify({status:'PASS',results},null,2)+'\n');
}finally{await browser.close();}

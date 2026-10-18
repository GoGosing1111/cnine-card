import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=new URL('qa/forward-guard-20261019/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),results=[];
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await page.goto('http://127.0.0.1:8997/preview/mercenary-leonel-sss-limited-20261018-v2/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.LeonelPreview);
  const motion=await page.evaluate(()=>{
   const f=window.LeonelPreview.fx,r=f.whiteRig,rows=[];f.setMode('idle');
   for(let i=0;i<=480;i++){f.seek(i/120);rows.push({layers:r.current.layers.map(l=>[l.pose.bank,l.pose.index]),bodies:r.bodies.filter(s=>s.visible).length,x:r.current.x,y:r.current.y,angle:r.current.angle,scale:r.current.scale,breath:r.current.layers[0].breath});}
   const range=key=>Math.max(...rows.map(r=>r[key]))-Math.min(...rows.map(r=>r[key]));
   f.setMode('ultimate');f.cutInEnabled=false;let maxGripError=0,maxAngleError=0,maxBodyLayers=0,wrongPose=0;
   for(let i=0;i<=510;i++){
    const t=i/120;f.seek(t);maxBodyLayers=Math.max(maxBodyLayers,r.current.layers.length);const actual=r.current.layers[0].pose;
    if(t<3.94){const expected=f.state.pose.index===0||f.state.pose.index>=8?{bank:'ultimate',index:8}:f.state.pose;if(actual.bank!==expected.bank||actual.index!==expected.index)wrongPose++;
     const frame=f.pose(expected),s=f.bodyHeight/610;
     maxGripError=Math.max(maxGripError,Math.hypot(r.current.x-(frame.grip.x-frame.pivot.x)*s,r.current.y-(frame.grip.y-frame.pivot.y)*s*r.current.layers[0].breath));
     maxAngleError=Math.max(maxAngleError,Math.abs(r.current.angle-(frame.weapon.angleDegrees*Math.PI/180-r.originalAngle)));
    }
   }
   f.setMode('idle');f.seek(1.37);const entry=structuredClone(r.current),phase=f.ambientPhase;f.setMode('attack');const entryGripError=Math.hypot(entry.x-r.current.x,entry.y-r.current.y),phaseError=Math.abs(phase-f.ambientPhase);
   f.seek(.7);const ending=structuredClone(r.current);f.setMode('idle');f.seek(0);const recoveryGripError=Math.hypot(ending.x-r.current.x,ending.y-r.current.y);
   f.cutInState.shown=false;f.setMode('ultimate');f.seek(.6);const first=f.screenLayer.visible;f.setMode('ultimate');f.seek(.6);const second=f.screenLayer.visible;
   const forward=[];
   for(const direction of [1,-1]){Object.defineProperty(f,'direction',{configurable:true,value:direction});
    for(const [mode,time]of [['idle',1],['ultimate',0],['ultimate',1.1],['ultimate',2.25],['ultimate',2.8],['ultimate',3.7],['ultimate',4.25]]){f.setMode(mode);f.seek(time);const b=r.blade(),grip=f.merc.view.toGlobal(b.grip),tip=f.merc.view.toGlobal(b.tip);forward.push({direction,mode,time,forwardDistance:(tip.x-grip.x)*direction,pose:r.current.layers[0].pose.index});}
   }delete f.direction;
   const contacts=[];for(const [mode,time]of [['attack',.21],['skill',.24],['skill',.47],['skill',.73],['ultimate',1.79]]){f.setMode(mode);f.seek(time);contacts.push({mode,time,intersects:f.collision.intersects});}
   return{forward,contacts,idle:{oneStableDrawing:rows.every(r=>r.bodies===1&&r.layers.length===1&&r.layers[0][0]==='ultimate'&&r.layers[0][1]===8),gripXRange:range('x'),gripYRange:range('y'),angleRange:range('angle'),swordScaleRange:range('scale'),headBreathingRange:range('breath')*333},ultimate:{maxBodyLayers,wrongPose,maxGripError,maxAngleError},transition:{entryGripError,phaseError,recoveryGripError},cutIn:{first,second},overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert(motion.forward.every(p=>p.forwardDistance>0&&p.pose===8));assert(motion.contacts.every(p=>p.intersects));assert(motion.idle.oneStableDrawing);assert.equal(motion.idle.gripXRange,0);assert.equal(motion.idle.angleRange,0);assert.equal(motion.idle.swordScaleRange,0);assert(motion.idle.gripYRange>0&&motion.idle.gripYRange<1);assert(motion.idle.headBreathingRange>0&&motion.idle.headBreathingRange<2);
  assert.equal(motion.ultimate.maxBodyLayers,1);assert.equal(motion.ultimate.wrongPose,0);assert(motion.ultimate.maxGripError<1e-6&&motion.ultimate.maxAngleError<1e-6);assert(Object.values(motion.transition).every(v=>v<1e-6));assert.deepEqual(motion.cutIn,{first:true,second:false});assert.equal(motion.overflow,false);
  for(const [mode,time]of [['idle',1],['ultimate',0],['ultimate',1.79],['ultimate',3.7]]){
   await page.evaluate(({mode,time})=>{const f=window.LeonelPreview.fx;f.setMode(mode);f.cutInEnabled=false;f.setEffects(mode==='idle');f.setAura(mode==='idle');f.seek(time);},{mode,time});await page.waitForTimeout(70);
   await page.locator('.battle-viewport').screenshot({path:fileURLToPath(new URL(label+'-'+mode+'-'+time+'.png',out))});
  }
  const base64=await page.evaluate(async()=>{
   const {fx,engine}=window.LeonelPreview;fx.onComplete=()=>{};fx.setEffects(true);fx.setAura(true);fx.setSpeed(1);fx.cutInState.shown=true;
   const stream=engine.app.canvas.captureStream(60),parts=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:7000000});
   recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};const stopped=new Promise(r=>recorder.onstop=r),delay=ms=>new Promise(r=>setTimeout(r,ms));recorder.start();
   fx.setMode('idle');fx.play();await delay(4100);fx.setMode('ultimate');fx.play();await delay(4400);fx.setMode('idle');fx.play();await delay(1100);fx.pause();recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
   return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(new Blob(parts,{type:'video/webm'}));});
  });await fs.writeFile(new URL(label+'-motion-fixed.webm',out),Buffer.from(base64,'base64'));
  assert.deepEqual(errors,[]);results.push({label,...motion,errors});await page.close();console.log(label+' calm idle and registered ultimate PASS');
 }
 await fs.writeFile(new URL('report.json',out),JSON.stringify({status:'PASS',selectedGuard:'ultimate-09',userReference:'approved-20261019/forward-guard-reference.png',results},null,2)+'\n');
}finally{await browser.close();}

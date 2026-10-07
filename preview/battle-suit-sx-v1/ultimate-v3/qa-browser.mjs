import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('./',import.meta.url)),dir=root+'qa/verified/';
await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[],problems=[];
try{for(const[name,viewport]of [['desktop',{width:1440,height:1040}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],failures=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push({status:r.status(),url:r.url()});});
 await page.goto('http://127.0.0.1:8975/preview/battle-suit-sx-v1/ultimate-v3/');await page.waitForFunction(()=>window.SXUltimatePreview,null,{timeout:60000});
 const snapshots=[];
 for(const time of [0,.36,.85,1.32,1.78,1.97,2.02,2.24,2.47,3.1,3.8,4.4,5.7]){
  await page.evaluate(t=>window.SXUltimatePreview.fx.seek(t),time);await page.waitForTimeout(60);
  const data=await page.evaluate(()=>{
   const {fx,engine:e}=window.SXUltimatePreview;
   return{...fx.diagnostics(),targetBounds:e.enemies.map(t=>{const b=t.root.getBounds();return{x:b.minX,y:b.minY,width:b.maxX-b.minX,height:b.maxY-b.minY,visible:t.root.visible&&t.root.alpha>0};}),canvas:{width:e.app.screen.width,height:e.app.screen.height}};
  });snapshots.push(data);
  if([1.32,1.97,2.24,2.47,3.1,4.4].includes(time))await page.locator('.battle-viewport').screenshot({path:dir+name+'-'+time+'.png'});
  if(data.targetCount!==5||data.targets.some(t=>!t.visible))problems.push([name,time,'five visible targets']);
  if(time>2.32&&data.contactCount!==5)problems.push([name,time,'missing area hit']);
  if(data.mainBodyTint!==0xffffff||!data.bodyUniformScale||data.groundError>1e-8||data.title.mirrored)problems.push([name,time,'body identity']);
  const safe=data.safeFrame,boxes=[['actor',data.artScreenBounds],...data.targetBounds.map((b,i)=>['enemy'+i,b])];
  if(time>0&&time<5.7)boxes.push(['title',data.title.bounds]);
  for(const[k,b]of boxes)if(b.x<safe.left-6||b.y<safe.top-6||b.x+b.width>safe.right+6||b.y+b.height>safe.bottom+6)problems.push([name,time,k,'framing',b,safe]);
  if(data.giantTip&&!data.giantTip.rigidScale)problems.push([name,time,'sword distorted']);
  if(time>0&&time<5.7&&(data.bladeAuraAttachmentError>1e-5||!data.bladeAuraVisible||data.bodyAuraAlpha!==1))problems.push([name,time,'ambient attachment']);
 }
 const controls=await page.evaluate(async()=>{
  const f=window.SXUltimatePreview.fx,rows=[];
  for(const speed of [.25,.5,1,2]){f.seek(0);f.setSpeed(speed);f.play();await new Promise(r=>setTimeout(r,230));f.pause();const held=f.time;await new Promise(r=>setTimeout(r,70));rows.push({speed,advance:held,pauseStable:held===f.time});}
  f.setSpeed(1);f.setEffects(false);f.seek(2.40);const off=f.diagnostics();f.setEffects(true);f.cancel();const canceled=f.diagnostics();
  return{speeds:rows,off,canceled};
 });
 if(controls.speeds.some(x=>x.advance<=0||!x.pauseStable))problems.push([name,'clock']);
 for(const d of [controls.off,controls.canceled])if(d.visibleEffects||d.visibleGhosts)problems.push([name,'effects cleanup']);
 if(controls.canceled.registeredTimelines)problems.push([name,'canceled clock still registered']);
 await page.evaluate(()=>{const f=window.SXUltimatePreview.fx;f.setEffects(false);f.seek(1.32);});await page.locator('.battle-viewport').screenshot({path:dir+name+'-body-only.png'});
 await page.evaluate(()=>{const f=window.SXUltimatePreview.fx;f.setEffects(true);f.seek(1.32);});await page.screenshot({path:dir+name+'-page.png',fullPage:true});
 const overflow=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
 const downloadPromise=page.waitForEvent('download',{timeout:20000});
 const recording=await page.evaluate(async()=>{
  const {fx,engine}=window.SXUltimatePreview,stream=engine.app.canvas.captureStream(30),chunks=[];
  const type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm',rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:6500000});
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stop=new Promise(r=>rec.onstop=r);
  fx.seek(0);fx.setSpeed(1);rec.start();await new Promise(r=>setTimeout(r,300));fx.play();await new Promise(r=>setTimeout(r,6000));rec.stop();await stop;stream.getTracks().forEach(t=>t.stop());
  const blob=new Blob(chunks,{type}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='sx-ultimate-v3.webm';link.click();return{bytes:blob.size,mimeType:type,requestedDuration:6.3,final:fx.diagnostics()};
 });
 const download=await downloadPromise;await download.saveAs(root+'review-'+name+'-v3.webm');
 const lifecycle=await page.frames().find(f=>f.url().endsWith('battle.html')).evaluate(()=>{
  const {fx,engine}=window.SXUltimatePreview;fx.seek(1);fx.play();const descriptor=Object.getOwnPropertyDescriptor(document,'hidden');
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));const hidden=fx.diagnostics();
  if(descriptor)Object.defineProperty(document,'hidden',descriptor);else delete document.hidden;
  fx.destroy();return{hidden,disposed:fx.disposed,timelineCleared:fx.timeline===null,backdropsReset:engine.parallaxLayers.every(({layer})=>layer.scale.x===1&&layer.pivot.x===0)};
 });
 if(lifecycle.hidden.visibleEffects||lifecycle.hidden.visibleGhosts||lifecycle.hidden.registeredTimelines||!lifecycle.disposed||!lifecycle.timelineCleared||!lifecycle.backdropsReset)problems.push([name,'lifecycle']);
 if(errors.length||failures.length||overflow.scroll>overflow.width)problems.push([name,'browser',errors,failures,overflow]);
 results.push({name,viewport,errors,failures,overflow,snapshots,controls,recording,lifecycle});console.log(name+' recorded '+recording.bytes+' bytes');await page.close();
}}finally{await browser.close();}
await fs.writeFile(dir+'browser-report.json',JSON.stringify({results,problems},null,2)+'\n');
console.log(JSON.stringify({screens:results.map(r=>({name:r.name,targets:r.snapshots[0].targetCount,errors:r.errors.length})),problems},null,2));if(problems.length)process.exitCode=1;

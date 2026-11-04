import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const reports=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}});await page.goto('http://127.0.0.1:18804/');await page.waitForFunction(()=>advancementReview.ready);
 for(const rate of [1,.5]){
  await page.evaluate(rate=>{
   const api=advancementReview,source=api.engine.app.canvas;
   // Offline recording surface only. No node, renderer or new effect clock is
   // added to the live V3 scene. The header identifies the active visual test.
   const capture=document.createElement('canvas');capture.width=1280;capture.height=Math.round(source.height/source.width*1280)+52;
   const context=capture.getContext('2d'),stream=capture.captureStream(0),track=stream.getVideoTracks()[0],chunks=[];
   const media=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:6000000});let last=0;
   const record=api.recording={media,stream,chunks,rate,plays:[],samples:[],label:'용병 전직 · 16종 전용 이펙트',started:performance.now()};
   record.hook={postrender(){const now=performance.now();if(now-last<30)return;last=now;context.fillStyle='#07101b';context.fillRect(0,0,capture.width,capture.height);context.drawImage(source,0,52,1280,capture.height-52);context.fillStyle='#ffffff';context.font='bold 23px Malgun Gothic';context.fillText(record.label+'  /  '+rate+'배',20,34);track.requestFrame();if(api.current&&!api.current.disposed)record.samples.push({at:now-record.started,id:api.current.event.id,time:api.current.time,frame:api.current.audit().frames[0].frame});}};
   api.engine.app.renderer.runners.postrender.add(record.hook);media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};media.start();
  },rate);
  const ids=await page.evaluate(()=>advancementReview.catalog.map(s=>s.id));
  for(const id of ids){
   await page.evaluate(async({id,rate})=>{const api=advancementReview;api.recording.label=api.catalog.find(s=>s.id===id).name;const start=performance.now();const session=await api.play(id,{speed:rate});const ok=await session.done;api.recording.plays.push({id,ok,elapsedMs:performance.now()-start});},{id,rate});
   await page.waitForTimeout(150);
  }
  const result=await page.evaluate(async()=>{const api=advancementReview,r=api.recording;api.engine.app.renderer.runners.postrender.remove(r.hook);await new Promise(done=>{r.media.onstop=done;r.media.stop();});r.stream.getTracks().forEach(t=>t.stop());const bytes=new Uint8Array(await new Blob(r.chunks).arrayBuffer());let s='';for(const n of bytes)s+=String.fromCharCode(n);return {base64:btoa(s),plays:r.plays,samples:r.samples,errors:api.errors,remaining:api.fx.audit().active,canvasCount:document.querySelectorAll('canvas').length};});
  const {base64,...rest}=result,file=rate===1?'16-effects-normal.webm':'16-effects-half-speed.webm';await fs.writeFile(dir+file,Buffer.from(base64,'base64'));reports.push({rate,file,...rest});console.log(file+' saved, '+rest.plays.length+' effects');
 }
 await fs.writeFile(dir+'recording.json',JSON.stringify({capture:'Existing V3 postrender; offline text header; actual GSAP timing',physicalDevice:false,reports},null,2));
}finally{await browser.close();}

import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});const reports=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}});await page.goto('http://127.0.0.1:18804/');await page.waitForFunction(()=>advancementReview.ready);
 for(const rate of [1,.5]){
  await page.evaluate(async rate=>{
   const a=advancementReview;a.cancel();
   for(const id of ['avenger','shield-knight','commander']){await a.state(id);a.stateFx.cancel();}
   const source=a.engine.app.canvas,capture=document.createElement('canvas');capture.width=1280;capture.height=Math.round(source.height/source.width*1280)+52;
   const context=capture.getContext('2d'),stream=capture.captureStream(0),track=stream.getVideoTracks()[0],chunks=[];
   const media=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:6000000});let last=0,lastSample=0;
   const r=a.stateRecording={media,stream,chunks,rate,phases:[],samples:[],label:'용병 전직 지속 효과',start:performance.now()};
   r.hook={postrender(){const now=performance.now();if(now-last<30)return;last=now;context.fillStyle='#07101b';context.fillRect(0,0,capture.width,capture.height);context.drawImage(source,0,52,1280,capture.height-52);context.fillStyle='#fff';context.font='bold 23px Malgun Gothic';context.fillText(r.label+' / '+rate+'배',20,34);track.requestFrame();if(now-lastSample>100){lastSample=now;r.samples.push({time:now-r.start,label:r.label,states:a.stateFx.audit().rows.map(row=>({id:row.id,visible:row.sprites.filter(s=>s.visible).length,frames:row.sprites.map(s=>s.frame)}))});}}};
   a.engine.app.renderer.runners.postrender.add(r.hook);media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};media.start();
  },rate);
  const phases=await page.evaluate(async rate=>{
   const a=advancementReview,s=a.stateFx,r=a.stateRecording;
   const hold=duration=>a.engine.timeline(t=>t.to({v:0},{v:1,duration,ease:'none'}),()=>{},rate);
   const mark=label=>{r.label=label;r.phases.push({label,at:performance.now()-r.start,states:s.audit()});};
   await a.state('avenger');s.setSpeed(rate);mark('복수자 · 피격 후 충전 유지');await hold(1.6);
   await a.state('avenger',{charged:false});const av=await a.play('avenger',{speed:rate});mark('복수자 · 다음 공격에 충전 소모');await av.done;await hold(.25);
   for(const count of [3,2,1,0]){
    await a.state('shield-knight',{remaining:count});s.setSpeed(rate);if(count<3){const burst=await a.fx.play(a.event('shield-knight'),{speed:rate});await burst.done;}
    mark('방패기사 · 남은 방패 '+count+'장');await hold(.75);
   }
   await a.state('commander');s.setSpeed(rate);mark('지휘관 · 아군 전체 강화 유지');await hold(1.8);
   await a.state('commander',{active:false});mark('지휘관 · 지휘 종료 시 아군 표식 제거');await hold(.6);
   return r.phases;
  },rate);
  const result=await page.evaluate(async()=>{const a=advancementReview,r=a.stateRecording;a.engine.app.renderer.runners.postrender.remove(r.hook);await new Promise(done=>{r.media.onstop=done;r.media.stop();});r.stream.getTracks().forEach(t=>t.stop());const bytes=new Uint8Array(await new Blob(r.chunks).arrayBuffer());let data='';for(const n of bytes)data+=String.fromCharCode(n);return {base64:btoa(data),samples:r.samples,errors:a.errors,remaining:a.stateFx.audit().active,bursts:a.fx.audit().active,canvasCount:document.querySelectorAll('canvas').length};});
  const {base64,...observations}=result,file=rate===1?'sustained-states-normal.webm':'sustained-states-half-speed.webm';await fs.writeFile(dir+file,Buffer.from(base64,'base64'));reports.push({rate,file,phases,...observations});console.log(file+' saved');
 }
 await fs.writeFile(dir+'recording.json',JSON.stringify({capture:'Offline postrender copy of current V3 canvas; visual fixture states only',physicalDevice:false,reports},null,2));
}finally{await browser.close();}

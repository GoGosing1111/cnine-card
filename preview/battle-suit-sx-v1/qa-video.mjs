import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const b=await chromium.launch({channel:'chrome',headless:true}),report=[],out=fileURLToPath(new URL('qa/slash-v2/',import.meta.url));
await fs.mkdir(out,{recursive:true});
try{for(const name of ['desktop','mobile']){
 const p=await b.newPage({viewport:{width:1500,height:1300}});await p.goto('http://127.0.0.1:8975/preview/battle-suit-sx-v1/battle.html');
 await p.setContent('<video id="v" muted preload="auto" style="width:320px;display:block"></video><canvas id="c"></canvas>');
 const r=await p.evaluate(async name=>{
  const v=document.querySelector('video'),c=document.querySelector('canvas');v.src=URL.createObjectURL(await(await fetch('http://127.0.0.1:8975/preview/battle-suit-sx-v1/review-'+name+'-v2.webm')).blob());
  await new Promise((r,j)=>{v.onloadedmetadata=r;v.onerror=()=>j(Error(v.error?.message));});
  const width=name==='mobile'?234:480,height=Math.round(width*v.videoHeight/v.videoWidth),times=[.55,1.48,2.3,3.4,5.3,6.28,7.08,8.5,9.72,10.52,11.52,12.62,13.53,14.32,16.7],cols=name==='mobile'?5:3;
  c.width=cols*width;c.height=Math.ceil(times.length/cols)*(height+28);const x=c.getContext('2d');x.fillStyle='#0a1426';x.fillRect(0,0,c.width,c.height);const marks=[];
  for(const [i,t]of times.entries()){
   const frame=new Promise((r,j)=>{const timeout=setTimeout(()=>j(Error('Video frame decode timeout '+t)),6000);const next=()=>v.requestVideoFrameCallback((_,m)=>{if(m.mediaTime>=t-.07&&m.mediaTime<t+.25){clearTimeout(timeout);r(m);}else next();});next();});
   const seek=new Promise(r=>v.onseeked=r);v.currentTime=t;await seek;await v.play();const m=await frame;v.pause();
   x.drawImage(v,i%cols*width,Math.floor(i/cols)*(height+28),width,height);x.fillStyle='#b9d8ff';x.font='15px system-ui';x.fillText(t.toFixed(2)+'s',i%cols*width+10,Math.floor(i/cols)*(height+28)+height+20);marks.push({requested:t,frameTime:m.mediaTime});
  }return{duration:v.duration,width:v.videoWidth,height:v.videoHeight,marks};
 },name);
 await p.locator('canvas').screenshot({path:out+'filmstrip-'+name+'.png'});report.push({name,...r});console.log(name+' decoded 15 actual video frames');await p.close();
}await fs.writeFile(out+'video-decode-report.json',JSON.stringify(report,null,2)+'\n');}finally{await b.close();}

import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('./',import.meta.url)),dir=root+'qa/video/',browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
await fs.mkdir(dir,{recursive:true});
try{for(const name of ['desktop','mobile']){
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:8975/preview/battle-suit-sx-v1/ultimate-v3/manifest.json');
 const decoded=await page.evaluate(async name=>{
  document.body.innerHTML='';const video=document.createElement('video');video.muted=true;video.preload='auto';document.body.appendChild(video);
  const loaded=new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('video decode failed'));});
  video.src=URL.createObjectURL(await(await fetch('/preview/battle-suit-sx-v1/ultimate-v3/review-'+name+'-v3.webm')).blob());await loaded;
  if(!Number.isFinite(video.duration)){await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=1e6;});}
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d'),frames=[];
  for(const t of [.34,.8,1.4,1.95,2.2,2.42,2.76,3.4,4.1,4.9,5.6,6.15]){
   const decoded=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Actual video frame timeout '+t)),6000);
    const next=()=>video.requestVideoFrameCallback((_,meta)=>{if(meta.mediaTime>=t-.075&&meta.mediaTime<t+.25){clearTimeout(timer);resolve(meta);}else next();});next();
   });
   await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=Math.min(t,video.duration-.04);});
   await video.play();const frame=await decoded;video.pause();
   ctx.drawImage(video,0,0);frames.push({t,frameTime:frame.mediaTime,data:canvas.toDataURL('image/png')});
  }
  return{width:video.videoWidth,height:video.videoHeight,duration:video.duration,frames};
 },name);
 const parts=[],cellWidth=name==='desktop'?480:260,cellHeight=Math.round(cellWidth*decoded.height/decoded.width);
 for(const [i,frame]of decoded.frames.entries()){
  const bytes=Buffer.from(frame.data.split(',')[1],'base64');
  await fs.writeFile(dir+name+'-video-'+String(i+1).padStart(2,'0')+'.png',bytes);
  parts.push({input:await sharp(bytes).resize(cellWidth,cellHeight).png().toBuffer(),left:i%3*cellWidth,top:Math.floor(i/3)*cellHeight});
 }
 await sharp({create:{width:cellWidth*3,height:cellHeight*4,channels:4,background:'#091225'}}).composite(parts).png().toFile(dir+'filmstrip-'+name+'.png');
 const data=await fs.readFile(root+'review-'+name+'-v3.webm');
 report.push({name,width:decoded.width,height:decoded.height,duration:decoded.duration,decodedFrames:decoded.frames.length,timestamps:decoded.frames.map(f=>({requested:f.t,decoded:f.frameTime})),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
 await page.close();
}}finally{await browser.close();}
await fs.writeFile(dir+'video-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

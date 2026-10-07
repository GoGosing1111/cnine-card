import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const files=['C:/Users/User/Desktop/TzyFdcJ5KFQ2v56padUuHx1sP3IVoKgQgjsK6wZC9i-GsSdRB90eebAz5ZpJmsWoP_Y6kbevJL9rN0rO9khD3w.mp4','C:/Users/User/Desktop/mvgCey2qFOasG6GAtFvQNozShAAZhq_oI1WoFFu4MeJhK5G0PMUi0NtLC1rNr0r_xFe-R_HXsFHvGjU6njP69g.mp4'];
const out=fileURLToPath(new URL('qa/references/',import.meta.url));await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
try {for(const [i,file] of files.entries()){
 const bytes=await fs.readFile(file),p=await browser.newPage({viewport:{width:1600,height:1200}});
 await p.setContent('<video muted playsinline></video><canvas></canvas>');
 const result=await p.evaluate(async data=>{
  const v=document.querySelector('video'),c=document.querySelector('canvas');v.src='data:video/mp4;base64,'+data;await new Promise((r,j)=>{v.onloadedmetadata=r;v.onerror=()=>j(Error(v.error?.message));});
  const width=360,height=Math.round(width*v.videoHeight/v.videoWidth),n=24,cols=4;c.width=cols*width;c.height=Math.ceil(n/cols)*(height+28);const ctx=c.getContext('2d'),marks=[],frames=[];
  ctx.fillStyle='#101827';ctx.fillRect(0,0,c.width,c.height);
  for(let k=0;k<n;k++){const t=.04+(v.duration-.15)*k/(n-1),ready=new Promise((r,j)=>{const id=setTimeout(()=>j(Error('Decode timeout '+t)),8000);const next=()=>v.requestVideoFrameCallback((_,m)=>{if(m.mediaTime>=t-.08&&m.mediaTime<t+.25){clearTimeout(id);r(m.mediaTime);}else next();});next();});const seek=new Promise(r=>v.onseeked=r);v.currentTime=t;await seek;await v.play();const actual=await ready;v.pause();ctx.drawImage(v,k%cols*width,Math.floor(k/cols)*(height+28),width,height);ctx.fillStyle='#dbeaff';ctx.font='15px sans-serif';ctx.fillText(actual.toFixed(2)+'s',k%cols*width+8,Math.floor(k/cols)*(height+28)+height+20);marks.push({requested:t,actual});}
  return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,marks,png:c.toDataURL('image/png')};
 },bytes.toString('base64'));
 await fs.writeFile(out+'reference-'+(i+1)+'-filmstrip.png',Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
 report.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...result});console.log(JSON.stringify(report.at(-1)));await p.close();
}await fs.writeFile(out+'metadata.json',JSON.stringify(report,null,2)+'\n');} finally {await browser.close();}

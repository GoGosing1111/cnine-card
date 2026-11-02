import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import sharp from 'sharp';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),base='http://127.0.0.1:18766',url='/preview/v35-whitecoat-swordsman-20261102/qa/sword-trail/';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
const report={recordings:[],page:[],legacy:[],realDevice:false,continuousVideoWatched:false};
try{
 const p=await browser.newPage();await p.goto(base+'/fixture.json');await p.setContent('<video muted preload="auto"></video>');
 for(const state of ['off','on']){
  const meta=await p.evaluate(async src=>{const v=document.querySelector('video'),b=await(await fetch(src)).blob();v.src=URL.createObjectURL(b);await new Promise(r=>v.onloadeddata=r);if(!Number.isFinite(v.duration)){v.currentTime=1e6;await new Promise(r=>v.onseeked=r);}return {duration:v.duration,width:v.videoWidth,height:v.videoHeight};},url+'normal-effects-'+state+'.webm');
  const composites=[],times=[],count=36,cw=240,ch=180;
  for(let i=0;i<count;i++){
   const time=.04+i*.065,png=await p.evaluate(async t=>{const v=document.querySelector('video');if(Math.abs(v.currentTime-t)>.0001){const done=new Promise(r=>v.onseeked=r);v.currentTime=t;await done;}const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return c.toDataURL().split(',')[1];},time);
   const crop=await sharp(Buffer.from(png,'base64')).extract({left:Math.round(meta.width*.43),top:Math.round(meta.height*.25),width:Math.round(meta.width*.38),height:Math.round(meta.height*.45)}).resize(cw,ch,{fit:'contain',background:'#162232'}).png().toBuffer();
   composites.push({input:crop,left:i%6*cw,top:Math.floor(i/6)*(ch+20)});times.push(time);
  }
  const labels=times.map((t,i)=>`<text x="${i%6*cw+8}" y="${Math.floor(i/6)*(ch+20)+ch+15}" fill="#e4edf5" font-size="13" font-family="Arial">${t.toFixed(3)}s</text>`).join('');
  composites.push({input:Buffer.from(`<svg width="1440" height="1200">${labels}</svg>`),left:0,top:0});
  await sharp({create:{width:1440,height:1200,channels:4,background:'#162232'}}).composite(composites).png().toFile(dir+'normal-'+state+'-sampled.png');report.recordings.push({state,...meta,times});
 }
 await p.close();
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/preview/v35-whitecoat-swordsman-20261102/review.html');await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>v.readyState>=2));
  const checks=await page.evaluate(async()=>{
   const results=[];
   for(const v of document.querySelectorAll('video')){
    const sample=()=>{const c=document.createElement('canvas');c.width=240;c.height=140;c.getContext('2d').drawImage(v,0,0,240,140);return c.toDataURL();};
    v.muted=true;const before=sample();await v.play();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Video stalled')),6000);const f=()=>{if(v.currentTime>1.3){clearTimeout(timer);v.removeEventListener('timeupdate',f);resolve();}};v.addEventListener('timeupdate',f);});v.pause();const changed=before!==sample();const done=new Promise(r=>v.onseeked=r);v.currentTime=.4;await done;await v.play();await new Promise(r=>setTimeout(r,200));v.pause();results.push({src:v.getAttribute('src'),changed,resumed:v.currentTime>.4,error:v.error?.message||null});
   }
   return {videos:results,noOverflow:document.documentElement.scrollWidth<=innerWidth};
  });
  await page.screenshot({path:dir+'review-'+(mobile?'mobile':'pc')+'.png'});report.page.push({mobile,checks,errors});await page.close();
 }
 for(const kind of ['mixed','cardgu']){
  const page=await browser.newPage();await page.goto(base+'/?case='+kind);await page.waitForFunction(()=>v35Review.ready);for(let i=0;i<2;i++)await page.evaluate(async i=>{await v35Review.attack(i);},i);
  const a=await page.evaluate(()=>v35Review.audit());report.legacy.push({kind,passed:a.impacts.length===2&&a.errors.length===0&&a.canvasCount===1});await page.close();
 }
 const range=await fetch(base+url+'normal-effects-on.webm',{headers:{Range:'bytes=1024-2047'}}),data=await fs.readFile(dir+'normal-effects-on.webm');report.range={status:range.status,exactBytes:Buffer.from(await range.arrayBuffer()).equals(data.subarray(1024,2048))};
 report.passed=report.recordings.every(r=>r.duration>6)&&report.page.every(p=>!p.errors.length&&p.checks.noOverflow&&p.checks.videos.every(v=>v.changed&&v.resumed&&!v.error&&v.src.includes('sword-trail/')))&&report.legacy.every(r=>r.passed)&&report.range.status===206&&report.range.exactBytes;
}catch(error){report.error=error.stack;report.passed=false;}
finally{await fs.writeFile(dir+'review-video.json',JSON.stringify(report,null,2));console.log({passed:report.passed,page:report.page,legacy:report.legacy,range:report.range,error:report.error});await browser.close();if(!report.passed)process.exitCode=1;}

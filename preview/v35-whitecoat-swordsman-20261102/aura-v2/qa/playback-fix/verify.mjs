import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {browser} from '../../../swordplay-v5/qa/probe.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url));
const url='http://127.0.0.1:18766/preview/v35-whitecoat-swordsman-20261102/review.html?v=playback-20261105';
const checks=[],check=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
const recording=JSON.parse(await fs.readFile(dir+'../recording.json'));
const state=p=>p.locator('#swordplay-film').evaluate(v=>{
 const c=document.createElement('canvas');c.width=144;c.height=86;
 const x=c.getContext('2d');x.drawImage(v,0,0,c.width,c.height);
 const d=x.getImageData(0,0,c.width,c.height).data;
 let min=255,max=0,sum=0,sum2=0,alpha=0;
 for(let i=0;i<d.length;i+=4){const y=(d[i]+d[i+1]+d[i+2])/3;min=Math.min(min,y);max=Math.max(max,y);sum+=y;sum2+=y*y;alpha+=d[i+3];}
 const n=d.length/4;
 return {src:v.currentSrc,time:v.currentTime,duration:v.duration,paused:v.paused,ended:v.ended,
  frames:v.getVideoPlaybackQuality().totalVideoFrames,error:v.error?.message,
  min,max,std:Math.sqrt(sum2/n-(sum/n)**2),meanAlpha:alpha/n};
});
const b=await browser();
try{
 for(const width of [1440,390]){
  const p=await b.newPage({viewport:{width,height:940}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url);await p.waitForFunction(()=>document.querySelector('#swordplay-film').currentTime>.15);
  for(const file of ['four-skills.webm','four-skills-half.webm','four-skills-body.webm']){
   await p.locator(`[data-film="${file}"]`).click();
   await p.waitForFunction(()=>{const v=document.querySelector('#swordplay-film');return !v.paused&&!v.seeking&&v.currentTime>.15&&v.currentTime<1.5});
   const s=await state(p);
   check(`${width}/${file} decodes visible frames and advances`,s.src.endsWith(file.replace('.webm','.mp4'))&&s.frames>2&&s.max>100&&s.std>15&&s.meanAlpha===255&&!s.error,s);
   const chapters=recording.records.find(r=>r.file===file).chapters;
   for(const chapter of chapters){
    await p.locator(`[data-cast="${chapter.id}"]`).click();
    await p.waitForFunction(start=>{const v=document.querySelector('#swordplay-film');return !v.seeking&&!v.paused&&v.currentTime>=Math.max(0,start-.065)&&v.currentTime<start+.6},chapter.start);
    check(`${width}/${file}/${chapter.id} seeks and plays`,true);
   }
  }
  await p.locator('[data-film="four-skills.webm"]').click();
  await p.waitForFunction(()=>document.querySelector('#swordplay-film').currentTime<1);
  await p.locator('#play-toggle').click();
  const stopped=await state(p);await p.waitForTimeout(150);
  const after=await state(p);
  check(width+' pause freezes playback',stopped.paused&&after.paused&&Math.abs(stopped.time-after.time)<.025,{stopped:stopped.time,after:after.time});
  await p.locator('#play-toggle').click();
  await p.waitForFunction(t=>document.querySelector('#swordplay-film').currentTime>t+.1,after.time);
  check(width+' resume advances',!(await state(p)).paused);
  await p.locator('#play-loop').uncheck();
  await p.locator('#swordplay-film').evaluate(v=>{v.currentTime=v.duration-.12});
  await p.waitForFunction(()=>document.querySelector('#swordplay-film').ended);
  const end=await state(p);
  check(width+' end keeps a visible frame',end.max>100&&end.std>15&&end.meanAlpha===255,end);
  await p.locator('#play-restart').click();
  await p.waitForFunction(()=>{const v=document.querySelector('#swordplay-film');return !v.paused&&v.currentTime>.05&&v.currentTime<1});
  check(width+' restart after end returns to beginning',true);
  await p.locator('#play-loop').check();
  await p.locator('#swordplay-film').evaluate(v=>{v.currentTime=v.duration-.12});
  await p.waitForFunction(()=>{const v=document.querySelector('#swordplay-film');return !v.paused&&v.currentTime<1});
  check(width+' repeat resumes from beginning',true);
  check(width+' page fits and has no script errors',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&!errors.length,errors);
  if(width===1440){await p.locator('[data-cast="skill_wheel"]').click();await p.waitForTimeout(270);await p.locator('#play-toggle').click();}
  await p.screenshot({path:dir+`review-${width}.png`});await p.close();
 }
 const slow=await b.newPage();
 await slow.route('**/recording.json',async route=>{await new Promise(r=>setTimeout(r,1800));await route.continue()});
 await slow.goto(url,{waitUntil:'domcontentloaded'});
 await slow.locator('[data-film="four-skills.webm"]').click();
 await slow.waitForFunction(()=>document.querySelector('#swordplay-film').currentTime>.1,{},{timeout:1500});
 check('Playback does not depend on chapter JSON resolving',true);await slow.close();
 const fallback=await b.newPage();
 await fallback.route('**/*.mp4',route=>route.fulfill({status:404,body:''}));
 await fallback.goto(url);await fallback.locator('[data-film="four-skills.webm"]').click();
 await fallback.waitForFunction(()=>{const v=document.querySelector('#swordplay-film');return v.currentSrc.endsWith('.webm')&&v.currentTime>.1&&!v.paused});
 check('Unavailable MP4 falls back to original recording',true);await fallback.close();
 const manifest=JSON.parse(await fs.readFile(dir+'../../playback/manifest.json'));
 for(const f of manifest.files){
  const data=await fs.readFile(dir+'../'+f.file.replace('.mp4','.webm'));
  check(f.file+' original preserved',createHash('sha256').update(data).digest('hex')===f.sourceSha256);
  const response=await fetch(new URL('aura-v2/playback/'+f.file,url),{headers:{Range:'bytes=0-1023'}});
  check(f.file+' served with video MIME and seek range',response.status===206&&response.headers.get('content-type')==='video/mp4'&&response.headers.get('content-range')?.startsWith('bytes 0-1023/'));
  await response.arrayBuffer();
 }
}catch(error){check('Execution',false,error.stack)}finally{
 await b.close();const failed=checks.filter(c=>!c.pass);
 await fs.writeFile(dir+'verification.json',JSON.stringify({passed:!failed.length,checks},null,2)+'\n');
 console.log({checks:checks.length,failed});if(failed.length)process.exitCode=1;
}

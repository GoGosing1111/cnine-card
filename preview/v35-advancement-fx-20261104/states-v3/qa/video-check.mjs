import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),record=JSON.parse(await fs.readFile(dir+'recording.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio']});const reports=[];
try{
 const page=await browser.newPage();
 for(const row of record.reports){
  await page.goto('http://127.0.0.1:18804/preview/v35-advancement-fx-20261104/states-v3/qa/'+row.file);await page.waitForSelector('video');
  const info=await page.evaluate(async()=>{const v=document.querySelector('video');v.pause();if(v.readyState<2)await new Promise(r=>v.addEventListener('loadeddata',r,{once:true}));return {width:v.videoWidth,height:v.videoHeight,ready:v.readyState};});
  const frames=[];
  for(const index of [0,2,3,4,5,6,7]){
   const phase=row.phases[index],time=phase.at/1000+.25/row.rate;
   const data=await page.evaluate(async time=>{const v=document.querySelector('video');await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=time;});const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return c.toDataURL('image/png').split(',')[1];},time);
   const file=row.file.replace('.webm','')+'-phase-'+index+'.png';await fs.writeFile(dir+file,Buffer.from(data,'base64'));frames.push({index,time,label:phase.label,file});
  }
  reports.push({file:row.file,...info,frames,endedWithoutResidue:row.remaining===0&&row.bursts===0,singleCanvas:row.canvasCount===1,noErrors:row.errors.length===0});
 }
 await fs.writeFile(dir+'video-check.json',JSON.stringify({method:'Actual WebM decoding and seeked frame capture; sampled visual review, not full human playback',reports},null,2));
 if(reports.some(r=>!r.width||!r.endedWithoutResidue||!r.singleCanvas||!r.noErrors))throw Error('Video check failed');console.log('2 videos decoded; 14 phase frames extracted; no remaining effects or errors');
}finally{await browser.close();}

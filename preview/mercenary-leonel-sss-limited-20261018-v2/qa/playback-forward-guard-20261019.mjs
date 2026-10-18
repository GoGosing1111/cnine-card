import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),sharp=require('C:/Users/User/Downloads/upload/cnine-card/node_modules/sharp');
const out=new URL('forward-guard-20261019/',import.meta.url),browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
 for(const label of ['desktop','mobile']){
  const page=await browser.newPage({viewport:{width:1440,height:620}});
  await page.goto('http://127.0.0.1:8997/preview/mercenary-leonel-sss-limited-20261018-v2/qa/forward-guard-20261019/'+label+'-motion-fixed.webm');
  const video=page.locator('video');await video.waitFor();await video.evaluate(v=>{v.muted=true;v.controls=false;v.style.width='1440px';v.style.height='600px';v.currentTime=0;return v.play();});
  const frames=[];let last=0;
  for(const at of [.5,2.5,4.35,5.55,6.7,8.6]){
   await page.waitForTimeout((at-last)*1000);last=at;
   const state=await video.evaluate(v=>({time:v.currentTime,width:v.videoWidth,height:v.videoHeight,error:v.error?.message||null}));assert(!state.error&&state.width>0);
   if(label==='desktop')frames.push(await sharp(await video.screenshot()).resize(720,300,{fit:'contain'}).png().toBuffer());
  }
  await page.waitForFunction(()=>document.querySelector('video').ended,null,{timeout:15000});
  const state=await video.evaluate(v=>({duration:v.duration,time:v.currentTime,ended:v.ended,width:v.videoWidth,height:v.videoHeight,error:v.error?.message||null}));assert(state.duration>8&&state.ended&&!state.error);results.push({label,...state});
  if(frames.length)await sharp({create:{width:1440,height:900,channels:4,background:'#080d14'}}).composite(frames.map((input,i)=>({input,left:i%2*720,top:Math.floor(i/2)*300}))).png().toFile(fileURLToPath(new URL('video-contact.png',out)));
  await page.close();
 }
 await fs.writeFile(new URL('video-playback.json',out),JSON.stringify({status:'REAL_PLAYBACK_PASS',results},null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close();}

import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),sharp=require('C:/Users/User/Downloads/upload/cnine-card/node_modules/sharp');
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:500}}),frames=[];
try{
 await page.goto('http://127.0.0.1:8985/preview/mercenary-leonel-sss-limited-20261018-v2/review-v2.webm');
 const v=page.locator('video');await v.waitFor();
 await v.evaluate(async x=>{x.muted=true;x.controls=false;x.style.width='1440px';x.style.height='402px';x.pause();x.currentTime=0;await x.play();});
 let last=0;
 for(const at of [.4,1,1.8,2.6,3.4,4.5,5.3,6.2,7.1,8.4,9.5]){
  await page.waitForTimeout((at-last)*1000);last=at;
  const state=await v.evaluate(x=>({time:x.currentTime,width:x.videoWidth,height:x.videoHeight,paused:x.paused,ended:x.ended,error:x.error?.message||null}));
  if(state.error||!state.width)throw Error('Video decode failure');
  const bytes=await v.screenshot();frames.push({at,...state,bytes});
 }
 await page.waitForTimeout(1200);const ended=await v.evaluate(x=>({ended:x.ended,time:x.currentTime,error:x.error?.message||null}));
 if(!ended.ended||ended.error)throw Error('Video did not finish decoding');
 const w=720,h=232,images=[];
 for(let i=0;i<frames.length;i++){const f=frames[i];images.push({input:await sharp(f.bytes).resize(w,201).png().toBuffer(),left:i%2*w,top:Math.floor(i/2)*h+26});}
 const labels=frames.map((f,i)=>'<text x="'+(i%2*w+10)+'" y="'+(Math.floor(i/2)*h+20)+'" fill="white" font-size="15">'+f.time.toFixed(2)+'s / actual WebM playback</text>').join('');
 await sharp({create:{width:w*2,height:h*Math.ceil(frames.length/2),channels:4,background:'#0a0c14'}}).composite([...images,{input:Buffer.from('<svg width="'+(w*2)+'" height="'+(h*Math.ceil(frames.length/2))+'">'+labels+'</svg>')}]).png().toFile(new URL('qa/video-contact-v2.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'));
 await fs.writeFile(new URL('qa/video-playback-v2.json',import.meta.url),JSON.stringify({status:'PASS_DECODE_AND_REAL_PLAYBACK',ended,frames:frames.map(({bytes,...f})=>f)},null,2)+'\n');
 console.log(JSON.stringify({frames:frames.length,ended}));
}finally{await browser.close();}

import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import sharp from 'sharp';
const dir=fileURLToPath(new URL('./',import.meta.url));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,timeout:20000,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1280,height:1120},deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:18763'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:18763/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.rigReview?.ready,{timeout:30000});
 const initial=await page.evaluate(()=>rigReview.sample());console.log(JSON.stringify(initial));
 for(const background of ['dark','light'])for(const mode of ['source','rig']){
  await page.evaluate(({background,mode})=>{rigReview.setBackground(background);rigReview.setMode(mode);rigReview.select('setup',false);},{background,mode});await page.waitForTimeout(150);
  await page.locator('#stage').screenshot({path:path.join(dir,`setup-${background}-${mode}.png`)});
 }
 const comparisons=[];for(const background of ['dark','light']){
  const {data:a,info}=await sharp(path.join(dir,`setup-${background}-source.png`)).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(path.join(dir,`setup-${background}-rig.png`)).ensureAlpha().raw().toBuffer();let sum=0,max=0,over8=0;
  for(let i=0;i<a.length;i+=4){let px=0;for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);sum+=d;px=Math.max(px,d);max=Math.max(max,d);}if(px>8)over8++;}
  comparisons.push({background,width:info.width,height:info.height,meanAbsoluteRgbError:sum/(info.width*info.height*3),maxChannelDifference:max,pixelsOver8:over8});
 }
 await page.evaluate(()=>{rigReview.setMode('rig');rigReview.setBackground('dark');});await page.screenshot({path:path.join(dir,'setup-desktop.png'),fullPage:true});
 await fs.writeFile(path.join(dir,'static-compare.json'),JSON.stringify({initial,comparisons,errors,visualReview:'pending'},null,2));console.log(JSON.stringify({comparisons,errors}));
 await context.close();
}finally{await browser.close();}

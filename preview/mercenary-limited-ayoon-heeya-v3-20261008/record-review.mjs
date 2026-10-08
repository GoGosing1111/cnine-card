import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {file} from './inspect-assets.mjs';
const {chromium}=await import(pathToFileURL('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
await fs.mkdir(file('qa/video'),{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{for(const [name,viewport]of [['pc',{width:1440,height:1100}],['mobile',{width:390,height:1260}]]){
 const context=await browser.newContext({viewport,recordVideo:{dir:file('qa/video'),size:viewport}}),page=await context.newPage();
 await page.goto('http://127.0.0.1:8848/preview/mercenary-limited-ayoon-heeya-v3-20261008/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.LimitedDuoPreview?.fx);
 for(const code of ['V-997','V-998']){
  await page.selectOption('#character',code);await page.waitForFunction(c=>window.LimitedDuoPreview.fx?.plan.code===c,code);
  for(const mode of ['basic','skill']){
   await page.selectOption('#mode',mode);await page.waitForFunction(m=>window.LimitedDuoPreview.fx?.plan.mode===m,mode);
   await page.evaluate(()=>{const f=window.LimitedDuoPreview.fx;f.seek(0);f.setSpeed(1);f.play();});
   await page.waitForFunction(()=>window.LimitedDuoPreview.fx.time>=window.LimitedDuoPreview.fx.plan.duration);
  }
  await page.locator('#effects').uncheck();await page.evaluate(()=>{const f=window.LimitedDuoPreview.fx;f.seek(0);f.setSpeed(.5);f.play();});
  await page.waitForFunction(()=>window.LimitedDuoPreview.fx.time>=window.LimitedDuoPreview.fx.plan.duration);await page.locator('#effects').check();
 }
 const video=page.video();await context.close();await video.saveAs(file('qa/review-'+name+'.webm'));await video.delete();
}}finally{await browser.close();}
console.log('Recorded actual V3 1x and 0.5x/FX-off playback on PC and mobile.');

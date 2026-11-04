import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
const results=[];
try{
 for(const [name,width,height]of [['pc',1440,950],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push([r.status(),r.url()]);});
  await page.goto('http://127.0.0.1:18804/');await page.waitForFunction(()=>advancementReview?.ready||advancementReview?.errors.length,null,{timeout:90000});
  if(!await page.evaluate(()=>advancementReview.ready))throw Error(JSON.stringify(await page.evaluate(()=>advancementReview.errors)));
  await page.click('#openAdvancement');await page.waitForFunction(()=>advancementReview.advancementWindow.audit().snapshot&&!advancementReview.advancementWindow.audit().busy);
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:dir+name+'-selection.png'});
  const layout=await page.evaluate(()=>({dialog:{w:document.querySelector('.adv-window').scrollWidth,client:document.querySelector('.adv-window').clientWidth},body:document.body.scrollWidth,window:innerWidth,images:[...document.querySelectorAll('.adv-window img')].map(i=>({src:i.src,loaded:i.complete&&i.naturalWidth>0})),scroll:{height:document.querySelector('.adv-scroll').clientHeight,total:document.querySelector('.adv-scroll').scrollHeight}}));
  await page.locator('[data-action="confirm"]').click();await page.screenshot({path:dir+name+'-confirm.png'});
  await page.locator('[data-action="close"]').first().click();
  for(const state of ['avenger-charge','shield-3','shield-2','shield-1','commander']){
   await page.evaluate(async s=>{await advancementReview.showState(s);advancementReview.stateFx.seek(.3);advancementReview.engine.app.render();},state);
   await page.screenshot({path:dir+name+'-'+state+'.png'});
  }
  results.push({name,layout,errors,failed,audit:await page.evaluate(()=>advancementReview.audit())});await page.close();
 }
 await fs.writeFile(dir+'smoke.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({name,layout,errors,failed})=>({name,layout,errors,failed})),null,2));
}finally{await browser.close();}

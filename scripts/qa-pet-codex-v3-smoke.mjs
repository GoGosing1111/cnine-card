import {chromium} from 'file:///C:/Program%20Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true}),out='docs/qa/pet-rework-20261114/unified';
await fs.mkdir(out,{recursive:true});
for(const width of [1440,768,390,320]){
 const page=await browser.newPage({viewport:{width,height:width>800?1000:844}});
 page.on('pageerror',error=>console.log('ERROR '+error.message));
 await page.goto('http://127.0.0.1:18874/pet-codex/');
 await page.locator('[data-pg-action="roll"][data-kind="stats"]:not([disabled])').waitFor();
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.pet-codex-v3 img')].filter(x=>x.getBoundingClientRect().left<innerWidth).map(x=>x.decode().catch(()=>{})));});
 console.log(JSON.stringify(await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,missing:[...document.images].filter(x=>x.getBoundingClientRect().left<innerWidth&&(!x.complete||!x.naturalWidth)).map(x=>x.src),small:[...document.querySelectorAll('button,select,input,summary')].filter(x=>x.getClientRects().length&&x.getBoundingClientRect().height<43).map(x=>x.textContent.trim())}))));
 await page.screenshot({path:out+'/first-'+width+'.png',fullPage:true});
 if(width===1440){
  await page.locator('[data-pg-action="roll"][data-kind="stats"]').click();await page.locator('[data-dice-phase="rolling"]').waitFor();await page.waitForTimeout(330);await page.screenshot({path:out+'/first-rolling.png',fullPage:true});
  await page.locator('[data-pg-action="apply"]').waitFor();await page.screenshot({path:out+'/first-result.png',fullPage:true});
 }
 await page.close();
}
await browser.close();

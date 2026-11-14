import {chromium} from 'file:///C:/Program%20Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const dir='docs/qa/pet-rework-20261114';await fs.mkdir(dir,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],requests=[];
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)requests.push({url:r.url(),status:r.status()});});
try{
 await page.goto('http://127.0.0.1:18874/pet-codex/');
 await page.locator('[data-pet-growth-open]').waitFor({timeout:15000});
 await page.screenshot({path:dir+'/codex-desktop.png',fullPage:true});
 await page.locator('[data-pet-growth-open]').click();await page.locator('[data-pg-action="roll"]').waitFor();
 await page.screenshot({path:dir+'/desktop.png',fullPage:true});
 console.log(JSON.stringify({errors,requests,title:await page.title(),stats:await page.locator('.pg-stat-list').innerText()}));
}catch(e){console.log(JSON.stringify({error:e.message,errors,requests,body:(await page.locator('body').innerText()).slice(0,1600)}));throw e;}
finally{await browser.close();}

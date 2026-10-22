import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import('file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),out=new URL('./',import.meta.url),rows=[];
try{for(const width of [1440,390,360]){
 const page=await browser.newPage({viewport:{width,height:width<700?844:960},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
 await page.goto('http://127.0.0.1:8941/docs/qa/tower-clock-auto-next-20261022/index.html?pve=tower&profile=layout-'+width+'-'+Date.now());
 await page.locator('[data-abyss-action="fight"]').click();await page.locator('[data-continuous-pause]:enabled').waitFor({timeout:45000});await page.locator('[data-continuous-pause]').click();
 const row=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return {width:innerWidth,auto:rect('.abyss-battle-auto button'),pause:rect('[data-continuous-pause]'),hud:rect('.abyss-combat-hud'),title:rect('.battle-v3-header strong'),overflow:document.documentElement.scrollWidth>innerWidth};});
 const separated=(a,b)=>a.x>=b.right||a.right<=b.x||a.y>=b.bottom||a.bottom<=b.y;
 assert.ok(separated(row.auto,row.hud));assert.ok(separated(row.auto,row.pause));assert.ok(separated(row.auto,row.title));assert.ok(row.auto.height>=44);assert.equal(row.overflow,false);
 await page.screenshot({path:fileURLToPath(new URL(width+'-layout-final.png',out))});rows.push(row);console.log('Final layout passed: '+width);await page.close();
}await fs.writeFile(new URL('layout-verification.json',out),JSON.stringify({checkedAt:new Date().toISOString(),rows},null,2)+'\n');}finally{await browser.close();}

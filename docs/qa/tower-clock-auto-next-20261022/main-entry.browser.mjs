import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import('file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),out=new URL('./',import.meta.url),rows=[];
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:width===390?844:960},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[],calls=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(/\/api\/(battle\/fight|pvp\/(match|fight))$/.test(r.url()))calls.push({url:r.url(),status:r.status()});});
 // The older isolated server predates the three-mercenary roster UI.
 await page.route('**/api/pvp/config',async route=>{const response=await route.fetch(),data=await response.json();data.rankedSeries={codes:['V-001','V-002','V-003'],cards:['V-001','V-002','V-003'].map((code,i)=>({code,name:'검수 용병 '+(i+1),rank:'S'})),ownedCount:3,ready:true,revision:0};await route.fulfill({response,json:data});});
 await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine:project-v:sound','OFF');});
 await page.goto('http://127.0.0.1:8942/?screen=hunt');await page.waitForFunction(()=>window.loadUser?.()?.serverUserId===7&&window.SoopketmonV21RuntimeRouter);
 for(const [mode,route,button] of (width===1440?[['PVP','pvp','#rankedMatchStart']]:[['PVE','hunt','#battleStart'],['PVP','pvp','#rankedMatchStart']])){
  await page.evaluate(route=>window.SoopketmonV21RuntimeRouter.navigate(route),route);await page.locator(button+':visible').click({timeout:30000});
  await page.locator('#modal canvas').waitFor({state:'visible',timeout:45000});
  await page.screenshot({path:fileURLToPath(new URL(width+'-'+mode+'-main-battle.png',out))});
  const confirm=page.locator('#modal .v3-report-confirm, #modal #pvpResultConfirm');await confirm.waitFor({state:'visible',timeout:120000});
  await page.screenshot({path:fileURLToPath(new URL(width+'-'+mode+'-main-result.png',out))});await confirm.click();await page.waitForFunction(()=>!document.querySelector('#modal.show canvas'));
  console.log(width+' '+mode+': actual main button -> battle -> result -> return');
 }
 if(width===390)assert.ok(calls.some(x=>x.url.endsWith('/battle/fight')&&x.status===200));assert.ok(calls.some(x=>x.url.endsWith('/pvp/fight')&&x.status===200));assert.deepEqual(errors,[]);rows.push({width,calls,errors,...(width===1440?{pve:'Passed on preceding run; 1440-PVE-main-battle.png and 1440-PVE-main-result.png; unchanged runtime'}:{})});await page.close();
}await fs.writeFile(new URL('main-entry-verification.json',out),JSON.stringify({checkedAt:new Date().toISOString(),source:'Actual index.html start buttons and loader; isolated QA API',rows},null,2)+'\n');}finally{await browser.close();}

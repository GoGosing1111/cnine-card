import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),out=new URL('./',import.meta.url),rows=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:960},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let release;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/js/battle-v2-live.js?**',async route=>{await gate;await route.continue();});
  const profile='account-entry-'+width+'-'+Date.now(),url=`http://127.0.0.1:8940/docs/qa/tower-account-entry-20261022/index.html?pve=tower&profile=${profile}`;
  await page.goto(url);const button=page.locator('[data-abyss-action="fight"]');await button.waitFor({state:'visible'});assert.match(await button.innerText(),/1층 도전/);
  assert.deepEqual(await page.evaluate(()=>Object.keys(loadUser())),['serverUserId','nickname','role']);
  await page.screenshot({path:fileURLToPath(new URL(width+'-entry.png',out)),fullPage:true});
  if(width===390)await button.locator('strong').tap();else await button.locator('strong').click();
  assert.equal(await button.getAttribute('aria-busy'),'true');assert.equal(await button.isDisabled(),true);assert.match(await button.innerText(),/전투 준비 중/);
  await page.screenshot({path:fileURLToPath(new URL(width+'-preparing.png',out))});release();
  await page.locator('[data-continuous-pause]').waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#modal canvas')?.width>0);
  assert.equal(await page.locator('[data-continuous-result]').count(),0);
  const state=await page.evaluate(()=>({userId:loadUser().serverUserId,starts:QA.calls.filter(r=>r.path==='tower/start'),pending:JSON.parse(sessionStorage.getItem('cnine:tower:battle:v2094:7')||'null'),legacyKey:sessionStorage.getItem('cnine:tower:battle:v2094:0'),overflow:document.documentElement.scrollWidth>innerWidth,sound:localStorage.getItem('cnine_battle_sound')}));
  assert.equal(state.starts.length,1);assert.equal(state.starts[0].status,200);assert.equal(state.pending.floorNo,1);assert.equal(state.legacyKey,null);assert.equal(state.overflow,false);assert.equal(state.sound,'OFF');
  await page.locator('[data-continuous-pause]').click();assert.match(await page.locator('[data-continuous-pause]').innerText(),/계속|재개/);
  await page.screenshot({path:fileURLToPath(new URL(width+'-battle.png',out))});
  let recovered=false;
  if(width===390){
   await page.goto(url);await page.locator('[data-continuous-pause]').waitFor({state:'visible',timeout:30000});
   const recovery=await page.evaluate(()=>({starts:QA.calls.filter(r=>r.path==='tower/start').length,pending:JSON.parse(sessionStorage.getItem('cnine:tower:battle:v2094:7'))}));
   assert.equal(recovery.starts,0);assert.equal(recovery.pending.requestId,state.pending.requestId);recovered=true;
   await page.screenshot({path:fileURLToPath(new URL(width+'-recovered.png',out))});
  }
  const audit=await page.evaluate(async profile=>await(await fetch(`/qa-api/${profile}/audit`)).json(),profile);assert.equal(audit.grants,0);assert.equal(Number(audit.progress.current_floor),1);assert.deepEqual(errors,[]);
  rows.push({width,userId:state.userId,startRequests:state.starts.length,startStatus:state.starts[0].status,floorNo:state.pending.floorNo,accountKey:'cnine:tower:battle:v2094:7',legacyKeyUsed:false,immediatePreparingFeedback:true,canvasVisible:true,pause:true,recovered,overflow:state.overflow,sound:state.sound,errors,audit});
  console.log(`Passed ${width}: actual login shape, 1st-floor start, immediate feedback, visible battle${recovered?', same-battle reload recovery':''}`);
  await page.close();
 }
 await fs.writeFile(new URL('browser-verification.json',out),JSON.stringify({checkedAt:new Date().toISOString(),source:'Actual game resource loader and Tower controller/API with isolated database; no production account writes',rows},null,2)+'\n');
}finally{await browser.close();}

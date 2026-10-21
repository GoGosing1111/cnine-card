import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),rows=[],out=new URL('./',import.meta.url);
try{
 for(const width of (process.env.QA_WIDTH?[Number(process.env.QA_WIDTH)]:[1440,390])){
  const name=`pw-${width}-${Date.now()}`,page=await browser.newPage({viewport:{width,height:width===390?844:960},isMobile:width===390,hasTouch:width===390,deviceScaleFactor:1,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:8938/docs/qa/tower-abyss-growth-20261022/index.html?pve=tower&profile=${name}${width===390?'&loseFinish=1':''}`;
  await page.goto(url);await page.locator('[data-abyss-action="fight"]').waitFor({state:'visible',timeout:30000});
  await page.screenshot({path:new URL(`${width}-entry.png`,out).pathname.replace(/^\/([A-Z]:)/i,'$1'),fullPage:true});
  await page.locator('[data-abyss-action="fight"]').click();
  await page.locator('[data-continuous-pause]').waitFor({state:'visible',timeout:30000});
  assert.equal(await page.locator('[data-continuous-result]').count(),0);
  const before=await page.evaluate(async name=>await(await fetch(`/qa-api/${name}/audit`)).json(),name);assert.equal(before.grants,0);assert.equal(Number(before.progress.current_floor),110);
  if(width===390){
   await page.locator('[data-continuous-pause]').click();assert.match(await page.locator('[data-continuous-pause]').innerText(),/계속|재개/);
   await page.screenshot({path:new URL(`${width}-paused.png`,out).pathname.replace(/^\/([A-Z]:)/i,'$1')});
   // Reload while unfinished. Server receipt restores the exact encounter.
   await page.goto(url);await page.locator('[data-continuous-pause]').waitFor({state:'visible',timeout:30000});
  }
  console.log(`Playback running ${width}`);
  await page.locator('.abyss-result-actions').waitFor({state:'visible',timeout:180000});
  if(width===390){
   assert.match(await page.locator('#modal').innerText(),/보상 확정 후 응답 유실/);
   await page.locator('[data-abyss-action="resume"]').click();
   await page.locator('.abyss-result-metrics').waitFor({state:'visible',timeout:30000});
  }
  const audit=await page.evaluate(async name=>await(await fetch(`/qa-api/${name}/audit`)).json(),name);
  assert.equal(audit.grants,1);assert.equal(audit.coin,600010000000);assert.equal(Number(audit.progress.current_floor),111);assert.deepEqual(errors,[]);
  const state=await page.evaluate(()=>({text:document.querySelector('#modal').innerText,calls:QA.calls,overflow:document.documentElement.scrollWidth>innerWidth,sound:localStorage.getItem('cnine_battle_sound')}));
  assert.match(state.text,/600,000,000,000/);assert.equal(state.overflow,false);assert.equal(state.sound,'OFF');
  await page.screenshot({path:new URL(`${width}-result.png`,out).pathname.replace(/^\/([A-Z]:)/i,'$1')});
  rows.push({width,audit,...state,errors});await fs.writeFile(new URL(`browser-${width}.json`,out),JSON.stringify(rows.at(-1),null,2)+'\n');console.log(`Passed ${width}`);await page.close();
 }
 await fs.writeFile(new URL('browser-verification.json',out),JSON.stringify({checkedAt:new Date().toISOString(),source:'Actual tower API route against isolated SQLite; live client/renderer; no production account writes',rows},null,2)+'\n');
}finally{await browser.close();}

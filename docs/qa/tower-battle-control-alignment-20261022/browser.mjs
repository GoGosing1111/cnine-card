import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),out=new URL('./',import.meta.url),rows=[];
async function measure(button){return button.evaluate(el=>{
 const css=getComputedStyle(el),range=document.createRange();range.selectNodeContents(el);
 const box=el.getBoundingClientRect(),text=range.getBoundingClientRect();
 return {label:el.textContent,box:box.toJSON(),text:text.toJSON(),centerOffsetX:text.x+text.width/2-box.x-box.width/2,centerOffsetY:text.y+text.height/2-box.y-box.height/2,css:Object.fromEntries(['display','boxSizing','height','minHeight','lineHeight','paddingTop','paddingBottom','borderTopWidth','borderBottomWidth','alignItems','justifyContent','fontSize'].map(k=>[k,css[k]]))};
});}
function check(m,label){
 assert.equal(m.label,label);assert.equal(m.box.height,44);assert.equal(m.css.paddingTop,'0px');assert.equal(m.css.paddingBottom,'0px');
 assert.equal(m.css.alignItems,'center');assert.equal(m.css.justifyContent,'center');
 assert.ok(Math.abs(m.centerOffsetX)<=1,JSON.stringify(m));assert.ok(Math.abs(m.centerOffsetY)<=1,JSON.stringify(m));
 assert.ok(m.text.top>=m.box.top+12);assert.ok(m.text.bottom<=m.box.bottom-12);
}
try{
 for(const width of [1440,390,360]){
  const page=await browser.newPage({viewport:{width,height:width<760?844:960},isMobile:width<760,hasTouch:width<760,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const profile='button-align-'+width+'-'+Date.now();
  await page.goto(`http://127.0.0.1:8940/docs/qa/tower-account-entry-20261022/index.html?pve=tower&profile=${profile}`);
  const fight=page.locator('[data-abyss-action="fight"] strong');if(width<760)await fight.tap();else await fight.click();
  const button=page.locator('[data-continuous-pause]');await button.waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('[data-continuous-pause]').disabled&&document.querySelector('#modal canvas')?.width>0);
  const initial=await measure(button);check(initial,'일시정지');
  await button.screenshot({path:fileURLToPath(new URL(width+'-pause.png',out))});
  if(width<760)await button.tap();else await button.click();
  const paused=await measure(button);check(paused,'재개');
  // Let the browser's temporary touch highlight fade before capturing the frame.
  if(width<760)await page.waitForTimeout(350);
  await button.screenshot({path:fileURLToPath(new URL(width+'-resume.png',out))});
  await page.screenshot({path:fileURLToPath(new URL(width+'-battle.png',out))});
  if(width<760)await button.tap();else await button.click();check(await measure(button),'일시정지');
  const state=await page.evaluate(()=>({startRequests:QA.calls.filter(c=>c.path==='tower/start'),overflow:document.documentElement.scrollWidth>innerWidth,sound:localStorage.getItem('cnine_battle_sound'),styles:[...document.styleSheets].map(s=>s.href).filter(Boolean)}));
  assert.equal(state.startRequests.length,1);assert.equal(state.startRequests[0].status,200);assert.equal(state.overflow,false);assert.equal(state.sound,'OFF');
  const towerIndex=state.styles.findIndex(s=>s.includes('tower-abyss-ui.css')),sharedIndex=state.styles.findIndex(s=>s.includes('pve-continuous-battle-live.css'));
  assert.ok(towerIndex>=0&&sharedIndex>towerIndex,'Shared CSS must load after the Tower stylesheet to reproduce the original cascade.');
  assert.deepEqual(errors,[]);
  rows.push({width,initial,paused,resumed:true,startRequests:1,sharedStylesheetLoadedAfterTower:true,overflow:state.overflow,sound:state.sound,errors});
  console.log(`Passed ${width}px: pause/resume centered, 44px touch target, late shared CSS, click/tap and one start request.`);
  await page.close();
 }
 await fs.writeFile(new URL('browser-verification.json',out),JSON.stringify({checkedAt:new Date().toISOString(),source:'Actual Tower controller and battle renderer; isolated API/database fixture; no production account writes',rows},null,2)+'\n');
}finally{await browser.close();}

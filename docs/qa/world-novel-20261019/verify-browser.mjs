import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=new URL('./screens/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[],errors=[];
const base=process.env.WORLD_QA_URL||'http://127.0.0.1:8949/world/';
async function ready(page){await page.waitForFunction(()=>[...document.querySelectorAll('.scene-art.is-visible')].every(img=>img.complete&&img.naturalWidth));await page.evaluate(()=>document.fonts.ready);}
async function shot(page,name){await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:true});}
async function noOverflow(page,label){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' overflow');}
try{
 for(const viewport of [{width:1440,height:960},{width:390,height:844},{width:320,height:740}]){
  const mobile=viewport.width<600,page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await ready(page);await noOverflow(page,'cover '+viewport.width);
  await shot(page,'cover-'+viewport.width);
  await page.getByRole('button',{name:'1부 읽기',exact:true}).click();
  await page.waitForURL(/scene=rewrite/);await ready(page);
  assert.equal(await page.locator('#scene-cast li').count(),2);
  await noOverflow(page,'reader '+viewport.width);await shot(page,'reader-'+viewport.width);
  await page.keyboard.press('ArrowRight');await page.waitForURL(/scene=erased/);
  await page.locator('#next-scene').click();await page.waitForURL(/scene=reverse-call/);
  await page.locator('#reader-cover').click();await page.locator('#resume-story').click();await page.waitForURL(/scene=reverse-call/);
  await page.reload();await page.waitForURL(/scene=reverse-call/);assert.equal(await page.locator('#scene-title').textContent(),'먼저 부른 쪽');
  await page.locator('#open-chapters').click();
  await page.locator('#dialog-tabs [data-collection="interludes"]').click();
  assert.equal(await page.locator('#dialog-chapters .chapter-row').count(),7);
  await shot(page,'chapters-'+viewport.width);
  await page.locator('#dialog-chapters .chapter-row').first().click();await page.waitForURL(/scene=seam-1/);
  assert.equal(await page.locator('#previous-scene').isDisabled(),true);
  await page.locator('#next-scene').click();await page.locator('#next-scene').click();await page.waitForURL(/scene=seam-3/);
  await page.locator('#next-scene').scrollIntoViewIfNeeded();
  const next=await page.locator('#next-scene').boundingBox();assert(next.height>=44);assert(next.y+next.height<=viewport.height);
  await shot(page,'interlude-'+viewport.width);
  await page.locator('#next-scene').click();assert(await page.locator('#cover').isVisible());
  assert.equal(await page.locator('#collection-tabs [aria-pressed="true"]').textContent(),'용병 이야기');
  await page.goto(base+'#scene=guard-the-gap');await ready(page);await noOverflow(page,'raid '+viewport.width);
  assert.equal(await page.locator('#scene-cast li').count(),3);await shot(page,'raid-'+viewport.width);
  if(mobile){
   await page.evaluate(()=>{const el=document.getElementById('swipe-surface');const point=(x,y)=>new Touch({identifier:1,target:el,clientX:x,clientY:y});el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[point(260,160)]}));el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[point(80,162)]}));});
   await page.waitForURL(/scene=third-answer/);
  }
  results.push({viewport,passed:['cover','scene','multiple-speakers','next-and-keyboard','bookmark-reload','chapter-dialog','interlude-boundary','button-touch-size','raid-art','no-overflow',...(mobile?['swipe']:[])]});await page.close();
 }
 const denied=await browser.newPage({viewport:{width:390,height:844}});
 await denied.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}}));
 await denied.goto(base);await denied.locator('#start-story').click();await denied.locator('#next-scene').click();await denied.locator('#reader-cover').click();
 assert.match(await denied.locator('#save-note').textContent(),/저장할 수 없습니다/);await denied.close();
 assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('report.json',out),JSON.stringify({results,storageDenied:true,pageErrors:errors},null,2));console.log(JSON.stringify({viewports:results.length,storageDenied:true,pageErrors:errors}));
}finally{await browser.close();}

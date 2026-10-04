// Pure presentation QA. Sample receipts do not call or mutate any live API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.WORKSHOP_QA_ORIGIN||'http://127.0.0.1:8803';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Use an isolated localhost fixture');
const out=process.env.WORKSHOP_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'forge-reveal-'));
fs.mkdirSync(out,{recursive:true});const checks=[],errors=[],writes=[];
const check=(value,name)=>{assert.ok(value,name);checks.push(name);};
const sample={ok:true,equipmentCraft:true,success:false,recipeName:'엠퍼러 슈트 제작',input:{name:'미스틱 갑옷',preserved:true},pity:{failures:2,pityAfter:5,guaranteed:false},coinSpent:3000000000000,masterStarSpent:200000};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 for(const [width,height] of [[1440,1000],[390,844]]){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'}),label=`${width}x${height}`;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
  await page.goto(base+'/qa/workshop');await page.waitForFunction(()=>!!window.EquipmentCraftReveal);
  const show=async data=>page.evaluate(data=>{window.qaForgeResult=window.EquipmentCraftReveal.play({data,recipe:{output_name:'엠퍼러 슈트'}});},data);
  await show(sample);await page.waitForTimeout(750);
  await page.locator('.ef-gate img').first().evaluate(img=>img.decode());
  check(await page.locator('.ef-reveal').evaluate(e=>e.scrollWidth<=e.clientWidth),label+' seal fits viewport');
  await page.screenshot({path:path.join(out,label+'-final-sealed.png')});
  const h=await page.locator('.ef-handle').boundingBox(),t=await page.locator('.ef-track').boundingBox();
  await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+(t.width-h.width-12)*.6,h.y+h.height/2,{steps:10});
  await page.screenshot({path:path.join(out,label+'-final-charging.png')});
  check(await page.locator('.ef-handle').getAttribute('aria-valuenow')==='60',label+' dragging drives seal charge');
  await page.mouse.move(t.x+t.width-h.width/2-6,h.y+h.height/2,{steps:12});await page.mouse.up();await page.waitForTimeout(750);
  await page.screenshot({path:path.join(out,label+'-final-opening.png')});
  await page.locator('.ef-reveal[data-phase="result"]').waitFor();await page.waitForTimeout(850);await page.screenshot({path:path.join(out,label+'-final-failure.png')});
  check(await page.locator('.ef-shard').count()===3,label+' failed seal visibly fractures');
  check((await page.locator('.ef-result').innerText()).includes('+10 미스틱 갑옷 보존'),label+' Emperor input protection stated');
  await page.locator('.ef-done').click();
  await show({...sample,success:true,input:{name:'미스틱 갑옷',preserved:false},output:{name:'엠퍼러 슈트',image:'assets/items/emperor-suit-v1.png',level:0},pity:{failures:0,pityAfter:5}});
  await page.locator('.ef-handle').press('Enter');await page.locator('.ef-reveal[data-phase="result"]').waitFor();await page.waitForTimeout(1100);
  await page.screenshot({path:path.join(out,label+'-final-success.png')});
  check(await page.locator('.ef-relic img').evaluate(i=>i.complete&&i.naturalWidth>0),label+' authentic Emperor equipment image loaded');
  check(await page.locator('.ef-relic img').evaluate(i=>{const a=i.getBoundingClientRect(),b=document.querySelector('.ef-scene').getBoundingClientRect(),c=document.querySelector('.ef-controls').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom&&a.bottom<=c.top;}),label+' reward artwork stays in stage above result copy');
  check(await page.locator('.ef-dialog').evaluate(e=>{const r=e.getBoundingClientRect();return [...e.querySelectorAll('.ef-heading,.ef-controls,.ef-footer')].every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right&&b.bottom<=r.bottom;});}),label+' success text and confirmation fit');
  await page.keyboard.press('Escape');await page.locator('.ef-reveal').waitFor({state:'detached'});
  check(await page.evaluate(()=>document.body.style.overflow!=='hidden'),label+' Escape restores scrolling');
  await page.emulateMedia({reducedMotion:'reduce'});await show({...sample,success:true,output:{name:'이미지 로딩 실패 검수',image:'/qa/missing-image.png'}});await page.locator('[data-skip]').click();
  await page.locator('.ef-image-fallback').waitFor();check((await page.locator('.ef-result').innerText()).includes('이미지 로딩 실패 검수 +0 획득'),label+' asset failure retains receipt and close control');await page.locator('.ef-done').click();
  await show(sample);await page.evaluate(()=>window.EquipmentCraftReveal.cancel());await page.locator('.ef-reveal').waitFor({state:'detached'});
  check(await page.evaluate(()=>document.body.style.overflow!=='hidden'),label+' cancellation removes timers/overlay and restores scrolling');
  await page.close();
 }
 check(!errors.length,'no JavaScript errors: '+errors.join('; '));check(!writes.length,'presentation made zero mutation requests');
 fs.writeFileSync(path.join(out,'visual-results.json'),JSON.stringify({checks,errors,writes},null,2));console.log(JSON.stringify({passed:checks.length,out}));
}finally{await browser.close();}

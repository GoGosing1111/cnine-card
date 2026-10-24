import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:43825',out='C:/Users/User/Downloads/upload/cnine-card/output/clan-restore-lock-20261025';
const browser=await chromium.launch({channel:'chrome',headless:true});
const checks=[],errors=[],failed=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844}});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===base)failed.push(r.status()+' '+r.url());});
  await page.goto(base+'/review/?tab=war');await page.locator('.clan-restoration-notice').waitFor();
  const art=await page.locator('.clan-restoration-notice').evaluate(e=>getComputedStyle(e).borderImageSource);assert.ok(art.includes('panel-v3.webp'));
  const action=await page.locator('[data-clan-tab="war"]').evaluate(e=>({image:getComputedStyle(e).borderImageSource,color:getComputedStyle(e).color}));assert.ok(action.image.includes('action-user-approved.webp'));assert.equal(action.color,'rgb(24, 36, 10)');
  assert.equal(await page.locator('[data-clan-fight],[data-clan-register-form]').count(),0);
  assert.ok((await page.locator('.clan-tabs').innerText()).includes('챔피언스리그'));
  await page.screenshot({path:out+'/'+width+'-clan.png',fullPage:true});
  await page.locator('[data-clan-tab="champions"]').click();await page.locator('.clan-cup-bracket').waitFor();
  assert.ok((await page.locator('.clan-view').innerText()).includes('다음 개최 일정 잠금'));
  await page.screenshot({path:out+'/'+width+'-champions.png',fullPage:true});
  let overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,width+' champions overflow');
  await page.locator('[data-clan-tab="organization"]').click();await page.frameLocator('.org-live-frame').locator('.organization-app').waitFor();
  await page.locator('[data-clan-tab="war"]').click();await page.locator('.clan-restoration-notice').waitFor();
  await page.goto(base+'/organization/faction/');await page.locator('.fw-operation-info summary').click();await page.locator('[aria-label="세력전 일정 잠금"]').waitFor();
  const text=await page.locator('body').innerText();assert.ok(text.includes('매일 2회 랜덤'));assert.ok(text.includes('승점 미포함'));assert.ok(!text.includes('화·목·토·일 20:00'));
  await page.screenshot({path:out+'/'+width+'-faction-lock.png',fullPage:true});
  await page.locator('.fw-operation-info summary').click();
  await page.screenshot({path:out+'/'+width+'-faction.png',fullPage:true});
  overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,width+' faction overflow');
  const rank=page.getByRole('button',{name:'순위표',exact:false});if(await rank.count()){await rank.first().click();await page.locator('[aria-label="세력전 승점 미포함"]').waitFor();}
  await page.goto(base+'/review/cms');await page.locator('[data-tab="faction"]').waitFor();
  const factionTab=page.locator('[data-tab="faction"]');if(await factionTab.count())await factionTab.click();
  await page.screenshot({path:out+'/'+width+'-cms.png',fullPage:true});
  assert.ok((await page.locator('body').innerText()).includes('매일 2회 랜덤'));
  const competition=page.locator('[data-tab="competition"]');if(await competition.count()){await competition.click();await page.getByText('세력전 승점 미포함',{exact:true}).first().waitFor();assert.equal(await page.locator('[data-action="competition-settle"]').count(),0);}
  const broken=await page.evaluate(()=>[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src));assert.deepEqual(broken,[]);
  checks.push({width,clanLocked:true,championsVisible:true,factionLocked:true,randomDailyCount:2,pointsIncluded:false,overflow:false});await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
}finally{fs.writeFileSync(out+'/browser.json',JSON.stringify({checks,errors,failed},null,2));await browser.close();}
console.log(JSON.stringify({checks,errors,failed}));

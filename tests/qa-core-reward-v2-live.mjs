// Run against tests/serve-core-rewards-qa.mjs (disposable DB, never production).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const base=process.env.CORE_REWARD_QA_URL||'http://127.0.0.1:8974';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const out=path.resolve(process.env.QA_OUTPUT||'../qa-core-reward-v2-live');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],results=[];
try{
 for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push(d.message());void d.dismiss();});
  await page.request.post(base+'/__qa__/reset');await page.goto(base+'/');
  const bodyStyle=await page.evaluate(()=>{const s=getComputedStyle(document.body);return [s.backgroundColor,s.color,s.fontFamily];});
  await page.locator('[data-core-action="claim"]').click();await page.locator('.reliquary.is-ready').waitFor();await page.waitForTimeout(900);
  assert.equal(await page.locator('[data-slot]').count(),3);assert.equal(await page.locator('.reliquary-review').count(),0);assert.match(await page.locator('.reliquary-weekly').innerText(),/0\/3회/);
  assert.deepEqual(await page.evaluate(()=>{const s=getComputedStyle(document.body);return [s.backgroundColor,s.color,s.fontFamily];}),bodyStyle);
  await page.screenshot({path:path.join(out,name+'-selection.png')});
  if(name==='mobile'){
    await page.request.get(base+'/__qa__/fail?sql=INSERT%20INTO%20user_mercenary_cards_v1');await page.locator('[data-slot="1"]').click();await page.locator('.reliquary-retry:visible').waitFor();
    await page.reload();await page.locator('[data-core-action="claim"]').click();await page.locator('.reliquary-retry:visible').waitFor();
    assert.equal(await page.locator('[data-slot]:disabled').count(),3);await page.request.get(base+'/__qa__/fail');await page.locator('.reliquary-retry').click();
  }else await page.locator('[data-slot="1"]').click();
  await page.locator('.reliquary.is-revealed').waitFor();await page.waitForTimeout(1800);
  assert.match(await page.locator('.reliquary-done').innerText(),/^확인\s+→$/);assert.match(await page.locator('.reliquary-weekly').innerText(),/1\/3회/);
  assert.equal(await page.locator('.reliquary-prize-image').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  await page.screenshot({path:path.join(out,name+'-reward.png')});await page.locator('.reliquary-done').click();
  const audit=await (await page.request.get(base+'/__qa__/audit')).json();assert.equal(audit.user.coin,10000000000);assert.equal(audit.weekly.used,1);assert.equal(audit.mercenaries[0].total_copies,1);
  await page.getByRole('button',{name:'받은 보상 확인',exact:true}).click();await page.locator('.reliquary.is-revealed').waitFor();await page.locator('.reliquary-done').click();
  assert.deepEqual(await (await page.request.get(base+'/__qa__/audit')).json(),audit);
  await page.goto(base+'/admin/__qa__');await page.locator('#coreRewardAdmin form:visible').waitFor();await page.locator('[data-action="preview"]').click();await page.locator('.reliquary.is-ready').waitFor();
  assert.equal(await page.locator('.reliquary-review').innerText(),'연출 미리보기');await page.locator('[data-slot="0"]').click();await page.locator('.reliquary.is-revealed').waitFor();await page.waitForTimeout(1700);
  await page.screenshot({path:path.join(out,name+'-cms-preview.png')});await page.locator('.reliquary-done').click();
  assert.deepEqual(await (await page.request.get(base+'/__qa__/audit')).json(),audit,'CMS preview must not change policy, quota or inventory');
  assert.equal(await page.locator('dialog,canvas').count(),0);results.push(name+': real handlers + player/CMS V2, weekly display, replay, scoped CSS, disposal PASS');await context.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}

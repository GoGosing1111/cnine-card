import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8899',output=path.resolve(process.env.QA_OUTPUT_DIR||'../qa/cow-economy');
if(new URL(base).hostname!=='127.0.0.1')throw Error('Isolated local QA only');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{})});
const errors=[],checks=[];
try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  await context.addInitScript(()=>localStorage.setItem('cnine_admin_token','local-account-7'));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const config=()=>page.evaluate(async()=>{const response=await fetch('/api/admin/pve-v3',{headers:{authorization:'Bearer local-account-7'}});if(!response.ok)throw Error('CMS read failed');return response.json();});
  const cow=()=>page.getByRole('button',{name:'카우방',exact:true}).click();
  const field=name=>page.locator(`input[name="economy.${name}"]`);
  await page.goto(base+'/pve-v3/cms.html');await cow();await field('clearCoin.0').waitFor();
  const before=await config();await fs.writeFile(path.join(output,'before.json'),JSON.stringify(before,null,2));
  for(const name of ['clearCoin.0','dailyCoinCap']){
    const input=field(name);assert.equal(await input.getAttribute('max'),'10000000000');
    await input.fill('10000000000');assert.equal(await input.evaluate(el=>el.checkValidity()),true);
    await input.fill('10000000001');assert.equal(await input.evaluate(el=>el.checkValidity()),false);
  }
  await field('clearCoin.0').fill('500000000');await field('dailyCoinCap').fill('3000000000');await field('dailyRuns').fill('6');
  if(!process.argv.includes('--verify-only')){
    await page.getByRole('button',{name:'초안 저장',exact:true}).click();
    await page.getByRole('status').filter({hasText:'초안을 저장했습니다.'}).waitFor();
  }
  const after=await config();await fs.writeFile(path.join(output,'after.json'),JSON.stringify(after,null,2));
  assert.equal(after.cow.clearCoin[0],500000000);assert.equal(after.cow.dailyCoinCap,3000000000);assert.equal(after.cow.dailyRuns,6);
  assert.equal(after.cow.entryCoin,before.cow.entryCoin);assert.equal(after.cow.mode,before.cow.mode);assert.equal(after.release.enabled,false);assert.deepEqual(after.tower,before.tower);
  checks.push({save:'5억 / 30억 / 6회',rewardInputLimit:'100억',otherSettings:'preserved',release:'OFF'});
  for(const [width,height]of[[1440,1100],[390,844],[320,720]]){
    await page.setViewportSize({width,height});await page.reload();await cow();await field('clearCoin.0').waitFor();
    assert.equal(await field('clearCoin.0').inputValue(),'500000000');assert.equal(await field('dailyCoinCap').inputValue(),'3000000000');assert.equal(await field('dailyRuns').inputValue(),'6');
    assert.match(await page.locator('#settings').innerText(),/5억 코인 · 최대 100억/);assert.match(await page.locator('#settings').innerText(),/30억 코인 · 최대 100억/);
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,inputs:[...document.querySelectorAll('input')].map(el=>{const b=el.getBoundingClientRect(),label=el.closest('label').getBoundingClientRect();return {left:b.left,right:b.right,labelLeft:label.left,labelRight:label.right};})}));
    assert.ok(layout.scroll<=width+1,JSON.stringify(layout));assert.ok(layout.inputs.every(b=>b.left>=0&&b.right<=width&&b.left>=b.labelLeft-1&&b.right<=b.labelRight+1),JSON.stringify(layout));
    await page.screenshot({path:path.join(output,`cms-${width}.png`),fullPage:true,animations:'disabled'});checks.push({width,reload:'saved',layout:'contained'});
  }
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'report.json'),JSON.stringify({ok:true,checks,errors},null,2));console.log(JSON.stringify({ok:true,checks},null,2));
}finally{await browser.close();}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8899',output=path.resolve(process.env.QA_OUTPUT_DIR||'../qa/account-entry');
if(new URL(base).hostname!=='127.0.0.1')throw Error('Account QA requires the isolated local server');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{}),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const errors=[],results=[];
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_admin_token','local-account-7');});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/pve-v3/cms.html');
  await page.getByText('설정을 불러왔습니다.',{exact:true}).waitFor();
  await page.locator('[name="economy.dailyRewardedClears"]').fill('9');
  await page.getByRole('button',{name:'초안 저장',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent.includes('저장'));
  const cms=await page.evaluate(async()=>{const r=await fetch('/api/admin/pve-v3',{headers:{authorization:'Bearer local-account-7'}});return r.json();});
  assert.equal(cms.tower.economy.dailyRewardedClears,9);assert.equal(cms.tower.economy.entryCoin,0);assert.equal(cms.tower.economy.approved,false);assert.equal(cms.release.enabled,false);
  await page.screenshot({path:path.join(output,'cms-desktop.png'),fullPage:true});results.push({cms:'saved owner draft; execution OFF'});
  for(const [content,width]of[['tower',1440],['scrapyard',390],['cow-room',1440],['idle-dungeon',390]]){
    await page.setViewportSize({width,height:960});await page.goto(`${base}/pve-v3/?content=${content}`);
    await page.locator('#start:not([disabled])').waitFor({timeout:20000});
    await page.click('#start');
    const frame=page.frameLocator('#battle-frame');await frame.locator('canvas').waitFor({timeout:60000});
    const stats=()=>page.evaluate(()=>{const d=document.getElementById('battle-frame').contentWindow.PveV3BattleBridge.diagnostics();return {canvasCount:d.canvasCount,cards:d.cards,layout:d.formation?.layoutVersion};});
    await page.waitForFunction(()=>document.getElementById('battle-frame').contentWindow.PveV3BattleBridge?.diagnostics().formation?.layoutVersion==='UNIFORM_LATTICE_V2');
    assert.deepEqual(await stats(),{canvasCount:1,cards:5,layout:'UNIFORM_LATTICE_V2'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    const contained=await page.evaluate(()=>{const f=document.getElementById('battle-frame');return f.getBoundingClientRect().bottom<=f.parentElement.getBoundingClientRect().bottom+1;});assert.equal(contained,true,'mobile frame extends past its arena');
    await page.screenshot({path:path.join(output,`${content}-${width}.png`),fullPage:true});
    if(content==='idle-dungeon'){
      await page.reload();await page.locator('#idle-stop:not([disabled])').waitFor();
      assert.match(await page.locator('#formation').textContent(),/진행 중/);
      await page.click('#idle-stop');await page.waitForFunction(()=>document.getElementById('formation').textContent==='정지');
      results.push({content,width,resume:'background continued; explicit stop works'});
    }else{
      await page.reload();await frame.locator('canvas').waitFor({timeout:60000});
      await page.locator('#speed:not([disabled])').waitFor();await page.click('#speed');
      console.log(`${content} ${width}px: authenticated result resumed; waiting for shared-clock playback.`);
      await page.locator('#result:not([hidden])').waitFor({timeout:240000});
      assert.match(await page.locator('#result-title').textContent(),/작전 성공|재정비/);
      results.push({content,width,recovered:true,resultVisible:true});
    }
    await fs.writeFile(path.join(output,'qa.json'),JSON.stringify({results,errors},null,2));
    console.log(`${content}: account entry, responsive renderer and recovery passed.`);
  }
  assert.deepEqual(errors,[]);console.log(`Passed ${results.length} account/CMS journeys.`);
}finally{await fs.writeFile(path.join(output,'qa.json'),JSON.stringify({results,errors},null,2));await browser.close();}

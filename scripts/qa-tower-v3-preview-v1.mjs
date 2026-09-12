import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8897',out=path.resolve(process.env.QA_OUTPUT_DIR||'tmp/v3-overhaul-ready-20260911/browser');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{}),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const report={checks:[],errors:[],requests:[]};
try{
  for(const width of [390,1366]){
    const page=await browser.newPage({viewport:{width,height:844}});
    page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.requests.push({status:r.status(),url:r.url()});});
    await page.goto(base+'/preview/infinite-tower-v3-v1/');
    await page.waitForFunction(()=>window.TowerV3?.diagnostics().ready,null,{timeout:60000});
    const at844=await page.evaluate(()=>({d:TowerV3.diagnostics(),scroll:document.documentElement.scrollWidth,width:innerWidth,frame:document.querySelector('#battle-frame').getBoundingClientRect().toJSON()}));
    assert.ok(at844.scroll<=width+1,'horizontal overflow');assert.equal(at844.d.bridge.formation.version,'OCCUPIED_GRID_V1');
    await page.screenshot({path:path.join(out,`tower-${width}-844.png`),fullPage:true});
    await page.setViewportSize({width,height:1100});await page.waitForTimeout(300);
    const tall=await page.evaluate(()=>({d:TowerV3.diagnostics(),frame:document.querySelector('#battle-frame').getBoundingClientRect().toJSON()}));
    if(width===390)assert.ok(Math.abs(at844.frame.height-tall.frame.height)<2,'same width must retain formation height when viewport grows');
    report.checks.push({width,at844,tall});await page.screenshot({path:path.join(out,`tower-${width}-1100.png`),fullPage:true});
    if(width===1366){
      await page.locator('#tier').fill('20');await page.locator('#tier').dispatchEvent('change');
      await page.waitForFunction(()=>TowerV3.diagnostics().ready&&TowerV3.diagnostics().tier===20);
      await page.locator('#speed').selectOption('2');await page.locator('#start').click();
      await page.waitForFunction(()=>TowerV3.diagnostics().busy);
      await page.locator('#pause').click();await page.waitForFunction(()=>TowerV3.diagnostics().paused);
      await page.locator('#pause').click();
      await page.waitForFunction(()=>document.querySelector('#result-actions').hidden===false,null,{timeout:180000});
      report.checks.push({completed:await page.locator('#result').innerText(),detail:await page.locator('#detail').innerText(),rewards:await page.locator('#rewards').innerText()});
      await page.screenshot({path:path.join(out,'tower-result.png'),fullPage:true});
      const before=await page.locator('#detail').innerText();await page.reload();
      await page.waitForFunction(()=>document.querySelector('#result-actions').hidden===false,null,{timeout:180000});
      assert.equal(await page.locator('#detail').innerText(),before,'refresh replays the completed run');
    }
    await page.close();
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
}finally{await fs.writeFile(path.join(out,'tower-qa.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({checks:report.checks.length,errors:report.errors,requests:report.requests}));

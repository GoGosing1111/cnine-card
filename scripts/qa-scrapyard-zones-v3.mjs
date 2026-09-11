import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{}),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const out=path.resolve(process.env.QA_OUTPUT_DIR||'tmp/v3-overhaul-ready-20260911/browser'),base=process.env.QA_BASE_URL||'http://127.0.0.1:8897';await fs.mkdir(out,{recursive:true});const report={checks:[],errors:[],requests:[]};
try{for(const width of [390,1366]){const page=await browser.newPage({viewport:{width,height:960}});page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.requests.push(r.url());});
  await page.goto(base+'/preview/scrapyard-v3-v1/?backgroundQa=1');await page.waitForFunction(()=>window.ScrapyardPreview?.diagnostics().ready,null,{timeout:60000});
  for(const zone of ['OUTER','CORE','FURNACE']){await page.locator('#zone').selectOption(zone);await page.waitForFunction(zone=>{const d=ScrapyardPreview.diagnostics();return d.ready&&d.zone===zone;},zone,{timeout:60000});
    const d=await page.evaluate(()=>ScrapyardPreview.diagnostics());assert.equal(d.bridge.formation.version,'OCCUPIED_GRID_V1');assert.equal(d.bridge.cards,5);assert.equal(d.bridge.canvasCount,1);
    for(const r of d.bridge.geometry.actors.flatMap(a=>[a.body,a.hud]))if(d.bridge.geometry.fit){const g=d.bridge.geometry;assert.ok(r.x>=-1&&r.x+r.width<=g.width+1,`${zone} ${width} horizontal clip`);assert.ok(r.y>=g.fit.available.top-1&&r.y+r.height<=g.fit.available.top+g.fit.available.height+1,`${zone} ${width} vertical clip`);}
    await page.screenshot({path:path.join(out,`scrapyard-${zone}-${width}.png`),fullPage:true});report.checks.push({zone,width,formation:d.bridge.formation,geometry:d.bridge.geometry});
    if(width===390&&zone==='FURNACE'){await page.locator('#speed').selectOption('2');await page.locator('#start').click();await page.waitForFunction(()=>ScrapyardPreview.diagnostics().ended,null,{timeout:180000});const result=await page.locator('#result-note').innerText();assert.match(result,/16\/16/);report.checks.push({furnaceResult:result});await page.screenshot({path:path.join(out,'scrapyard-furnace-result.png'),fullPage:true});}
  }await page.close();}
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
}finally{await fs.writeFile(path.join(out,'scrapyard-qa.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({checks:report.checks.length,errors:report.errors,requests:report.requests}));

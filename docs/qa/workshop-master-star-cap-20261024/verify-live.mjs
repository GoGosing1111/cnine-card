import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='C:/Users/User/.codex/worktrees/lounge-cnine-pause/cnine-card';
const out=fileURLToPath(new URL('./',import.meta.url));
const origin='https://cnine-card.pages.dev';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={startedAt:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),status:'PENDING',productionWrites:0,blockedWrites:[],files:[],viewports:[]};
let browser;
try{
  const files=['admin/workshop-admin-v1668.js','admin/index.html','index.html','js/streamer-lounge-v2036.js'];
  for(const file of files){
    const expected=fs.readFileSync(path.join(root,file));
    const res=await fetch(origin+'/'+file+'?qa=master-star-100m-'+Date.now(),{cache:'no-store'});
    assert.equal(res.status,200,file);
    const bytes=Buffer.from(await res.arrayBuffer());
    report.files.push({file,status:res.status,expectedSha256:sha(expected),deployedSha256:sha(bytes),matches:bytes.equals(expected)});
    assert.equal(sha(bytes),sha(expected),file+' source hash');
    if(file==='admin/index.html')assert.match(bytes.toString(),/workshop-admin-v1668\.js\?masterStarCap=20261024-100m/);
    if(file==='admin/workshop-admin-v1668.js')assert.match(bytes.toString(),/category==='MATERIAL_CRAFT'\?100000000:1000000/);
  }
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const [width,height] of [[1440,1000],[390,844]]){
    const result={width,height,errors:[],markIds:[],orderPreserved:false};report.viewports.push(result);
    const context=await browser.newContext({viewport:{width,height},isMobile:width<760,hasTouch:width<760,serviceWorkers:'block'});
    await context.route('**/*',async route=>{
      const req=route.request();
      if(!['GET','HEAD'].includes(req.method())){report.blockedWrites.push({method:req.method(),url:req.url()});await route.abort();return;}
      await route.continue();
    });
    const page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',err=>result.errors.push(err.message));
    await page.goto(origin+'/?qa=master-star-100m-'+Date.now(),{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.StreamerLounge?.open==='function');
    const roster=await (await context.request.get(origin+'/api/streamer-profiles')).json();
    await page.evaluate(()=>window.StreamerLounge.open());
    await page.waitForFunction(()=>document.querySelectorAll('.sl40-card').length>0);
    result.markIds=await page.locator('[data-sl40-cnine-logo]').evaluateAll(nodes=>nodes.map(node=>node.closest('[data-profile-id]').dataset.profileId).sort());
    assert.deepEqual(result.markIds,['mew030709','zalalz']);
    assert.deepEqual(await page.locator('.sl40-card').evaluateAll(nodes=>nodes.map(node=>node.dataset.profileId)),roster.profiles.map(row=>row.id));
    result.orderPreserved=true;
    assert.deepEqual(result.errors,[]);
    await page.locator('#streamerLoungeV2036').screenshot({path:path.join(out,`${width}x${height}-live-lounge.png`)});
    await context.close();
  }
  report.status='PASSED';
}catch(error){report.status='FAILED';report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{await browser?.close();report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'live-verification.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));

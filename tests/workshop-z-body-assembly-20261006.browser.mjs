import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const out=process.env.Z_BODY_QA_OUT,origin=process.env.Z_BODY_QA_ORIGIN||'http://127.0.0.1:8985',reports=[];
assert.ok(out,'Z_BODY_QA_OUT must be outside the deployment checkout');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
  for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'});
    const page=await context.newPage(),errors=[],mutations=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(r.method()!=='GET')mutations.push(r.url());});
    await page.goto(origin+'/preview/workshop-assembly-v1/?mode=suit&item=z');
    await page.waitForFunction(()=>Boolean(window.WorkshopAssemblyPreview),{},{timeout:30000});
    for(const time of [3,6.9,8.5,13.4]){
      await page.evaluate(time=>window.WorkshopAssemblyPreview.seek(time),time);
      await page.screenshot({path:out+'/'+width+'-preview-'+time+'.png'});
    }
    const assembled=await page.evaluate(()=>window.WorkshopAssemblyPreview.diagnostics());
    assert.equal(assembled.model,'z');assert.equal(assembled.authoredPartCount,12);assert.equal(assembled.finished,true);
    await page.goto(origin+'/preview/workshop-assembly-v1/live.html?item=z&autoConfirm=1&result='+(width===1440?'success':'failure'));
    await page.locator('[data-ws-section="BATTLE_SUIT_CRAFT"]').click();
    await page.locator('[data-suit-recipe]').filter({hasText:'Z-BODY'}).click();
    await page.locator('#wsBattleSuitCraft').click();
    await page.waitForFunction(()=>window.WorkshopAssemblyLive?.diagnostics().ready===true,null,{timeout:30000});
    assert.equal(await page.locator('.ws-assembly-overlay').getAttribute('data-model'),'z');
    await page.locator('[data-action="pause"]').click();
    const paused=await page.evaluate(()=>window.WorkshopAssemblyLive.diagnostics());
    assert.equal(paused.playing,false);assert.equal(paused.audioEnabled,false);
    await page.screenshot({path:out+'/'+width+'-live-paused.png'});
    await page.locator('[data-action="pause"]').click();
    await page.waitForFunction(()=>window.WorkshopAssemblyLive?.diagnostics().time>=7,null,{timeout:15000});
    await page.locator('[data-action="pause"]').click();
    await page.screenshot({path:out+'/'+width+'-live-assembly.png'});
    await page.locator('[data-action="skip"]').click();
    assert.equal(await page.locator('[data-result-title]').innerText(),width===1440?'제작 성공':'제작 실패');
    const bounds=await page.locator('.ws-assembly-panel').boundingBox();
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
    const done=await page.locator('[data-action="done"]').boundingBox();
    assert.ok(done.y>=0&&done.y+done.height<=1000);
    await page.screenshot({path:out+'/'+width+'-live-result.png'});
    await page.locator('[data-action="done"]').click();
    await page.waitForFunction(()=>!document.querySelector('.ws-assembly-overlay'));
    await page.waitForFunction(()=>document.querySelector('#wsBattleSuitCraft')?.disabled===false);
    assert.match(await page.locator('#qa-status').innerText(),/모의 제작 요청 1회/);
    assert.equal(await page.evaluate(()=>window.WorkshopAssemblyLive.diagnostics().activeTimelines),0);
    assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
    reports.push({width,assembled,success:width===1440,pauseResume:true,skip:true,closed:true,unlocked:true,mockCraftRequests:1,realApiMutations:0,pageErrors:errors});
    await context.close();
  }
  await writeFile(out+'/browser-report.json',JSON.stringify({passed:true,reports},null,2));
  console.log(JSON.stringify({passed:true,reports}));
}finally{await browser.close();}

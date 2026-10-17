import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.VEHICLE_QA_ORIGIN||'http://127.0.0.1:8986',out=process.env.VEHICLE_QA_OUT;
assert.ok(out,'Store visual QA outside the deployment checkout');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const reports=[];
try{
  for(const key of ['maybach','astra'])for(const width of [1440,390]){
    const success=width===1440,height=width===1440?1000:844;
    const context=await browser.newContext({viewport:{width,height},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'});
    const page=await context.newPage(),errors=[],mutations=[],failures=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')mutations.push(r.url());});
    page.on('response',r=>{if(r.status()>=400)failures.push([r.status(),r.url()]);});
    await page.goto(origin+`/preview/workshop-assembly-v1/?mode=vehicle&item=${key}`);
    await page.waitForFunction(()=>Boolean(window.WorkshopAssemblyPreview),null,{timeout:30000});
    for(const time of width===1440?[5.3,7.7,11.5]:[11.5]){
      await page.evaluate(t=>window.WorkshopAssemblyPreview.seek(t),time);
      await page.screenshot({path:`${out}/${key}-${width}-preview-${time}.png`});
    }
    assert.equal(await page.evaluate(()=>window.WorkshopAssemblyPreview.diagnostics().model),key);
    await page.goto(origin+`/preview/workshop-assembly-v1/live.html?item=${key}&autoConfirm=1&result=${success?'success':'failure'}`);
    await page.locator('[data-ws-section="VEHICLE"]').click();
    await page.locator('[data-recipe]').filter({hasText:key==='maybach'?'비전 마이바흐 6':'아스트라 - 볼트'}).click();
    const craft=page.locator('#wsVehicleCraft');if(width===390)await craft.tap();else{await craft.focus();await page.keyboard.press('Enter');}
    await page.waitForFunction(()=>window.WorkshopAssemblyLive?.diagnostics().ready===true,null,{timeout:30000});
    assert.equal(await page.locator('.ws-assembly-overlay').getAttribute('data-model'),key);
    await page.waitForFunction(()=>window.WorkshopAssemblyLive?.diagnostics().time>=7.7,null,{timeout:15000});
    await page.locator('[data-action="pause"]').click();
    assert.equal(await page.evaluate(()=>window.WorkshopAssemblyLive.diagnostics().playing),false);
    await page.screenshot({path:`${out}/${key}-${width}-live-assembly.png`});
    if(success){await page.locator('[data-action="pause"]').click();await page.waitForFunction(()=>window.WorkshopAssemblyLive?.diagnostics().finished,null,{timeout:12000});}
    else await page.locator('[data-action="skip"]').tap();
    assert.equal(await page.locator('[data-result-title]').innerText(),success?'제작 성공':'제작 실패');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const canvas=await page.locator('.ws-assembly-canvas').boundingBox(),result=await page.locator('.ws-assembly-complete').boundingBox();
    assert.ok(canvas.y+canvas.height<=result.y+1,'result text must have separate space below the vehicle');
    const panel=await page.locator('.ws-assembly-panel').boundingBox(),done=await page.locator('[data-action="done"]').boundingBox();
    assert.ok(panel.x>=0&&panel.x+panel.width<=width+1&&panel.y>=0&&panel.y+panel.height<=height+1);
    assert.ok(done.y>=0&&done.y+done.height<=height);
    assert.match(await page.locator('.ws-assembly-panel').evaluate(el=>getComputedStyle(el,'::after').borderImageSource),/frame.webp/);
    assert.match(await page.locator('[data-action="done"]').evaluate(el=>getComputedStyle(el).borderImageSource),/button.webp/);
    await page.screenshot({path:`${out}/${key}-${width}-live-result.png`});
    await page.locator('[data-action="done"]').click();
    await page.waitForFunction(()=>!document.querySelector('.ws-assembly-overlay')&&!document.querySelector('#wsVehicleCraft')?.disabled);
    assert.match(await page.locator('#qa-status').innerText(),/모의 제작 요청 1회/);
    assert.equal(await page.evaluate(()=>window.WorkshopAssemblyLive.diagnostics().activeTimelines),0);
    assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);assert.deepEqual(failures,[]);
    reports.push({key,width,height,success,keyboardOrTouch:true,pauseResume:true,skip:!success,naturalCompletion:success,mockCraftRequests:1,realApiMutations:0,assetFailures:failures,pageErrors:errors});
    await context.close();console.log(`${key} ${width}: passed`);
  }
  await writeFile(out+'/browser-report.json',JSON.stringify({passed:true,reports},null,2));
}finally{await browser.close();}

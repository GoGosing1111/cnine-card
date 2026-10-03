import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {petOpeningFixture} from './helpers/pet-opening-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),out=process.env.QA_OUTPUT_DIR;
if(!out||path.resolve(out).startsWith(root+path.sep))throw Error('QA_OUTPUT_DIR must be outside the deployment checkout');
await mkdir(out,{recursive:true});const h=await petOpeningFixture(),errors=[],opens=[];let truncate=false,forceBlank=false;
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://'+req.headers.host);
    if(url.pathname.startsWith('/api/')){
      if(url.pathname.includes('/shell/')||url.pathname.includes('/events/')){res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;}
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks),request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:raw})});
      if(url.pathname.endsWith('/opening/open'))opens.push(JSON.parse(raw));
      const random=crypto.getRandomValues;let response;
      try{if(forceBlank&&url.pathname.endsWith('/opening/open'))crypto.getRandomValues=array=>{array[0]=4;return array;};response=await h.petHandle(request);}finally{crypto.getRandomValues=random;}
      if(truncate&&url.pathname.endsWith('/opening/open')&&response?.ok){truncate=false;res.writeHead(200,{'content-type':'application/json'});res.end();return;}
      res.writeHead(response?.status||404,response?Object.fromEntries(response.headers):{});res.end(response?await response.text():'');return;
    }
    let pathname=decodeURIComponent(url.pathname);if(pathname.endsWith('/'))pathname+='index.html';
    const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw Error('path');
    const data=await readFile(file),mime={'.html':'text/html;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
    res.writeHead(200,{'content-type':mime});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true}),base='http://127.0.0.1:'+server.address().port;
const settle=page=>page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.complete).map(i=>i.decode().catch(()=>{})));await Promise.all(document.getAnimations().filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
try{
  for(const [label,viewport] of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
    forceBlank=false;await h.petConfigure({enabled:false,pool:[],blankWeight:0});const beforeCollection=(await h.petCall()).body.collection.revision;
    const context=await browser.newContext({viewport});await context.addInitScript(()=>{localStorage.setItem('cnine_admin_token','local-qa-1');localStorage.setItem('cnine_card_api_token','local-qa-1');});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/pets/opening/?review=1');await page.locator('#status').filter({hasText:/OWNER 검수/}).waitFor();await settle(page);
    assert.equal(await overflow(page),false);assert.equal(await page.locator('#quantity').inputValue(),'1');
    await page.screenshot({path:path.join(out,label+'-sanctum.png'),fullPage:true});
    await page.locator('#rates').click();assert.match(await page.locator('#poolNote').textContent(),/운영 풀/);await page.locator('#probabilities .po-dialog-close').click();
    await page.locator('#quantity').fill('7');await page.locator('#open').click();assert.match(await page.locator('#confirmCost').textContent(),/정수 70개/);await page.locator('#cancel').click();
    assert.equal((await h.petCall()).body.collection.revision,beforeCollection);
    const cms=await context.newPage();cms.on('pageerror',e=>errors.push(e.message));await cms.goto(base+'/preview/pet-opening-cms-v1/');await cms.locator('[data-note]').filter({hasText:/저장된 설정/}).waitFor();
    await cms.locator('[data-pool="PET-BONGSOON"]').check();await cms.locator('[data-pool="PET-DIIM"]').check();await cms.locator('[data-weight="PET-DIIM"]').fill('3');
    assert.equal(await cms.locator('[data-rate="PET-BONGSOON"]').textContent(),'25%');assert.equal(await cms.locator('[data-rate="PET-DIIM"]').textContent(),'75%');
    await cms.locator('[name=blankWeight]').fill('4');assert.equal(await cms.locator('[data-rate="PET-BONGSOON"]').textContent(),'12.5%');assert.equal(await cms.locator('[data-rate="PET-DIIM"]').textContent(),'37.5%');assert.equal(await cms.locator('[data-blank-rate]').textContent(),'50%');
    await cms.locator('[name=enabled]').check();await cms.locator('button[type=submit]').click();await cms.locator('[data-note]').filter({hasText:/저장 완료/}).waitFor();await settle(cms);
    assert.equal(await overflow(cms),false);await cms.screenshot({path:path.join(out,label+'-cms.png'),fullPage:true});await cms.close();
    await h.stock(1,50,500);await page.goto(base+'/pets/opening/');await page.locator('#status').filter({hasText:/개봉할 수량/}).waitFor();await settle(page);
    await page.locator('[data-count=max]').click();assert.equal(await page.locator('#quantity').inputValue(),'50');
    await page.locator('#quantity').fill('7');assert.equal(await page.locator('#cost').textContent(),'70');
    const before=opens.length,retryCase=label==='desktop';truncate=retryCase;await page.locator('#open').click();await page.locator('#confirmOpen').click();
    if(retryCase){await page.locator('#open').filter({hasText:'개봉 결과 다시 확인'}).waitFor();assert.equal(await page.locator('#quantity').isDisabled(),true);await page.locator('#open').click();}
    await page.locator('#resultCount').filter({hasText:'7'}).waitFor();await settle(page);
    const receipt=JSON.parse((await h.one('SELECT value FROM app_meta WHERE key=?','pet_open_receipt_v1:1:'+opens[before].requestId)).value);
    assert.equal(await page.locator('#resultPetCount').textContent(),String(receipt.petCount));assert.equal(await page.locator('#resultBlankCount').textContent(),String(receipt.blankCount));
    assert.equal(await page.locator('#results').evaluate(dialog=>dialog.open),true);
    const popup=await page.locator('#results').boundingBox();assert.ok(popup.x>=0&&popup.y>=0&&popup.x+popup.width<=viewport.width&&popup.y+popup.height<=viewport.height);
    assert.equal((await h.petCall()).body.balances.seals,43);assert.equal((await h.petCall()).body.balances.essence,430);assert.equal(await overflow(page),false);
    if(label==='desktop'){assert.equal(opens[before].requestId,opens[before+1].requestId);}
    await page.screenshot({path:path.join(out,label+'-results.png')});
    await page.locator('#results .po-primary').click();assert.equal(await page.locator('#results').evaluate(dialog=>dialog.open),false);
    await page.locator('#rates').click();assert.match(await page.locator('#poolRows').textContent(),/12.5%/);assert.match(await page.locator('#poolRows').textContent(),/37.5%/);assert.match(await page.locator('#poolRows').textContent(),/꽝.*50%/);await page.locator('#probabilities .po-dialog-close').click();
    forceBlank=true;await page.locator('#quantity').fill('3');await page.locator('#open').click();assert.match(await page.locator('#confirmNote').textContent(),/꽝.*소모/);await page.locator('#confirmOpen').click();
    await page.locator('#resultBlankCount').filter({hasText:'3'}).waitFor();await settle(page);assert.equal(await page.locator('#resultPetCount').textContent(),'0');assert.equal(await page.locator('#results .po-blank-card').count(),1);assert.equal(await page.locator('#results').evaluate(dialog=>dialog.scrollWidth>dialog.clientWidth),false);
    await page.screenshot({path:path.join(out,label+'-all-blank-popup.png')});await page.locator('#again').click();assert.equal(await page.locator('#results').evaluate(dialog=>dialog.open),false);
    assert.ok((await page.locator('#open').boundingBox()).height>=44);await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(out,'qa-summary.json'),JSON.stringify({desktop:true,mobile:true,noOverflow:true,receiptRetry:true,blankProbabilityEditable:true,modalResults:true,allBlankModal:true,pageErrors:errors,actualOpeningRequests:opens.length},null,2));console.log('PC/mobile CMS blank probability, modal results, all blank, receipt retry passed: '+out);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await h.close();}

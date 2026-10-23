import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative,extname,join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {PET_PUMPKIN_CHOICE_ITEM as ITEM,PET_PUMPKIN_CHOICES as CHOICES,PET_PUMPKIN_CHOICE_VERSION as VERSION} from '../shared/pet-pumpkin-choice-v1.mjs';

// Browser-only HTTP fixtures exercise the real inventory entry and real selector.
// Atomic debit/grant correctness belongs to the separate backend transaction tests.
const root=process.cwd(),out=resolve('docs/qa/pet-pumpkin-choice-20261023');mkdirSync(out,{recursive:true});
const app=readFileSync('js/app.js','utf8');
const start=app.indexOf('async function openInventoryPack('),end=app.indexOf("  if(itemCode==='PET_SEAL_ORB')",start);
assert(start>=0&&end>start,'Real inventory chooser entry must be available');
const entry=app.slice(start,end)+'}';assert(entry.includes(ITEM.code),'Real inventory branch must include the pumpkin ticket');
const recovery=app.slice(app.indexOf('function inventoryPendingGifts(){'),app.indexOf('const INVENTORY_GROUPS='));
assert(recovery.includes(ITEM.code),'Real inventory recovery must include the pumpkin ticket');
const icon=app.slice(app.indexOf('function inventoryIcon('),app.indexOf('function inventoryItemGroup('));
let fixture;
const reset=()=>fixture={tickets:1,owned:Object.fromEntries(CHOICES.map(p=>[p.code,0])),receipts:new Map(),posts:0,dropResponse:false,delayResponse:0,requests:[]};
const json=(res,status,body)=>res.writeHead(status,{'content-type':'application/json; charset=utf-8'}).end(JSON.stringify(body));
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  if(url.pathname==='/qa')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/inventory-v2125.css"><body style="background:#090a13;color:#fff;font-family:sans-serif"><button id="openItem">호박펫 선택권 사용</button><section id="inventoryGiftRecovery" class="iv25-gift-recovery" hidden></section><dialog id="inventoryDetailDialog" class="iv25-dialog"><div class="iv25-dialog-head"><b>아이템 상세</b><button data-inventory-close onclick="this.closest('dialog').close()">닫기</button></div><div id="inventoryDialogContent"></div></dialog><script>
  let API_TOKEN='local-account-7';window.activeAccount=7;window.refreshed=0;
  window.switchAccount=id=>{window.activeAccount=id;API_TOKEN='local-account-'+id;};
  const loadUser=()=>({serverUserId:window.activeAccount});const clearApiCache=()=>{};
  const loadInventory=async()=>{window.refreshed++;inventoryRenderGiftRecovery();};const renderShell=()=>{};
  ${entry}\n${recovery}\n${icon}
  document.getElementById('openItem').onclick=()=>openInventoryPack('${ITEM.code}',1);
  document.getElementById('inventoryGiftRecovery').onclick=event=>{if(event.target.closest('[data-inventory-recover="${ITEM.code}"]'))openInventoryPack('${ITEM.code}',0);};
  </script></body></html>`);
  if(url.pathname.startsWith('/api/pets/choice/')){
    let raw='';for await(const chunk of req)raw+=chunk;
    const input=raw?JSON.parse(raw):null,route=url.pathname.split('/').at(-1);
    fixture.requests.push({route,method:req.method,authorization:req.headers.authorization,input});
    if(req.headers.authorization!=='Bearer local-account-7')return json(res,401,{error:'Fixture account changed',code:'PET_CHOICE_AUTH',retryable:false});
    if(route==='options')return json(res,200,{userId:7,item:ITEM,version:VERSION,enabled:true,quantity:fixture.tickets,choices:CHOICES.map(p=>({...p,quantity:fixture.owned[p.code]})),pendingRequestId:null});
    if(route==='receipt'){
      const receipt=fixture.receipts.get(url.searchParams.get('requestId'));
      return receipt?json(res,200,{...receipt,replayed:true}):json(res,404,{code:'JOINT_NOT_FOUND',error:'아직 처리되지 않은 요청입니다.'});
    }
    if(route==='use'){
      fixture.posts++;const pet=CHOICES.find(p=>p.code===input?.targetCode);
      if(!pet||input.version!==VERSION)return json(res,400,{code:'PET_CHOICE_TARGET',error:'선택 대상 오류',retryable:false});
      let result=fixture.receipts.get(input.requestId);
      if(!result){
        if(fixture.tickets<1)return json(res,409,{code:'PET_CHOICE_BALANCE',error:'선택권이 없습니다.',retryable:false});
        fixture.tickets--;fixture.owned[pet.code]++;
        result={ok:true,status:'COMPLETED',requestId:input.requestId,itemCode:ITEM.code,consumed:1,reward:{...pet,quantity:1,ownedAfter:fixture.owned[pet.code]}};
        fixture.receipts.set(input.requestId,result);
      }
      if(fixture.delayResponse)await new Promise(r=>setTimeout(r,fixture.delayResponse));
      if(fixture.dropResponse){fixture.dropResponse=false;return json(res,503,{error:'검수: 지급 후 응답 유실',retryable:true});}
      return json(res,200,result);
    }
    return json(res,404,{error:'Unknown fixture endpoint'});
  }
  const file=resolve(root,'.'+decodeURIComponent(url.pathname)),rel=relative(root,file);
  if(rel.startsWith('..')||resolve(file)===root)return res.writeHead(403).end();
  const bytes=readFileSync(file);res.writeHead(200,{'content-type':({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'}).end(bytes);
}catch(error){json(res,500,{error:error.message});}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[];
const open=async page=>{await page.locator('#openItem').click();await page.locator('[data-pumpkin-choice]').last().waitFor();};
const waitImages=page=>page.locator('.ppc-content img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
try{
  for(const [width,height]of [[1440,1000],[390,844],[320,740]]){
    reset();const page=await browser.newPage({viewport:{width,height},isMobile:width<700,hasTouch:width<700}),errors=[],httpErrors=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400&&!response.url().includes('/api/'))httpErrors.push(response.url());});
    await page.goto(base+'/qa');await open(page);await waitImages(page);
    assert.equal(await page.locator('[data-pumpkin-choice]').count(),2);assert.equal(await page.locator('[data-pumpkin-confirm]').isDisabled(),true);
    for(const pet of CHOICES)assert((await page.locator(`[data-pumpkin-choice="${pet.code}"] img`).getAttribute('src')).endsWith(pet.sourceArt));
    await page.locator(`[data-pumpkin-choice="${CHOICES[0].code}"]`).click();assert.equal(fixture.posts,0);
    assert.equal(await page.locator(`[data-pumpkin-choice="${CHOICES[0].code}"]`).getAttribute('aria-pressed'),'true');
    const layout=await page.locator('.ppc-dialog').evaluate(el=>({
      overflow:el.scrollWidth>el.clientWidth+1||document.querySelector('.ppc-content').scrollWidth>document.querySelector('.ppc-content').clientWidth+1,
      width:el.getBoundingClientRect().width,panel:getComputedStyle(el).borderImageSource,
      button:getComputedStyle(document.querySelector('[data-pumpkin-confirm]')).backgroundImage,
      cancelHeight:document.querySelector('[data-pumpkin-cancel]').getBoundingClientRect().height,
      confirmHeight:document.querySelector('[data-pumpkin-confirm]').getBoundingClientRect().height,
    }));
    assert.equal(layout.overflow,false);assert(layout.width<=width+1);assert.match(layout.panel,/pumpkin-pet-choice-20261023\/panel.webp/);assert.match(layout.button,/pumpkin-pet-choice-20261023\/button.webp/);assert(layout.cancelHeight>=44&&layout.confirmHeight>=44);
    await page.screenshot({path:join(out,'choice-'+width+'.png')});
    await page.locator('[data-pumpkin-cancel]').click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
    assert.equal(fixture.tickets,1);assert.equal(fixture.posts,0);
    await open(page);assert.equal(await page.locator('[data-pumpkin-confirm]').isDisabled(),true);
    await page.locator(`[data-pumpkin-choice="${CHOICES[1].code}"]`).focus();await page.keyboard.press('Space');
    fixture.dropResponse=true;await page.locator('[data-pumpkin-confirm]').click();await page.locator('output').filter({hasText:'응답 유실'}).waitFor();
    assert.equal(fixture.posts,1);assert.equal(fixture.tickets,0);assert.equal(fixture.owned[CHOICES[1].code],1);
    assert.equal(await page.locator('[data-pumpkin-choice]:disabled').count(),2);
    await page.keyboard.press('Escape');await page.locator(`[data-inventory-recover="${ITEM.code}"]`).click();await page.locator('[data-pumpkin-done]').waitFor();await waitImages(page);
    assert.equal(fixture.posts,1,'Recovery must read the receipt rather than spend again');
    assert.equal(await page.evaluate(()=>window.refreshed),1);
    assert.equal(await page.evaluate(()=>localStorage.getItem('cnine.pet-pumpkin-choice.v1:7')),null);
    await page.screenshot({path:join(out,'result-'+width+'.png')});await page.locator('[data-pumpkin-done]').click();assert.equal(await page.locator('dialog').evaluate(el=>el.open),false);
    assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);checks.push({viewportWidth:width,viewportHeight:height,...layout,explicitCancelFree:true,keyboardSelection:true,receiptRecoveryWithoutSecondPost:true,errors,httpErrors});await page.close();
  }
  reset();const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(base+'/qa');await open(page);
  await page.locator(`[data-pumpkin-choice="${CHOICES[0].code}"]`).click();await page.evaluate(()=>window.switchAccount(8));await page.locator('[data-pumpkin-confirm]').click();await page.getByRole('alert').filter({hasText:'계정이 변경'}).waitFor();
  assert.equal(fixture.posts,0);assert.equal(fixture.tickets,1);assert.equal(await page.evaluate(()=>localStorage.getItem('cnine.pet-pumpkin-choice.v1:8')),null);
  await page.locator('[data-pumpkin-cancel]').click();await page.evaluate(()=>window.switchAccount(7));await open(page);
  await page.locator(`[data-pumpkin-choice="${CHOICES[0].code}"]`).click();fixture.delayResponse=300;await page.locator('[data-pumpkin-confirm]').click();
  await new Promise((resolve,reject)=>{const started=Date.now();const poll=()=>fixture.posts===1?resolve():Date.now()-started>3000?reject(Error('Fixture POST did not arrive')):setTimeout(poll,10);poll();});
  await page.evaluate(()=>window.switchAccount(8));await page.getByRole('alert').filter({hasText:'계정이 변경'}).waitFor();
  assert.equal(fixture.posts,1);assert.equal(fixture.owned[CHOICES[0].code],1);assert.equal(await page.locator('[data-pumpkin-done]').count(),0);
  assert(await page.evaluate(()=>Boolean(localStorage.getItem('cnine.pet-pumpkin-choice.v1:7'))));assert.equal(await page.evaluate(()=>localStorage.getItem('cnine.pet-pumpkin-choice.v1:8')),null);
  await page.locator('[data-pumpkin-cancel]').click();await page.evaluate(()=>window.switchAccount(7));fixture.delayResponse=0;await page.locator('#openItem').click();await page.locator('[data-pumpkin-done]').waitFor();assert.equal(fixture.posts,1);
  assert(fixture.requests.every(r=>r.authorization==='Bearer local-account-7'));await page.close();
  const result={scope:'Real inventory entry and recovery functions, actual selector and approved art; isolated HTTP fixtures',checks,accountChangeBeforePostBlocked:true,accountChangeAfterPostPreservesOriginalRecovery:true,serverTransactionTestsSeparate:true};
  writeFileSync(join(out,'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}

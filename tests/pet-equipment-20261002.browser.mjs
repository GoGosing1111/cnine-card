import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {petEquipmentFixture} from './helpers/pet-equipment-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),out=process.env.QA_OUTPUT_DIR;
if(!out||path.resolve(out).startsWith(root+path.sep))throw Error('Set QA_OUTPUT_DIR outside the deployment repository');
await mkdir(out,{recursive:true});const fixture=await petEquipmentFixture(),errors=[],requests=[];let truncateNext=false;
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host}`),route=url.pathname;
    if(route.startsWith('/api/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks);
      if(route.endsWith('/equipment/loadout'))requests.push(JSON.parse(raw));
      const response=await fixture.handle(new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:raw})}),{path:route.slice(5),denied:req.headers.authorization==='Bearer qa-denied'});
      if(truncateNext&&route.endsWith('/equipment/loadout')&&response?.status===200){truncateNext=false;res.writeHead(200,{'content-type':'application/json'});res.end();return;}
      res.writeHead(response?.status||404,response?Object.fromEntries(response.headers):{});res.end(response?await response.text():'');return;
    }
    if(route==='/qa-deck'){
      res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end('<html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/pet-equipment-v1.css"><style>body{background:#101c18;color:#ddd;padding:16px}button{font:inherit}</style></head><body><main><section><div id="battleDeck">PvE 일반 카드 5장</div></section><section><div id="pvpDeckSlots">PvP 일반 카드 5장</div></section></main><button id="ownerOpen">OWNER 장착 검수</button><script type="module" src="/js/pet-deck-slot-v1.mjs"></script><script type="module">import {openPetEquipment} from "/js/pet-equipment-window-v1.mjs?v=20261002-pet-equipment1";document.getElementById("ownerOpen").addEventListener("click",()=>openPetEquipment({review:true}));</script></body></html>');return;
    }
    let pathname=decodeURIComponent(route);if(pathname.endsWith('/'))pathname+='index.html';
    const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!/^\/(?:admin|shared|pets|css|js|preview\/companion-preparation-v2|assets)\//.test(pathname)){res.writeHead(404);res.end();return;}
    const data=await readFile(file),ext=path.extname(file),mime={'.html':'text/html;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'}[ext]||'application/octet-stream';res.writeHead(200,{'content-type':mime});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
  for(const [label,viewport]of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport});await context.addInitScript(()=>{if(!localStorage.getItem('cnine_admin_token'))localStorage.setItem('cnine_admin_token','qa-owner');if(!localStorage.getItem('cnine_card_api_token'))localStorage.setItem('cnine_card_api_token','qa-user');});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/pets/?review=1');await page.locator('[data-pet-status]').filter({hasText:/검수용 펫/}).waitFor();assert.equal(await page.locator('[data-pet-select]').count(),4);
    await page.locator('[data-pet-select="PET-HEEYA"]').click();assert.match(await page.locator('[data-pet-detail]').textContent(),/돼지/);assert.match(await page.locator('[data-pet-detail]').textContent(),/미정/);
    await page.locator('[data-pet-select="PET-BONGSOON"]').click();await page.locator('.pe-hero').evaluate(image=>image.decode());
    const initialArt=await page.locator('.pe-hero').getAttribute('src');assert.match(initialArt,/nametag-v2/);
    if(label==='desktop')await page.screenshot({path:path.join(out,'gugugaga-recovered-equipment.png'),fullPage:true});
    await page.locator('[data-pet-equip]').click();await page.locator('[data-pet-status]').filter({hasText:/장착을 저장/}).waitFor();assert.match(await page.locator('[data-pet-equipped]').textContent(),/봉순/);
    await page.reload();await page.locator('[data-pet-status]').filter({hasText:/검수용 펫/}).waitFor();assert.match(await page.locator('[data-pet-equipped]').textContent(),/봉순/);
    if(label==='desktop'){
      const cms=await context.newPage();cms.on('pageerror',error=>errors.push(error.message));await cms.goto(base+'/preview/companion-preparation-v2/');await cms.locator('[data-status]').filter({hasText:/CMS 버전/}).waitFor();
      await cms.locator('[data-art-preset]').selectOption('PET-DIIM');await cms.locator('[data-register-art]').click();assert.match(await cms.locator('[data-field="sourceArt"]').inputValue(),/pet-diim/);assert.equal(await cms.locator('[data-field="battleSprite"]').inputValue(),'');assert.equal(await cms.locator('[data-buff-percent="0"]').inputValue(),'');
      await cms.locator('[data-buff-percent="0"]').fill('7');await cms.locator('[data-field="target"]').selectOption('MERCENARIES');await cms.locator('[data-save]').click();await cms.locator('[data-status]').filter({hasText:/저장 완료/}).waitFor();assert.equal(await cms.locator('.cp-equipment-link').getAttribute('href'),'/pets/?review=1');
      await cms.screenshot({path:path.join(out,'desktop-art-cms.png'),fullPage:true});await cms.close();
      await page.locator('[data-pet-select="PET-DIIM"]').click();await page.locator('[data-pet-equip]').click();await page.locator('[data-pet-status]').filter({hasText:/다른 창/}).waitFor();assert.equal(await page.locator('[data-pet-equip]').isDisabled(),true);
      await page.locator('[data-pet-refresh]').click();await page.locator('[data-pet-status]').filter({hasText:/검수용 펫/}).waitFor();assert.match(await page.locator('[data-pet-detail]').textContent(),/7%/);assert.match(await page.locator('[data-pet-detail]').textContent(),/용병/);
      const before=requests.length;truncateNext=true;await page.locator('[data-pet-equip]').click();await page.locator('[data-pet-equip]').filter({hasText:'장착 결과 재확인'}).waitFor();assert.equal(await page.locator('[data-pet-unequip]').isDisabled(),true);assert.equal(await page.locator('[data-pet-select]').first().isDisabled(),true);await page.locator('[data-pet-equip]').click();await page.locator('[data-pet-status]').filter({hasText:/장착을 저장/}).waitFor();assert.equal(requests[before].requestId,requests[before+1].requestId);
    }else{
      await page.locator('[data-pet-select="PET-DIIM"]').click();assert.match(await page.locator('[data-pet-detail]').textContent(),/7%/);await page.locator('[data-pet-equip]').click();await page.locator('[data-pet-status]').filter({hasText:/장착을 저장/}).waitFor();
    }
    await page.locator('.pe-hero').evaluate(image=>image.decode());await page.screenshot({path:path.join(out,`${label}-equipment.png`),fullPage:true});
    const geometry=await page.evaluate(()=>({page:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(geometry.scroll<=geometry.page+1,JSON.stringify(geometry));results.push({label,viewport,...geometry});
    await page.locator('[data-pet-unequip]').click();await page.locator('[data-pet-status]').filter({hasText:/장착을 해제/}).waitFor();assert.match(await page.locator('[data-pet-equipped]').textContent(),/빈 지원 슬롯/);
    await page.goto(base+'/qa-deck');assert.equal(await page.locator('[data-pet-deck-slot]').count(),2);await page.locator('[data-pet-deck-slot="PVE"] button').click();await page.locator('[data-pet-status]').filter({hasText:/펫 시스템을 준비/}).waitFor();assert.equal(await page.locator('.pe-dialog [data-pet-select]').count(),0);await page.keyboard.press('Escape');await page.locator('.pe-dialog').waitFor({state:'detached'});assert.equal(await page.locator('[data-pet-deck-slot="PVE"] button').evaluate(button=>button===document.activeElement),true);
    await page.locator('#ownerOpen').click();await page.locator('.pe-dialog [data-pet-select]').first().waitFor();await page.locator('.pe-dialog [data-pet-select="PET-HEEYA"]').click();await page.locator('.pe-dialog .pe-hero').evaluate(image=>image.decode());const closeBox=await page.locator('.pe-close').boundingBox();assert.ok(closeBox.y>=0&&closeBox.y+closeBox.height<=viewport.height);await page.screenshot({path:path.join(out,`${label}-modal.png`),fullPage:true});
    await page.locator('.pe-close').focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('[data-pet-equip]').evaluate(button=>button===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await page.locator('.pe-close').evaluate(button=>button===document.activeElement),true);await page.getByRole('button',{name:'펫 장착창 닫기'}).click();await page.locator('.pe-dialog').waitFor({state:'detached'});assert.equal(await page.locator('#ownerOpen').evaluate(button=>button===document.activeElement),true);
    await page.goto(base+'/pets/');await page.locator('[data-pet-status]').filter({hasText:/펫 시스템을 준비/}).waitFor();assert.equal(await page.locator('[data-pet-select]').count(),0);assert.equal(await page.locator('[data-pet-equip]').isDisabled(),true);
    await page.goto(base+'/pets/?review=1');await page.locator('[data-pet-select]').first().waitFor();await page.evaluate(()=>localStorage.setItem('cnine_admin_token','qa-denied'));await page.locator('[data-pet-refresh]').click();await page.locator('[data-pet-status]').filter({hasText:/OWNER 로그인이/}).waitFor();assert.equal(await page.locator('[data-pet-select]').count(),0);assert.equal(await page.locator('[data-pet-equip]').isDisabled(),true);await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(out,'results.json'),JSON.stringify({results,errors,passed:true},null,2));console.log(JSON.stringify({results,errors,passed:true}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fixture.close();}

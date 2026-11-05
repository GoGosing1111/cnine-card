import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {petLiveFixture} from './helpers/pet-live-fixture.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.PET_MODE_QA_DIR;
const publicOrigin=process.env.PET_MODE_PUBLIC_UI==='1'?'https://cnine-card.pages.dev':null;
const origin=publicOrigin||'https://pets.qa.test';
const types={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'};
const deckPage='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/pet-equipment-v1.css"><body><section><div id="battleDeck"></div></section><section><div id="pvpDeckSlots"></div></section><script type="module" src="/js/pet-deck-slot-v1.mjs"></script></body></html>';
const first='PET-BONGSOON',second='PET-DIIM',art=PET_ART_CATALOG.find(p=>p.code===second);
async function localFile(file){
  try{return await readFile(path.join(root,file));}
  catch(error){
    if(error.code!=='ENOENT'||!file.startsWith('assets/'))throw error;
    return execFileSync('git',['show','HEAD:'+file],{cwd:root,maxBuffer:16e6,stdio:['ignore','pipe','ignore']});
  }
}
if(out)await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const width of (publicOrigin?[390]:[1440,390,320])){
    const f=await petLiveFixture(),cms=await f.record('pet_cms_preparation_v1');
    const context=await browser.newContext({viewport:{width,height:width===1440?960:844},serviceWorkers:'block'});
    try{
      cms.document.pets.push({...f.pet,code:second,name:art.name,sourceArt:art.sourceArt});
      await f.write('pet_cms_preparation_v1',cms);
      await f.write('pet_collection_v1:2',{revision:1,pets:{[first]:1,[second]:1}});
      await f.equip();
      let truncate=false;
      const writes=[],errors=[];
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url()),pathname=decodeURIComponent(url.pathname);
        if(url.origin!==origin)return route.abort();
        if(pathname.startsWith('/api/')){
          const key=pathname.slice(5),body=req.postDataJSON();
          if(['pets/v1/state','pets/v1/codex','pets/v1/loadout'].includes(key)){
            const result=await f.call(key,{method:req.method(),body});
            if(body){writes.push(body);if(truncate&&result.status===200){truncate=false;return route.fulfill({status:200,contentType:'application/json',body:''});}}
            return route.fulfill({status:result.status,json:result.body});
          }
          if(key==='server-support/info')return route.fulfill({json:{serverNow:Date.now(),subscription:{revision:0,endsAt:0,active:false}}});
          return route.fulfill({json:{visible:false,enabled:false,items:[],cards:[],settings:{}}});
        }
        if(req.method()!=='GET')return route.abort();
        if(pathname==='/deck-fixture')return route.fulfill({contentType:types['.html'],body:deckPage});
        if(publicOrigin)return route.continue();
        const file=pathname.slice(1)+(pathname.endsWith('/')?'index.html':'');
        try{return await route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:await localFile(file)});}
        catch{return route.fulfill({status:404,body:''});}
      });
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      page.setDefaultTimeout(10000);
      const selector=mode=>page.locator(`[data-pet-mode="${mode}"]`);
      const deck=mode=>page.locator(`[data-pet-deck-slot="${mode}"]`);
      const status=message=>page.locator('[data-pet-status]').filter({hasText:message}).waitFor();
      const waitMode=mode=>page.locator(`[data-pet-mode="${mode}"][aria-pressed="true"]:enabled`).waitFor();
      const waitDeck=(mode,code)=>page.locator(`[data-pet-deck-slot="${mode}"][data-pet-code="${code}"]`).waitFor();

      await page.goto(origin+'/deck-fixture');await waitDeck('PVE',first);await waitDeck('PVP',first);
      await deck('PVP').getByRole('button').click();await waitMode('PVP');
      await page.locator(`[data-pet-select="${second}"]`).click();
      truncate=true;await page.locator('[data-pet-equip]').click();await status(/끊겼습니다/);
      assert.equal(await selector('PVE').isDisabled(),true);
      await page.locator('[data-pet-equip]').click();await status(/PvP.*저장했습니다/);
      assert.deepEqual(writes[0],writes[1]);assert.equal(writes[0].mode,'PVP');
      assert.match(await selector('PVE').textContent(),/봉순/);assert.match(await selector('PVP').textContent(),/디임/);
      await page.locator('.pe-close').click();await waitDeck('PVP',second);await waitDeck('PVE',first);
      await deck('PVE').getByRole('button').click();await waitMode('PVE');
      assert.match(await page.locator('[data-pet-equipped]').textContent(),/봉순/);
      await page.locator('[data-pet-unequip]').click();await status(/PvE.*해제했습니다/);
      await page.locator('.pe-close').click();await waitDeck('PVE','');await waitDeck('PVP',second);

      await page.goto(origin+'/pet-codex/');await waitMode('PVE');await selector('PVP').click();
      await page.reload();await waitMode('PVP');
      assert.match(await page.locator('[data-pet-equipped]').textContent(),/디임/);
      await page.locator(`[data-pet-select="${first}"]`).click();
      await page.locator('[data-pet-equip]').click();await status(/PvP.*저장했습니다/);
      await page.goto(origin+'/pets/?mode=PVP');await waitMode('PVP');
      assert.match(await selector('PVE').textContent(),/미장착/);assert.match(await selector('PVP').textContent(),/봉순/);
      await page.locator(`[data-pet-select="${second}"]`).click();await page.locator('[data-pet-equip]').click();
      await status(/PvP.*저장했습니다/);await selector('PVE').click();
      await page.locator(`[data-pet-select="${first}"]`).click();await page.locator('[data-pet-equip]').click();await status(/PvE.*저장했습니다/);
      await page.reload();await waitMode('PVE');
      await page.locator('.pe-hero').evaluate(img=>img.decode());
      assert.match(await selector('PVE').textContent(),/봉순/);assert.match(await selector('PVP').textContent(),/디임/);
      const bounds=await Promise.all(['PVE','PVP'].map(mode=>selector(mode).boundingBox()));
      assert.ok(bounds.every(b=>b&&b.height>=44&&b.x>=0&&b.x+b.width<=width+1));
      assert.ok(bounds[0].x+bounds[0].width<=bounds[1].x);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(out){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,width+'-equipment.png')});}
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({width,origin,modeButtons:bounds.map(b=>b.height),PVE:first,PVP:second,requests:writes.length,errors}));
    }finally{await context.close();await f.close();}
  }
}finally{await browser.close();}

// Real public page, approved FX and shared navigation; API data is isolated locally.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.FORGE_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'forge-inventory-scroll-'));
fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const types=[
  ['금룡 돌격소총','WEAPON','assets/ui/project-v/account-battle-suits/weapons/gilded-dragon-ar-v1.png'],
  ['엠퍼러 슈트','TOP','assets/items/emperor-suit-v1.png'],
  ['엠퍼러 레깅스','BOTTOM','assets/items/emperor-leggings-v1.png'],
  ['엠퍼러 슈즈','SHOES','assets/items/emperor-shoes-v1.png'],
  ['엠퍼러 듀얼디스크','ACCESSORY','assets/items/emperor-dual-disk-v1.png']
];
const inventory=Array.from({length:120},(_,i)=>{
  const [name,slot,image]=types[i%5];
  return {instanceId:String(i+1),equipmentId:String(i%5+1),name,slot,image,grade:'MYTHIC',equipped:[1,2,43,84,85].includes(i+1),basePower:{total:200000,pve:180000,pvp:20000},enhancement:{level:i%11,power:{total:200000,pve:180000,pvp:20000}}};
});
const status={publicVisible:true,executionMode:'OFF',canEnhance:false,canRestore:false,notice:'강화 오픈 일정은 추후 안내됩니다.'};
const state={...status,accountId:4242,wallet:{coins:'5000000000',protection:null,masterStars:0},policy:{},history:[],records:[{...inventory[0],recordId:'r1',equipped:true,level:3}]};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const reports=[];
try{
  for(const [width,height] of [[1920,1080],[1440,1050],[1366,768],[1024,768],[820,900],[390,844],[320,740]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:width<=700,hasTouch:width<=700,serviceWorkers:'block',reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[],requests=[];let loggedIn=true;
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','forge-layout-qa'));
    await page.route('**/api/**',async route=>{
      const request=route.request(),url=new URL(request.url());requests.push({path:url.pathname,method:request.method()});
      assert.equal(request.method(),'GET','UI inspection must never spend equipment or currency');
      if(url.pathname.endsWith('/forge/status'))return route.fulfill({json:status});
      if(url.pathname.endsWith('/forge/state')){
        if(!loggedIn)return route.fulfill({status:401,json:{error:'로그인이 필요합니다.'}});
        const group=url.searchParams.get('group'),rows=inventory.filter(item=>group==='weapon'?item.slot==='WEAPON':group==='armor'?['TOP','BOTTOM','SHOES'].includes(item.slot):group==='accessory'?item.slot==='ACCESSORY':true);
        const cursor=url.searchParams.get('beforeId'),offset=cursor?rows.findIndex(item=>item.instanceId===cursor)+1:0,items=rows.slice(offset,offset+40);
        return route.fulfill({json:{...state,items,nextCursor:offset+40<rows.length?items.at(-1).instanceId:null}});
      }
      return route.fulfill({json:{visible:false,enabled:false}});
    });
    await page.goto(origin+'/equipment-forge/');
    await page.locator('[data-id="40"]').waitFor({state:'attached'});
    await page.locator('.renderer-ready').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    const region=page.getByRole('region',{name:'보유 장비'});
    const dimensions=()=>page.evaluate(()=>{
      const region=document.getElementById('inventory-scroll'),workspace=document.getElementById('workspace'),button=document.getElementById('enhance-button');
      return {inventory:region.clientHeight,content:region.scrollHeight,workspace:workspace.offsetHeight,button:button.getBoundingClientRect().top+scrollY,body:document.documentElement.scrollHeight};
    });
    const first=await dimensions();
    assert.ok(first.inventory>=160&&first.inventory<=800,`bounded inventory at ${width}: ${JSON.stringify(first)}`);
    assert.ok(first.content>first.inventory*2,'large list scrolls internally');
    assert.equal(await page.locator('.equipment-equipped-badge').count(),2);
    assert.equal(await page.locator('[data-id="6"] .equipment-equipped-badge').count(),0,'same equipment type is not the equipped instance');
    assert.match(await page.locator('[data-id="1"]').getAttribute('aria-label'),/장착 중.*#1/);
    await region.evaluate(el=>el.scrollIntoView({block:'center'}));
    const position=await region.boundingBox();
    await page.mouse.move(position.x+position.width/2,Math.max(10,Math.min(height-80,position.y+position.height/2)));
    const bodyScroll=await page.evaluate(()=>scrollY);
    await page.mouse.wheel(0,400);
    await page.waitForFunction(()=>document.getElementById('inventory-scroll').scrollTop>100);
    assert.equal(await page.evaluate(()=>scrollY),bodyScroll,'list scrolling does not scroll the page');
    await region.focus();await page.keyboard.press('End');
    await page.locator('#inventory-more').click();
    await page.locator('[data-id="80"]').waitFor({state:'attached'});
    assert.equal(await page.locator('.equipment-equipped-badge').count(),3);
    await page.locator('[data-id="43"]').click();
    await page.waitForFunction(()=>document.getElementById('stage-item-sub').dataset.equipped==='true');
    const selectedScroll=await region.evaluate(el=>el.scrollTop);
    assert.ok(selectedScroll>100,'selection retains the internal scroll position');
    assert.equal(await page.locator('[data-id="43"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),'43','selection keeps keyboard focus');
    await page.keyboard.press('Enter');
    assert.equal(await region.evaluate(el=>el.scrollTop),selectedScroll,'keyboard selection does not jump back to the first row');
    await page.locator('#inventory-more').click();
    await page.locator('[data-id="120"]').waitFor({state:'attached'});
    assert.equal(await page.locator('.equipment-equipped-badge').count(),5);
    assert.equal(await page.locator('#inventory-more').isVisible(),false);
    const last=await dimensions();
    for(const key of ['workspace','button','body'])assert.ok(Math.abs(first[key]-last[key])<=1,`${key} stays fixed after pagination at ${width}: ${JSON.stringify({first,last})}`);
    await page.locator('[data-id="1"]').click();
    await page.locator('#workspace').evaluate(el=>el.scrollIntoView({block:'start'}));
    await page.screenshot({path:path.join(out,`workspace-${width}.png`),fullPage:false});
    await page.locator('.inventory-panel').screenshot({path:path.join(out,`inventory-${width}.png`)});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow');
    assert.ok(await region.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'no clipped inventory columns');
    await page.locator('#enhance-button').scrollIntoViewIfNeeded();
    const button=await page.locator('#enhance-button').boundingBox();
    const dock=await page.locator('soop-adventure-lobby .mobile-dock').boundingBox();
    assert.ok(button.y>=0&&button.y+button.height<=(dock?.y??height)+1,'button is reachable above the shared navigation');
    assert.equal(await page.locator('#enhance-button').isDisabled(),true,'execution OFF is unchanged');
    await page.screenshot({path:path.join(out,`controls-${width}.png`),fullPage:false});
    await page.locator('[data-filter="weapon"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.equipment-row').length===24);
    assert.equal(await region.evaluate(el=>el.scrollTop),0,'filter changes reset the inventory scroll');
    assert.equal(await page.locator('.equipment-equipped-badge').count(),1);
    await page.locator('[data-id="6"]').click();
    assert.match(await page.locator('#stage-item-sub').textContent(),/보유 장비/);
    assert.equal(await page.locator('#stage-item-sub').getAttribute('data-equipped'),'false');
    await page.locator('#tab-restore').click();
    assert.equal(await page.locator('.equipment-equipped-badge').count(),0,'destroyed snapshots are not marked equipped');
    assert.match(await page.locator('#stage-item-sub').textContent(),/파괴 기록/);
    await page.locator('#tab-enhance').click();
    loggedIn=false;await page.locator('#refresh-equipment').click();await page.locator('.public-login').waitFor();
    assert.equal(await page.locator('.equipment-row').count(),0);
    assert.equal(await page.locator('#wallet-coins').textContent(),'—');
    assert.deepEqual(errors,[]);
    reports.push({width,height,items:120,inventoryHeight:first.inventory,workspaceHeight:last.workspace,paginationDoesNotMoveButton:true,equippedInstances:5,noWrites:true,noOverflow:true,noErrors:true});
    await context.close();
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));
  console.log(JSON.stringify({out,reports},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {EQUIPMENT_POWER_STANDARD} from '../shared/equipment-mercenary-power-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(root,'../qa-forge-public');fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');let file=path.resolve(root,'.'+url.pathname);if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const catalog=[['1','금룡 돌격소총','WEAPON','assets/ui/project-v/account-battle-suits/weapons/gilded-dragon-ar-v1.png'],['2','엠퍼러 슈트','TOP','assets/items/emperor-suit-v1.png'],['3','엠퍼러 레깅스','BOTTOM','assets/items/emperor-leggings-v1.png'],['4','엠퍼러 슈즈','SHOES','assets/items/emperor-shoes-v1.png'],['5','엠퍼러 듀얼디스크','ACCESSORY','assets/items/emperor-dual-disk-v1.png']].map(([instanceId,name,slot,image])=>({instanceId,equipmentId:instanceId,name,slot,image,grade:'MYTHIC',equipped:slot==='WEAPON',basePower:{total:200000,pve:100000,pvp:100000},enhancement:null}));
const publicStatus={publicVisible:true,executionMode:'OFF',canEnhance:false,canRestore:false,notice:'무기와 방어구의 강화 센터가 공개되었습니다. 강화 오픈 일정은 추후 안내됩니다.'};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});const reports=[];
try{for(const [width,height]of(process.env.QA_ADMIN_ONLY?[]:[[1440,1050],[1024,900],[390,844],[360,740]])){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<760,hasTouch:width<760});const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));let loggedIn=true,visible=true;
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','qa-only-token'));
  await page.route(origin+'/api/character/equipment/forge/**',async route=>{
    const url=new URL(route.request().url());requests.push({path:url.pathname,method:route.request().method()});assert.equal(route.request().method(),'GET');
    if(url.pathname.endsWith('/status'))return route.fulfill({json:{...publicStatus,publicVisible:visible}});
    if(!loggedIn)return route.fulfill({status:401,json:{error:'로그인이 필요합니다.'}});
    const group=url.searchParams.get('group'),rows=catalog.filter(r=>group==='weapon'?r.slot==='WEAPON':group==='armor'?['TOP','BOTTOM','SHOES'].includes(r.slot):group==='accessory'?r.slot==='ACCESSORY':true);
    return route.fulfill({json:{...publicStatus,items:rows,nextCursor:null,wallet:{coins:'5000000000'},records:[],history:[]}});
  });
  await page.goto(origin+'/equipment-forge/');await page.locator('[data-id="1"]').waitFor();await page.locator('.renderer-ready').waitFor();
  assert.equal(await page.locator('[data-id]').count(),5);assert.equal(await page.locator('#wallet-coins').textContent(),'5,000,000,000');assert.equal(await page.locator('#enhance-button').isDisabled(),true);
  await page.screenshot({path:path.join(out,`weapon-${width}.png`),fullPage:false});
  await page.locator('[data-filter="armor"]').click();await page.locator('[data-id="2"]').waitFor();assert.equal(await page.locator('[data-id]').count(),3);
  for(const id of ['2','3','4']){await page.locator('[data-id="'+id+'"]').click();await page.waitForFunction(name=>document.getElementById('stage-item-name').textContent===name,catalog.find(r=>r.instanceId===id).name);assert.equal(await page.locator('#enhance-button').isDisabled(),true);}
  await page.locator('[data-id="2"]').click();await page.locator('.forge-stage').scrollIntoViewIfNeeded();await page.waitForTimeout(120);await page.screenshot({path:path.join(out,`armor-${width}.png`),fullPage:false});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow '+width);
  await page.locator('#enhance-button').evaluate(button=>{button.disabled=false;button.click();});assert.equal(requests.filter(r=>r.method!=='GET').length,0);assert.equal(await page.locator('#toast').textContent(),'아직 강화·복구가 오픈되지 않았습니다.');
  await page.locator('#tab-restore').click();assert.equal(await page.locator('#restore-button').isDisabled(),true);assert.match(await page.locator('#inventory-list').textContent(),/파괴 기록이 없습니다/);
  await page.locator('#rules-button').click();await page.locator('#rules-dialog').waitFor();assert.match(await page.locator('#rules-dialog').textContent(),/상의, 하의, 신발/);await page.locator('[data-close]').click();
  await page.locator('#tab-enhance').click();loggedIn=false;await page.locator('#refresh-equipment').click();await page.locator('.public-login').waitFor();assert.equal(await page.locator('[data-id]').count(),0);assert.equal(await page.locator('#wallet-coins').textContent(),'—');
  visible=false;await page.locator('#refresh-equipment').click();await page.waitForFunction(()=>document.getElementById('opening-title').textContent==='강화 센터 준비 중');assert.equal(await page.locator('[data-id]').count(),0);
  assert.deepEqual(errors,[]);reports.push({width,height,weapon:true,top:true,bottom:true,shoes:true,offCannotExecute:true,noPostRequests:true,logoutClearsInventory:true,noOverflow:true,noPageErrors:true});await context.close();
}
// Mount the production equipment renderer and verify its new entry at both sizes.
for(const width of (process.env.QA_ADMIN_ONLY?[]:[1440,390])){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
 await page.route(origin+'/preview/live-character-loadout-v2-v1/preview.js*',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'preview/live-character-loadout-v2-v1/preview.js'),'utf8').replace('request: previewRequest,','request: previewRequest, forgePublicEntry: true,')}));
 await page.goto(origin+'/preview/live-character-loadout-v2-v1/');await page.addStyleTag({url:origin+'/css/equipment-forge-entry-v1.css'});const entry=page.locator('.clv2-forge-entry');await entry.waitFor();assert.match(await entry.textContent(),/무기·방어구·장신구/);assert.equal(await entry.getAttribute('href'),'/equipment-forge/');await entry.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`loadout-${width}.png`),fullPage:false});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();
}
// Admin is the real page shell and new module, with isolated API responses.
for(const width of [1440,390]){
const context=await browser.newContext({viewport:{width,height:900},isMobile:width<760,hasTouch:width<760});const page=await context.newPage();
const html=fs.readFileSync(path.join(root,'admin/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script type="module" src="/admin/equipment-forge-admin-v1.js"></script></body>');
let settings={schemaVersion:1,revision:1,publicVisible:true,executionMode:'OFF',notice:'현재 안내'};
await page.route(origin+'/admin/',route=>route.fulfill({contentType:'text/html',body:html}));await page.route(origin+'/api/admin/equipment-forge',async route=>{if(route.request().method()==='PATCH'){const b=route.request().postDataJSON();assert.equal(b.settings.executionMode,'OFF');settings={...settings,...b.settings,revision:settings.revision+1};}return route.fulfill({json:{settings,executionReady:false,powerStandard:EQUIPMENT_POWER_STANDARD,pending:['운영 정책 확정','서버 연결 검수','공동 출시']}});});
await page.goto(origin+'/admin/#equipment-forge');await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.body.classList.add('auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});await page.locator('.forge-cms textarea').waitFor();assert.equal(await page.locator('.forge-power-standard tbody tr').count(),11);assert.match(await page.locator('.forge-power-highlight').nth(0).textContent(),/80%.*1.80배.*32%/);assert.match(await page.locator('.forge-power-highlight').nth(1).textContent(),/120%.*2.20배.*40%/);assert.equal(await page.locator('.forge-cms select[name="executionMode"] option[value="ON"]').evaluate(option=>option.disabled),true);await page.locator('.forge-cms textarea').fill('무기·방어구 선공개 안내');await page.locator('.forge-cms button[type=submit]').click();await page.getByRole('status').filter({hasText:'저장 완료'}).waitFor();assert.equal(settings.notice,'무기·방어구 선공개 안내');await page.locator('.forge-cms').screenshot({path:path.join(out,`power-admin-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));reports.push({adminWidth:width,powerLevels:11,approvedPower:true,offCannotExecute:true,noOverflow:true});await context.close();
}
}finally{await browser.close();server.close();}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));

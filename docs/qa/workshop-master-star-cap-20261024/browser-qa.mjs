import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='C:/Users/User/.codex/worktrees/lounge-cnine-pause/cnine-card';
const out=fileURLToPath(new URL('./',import.meta.url));
const origin='https://cnine-card.pages.dev';
const lounge=fs.readFileSync(path.join(root,'js/streamer-lounge-v2036.js'));
const report={startedAt:new Date().toISOString(),status:'PENDING',productionWrites:0,viewports:[],sourceHashes:Object.fromEntries(['admin/workshop-admin-v1668.js','js/streamer-lounge-v2036.js'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]))};
let snapshot,writes;
const reset=()=>{
  writes=[];
  const recipe={id:80,code:'QA_MATERIAL',category:'MATERIAL_CRAFT',name:'재료 제작 검수',description:'격리된 CMS 검수',output_type:'INVENTORY_ITEM',output_ref:'EMPEROR_ENERGY',output_quantity:1,payment_mode:'BOTH',coin_cost:200000000,master_star_cost:1000000,success_rate:100,is_active:0,is_public:0,owner_test_only:1,materials:[{item_code:'QA_MATERIAL',quantity:1}]};
  snapshot={recipes:[recipe,{...recipe,id:81,code:'WORKSHOP_MYSTIC_ENERGY',name:'미스틱 에너지 제작',master_star_cost:0}],vehicles:[{id:1,name:'검수 차량'}],equipment:[{id:1,name:'검수 장비'}],inventoryItems:[{code:'QA_MATERIAL',name:'검수 재료'},{code:'EMPEROR_ENERGY',name:'엠퍼러 에너지'}],recentLogs:[]};
};
reset();
const html=fs.readFileSync(path.join(root,'admin/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script src="/admin/workshop-admin-v1668.js"></script></body>');
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  try {
    if(url.pathname==='/api/admin/workshop'){
      if(req.method==='POST'){
        let text='';for await(const chunk of req)text+=chunk;
        const body=JSON.parse(text);assert.equal(body.action,'SAVE_RECIPE');writes.push(body);
        const draft=body.recipe,id=draft.id||82;
        const row={...draft,id,output_type:draft.outputType,output_ref:draft.outputRef,output_quantity:draft.outputQuantity,payment_mode:draft.paymentMode,coin_cost:draft.coinCost,master_star_cost:draft.masterStarCost,success_rate:draft.successRate,is_active:draft.isActive?1:0,is_public:draft.isPublic?1:0,owner_test_only:draft.ownerTestOnly?1:0,materials:draft.materials.map(item=>({...item,item_code:item.itemCode}))};
        snapshot.recipes=[row,...snapshot.recipes.filter(item=>item.id!==id)];
        res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,recipeId:id,snapshot}));return;
      }
      res.setHeader('content-type','application/json');res.end(JSON.stringify(snapshot));return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    if(url.pathname==='/admin/index.html'){res.setHeader('content-type','text/html; charset=utf-8');res.end(html);return;}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(path.resolve(root)+path.sep)||url.pathname.includes('node_modules')){res.writeHead(403);res.end();return;}
    if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    const type={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
    res.setHeader('content-type',type);res.end(fs.readFileSync(file));
  } catch(error){res.writeHead(500);res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const local='http://127.0.0.1:'+server.address().port;
let browser;
try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const [width,height] of [[1440,1000],[390,844]]){
    reset();const result={width,height,errors:[],checks:{}};report.viewports.push(result);
    const context=await browser.newContext({viewport:{width,height},isMobile:width<760,hasTouch:width<760,serviceWorkers:'block'});
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(!['GET','HEAD'].includes(request.method())&&url.origin!==local){report.productionWrites++;await route.abort();return;}
      if(url.origin===origin&&url.pathname==='/js/streamer-lounge-v2036.js'){await route.fulfill({contentType:'text/javascript',body:lounge});return;}
      await route.continue();
    });
    const page=await context.newPage();page.setDefaultTimeout(12000);
    page.on('pageerror',error=>result.errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.goto(local+'/admin/index.html',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.getElementById('login').style.display='none';const cms=document.getElementById('cms');cms.hidden=false;cms.style.display='block';if(innerWidth<900)document.querySelector('.layout>aside').style.display='none';document.querySelector('button[data-view="workshop"]').click();});
    const stars=page.locator('#workshopRecipeStarV1668'),category=page.locator('#workshopRecipeCategoryV1668');
    await stars.waitFor({state:'attached'});assert.equal(await stars.getAttribute('max'),'100000000');
    await stars.fill('100000001');assert.equal(await stars.evaluate(input=>input.validity.rangeOverflow),true);
    await stars.fill('100000000');assert.equal(await stars.evaluate(input=>input.checkValidity()),true);
    await category.selectOption('VEHICLE');assert.equal(await stars.getAttribute('max'),'1000000');assert.equal(await stars.inputValue(),'100000000');
    await category.selectOption('MATERIAL_CRAFT');assert.equal(await stars.getAttribute('max'),'100000000');
    await page.locator('#workshopRecipeSaveV1668').click();
    await page.waitForFunction(()=>document.querySelector('#workshopRecipeSaveV1668')?.disabled===false);
    assert.equal(writes.at(-1).recipe.masterStarCost,100000000);
    await page.locator('#workshopAdminReloadV1668').click();
    await page.waitForFunction(()=>document.querySelector('#workshopRecipeStarV1668')?.value==='100000000');
    assert.equal(await stars.getAttribute('max'),'100000000');
    await stars.locator('..').screenshot({path:path.join(out,`${width}x${height}-star-cost.png`)});
    result.checks.materialCapSaveReloadAndCategoryChange=true;
    await page.locator('#workshopAdminItemDraft').click();assert.equal(await stars.getAttribute('max'),'20000000');
    await page.locator('#workshopAdminCoreDraft').click();assert.equal(await stars.getAttribute('max'),'1000000');
    await page.locator('[data-workshop-recipe-id="81"]').click();assert.equal(await stars.evaluate(input=>input.readOnly),true);assert.equal(await stars.inputValue(),'0');
    result.checks.otherCategoryAndCanonicalLimitsPreserved=true;result.isolatedCmsWrites=writes.length;
    await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.StreamerLounge?.open==='function');
    const roster=await (await context.request.get(origin+'/api/streamer-profiles')).json();
    await page.evaluate(()=>window.StreamerLounge.open());
    await page.waitForFunction(()=>document.querySelectorAll('.sl40-card').length>0);
    const ids=await page.locator('[data-sl40-cnine-logo]').evaluateAll(nodes=>nodes.map(node=>node.closest('[data-profile-id]').dataset.profileId).sort());
    assert.deepEqual(ids,['mew030709','zalalz']);
    assert.deepEqual(await page.locator('.sl40-card').evaluateAll(nodes=>nodes.map(node=>node.dataset.profileId)),roster.profiles.map(row=>row.id));
    result.checks.onlyJoeunAndNamsudaengKeepMarks=true;result.checks.loungeOrderPreserved=true;
    assert.deepEqual(result.errors,[]);await context.close();
  }
  assert.equal(report.productionWrites,0);report.status='PASSED';
}catch(error){report.status='FAILED';report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'browser-qa.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));

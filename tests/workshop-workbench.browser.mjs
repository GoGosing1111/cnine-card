// Actual game shell and lazy-loaded production workshop, isolated local API only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.WORKSHOP_QA_ORIGIN||'http://127.0.0.1:8913';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Only the local isolated account server is allowed');
const out=process.env.WORKSHOP_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'workshop-workbench-'));
fs.mkdirSync(out,{recursive:true});
const item=(code,name,image,quantity)=>({code,name,image_url:image,quantity,rarity:'SPECIAL',category:'MATERIAL'});
const inventory=Object.fromEntries([
  item('SUIT_CORE_1','슈트 코어 1','assets/items/suit-core-1-v2004.png',100),
  item('SUIT_CORE_2','슈트 코어 2','assets/items/suit-core-2-v2004.png',0),
  item('MASTER_STAR','마스터의 별','assets/items/suit-core-1-v2004.png',100000),
  item('STARLIGHT_ARMOR_CORE','미스틱 에너지','assets/items/starlight-armor-core-v1749.png',50),
  ...['TIRE','FRAME','ENGINE'].map(code=>item('VEHICLE_PART_'+code,({TIRE:'타이어',FRAME:'프레임',ENGINE:'엔진'})[code],'assets/ui/workshop/vehicle-part-'+code.toLowerCase()+'-v1668.png',500)),
].map(row=>[row.code,row]));
const equipmentImage='assets/ui/project-v/account-battle-suits/weapons/gilded-dragon-ar-v1.png';
function fixture(){return {wallet:{coin:12345678901,cardShards:15000000,masterStars:100000},inventory:structuredClone(inventory),recipes:[
  ...Array.from({length:24},(_,i)=>({id:i+1,name:'솔라리스 오메가 '+(i+1),category:'VEHICLE',output_type:'VEHICLE',output_name:'솔라리스 오메가 '+(i+1),output_image:'assets/tire/solaris-omega-v1.png',output_rarity:'MYTHIC',output_pve:100000,success_rate:30,payment_mode:'COIN_OR_MASTER_STAR',coin_cost:5000000000,master_star_cost:1000,materials:[{item_code:'VEHICLE_PART_TIRE',item_name:'타이어',image_url:inventory.VEHICLE_PART_TIRE.image_url,quantity:10}],owned:i===2})),
  {id:80,name:'미스틱 에너지 제작',code:'WORKSHOP_MYSTIC_ENERGY',category:'MATERIAL_CRAFT',output_type:'INVENTORY_ITEM',output_ref:'STARLIGHT_ARMOR_CORE',output_name:'미스틱 에너지',output_image:inventory.STARLIGHT_ARMOR_CORE.image_url,output_quantity:1,success_rate:10,payment_mode:'COIN_AND_CARD_SHARD',coin_cost:200000000,card_shard_cost:5000000,master_star_cost:0,materials:[],description:'코인과 카드 조각을 사용해 미스틱 에너지를 제작합니다.'},
  {id:81,name:'H-BODY 제작',category:'BATTLE_SUIT_CRAFT',output_type:'EQUIPMENT',output_name:'H-BODY',output_image:'assets/ui/project-v/account-battle-suits/suits/h-body-v2066.png',output_quantity:1,success_rate:15,payment_mode:'BOTH',coin_cost:5000000000,master_star_cost:1000,materials:[{item_code:'SUIT_CORE_1',item_name:'슈트 코어 1',image_url:inventory.SUIT_CORE_1.image_url,quantity:1}],description:'전용 코어와 재화로 배틀슈트를 제작합니다.'}
],synthesis:Array.from({length:45},(_,i)=>({recipe_id:i+1,name:'금룡 돌격소총 '+(i+1),output_name:'인피니티 AK '+(i+1),image_url:equipmentImage,output_image:'assets/ui/project-v/account-battle-suits/weapons/infinity-ak-v1.png',rarity:'MYTHIC',output_rarity:'MYTHIC',quantity:i%3?30:0,input_quantity:3,success_rate:25,output_pve_power:250000,output_pvp_power:15000,material_code:'STARLIGHT_ARMOR_CORE',material_name:'미스틱 에너지',material_quantity:5,material_owned:50,material_active:1,material_image:inventory.STARLIGHT_ARMOR_CORE.image_url}))};}
const extension=()=>({id:90,name:'슈트 코어 2 합성',category:'SUIT_CORE_SYNTHESIS',output_type:'INVENTORY_ITEM',output_ref:'SUIT_CORE_2',output_name:'슈트 코어 2',output_image:inventory.SUIT_CORE_2.image_url,output_quantity:1,success_rate:25,payment_mode:'BOTH',coin_cost:1000000000,master_star_cost:100,materials:[{item_code:'SUIT_CORE_1',item_name:'슈트 코어 1',image_url:inventory.SUIT_CORE_1.image_url,quantity:10}],description:'격리된 UI 검수 레시피. 운영에는 저장하지 않습니다.'});
const browser=await chromium.launch({channel:'chrome',headless:true});
const checks=[],errors=[];
function check(ok,label){assert.ok(ok,label);checks.push(label);}
try{
 for(const [width,height] of [[1440,1000],[1366,768],[1024,768],[820,900],[390,844],[320,740]]){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'}),size=width+'x'+height;
  const state=fixture(),writes=[],dialogs=[];let failRead=false,uncertain=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  await page.addInitScript(()=>localStorage.setItem('cnine_card_api_token','local-account-7'));
  await page.route('**/api/workshop**',async r=>{
   if(r.request().method()==='GET')return r.fulfill(failRead?{status:503,json:{error:'제작소 검수 연결 오류'}}:{json:state});
   const body=r.request().postDataJSON();writes.push(body);
   if(uncertain){uncertain=false;return r.abort('failed');}
   const recipe=state.recipes.find(row=>row.id===body.recipeId);
   assert.ok(recipe);return r.fulfill({json:{ok:true,success:true,recipeId:recipe.id,recipeName:recipe.name,output:{name:recipe.output_name,image:recipe.output_image,quantity:1},state}});
  });
  await page.goto(base+'/?screen=fusion',{waitUntil:'domcontentloaded'});
  await page.locator('#workshopRootV1881 .ws81-nav').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const root=page.locator('#workshopRootV1881');
  for(const category of ['SYNTHESIS','VEHICLE','MATERIAL_CRAFT','BATTLE_SUIT_CRAFT','SUIT_CORE_SYNTHESIS','ITEM_SYNTHESIS']){
   await root.locator('[data-ws-section="'+category+'"]').click();
   check(await root.locator('[data-ws-section="'+category+'"]').getAttribute('aria-pressed')==='true',size+' selected '+category);
   await page.waitForTimeout(80);
   const bounds=await root.evaluate(e=>({overflow:e.scrollWidth-e.clientWidth,route:e.closest('.v21-route-body')?.scrollWidth-e.closest('.v21-route-body')?.clientWidth,broken:[...e.querySelectorAll('img')].filter(img=>img.complete&&!img.naturalWidth).map(img=>img.src)}));
   check(bounds.overflow<=1,size+' '+category+' no content overflow');
   check(!bounds.broken.length,size+' '+category+' no broken loaded images '+bounds.broken.join(','));
   await page.screenshot({path:path.join(out,size+'-'+category+'.png')});
   const action=root.locator('#wsSynthStart,#wsVehicleCraft,#wsMaterialCraft,#wsBattleSuitCraft').first();
   if(await action.count()){
    await action.scrollIntoViewIfNeeded();
    check(await action.evaluate(e=>{const r=e.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e===top||e.contains(top);}),size+' '+category+' action reachable and unobscured');
    await page.screenshot({path:path.join(out,size+'-'+category+'-action.png')});
   }
   await root.evaluate(e=>{for(let n=e;n;n=n.parentElement){if(n.scrollHeight>n.clientHeight)n.scrollTop=0;}});
  }
  check(await page.locator('soop-adventure-lobby').count()===1,size+' shared navigation retained');
  check(writes.length===0,size+' browsing and extension placeholders never spend');
  await root.locator('[data-ws-section="VEHICLE"]').click();
  await root.locator('#wsRecipeSearch').fill('오메가 12');
  check(await root.locator('[data-recipe]').count()===1,size+' recipe search');
  check(await root.locator('#wsRecipeSearch').evaluate(e=>e===document.activeElement),size+' typing retains focus');
  await root.locator('#wsRecipeSearch').fill('없는 결과');check(await root.locator('.ws22-empty').isVisible(),size+' search empty state');
  await root.locator('[data-ws-reset]').click();
  const list=root.locator('.ws76-blueprints');
  await list.evaluate(e=>{e.scrollTop=220;});const scroll=await list.evaluate(e=>e.scrollTop);
  const visibleRecipe=await list.locator('button').evaluateAll(nodes=>nodes.find(n=>{const r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom;})?.dataset.recipe);
  await root.locator('[data-recipe="'+visibleRecipe+'"]').click();
  check(Math.abs(await list.evaluate(e=>e.scrollTop)-scroll)<2,size+' recipe selection retains inner scroll');
  await root.locator('[data-ws-ready]').click();check(await root.locator('[data-recipe="3"]').count()===0,size+' ready filter excludes already owned vehicle');
  await root.locator('[data-ws-section="SUIT_CORE_SYNTHESIS"]').click();check((await root.innerText()).includes('확률 설정 예정'),size+' core example has no invented probability');
  state.recipes.push(extension());await root.locator('[data-ws-refresh]').click();await root.locator('#wsMaterialCraft').waitFor();
  check(await root.locator('.ws22-cost').count()===3,size+' core + coin + master star requirements');
  check((await root.locator('.ws22-cost').first().innerText()).includes('10'),size+' 10 core input');
  if(width===1440){
   uncertain=true;await root.locator('#wsMaterialCraft').click();await page.waitForFunction(()=>!document.querySelector('#workshopRootV1881')?.getAttribute('aria-busy')||document.querySelector('#workshopRootV1881').getAttribute('aria-busy')==='false');
   await root.locator('#wsMaterialCraft').filter({hasText:'이전 제작 결과 확인'}).waitFor();
   await root.locator('#wsMaterialCraft').click();await page.locator('.ws81-material-result').waitFor();
   check(writes.length===2&&writes[0].requestId===writes[1].requestId,'transport failure reuses the same request id');
   check(writes[1].paymentType==='BOTH'&&writes[1].recipeId===90,'core synthesis posts correct recipe and combined payment');
   await page.locator('.ws81-material-result button').click();
   check(dialogs.some(x=>x.includes('슈트 코어 1 10')&&x.includes('마스터의 별 100')),'confirmation names all resources');
   failRead=true;await root.locator('[data-ws-refresh]').click();await root.locator('.ws76-error').waitFor();failRead=false;await root.locator('.ws76-error button').click();await root.locator('.ws81-nav').waitFor();
   check(true,'read failure has working retry');
  }
  await page.close();
 }
 // Exercise the actual CMS source without an operational admin login or write.
 const admin=await browser.newPage({viewport:{width:1280,height:900},serviceWorkers:'block'}),saved=[];
 admin.on('dialog',d=>d.accept());admin.on('pageerror',e=>errors.push(e.message));
 const snapshot={recipes:[],vehicles:[],equipment:[],inventoryItems:Object.values(inventory),recentLogs:[]};
 await admin.route('**/__qa/workshop-admin',r=>r.fulfill({contentType:'text/html',body:'<html><body><h1 id="pageTitle"></h1><nav id="nav"><button data-view="equipment"></button></nav><main id="cms"></main></body></html>'}));
 await admin.route('**/api/admin/workshop',r=>{if(r.request().method()==='POST'){const body=r.request().postDataJSON();saved.push(body);return r.fulfill({json:{recipeId:90,snapshot}});}return r.fulfill({json:snapshot});});
 await admin.goto(base+'/__qa/workshop-admin');
 await admin.addScriptTag({content:fs.readFileSync(new URL('../admin/workshop-admin-v1668.js',import.meta.url),'utf8')});
 await admin.locator('#nav [data-view="workshop"]').click();await admin.locator('#workshopAdminCoreDraft').click();
 for(const id of ['workshopRecipeCoinV1668','workshopRecipeStarV1668','workshopRecipeRateV1668'])check(await admin.locator('#'+id).inputValue()==='',id+' draft stays unspecified');
 check(!await admin.locator('#workshopRecipeActiveV1668').isChecked()&&!await admin.locator('#workshopRecipePublicV1668').isChecked(),'CMS new synthesis starts OFF and hidden');
 await admin.locator('#workshopRecipeSaveV1668').click();check(saved.length===0,'blank policy never reaches save API');
 await admin.locator('#workshopRecipeCoinV1668').fill('5000000000');await admin.locator('#workshopRecipeStarV1668').fill('100');await admin.locator('#workshopRecipeRateV1668').fill('25');
 await admin.locator('#workshopRecipeSaveV1668').click();
 check(saved.length===1&&saved[0].recipe.materials[0].itemCode==='SUIT_CORE_1'&&saved[0].recipe.materials[0].quantity===10,'CMS preserves example inputs');
 check(saved[0].recipe.outputRef==='SUIT_CORE_2'&&saved[0].recipe.paymentMode==='BOTH'&&!saved[0].recipe.isActive&&!saved[0].recipe.isPublic,'CMS retains selected output, combined cost and release flags');
 check(!errors.length,'zero browser errors: '+errors.join('; '));
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors},null,2));
 console.log(JSON.stringify({passed:checks.length,out},null,2));
}finally{await browser.close();}

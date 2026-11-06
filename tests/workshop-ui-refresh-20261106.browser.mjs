// Render actual workshop modules against isolated recipes. No live account writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=process.cwd(),out=path.resolve(process.env.WORKSHOP_QA_DIR||'.impeccable/review'),baseline=process.env.WORKSHOP_BASELINE==='1',publicOrigin=process.env.WORKSHOP_PUBLIC_ORIGIN;
const shellOrigin=process.env.WORKSHOP_SHELL_ORIGIN;
if(shellOrigin)assert.equal(new URL(shellOrigin).hostname,'127.0.0.1','Shell integration uses only the isolated account server');
fs.mkdirSync(out,{recursive:true});
// Reuse the long-list fixture already covering production workshop behavior.
const prior=fs.readFileSync('tests/workshop-workbench.browser.mjs','utf8');
const {fixture,extension}=Function(prior.slice(prior.indexOf('const item='),prior.indexOf('const browser='))+'return {fixture,extension}')();
const state=fixture();state.wallet.coin=100000000000000000;state.recipes.push(extension());
state.inventory.SUIT_CORE_7={code:'SUIT_CORE_7',name:'슈트 코어 7',quantity:9,image_url:'assets/items/suit-core-7-v2004.png'};
const suit=state.recipes.find(r=>r.category==='BATTLE_SUIT_CRAFT');
state.recipes.push({...suit,id:570,name:'X-BODY 제작',output_name:'X-BODY',output_image:'assets/ui/project-v/account-battle-suits/suits/x-body-v1.png',success_rate:10,payment_mode:'COIN_ONLY',coin_cost:25000000000000,master_star_cost:0,materials:[{item_code:'SUIT_CORE_7',item_name:'슈트 코어 7',quantity:10,image_url:state.inventory.SUIT_CORE_7.image_url}]});
state.equipmentCraft={instances:[{id:'qa-10',equipmentId:101,level:10}],pity:{91:{failures:3,pityAfter:10,guaranteed:false}}};
state.recipes.push({id:91,name:'인피니티 AK 제작',category:'ITEM_SYNTHESIS',output_type:'EQUIPMENT',output_name:'인피니티 AK',output_image:'assets/ui/project-v/account-battle-suits/weapons/infinity-ak-v1.png',success_rate:10,payment_mode:'COIN_ONLY',coin_cost:1000000000000,materials:[{item_code:'STARLIGHT_ARMOR_CORE',item_name:'미스틱 에너지',quantity:5}],equipmentCraft:{inputEquipmentId:101,inputName:'금룡 돌격소총',inputImage:'assets/ui/project-v/account-battle-suits/weapons/gilded-dragon-ar-v1.png',requiredLevel:10,pityAfter:10,failureInputPolicy:'CONSUME',failureRepairable:true}});
state.inventory.MERCENARY_SSS_LIMITED_SHARD={code:'MERCENARY_SSS_LIMITED_SHARD',name:'SSS 리미티드 조각',quantity:12,image_url:'assets/items/mercenary-sss-limited-shard-v1.png'};
for(const [id,name,code,image] of [[92,'카이론','WORKSHOP_KAIRON','assets/ui/project-v/mercenaries/kairon-20261014/source-art.png'],[93,'족로','WORKSHOP_JOKRO','assets/ui/project-v/mercenaries/jokro-20261024/source-art.png']])state.recipes.push({id,name,code,output_name:name,category:'MERCENARY_CRAFT',output_type:'MERCENARY',output_image:image,output_pve:1347840,output_rarity:'SSS',success_rate:10,payment_mode:'BOTH',coin_cost:1e12,master_star_cost:1000,is_active:1,craftScope:'SSS_LIMITED_SHARD',craftStock:{remaining:id===92?2:0,limit:5,crafted:id===92?3:5,soldOut:id!==92},craftLocked:id!==92,lockReason:id!==92?'한정 수량 소진':'',materials:[{item_code:'MERCENARY_SSS_LIMITED_SHARD',item_name:'SSS 리미티드 조각',quantity:15}]});
// Resolve fixture resource paths from the committed catalog, not invented substitutes.
const files=execFileSync('git',['ls-files','assets'],{encoding:'utf8',maxBuffer:20e6}).split(/\r?\n/);
for(const [target,pattern] of [[state.inventory.SUIT_CORE_7,/suit-core-7.*\.(png|webp)$/],[state.inventory.MERCENARY_SSS_LIMITED_SHARD,/sss-limited.*shard.*\.(png|webp)$/]])target.image_url=files.find(f=>pattern.test(f))||target.image_url;
state.recipes.find(r=>r.id===570).materials[0].image_url=state.inventory.SUIT_CORE_7.image_url;
state.recipes.find(r=>r.id===570).output_image=files.find(f=>/suits\/x-body.*\.png$/.test(f))||files.find(f=>/x-body.*\.png$/.test(f));
state.recipes.find(r=>r.id===93).output_image=files.find(f=>/jokro.*source-art\.png$/.test(f))||state.recipes.find(r=>r.id===92).output_image;
const styles=['workshop-v1676','workshop-v1881','workshop-workbench-v1','command-ui-v1','mercenary-shard-craft-v1','mercenary-craft-reveal-v1','equipment-craft-reveal-v1'];
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(n=>`<link rel="stylesheet" href="/css/${n}.css">`).join('')}<style>*{box-sizing:border-box}body{margin:0;background:#08111c;color:#eaf4ff;font-family:'Malgun Gothic',sans-serif}#view{max-width:1440px;margin:auto}.modal{display:none}.modal.show{display:flex;position:fixed;inset:0;z-index:999;background:#000b;align-items:center;justify-content:center;overflow:auto}button,input,select{font-family:inherit}</style><main id="view"></main><div id="modal" class="modal"></div><script>localStorage.setItem('cnine_card_api_token','isolated-workshop-ui');localStorage.setItem('cnine_battle_sound','OFF');window.loadUser=()=>({id:7});window.apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json'}});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error),{status:r.status});return d};</script><script src="/js/workshop-thumbnails-v1.js"></script><script src="/js/workshop-recipes-v1.js"></script><script src="/js/workshop-v1881.js"></script><script>document.getElementById('view').innerHTML=workshopView(loadUser());bindWorkshopView();</script></html>`;
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml'},cache=new Map();let writes=[],fail=false;
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),key=decodeURIComponent(url.pathname);
 if(key==='/test')return res.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(html);
 if(key==='/api/workshop')return res.writeHead(fail?503:200,{'content-type':'application/json'}).end(JSON.stringify(fail?{error:'격리 검수 연결 오류'}:state));
 if(key.startsWith('/api/')){writes.push(key);return res.writeHead(403).end('{}');}
 if(key==='/favicon.ico')return res.writeHead(204).end();
 const relative=key.slice(1),file=path.resolve(root,relative);assert.ok(file.startsWith(root+path.sep));
 let data;if(publicOrigin){if(!cache.has(key)){const r=await fetch(publicOrigin+url.pathname);assert.equal(r.status,200,key);cache.set(key,Buffer.from(await r.arrayBuffer()));}data=cache.get(key);}else if(fs.existsSync(file))data=fs.readFileSync(file);else {if(!cache.has(key))cache.set(key,execFileSync('git',['show','HEAD:'+relative],{maxBuffer:25e6,windowsHide:true}));data=cache.get(key);}
 res.writeHead(200,{'content-type':mime[path.extname(key)]||'application/octet-stream'}).end(data);
 }catch(e){res.writeHead(404).end(String(e.message).slice(0,100));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,results=[];
try{for(const [engine,width] of (baseline?[[chromium,1440],[chromium,390]]:publicOrigin?[[webkit,390]]:shellOrigin?[[webkit,390],[chromium,320]]:[[chromium,1440],[webkit,390],[chromium,320]])){
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'chrome',args:['--mute-audio']}:{} )});
 try{const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(shellOrigin){
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
  await page.route('**/api/workshop**',route=>route.request().method()==='GET'?route.fulfill({json:state}):route.fulfill({status:403,json:{error:'No mutation in this UI tour'}}));
  await page.route('**/api/packs',route=>route.fulfill({json:{packs:[]}}));await page.route('**/api/sync/**',route=>route.fulfill({status:403,json:{error:'Isolated UI fixture'}}));
  await page.route('**/assets/**',async route=>{const pathname=decodeURIComponent(new URL(route.request().url()).pathname),file=path.join(process.env.WORKSHOP_ASSET_ROOT||root,pathname);try{if(!fs.existsSync(file)){const response=await route.fetch({url:'https://cnine-card.pages.dev'+new URL(route.request().url()).pathname});return route.fulfill({response});}return route.fulfill({body:fs.readFileSync(file),contentType:pathname.endsWith('.svg')?'image/svg+xml':pathname.endsWith('.webp')?'image/webp':pathname.endsWith('.png')?'image/png':undefined});}catch{return route.continue();}});
 }
 await page.goto(shellOrigin?shellOrigin+'/?screen=fusion':base+'/test');const rootElement=page.locator('#workshopRootV1881');await rootElement.locator('.ws81-nav').waitFor({state:'attached'});
 const chooseCategory=category=>!baseline&&width<=800?page.locator('#wsCategoryPicker').selectOption(category):rootElement.locator(`[data-ws-section="${category}"]`).click();
 for(const category of ['VEHICLE','SYNTHESIS','MATERIAL_CRAFT','BATTLE_SUIT_CRAFT','SUIT_CORE_SYNTHESIS','ITEM_SYNTHESIS','MERCENARY_CRAFT']){
  await chooseCategory(category);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(120);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(100);await page.evaluate(()=>window.scrollTo(0,0));
  if(!baseline){assert.ok(await rootElement.evaluate(e=>e.scrollWidth<=e.clientWidth+1),width+' '+category+' root overflow');assert.equal(await rootElement.locator(`[data-ws-section="${category}"]`).getAttribute('aria-pressed'),'true');
   if(width<800){assert.ok(await page.locator('#wsRecipePicker').isVisible());assert.ok((await page.locator('#wsRecipePicker').boundingBox()).height>=44);}
   const broken=await rootElement.locator('img').evaluateAll(nodes=>nodes.filter(i=>i.getBoundingClientRect().height>0&&i.complete&&!i.naturalWidth).map(i=>i.src));assert.deepEqual(broken,[],category+' resources');
  }
  await page.screenshot({path:path.join(out,`${width}-${category}.png`),fullPage:true});
  results.push({width,engine:engine.name(),category,bodyHeight:await rootElement.evaluate(e=>Math.round(e.getBoundingClientRect().height))});
 }
 if(!baseline){
  await page.locator('#wsRecipeSearch').fill('없는용병');assert.ok(await page.locator('.ws22-empty').isVisible());assert.equal(await page.locator('#wsMaterialCraft').count(),0);await page.locator('[data-ws-reset]').click();
  await page.locator('[data-ws-ready]').click();assert.ok(await page.locator('.ws22-empty').isVisible());await page.locator('[data-ws-reset]').click();
  await chooseCategory('BATTLE_SUIT_CRAFT');
  if(width<800)await page.locator('#wsRecipePicker').selectOption('570');else await page.locator('[data-suit-recipe="570"]').click();
  if(width<800){assert.equal(await page.locator('#wsSelectedRecipe').evaluate(e=>e===document.activeElement),true);await page.waitForTimeout(180);const position=await page.locator('#wsSelectedRecipe').evaluate(e=>({top:e.getBoundingClientRect().top,remaining:document.documentElement.scrollHeight-innerHeight-scrollY}));if(!shellOrigin)assert.ok(position.top<50||position.remaining<2,JSON.stringify(position));assert.match(await page.locator('.ws26-decision').innerText(),/10%/);assert.match(await page.locator('.ws26-decision').innerText(),/25조/);}
  assert.ok(await page.locator('#wsBattleSuitCraft').isDisabled());assert.match(await page.locator('.ws81-suit-costs').innerText(),/1\s*부족/);assert.match(await page.locator('.ws81-suit-costs').innerText(),/25조/);assert.match(await page.locator('.ws81-header aside').innerText(),/10경/);
  await page.locator('#wsRecipeSearch').fill('없는슈트');assert.ok(await page.locator('.ws22-empty').isVisible());assert.equal(await page.locator('#wsBattleSuitCraft').count(),0);await page.locator('[data-ws-reset]').click();
  await chooseCategory('SUIT_CORE_SYNTHESIS');await page.locator('#wsMaterialAttempts').fill('3');assert.match(await page.locator('.ws22-requirements').innerText(),/3회 제작 총 소모량/);assert.match(await page.locator('.ws22-requirements').innerText(),/30억/);
  assert.match(await page.locator('.ws26-decision').innerText(),/3회 제작 소모량/);assert.match(await page.locator('.ws26-decision').innerText(),/30억/);
  await page.locator('#wsMaterialAttempts').fill('101');assert.ok(await page.locator('#wsMaterialCraft').isDisabled());await page.locator('#wsMaterialAttempts').fill('1');
  await page.locator('#wsRecipeSearch').fill('없는결과');await page.locator('[data-ws-reset]').click();await page.locator('#wsRecipeSearch').fill('코어');assert.equal(await page.locator('#wsRecipeSearch').evaluate(e=>e===document.activeElement),true);
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 }
 }finally{await browser.close();}}
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({baseline,publicOrigin:publicOrigin||null,shellOrigin:shellOrigin||null,productionWrites:0,results},null,2));console.log(JSON.stringify({profiles:results.length,baseline,results}));
}finally{await new Promise(resolve=>server.close(resolve));}

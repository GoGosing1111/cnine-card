import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {SUPPORTER_BLUE_BEAST_TITLES} from '../functions/_supporter_blue_beast_titles.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(process.env.TITLE_QA_OUTPUT||root+'/../../qa-supporter-blue-beast-20261003');
await mkdir(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const titles=SUPPORTER_BLUE_BEAST_TITLES.map((t,i)=>({id:i+1,code:t.code,name:t.name,badgeText:t.name,description:t.description,image:t.image,stylePreset:t.style,unlockType:t.type,unlockConfig:t.config,pvePower:t.power,sortOrder:t.order,isActive:true,isPublic:true}));
const catalog={items:[],titles,profiles:[],slots:[],supplyBoxSettings:{sources:{}},titleUnlockTypes:['MANUAL','CHALLENGER_TOTAL'],titleStylePresets:['SUPPORTER_VIP','BLUE_BEAST']};
const server=createServer(async(req,res)=>{try{
 const path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 if(path==='/title-cms-qa'){
  res.writeHead(200,{'content-type':mime['.html']});res.end(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/equipment-admin-v1247.css"><link rel="stylesheet" href="/admin/equipment-admin-v1278.css"><link rel="stylesheet" href="/css/achievement-titles-20260927.css"><style>body{margin:16px;background:#090e18;color:#e2eaf7;font-family:Arial,sans-serif}main{max-width:1200px;margin:auto}input,select,textarea{max-width:100%;box-sizing:border-box}.field{min-width:0}</style><main id="equipmentAdminRoot"></main><script>window.api=async()=>(${JSON.stringify(catalog)});</script><script src="/admin/equipment-admin-v1278.js"></script><script>window.loadEquipmentAdmin(${JSON.stringify(catalog)});</script></html>`);return;
 }
 const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
 if(!file.startsWith(resolve(root)+sep)||/(^|[/\\])\./.test(path)){res.writeHead(403);res.end();return;}
 const content=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(content);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/preview/supporter-blue-beast-titles-20261003/',{waitUntil:'networkidle'});
  await page.locator('.clv2-title-showcase.is-title-supporter_vip').waitFor();
  for(const [style,description] of [['supporter_vip','운영에 도움을 주신 감사 칭호'],['blue_beast','챌린저 누적 10회 달성']])assert.equal(await page.locator('.clv2-title-card.is-title-'+style+' > small').innerText(),description);
  assert.equal(await page.locator('.clv2-title-card.is-title-supporter_vip > span').first().innerText(),'운영에 도움을 주신');
  assert.equal(await page.evaluate(()=>window.titlePreview.getState().bonuses.pve),75000);
  assert.equal(await page.evaluate(()=>window.titlePreview.getState().bonuses.pvp),75000);
  const invalidImages=await page.locator('img').evaluateAll(images=>images.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));assert.deepEqual(invalidImages,[]);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
  assert.notEqual(await page.locator('.clv2-title-showcase .clv2-title-sigil').evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
  await page.screenshot({path:out+'/'+name+'-supporter.png',fullPage:true});
  if(name==='desktop'&&process.env.TITLE_EXPORT_GIF==='1'){
   const bounds=await page.locator('.clv2-title-showcase .clv2-title-sigil').boundingBox();
   const clip={x:Math.floor(bounds.x-30),y:Math.floor(bounds.y-30),width:Math.ceil(bounds.width+60),height:Math.ceil(bounds.height+60)};
   const frames=[];let dimensions;
   for(let i=0;i<36;i++){
    await page.evaluate(ms=>{for(const a of document.getAnimations()){a.pause();a.currentTime=ms;}},i*150);
    const {data,info}=await sharp(await page.screenshot({clip})).ensureAlpha().raw().toBuffer({resolveWithObject:true});frames.push(data);dimensions=info;
   }
   await sharp(Buffer.concat(frames),{raw:{width:dimensions.width,height:dimensions.height*frames.length,channels:4,pageHeight:dimensions.height}}).gif({loop:0,delay:Array(frames.length).fill(150),colours:256,effort:5}).toFile(out+'/supporter-vip-effects.gif');
   await page.evaluate(()=>{for(const a of document.getAnimations())a.play();});
  }
  await page.locator('[data-title-equip="2"]').click();await page.locator('.clv2-title-showcase.is-title-blue_beast').waitFor();
  assert.equal(await page.evaluate(()=>window.titlePreview.getState().bonuses.pve),70000);assert.equal(await page.evaluate(()=>window.titlePreview.getState().bonuses.pvp),70000);
  await page.screenshot({path:out+'/'+name+'-blue-beast.png',fullPage:true});
  await page.locator('[data-title-unequip]').click();await page.waitForFunction(()=>window.titlePreview.getState().bonuses.pve===0);
  await page.goto(base+'/preview/supporter-blue-beast-titles-20261003/?locked=1',{waitUntil:'networkidle'});
  assert.equal(await page.locator('[data-title-equip]').count(),0);assert.equal(await page.locator('[role="progressbar"]').getAttribute('aria-valuenow'),'9');
  assert.match(await page.locator('.clv2-title-card.is-title-blue_beast').innerText(),/9 \/ 10회/);
  for(const [style,description] of [['supporter_vip','운영에 도움을 주신 감사 칭호'],['blue_beast','챌린저 누적 10회 달성']])assert.equal(await page.locator('.clv2-title-card.is-title-'+style+' > small').innerText(),description);
  assert.doesNotMatch(await page.locator('.clv2-title-grid').innerText(),/운영 지급|운영을 빛낸 마음|열 번의 챌린저/);
  await page.screenshot({path:out+'/'+name+'-locked.png',fullPage:true});
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.preview-names .title-style-supporter_vip').evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
  await page.goto(base+'/title-cms-qa',{waitUntil:'networkidle'});
  await page.locator('[data-eq-tab="titles"]').click();await page.locator('[data-eq-title-edit="2"]').click();
  assert.equal(await page.locator('#eqTitlePower').inputValue(),'70000');assert.equal(await page.locator('#eqTitleUnlock').inputValue(),'CHALLENGER_TOTAL');
  assert.equal(await page.locator('#eqTitleStylePreset').inputValue(),'BLUE_BEAST');
  assert.equal(JSON.parse(await page.locator('#eqTitleConfig').inputValue()).count,10);
  await page.screenshot({path:out+'/'+name+'-cms.png',fullPage:true});
  assert.deepEqual(errors,[]);results.push({viewport:name,powers:[75000,70000],pveAndPvp:true,lockAndProgress:true,animationAndReducedMotion:true,brokenImages:invalidImages,overflow,errors});await context.close();
 }
 await writeFile(out+'/qa.json',JSON.stringify({dateKst:'2026-10-03',results},null,2));console.log(JSON.stringify({out,results}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

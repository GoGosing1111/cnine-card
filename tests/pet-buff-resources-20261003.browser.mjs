import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {petEquipmentFixture} from './helpers/pet-equipment-fixture.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {emptyPetCmsDocument,emptyPetDraft} from '../shared/pet-cms-v1.mjs';
import {PET_BUFF_VISUALS} from '../shared/pet-buff-visuals-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.QA_OUTPUT_DIR;
if(!out||path.resolve(out).startsWith(path.resolve(root)))throw Error('QA output must be outside the deployment repository');
await mkdir(out,{recursive:true});
const fixture=await petEquipmentFixture();
await fixture.cmsCall({document:{...emptyPetCmsDocument(),pets:PET_ART_CATALOG.map(art=>({...emptyPetDraft(art.code),name:art.name,sourceArt:art.sourceArt}))},expectedRevision:0,requestId:'pet-buff-browser-20261003'});
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/api/')){
   if(['/api/shell/summary','/api/events/golden-axe/feature'].includes(url.pathname)){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({visible:false,avatarFeature:{visible:false},alchemyFeature:{visible:false}}));return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const response=await fixture.handle(new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})}),{path:url.pathname.slice(5)});
   res.writeHead(response?.status||404,response?Object.fromEntries(response.headers):{});res.end(response?await response.text():'');return;
  }
  let route=decodeURIComponent(url.pathname);if(route.endsWith('/'))route+='index.html';
  const file=path.resolve(root,'.'+route);if(!file.startsWith(root)||!/^\/(?:admin|shared|pets|css|js|preview|assets)\//.test(route)){res.writeHead(404);res.end();return;}
  const bytes=await readFile(file);res.writeHead(200,{'content-type':({'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html;charset=utf-8','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],results=[];
const fits=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport});
  await context.addInitScript(()=>localStorage.setItem('cnine_admin_token','qa-owner'));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/preview/pet-buffs-v1/?type=invalid');
  await page.locator('.pet-buff-effect[data-state="complete"]').waitFor();
  assert.equal(await page.locator('[data-effect][aria-pressed="true"]').getAttribute('data-effect'),'ATTACK_PERCENT');
  for(const v of Object.values(PET_BUFF_VISUALS)){
   await page.locator('button[data-effect="'+v.type+'"]').click();
   await page.locator('.pet-buff-effect[data-state="complete"]').waitFor();
   assert.equal(await page.locator('#effect-name').textContent(),v.label);
   assert.equal(await page.locator('#frames figure').count(),8);
   await page.locator('#selected-icon').evaluate(image=>image.decode());
   assert.equal(await page.locator('#effect-stage canvas').count(),1);
   assert.ok(await fits(page),label+' horizontal overflow');
  }
  await page.locator('button[data-effect="ATTACK_PERCENT"]').click();
  await page.locator('.pet-buff-effect[data-state="complete"]').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(out,label+'-buffs.png'),fullPage:true});
  await page.locator('#loop').click();
  await page.locator('.pet-buff-effect[data-state="playing"]').waitFor();
  assert.equal(await page.locator('#loop').getAttribute('aria-pressed'),'true');
  await page.locator('button[data-effect="START_SHIELD_PERCENT"]').click();
  assert.equal(await page.locator('#effect-stage canvas').count(),1);
  await page.locator('#loop').click();
  await page.locator('.pet-buff-effect[data-state="complete"]').waitFor();
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#play').click();
  await page.locator('.pet-buff-effect[data-state="reduced"]').waitFor();
  assert.match(await page.locator('#stage-caption').textContent(),/모션 축소/);
  await page.goto(base+'/pets/?review=1');
  await page.locator('[data-pet-select]').first().waitFor();
  assert.equal(await page.locator('[data-pet-select]').count(),5);
  for(const art of PET_ART_CATALOG){
   await page.locator('[data-pet-select="'+art.code+'"]').click();await page.locator('.pe-hero').evaluate(image=>image.decode());
   assert.equal(await page.locator('.pe-hero').getAttribute('src'),'/'+art.sourceArt);
   await page.locator('.pe-buff-label .pet-buff-icon').evaluate(image=>image.decode());
   assert.match(await page.locator('.pe-buff-list').textContent(),/미정/);
  }
  await page.locator('[data-pet-select="PET-BONGSOON"]').click();await page.locator('.pe-hero').evaluate(image=>image.decode());
  await page.screenshot({path:path.join(out,label+'-pets.png'),fullPage:true});assert.ok(await fits(page));
  await page.goto(base+'/preview/companion-preparation-v2/');
  await page.locator('[data-status]').filter({hasText:/CMS 버전/}).waitFor();
  assert.equal(await page.locator('[data-pet-list] option').count(),6);
  await page.locator('.cp-buff-label .pet-buff-icon').evaluate(image=>image.decode());
  assert.equal(await page.locator('.cp-buff-resource-link').getAttribute('href'),'/preview/pet-buffs-v1/');
  assert.ok(await fits(page));await page.screenshot({path:path.join(out,label+'-cms.png'),fullPage:true});
  results.push({label,viewport,effects:5,pets:5,overflow:false,reducedMotion:true});
  await context.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(path.join(out,'result.json'),JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({results,errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fixture.close();}

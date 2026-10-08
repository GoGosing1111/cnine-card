import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {MERCENARY_CMS_SEED as seed} from '../../functions/_mercenary_cms_seed.js';
import {mercenaryCodexDocument} from '../../functions/_mercenary_codex.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=fileURLToPath(new URL('qa/registration/',import.meta.url));
await fs.mkdir(out,{recursive:true});
const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1,updated_at:'2026-10-09'});
const account={accountId:1,available:true,coin:'0',cards:[],leveling:{enabled:true},loadout:{mercenaryCode:null,revision:0}};
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify(pathname==='/api/mercenary-codex'?catalog:pathname==='/api/mercenaries/v3/state'?account:{}));}
  const file=path.resolve(root,'.'+decodeURIComponent(pathname)+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403);return res.end();}
  const data=await fs.readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),report=[];
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,reducedMotion:'reduce'}),errors=[],failures=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1')&&r.status()>=400)failures.push({url:r.url(),status:r.status()});});
  await page.goto(`http://127.0.0.1:${server.address().port}/mercenary-codex/?view=limited&rank=SSS#V-999`,{waitUntil:'networkidle'});
  await page.locator('.stage-heading h2').waitFor();assert.equal(await page.locator('.stage-heading h2').textContent(),'헬리오스');
  assert.equal(await page.locator('#cardGrid [data-code]').count(),2);assert.equal(await page.locator('#limitedCount').textContent(),'9');
  assert.equal(await page.locator('.stage-heading p').count(),0);assert.equal(await page.locator('[data-code="V-999"] .row-identity em').count(),0);
  assert.equal(await page.locator('[data-equip="V-999"]').count(),0);
  const images=await page.locator('#portraitDisplay img').evaluateAll(async els=>{await Promise.all(els.map(e=>e.decode()));return els.map(e=>({src:e.getAttribute('src'),width:e.naturalWidth,height:e.naturalHeight}));});
  assert.equal(images[0].width,1024);assert.equal(images[0].height,1536);
  await page.locator('#inspection').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,name+'-art.png')});
  await page.locator('#sdTab').click();await page.locator('#portraitDisplay img').evaluate(e=>e.decode());
  await page.screenshot({path:path.join(out,name+'-sd.png')});
  await page.locator('#portraitDisplay [data-zoom]').click();assert.equal(await page.locator('#artTitle').textContent(),'헬리오스 · 전투 SD');await page.locator('#originalArt').evaluate(e=>e.decode());await page.locator('#closeArt').click();
  await page.locator('#rank').selectOption('');assert.equal(await page.locator('#cardGrid [data-code]').count(),9);
  const overflow=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(overflow.scroll<=overflow.width);assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  report.push({name,viewport,errors,failures,overflow,images,checks:{sssLimitedTwo:true,allLimitedNine:true,nameAndDeferredTitle:true,artAndSdDecoded:true,sdZoom:true,noDeploymentAction:true}});
  console.log(JSON.stringify(report.at(-1)));await page.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}

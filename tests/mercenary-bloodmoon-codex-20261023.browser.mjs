import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {BLOODMOON_MERCENARIES as cards} from '../shared/mercenary-bloodmoon-catalog-v1.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),out=path.join(root,'docs/qa/bloodmoon-codex-20261023');
const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1,updated_at:'2026-10-23'});
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://'+req.headers.host),json=data=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
 if(url.pathname==='/api/mercenary-codex')return json(catalog);
 if(url.pathname==='/api/shell/summary')return json({});
 if(url.pathname==='/api/mercenaries/v3/state')return json({accountId:1,available:true,cards:[],loadouts:{PVE:{revision:0,mercenaryCode:null},PVP:{revision:0,mercenaryCode:null}}});
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();
 res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
try{
 for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',isMobile:width<700,hasTouch:width<700});const page=await context.newPage(),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(base+'/mercenary-codex/?view=limited&q=블러드문&rank=SS#V-960');await page.locator('.roster-row').first().waitFor();assert.equal(await page.locator('.roster-row').count(),5);
  for(const c of cards){
   await page.locator('[data-code="'+c.code+'"]').click();await page.locator('.source-art').evaluate(img=>img.decode());await page.locator('.card-frame').evaluate(img=>img.decode());
   assert.equal(await page.locator('.stage-heading h2').textContent(),c.name);assert.match(await page.locator('.deployment-card').innerText(),/현재 개봉 불가/);await page.locator('.combat-details').evaluate(el=>el.open=true);
   assert.match(await page.locator('.limited-record').innerText(),/서버 10장/);assert.equal(await page.locator('[data-equip]').count(),0);assert.equal(await page.locator('#sdTab').isDisabled(),false);
   await page.locator('.combat-details').evaluate(el=>el.open=true);assert.match(await page.locator('.combat-panel').innerText(),/356,400/);assert.match(await page.locator('.combat-panel').innerText(),new RegExp(c.skills[0].name));assert.match(await page.locator('.skill-state').innerText(),/출시 대기/);
   await page.locator('.portrait-stage').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,label+'-'+c.code+'-art.png')});
   await page.locator('#sdTab').click();assert.equal(await page.locator('.bloodmoon-sprite image').getAttribute('href'),'/'+c.battleSprite);await page.locator('.bloodmoon-sprite image').evaluate(async el=>{const img=new Image();img.src=el.getAttribute('href');await img.decode();});
   if(c.code==='V-960')await page.screenshot({path:path.join(out,label+'-bongsoon-idle.png')});
   await page.locator('[data-zoom]').click();await page.locator('#originalArt').evaluate(img=>img.decode());assert.equal(await page.locator('#originalArt').getAttribute('src'),'/'+c.battleSprite);await page.locator('#closeArt').click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(width<700)await page.locator('#closeInspection').click();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);reports.push({viewport:{width,height},characters:5,rank:'SS',limit:10,openingDisabled:true,originalAndCorrectedIdle:true,skillsVisible:true,errors,failed});await context.close();
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASSED',scope:'Actual codex and server projection, isolated empty account; no production account writes',reports},null,2)+'\n');console.log(JSON.stringify({status:'PASSED',reports}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

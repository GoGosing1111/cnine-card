import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {readHalloweenPackState,saveHalloweenPack} from '../functions/_mercenary_halloween_pack.js';
const root=process.cwd(),out='C:/Users/User/.codex/tmp/halloween-owner-ready-20261017/qa';fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await halloweenFixture({after:fn=>cleanup.push(fn)}),catalog=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1});
f.settings.mode='OFF';await f.configure();
// Compile a local-only harness from the shipped V3 preview; no production API calls.
const previewDir='preview/halloween-bongsoon-harlequin-20261017';
let source=fs.readFileSync(previewDir+'/source/preview.js','utf8');
source=source.replace("import {HARLEQUIN_CODE,HARLEQUIN_SKILL,sampleHarlequinSkill}","import {sampleHarlequinSkill}");
source="import {HALLOWEEN_MERCENARIES} from '../../../shared/mercenary-halloween-catalog-v1.mjs';\nconst HARLEQUIN_CODE=new URL(location.href).searchParams.get('code')||'V-980',selected=HALLOWEEN_MERCENARIES.find(c=>c.code===HARLEQUIN_CODE),HARLEQUIN_SKILL={...selected.skills[0],duration:2.6,contact:1.2};\n"+source;
source=source.replaceAll("name:'할리퀸 나무늘봉순'","name:selected.name").replace("skillId:'MS-980'","skillId:'MS-'+HARLEQUIN_CODE.slice(2)").replace("type:'MERCENARY_HIT',actorId:actor.id","type:HARLEQUIN_CODE==='V-984'?'MERCENARY_BUFF':'MERCENARY_HIT',effect:'SHIELD',amount:37,targetShieldAfter:37,actorId:actor.id").replace('target=engine.enemies.slice()',"target=HARLEQUIN_CODE==='V-984'?engine.allies[0]:engine.enemies.slice()");
const bundle=await build({stdin:{contents:source,resolveDir:path.resolve(previewDir+'/source'),loader:'js'},write:false,bundle:true,minify:true,format:'iife',target:'es2022'});
const cmsHtml=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><link rel="stylesheet" href="/admin/mercenary-limited-admin-v1.css"><body style="margin:0;padding:16px;background:#10141d;color:#eee;font-family:Arial"><main id="editor" class="mc-admin" style="max-width:1180px;margin:auto"></main><script type="module">import {createHalloweenMercenaryEditor} from '/admin/mercenary-halloween-admin-v1.mjs';const root=document.getElementById('editor');let editor;const render=()=>{root.innerHTML=editor.html();editor.mount(root.querySelector('[data-halloween-root]'));};editor=createHalloweenMercenaryEditor({onRender:render,request:async(options={})=>{const r=await fetch('/api/admin/mercenaries/halloween-pack',{...options,headers:{'content-type':'application/json'}}),b=await r.json();if(!r.ok)throw Object.assign(Error(b.error),{status:r.status});return b;}});render();</script></body></html>`;
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host),send=(data,type='application/json',status=200)=>{res.writeHead(status,{'content-type':type});res.end(type==='application/json'?JSON.stringify(data):data);};
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(url.pathname==='/api/mercenary-codex')return send(catalog);
 if(url.pathname==='/api/mercenaries/v3/state')return send({available:true,cards:[],loadouts:{PVE:{revision:0},PVP:{revision:0}},leveling:{enabled:false},deployment:{enabled:true}});
 if(url.pathname==='/api/admin/mercenaries/halloween-pack'){
  if(req.method==='PATCH'){const parts=[];for await(const p of req)parts.push(p);return send(await saveHalloweenPack(f.env,f.user,JSON.parse(Buffer.concat(parts))));}
  return send(await readHalloweenPackState(f.env));
 }
 if(url.pathname.startsWith('/api/'))return send({enabled:false,mode:'OFF',items:[],cards:[],packs:[]});
 if(url.pathname==='/__cms')return send(cmsHtml,'text/html; charset=utf-8');
 if(url.pathname==='/__hw-preview')return send(fs.readFileSync(previewDir+'/index.html','utf8').replace('src="battle.html"','src="/__hw-battle?code='+url.searchParams.get('code')+'"').replace('href="preview.css"','href="/'+previewDir+'/preview.css"'),'text/html; charset=utf-8');
 if(url.pathname==='/__hw-battle')return send(fs.readFileSync(previewDir+'/battle.html','utf8').replace('./preview.bundle.js','/__hw-battle.js'),'text/html; charset=utf-8');
 if(url.pathname==='/__hw-battle.js')return send(bundle.outputFiles[0].text,'text/javascript');
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(e.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{for(const width of (process.env.QA_WIDTHS||'1440,390').split(',').map(Number)){
 const page=await browser.newPage({viewport:{width,height:width===1440?1000:844}}),errors=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))failed.push([r.status(),r.url()]);});
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:200,body:''}));
 await page.goto(base+'/__cms');await page.locator('[data-halloween-mode]').waitFor();assert.equal(await page.locator('[data-halloween-mode]').inputValue(),'OFF');
 assert.match(await page.locator('[data-halloween-readiness]').innerText(),/개방 조건 충족/);
 // Only this isolated in-memory DB is toggled during verification.
 await page.locator('[data-halloween-mode]').selectOption('ON');await page.locator('[data-halloween-save]').click();await page.waitForFunction(()=>document.querySelector('[data-halloween-root]')?.textContent.includes('저장 완료 · 판매 상태 ON'));
 assert.equal((await f.state()).userOpeningEnabled,true);
 await page.locator('[data-halloween-mode]').selectOption('OFF');await page.locator('[data-halloween-save]').click();await page.waitForFunction(()=>document.querySelector('[data-halloween-root]')?.textContent.includes('저장 완료 · 판매 상태 OFF'));
 await page.screenshot({path:path.join(out,'cms-'+width+'.png'),fullPage:true});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'cms-top-'+width+'.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 for(const card of HALLOWEEN_PACK_CARDS.filter(c=>!process.env.QA_CODES||process.env.QA_CODES.split(',').includes(c.code))){
  await page.goto(base+'/mercenary-codex/?view=limited&q='+card.code+'#'+card.code);await page.locator('[data-code="'+card.code+'"]').waitFor();await page.locator('[data-code="'+card.code+'"]').click();await page.locator('.source-art').evaluate(i=>i.decode());
  if(card.season==='HALLOWEEN'){assert.match(await page.locator('.power-summary').innerText(),/216,000/);assert.equal(await page.locator('.skill-entry').count(),1);}
  await page.locator('#sdTab').click();await page.locator('.sd-display img').evaluate(i=>i.decode());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(out,'codex-'+card.code+'-'+width+'.png'),fullPage:true});if(card.season==='HALLOWEEN'){await page.locator('.skill-entry').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'skill-'+card.code+'-'+width+'.png')});}
 }
 const bindings=[];
 for(const card of HALLOWEEN_PACK_CARDS.filter(c=>c.season==='HALLOWEEN'&&(!process.env.QA_CODES||process.env.QA_CODES.split(',').includes(c.code)))){
  await page.goto(base+'/__hw-preview?code='+card.code);await page.waitForFunction(()=>window.HarlequinPreview?.diagnostics().ready,null,{timeout:45000});
  await page.locator('#battle-frame').scrollIntoViewIfNeeded();const initial=await page.evaluate(()=>window.HarlequinPreview.actor.fullBodySprite.texture.uid);
  await page.evaluate(()=>window.HarlequinPreview.seek(1.38));await page.waitForTimeout(80);const d=await page.evaluate(()=>window.HarlequinPreview.diagnostics());assert.equal(d.code,card.code);assert.equal(d.visibleEffects,1);assert.equal(d.contactDistance,0);assert.equal(d.canvasCount,1);
  assert.equal(await page.evaluate(()=>window.HarlequinPreview.actor.fullBodySprite.texture.uid),initial);
  await page.locator('.battle-viewport').screenshot({path:path.join(out,'battle-'+card.code+'-'+width+'.png')});
  const binding=await page.evaluate(()=>window.HarlequinPreview.verifyBinding());assert.equal(binding.playback.code,card.code);assert.equal(binding.playback.damageApplications,card.code==='V-984'?0:1);if(card.code==='V-984')assert.equal(binding.playback.supportApplications,1);bindings.push(binding.playback);
  await page.evaluate(()=>window.HarlequinPreview.dispose());
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);reports.push({width,bindings,errors,failed});await page.close();console.log(JSON.stringify({width,result:'PASS'}));
}fs.writeFileSync(path.join(out,process.env.QA_CODES?'browser-targeted-report.json':'browser-report.json'),JSON.stringify({result:'PASS',reports},null,2)+'\n');}finally{await browser.close();server.close();for(const fn of cleanup)await fn();}

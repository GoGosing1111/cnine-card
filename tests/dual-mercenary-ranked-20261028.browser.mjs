import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {companionCmsFixture} from './helpers/companion-preparation-fixture.mjs';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {battleConfig} from '../functions/_mercenary_account.js';
import {contentPayloads} from './helpers/dual-content-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.DUAL_QA_DIR;
if(!out)throw Error('DUAL_QA_DIR required');fs.mkdirSync(out,{recursive:true});
const codes=['V-001','V-002','V-003','V-004','V-005','V-006'],ranks=['SS','SSS','SS','SSS','S','S'];
const doc=structuredClone(seed.document);codes.forEach((code,i)=>doc.mercenaries.find(m=>m.code===code).rank=ranks[i]);
const fx=await companionCmsFixture({mercenaries:codes.map(code=>battleConfig(doc,code,1))});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const publicBase=process.env.DUAL_QA_PUBLIC_BASE||'',publicFiles=new Map();
const requests=[],server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local');
  if(url.pathname==='/qa-content-payloads'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(contentPayloads()));return;}
  if(url.pathname.startsWith('/api/')){
   requests.push({method:req.method,path:url.pathname});const chunks=[];for await(const c of req)chunks.push(c);
   const response=await fx.handle(new Request(url,{method:req.method,headers:{'content-type':'application/json'},...(req.method!=='GET'?{body:Buffer.concat(chunks)}:{})}),{path:url.pathname.slice(5)});
   if(!response){res.writeHead(404);res.end();return;}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  if(publicBase){const key=url.pathname+url.search;if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const response=await fetch(publicBase+key,{signal:AbortSignal.timeout(45000)});return {status:response.status,type:response.headers.get('content-type'),body:Buffer.from(await response.arrayBuffer())};})());const r=await publicFiles.get(key);res.writeHead(r.status,{'content-type':r.type||'application/octet-stream'});res.end(r.body);return;}
  let file=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\//,''));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(url.pathname==='/preview/project-v-v3/project-v-pixi-battle.bundle.js'&&process.env.DUAL_QA_BUNDLE)file=process.env.DUAL_QA_BUNDLE;
  if(!fs.existsSync(file)&&process.env.DUAL_QA_MEDIA_ROOT&&/\.(png|webp|avif|jpe?g|gif|mp3|ogg|wav|woff2?|ttf|webm|mp4)$/i.test(file))file=path.join(process.env.DUAL_QA_MEDIA_ROOT,path.relative(root,file));
  if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  if(url.searchParams.has('legion')&&file.endsWith('index.html')){res.end(fs.readFileSync(file,'utf8').replace(/\/preview\/project-v-v3\/project-v-pixi-battle\.bundle\.js[^\"]*/, '/preview/sustained-hunt-v2/battle.bundle.js'));return;}
  fs.createReadStream(file).pipe(res);
 }catch(error){res.writeHead(500);res.end(error.message);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{for(const width of (publicBase?[390]:[1440,390])){
 const page=await browser.newPage({viewport:{width,height:width===390?844:1000},hasTouch:width===390,serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 await page.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.goto(origin+'/preview/dual-mercenary-ranked-20261028/');await page.locator('#rsSelect5').waitFor();
 assert.equal(await page.locator('#rsSave').isDisabled(),true);
 await page.locator('#rsSelect0').selectOption(codes[0]);
 assert.equal(await page.locator('#rsSelect1 option[value="V-003"]').isDisabled(),true,'same rank blocked inside a pair');
 await page.locator('#rsSelect1').selectOption(codes[1]);
 assert.equal(await page.locator('#rsSelect0 option[value="V-004"]').isDisabled(),true,'SSS shares one slot including LIMITED');
 for(let i=2;i<6;i++){if(i===5)assert.equal(await page.locator('#rsSelect5 option[value="V-006"]').isDisabled(),false,'different S mercenaries may share a round');await page.locator('#rsSelect'+i).selectOption(codes[i]);}
 assert.equal(await page.locator('#rsSelect5 option[value="V-001"]').isDisabled(),true,'used mercenary cannot re-enter');
 await page.locator('[data-rs-round-move="1:0"]').click();await page.locator('#rsSave').click();await page.locator('#rankedMatchStart:not([disabled])').waitFor();
 assert.deepEqual(await page.evaluate(()=>pvpState.rankedSeries.codes),[codes[2],codes[3],codes[0],codes[1],codes[4],codes[5]]);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.waitForFunction(()=>[...document.querySelectorAll('.rs-art .rs-portrait')].every(img=>img.complete&&img.naturalWidth>0));await page.locator('#roster').screenshot({path:path.join(out,`selection-${width}.png`)});
 await page.locator('#rankedMatchStart').click();await page.waitForFunction(()=>window.dualPreparationEngine?.mercenaries?.length===4);await page.locator('#battle').scrollIntoViewIfNeeded();
 const formation=await page.evaluate(()=>({mercenaries:dualPreparationEngine.gridDiagnostics().mercenaries,actors:dualPreparationEngine.mercenaries.map(m=>({id:m.id,visible:m.root.visible,x:m.baseX,y:m.baseY}))}));
 assert.equal(await page.evaluate(()=>dualPreparationEngine.allies.filter(a=>a.root.visible).length),5);assert.equal(await page.evaluate(()=>dualPreparationEngine.enemies.filter(a=>a.root.visible).length),5);
 assert.equal(new Set(formation.mercenaries.map(m=>m.x+':'+m.y)).size,4);assert.ok(formation.actors.every(a=>a.visible));
 await page.locator('#battle').screenshot({path:path.join(out,`pvp-${width}.png`)});
 await page.locator('#play').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('재생 완료'),{},{timeout:180000});
 await page.locator('#round').selectOption('1');await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('2차전'));
 assert.equal(await page.evaluate(()=>dualPreparationEngine.mercenaries.length),4,'replacement keeps only the current four mercenaries');
 await page.locator('#pve').click();await page.waitForFunction(()=>window.dualPreparationEngine?.mercenaries?.length===2&&document.getElementById('status').textContent.startsWith('PVE'));
 await page.locator('#battle').screenshot({path:path.join(out,`pve-${width}.png`)});
 if(process.env.DUAL_QA_CONTENTS==='1'||process.env.DUAL_QA_GROUPS_ONLY==='1'){
  for(const [id,count]of [['coop',6],['duo',8]]){
   await page.locator('#'+id).click();await page.waitForFunction(n=>window.dualPreparationEngine?.mercenaries?.length===n,count);
   assert.ok(await page.evaluate(()=>dualPreparationEngine.mercenaries.every(a=>a.root.visible)));
   await page.locator('#battle').screenshot({path:path.join(out,`${id}-${width}.png`)});
  }
 }
 if(process.env.DUAL_QA_CONTENTS==='1'){
  const contents=await page.evaluate(async()=>{window.qaContents=await fetch('/qa-content-payloads').then(r=>r.json());return Object.keys(qaContents);}),checks=[];
  for(const name of contents){
   if(name==='LEGION')continue; // Legion owns a twelve-enemy extension, loaded separately below.
   const result=await page.evaluate(async name=>{
    const payload=qaContents[name],engine=await ProjectVPixiBattle.mountForBattle(payload,document.getElementById('battle'));
    await ProjectVPixiBattle.setBattlePayload(payload);await ProjectVPixiBattle.setVisible(true);await ProjectVPixiBattle.restoreDeployedFormation();
    window.dualPreparationEngine=engine;window.qaLastPayload=payload;
    const actors=engine.mercenaries.filter(a=>a.root.visible);
    return {name,count:actors.length,stations:actors.map(a=>({id:a.id,x:a.baseX,y:a.baseY})),diagnostics:engine.gridDiagnostics()};
   },name);
   assert.equal(result.count,name==='COOP'?6:name==='DUO'?8:2,name);
   assert.equal(new Set(result.stations.map(a=>a.x+':'+a.y)).size,result.count,name);
   await page.locator('#battle').screenshot({path:path.join(out,`${name.toLowerCase()}-content-${width}.png`)});
   checks.push(result);
  }
  await page.setViewportSize({width,height:width===390?764:920});
  await page.evaluate(async()=>{
   await ProjectVPixiBattle.cancelActiveAnimations();await ProjectVPixiBattle.restoreDeployedFormation();
   const e=dualPreparationEngine;
   for(const a of e.mercenaries.filter(m=>m.side==='ALLY').slice(0,2))await e.normalAttack(0,{attacker:a,target:e.enemies[0],apply:()=>{}});
  });
  assert.ok(await page.evaluate(()=>dualPreparationEngine.mercenaries.every(a=>a.root.x===a.baseX&&a.root.y===a.baseY)),'duo resize and independent attack return');
  reports.push({width,contents:checks});
  await page.goto(origin+'/preview/dual-mercenary-ranked-20261028/?legion=1');await page.locator('#rsSelect5').waitFor();
  await page.evaluate(async()=>{const payload=(await fetch('/qa-content-payloads').then(r=>r.json())).LEGION;window.dualPreparationEngine=await ProjectVPixiBattle.mountForBattle(payload,document.getElementById('battle'));await ProjectVPixiBattle.setVisible(true);await ProjectVPixiBattle.restoreDeployedFormation();});
  assert.equal(await page.evaluate(()=>dualPreparationEngine.mercenaries.filter(a=>a.root.visible).length),2);
  assert.equal(await page.evaluate(()=>dualPreparationEngine.enemies.length),12);
  await page.locator('#battle').screenshot({path:path.join(out,`legion-content-${width}.png`)});
 }
 assert.deepEqual(errors,[]);reports.push({width,formation,errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});await page.close();
}
 assert.ok(requests.every(r=>r.method==='GET'||r.path==='/api/admin/companions/preparation/dual'));
 assert.equal((await fx.pg.query('SELECT COUNT(*) n FROM app_meta')).rows[0].n,0);
}catch(error){for(const c of browser.contexts())for(const page of c.pages()){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.log(await page.locator('#status').innerText());}throw error;}
finally{await browser.close();await new Promise(r=>server.close(r));await fx.close();fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({reports,requests},null,2));console.log(JSON.stringify({viewports:reports.map(r=>r.width),contentCases:reports.reduce((n,r)=>n+(r.contents?.length||0),0),errors:reports.flatMap(r=>r.errors||[])}));}

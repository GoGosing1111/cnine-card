import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {companionCmsFixture} from './helpers/companion-preparation-fixture.mjs';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {battleConfig} from '../functions/_mercenary_account.js';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.DUAL_QA_DIR;
if(!out)throw Error('DUAL_QA_DIR required');fs.mkdirSync(out,{recursive:true});
const codes=['V-001','V-002','V-003','V-004','V-005','V-006'],ranks=['SS','SSS','SS','SSS','A','S'];
const doc=structuredClone(seed.document);codes.forEach((code,i)=>doc.mercenaries.find(m=>m.code===code).rank=ranks[i]);
const fx=await companionCmsFixture({mercenaries:codes.map(code=>battleConfig(doc,code,1))});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const requests=[],server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local');
  if(url.pathname.startsWith('/api/')){
   requests.push({method:req.method,path:url.pathname});const chunks=[];for await(const c of req)chunks.push(c);
   const response=await fx.handle(new Request(url,{method:req.method,headers:{'content-type':'application/json'},...(req.method!=='GET'?{body:Buffer.concat(chunks)}:{})}),{path:url.pathname.slice(5)});
   if(!response){res.writeHead(404);res.end();return;}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  let file=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\//,''));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(url.pathname==='/preview/project-v-v3/project-v-pixi-battle.bundle.js'&&process.env.DUAL_QA_BUNDLE)file=process.env.DUAL_QA_BUNDLE;
  if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(error){res.writeHead(500);res.end(error.message);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:width===390?844:1000},hasTouch:width===390,serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 await page.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.goto(origin+'/preview/dual-mercenary-ranked-20261028/');await page.locator('#rsSelect5').waitFor();
 assert.equal(await page.locator('#rsSave').isDisabled(),true);
 await page.locator('#rsSelect0').selectOption(codes[0]);
 assert.equal(await page.locator('#rsSelect1 option[value="V-003"]').isDisabled(),true,'same rank blocked inside a pair');
 for(let i=1;i<6;i++)await page.locator('#rsSelect'+i).selectOption(codes[i]);
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
 assert.deepEqual(errors,[]);reports.push({width,formation,errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});await page.close();
}
 assert.ok(requests.every(r=>r.method==='GET'||r.path==='/api/admin/companions/preparation/dual'));
 assert.equal((await fx.pg.query('SELECT COUNT(*) n FROM app_meta')).rows[0].n,0);
}catch(error){for(const c of browser.contexts())for(const page of c.pages()){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.log(await page.locator('#status').innerText());}throw error;}
finally{await browser.close();await new Promise(r=>server.close(r));await fx.close();fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({reports,requests},null,2));console.log(JSON.stringify(reports));}

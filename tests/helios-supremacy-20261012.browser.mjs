import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/helios-supremacy-20261012');
fs.mkdirSync(out,{recursive:true});
const codex=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61,updated_at:'2026-10-12'});
const json=(res,data)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer((req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1');
 if(req.method!=='GET')return res.writeHead(405).end();
 if(u.pathname==='/api/mercenary-codex')return json(res,codex);
 if(u.pathname.startsWith('/api/'))return json(res,{ok:true,authenticated:false,user:null,cards:[],items:[],policy:{mode:'OFF'},loadouts:{PVE:null,PVP:null}});
 let file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/preview/mercenary-limited-solar-sword-20261009-v1/');
  await page.waitForFunction(()=>Boolean(window.SolarPreview),null,{timeout:60000});
  await page.locator('#battle').scrollIntoViewIfNeeded();
  const motion=await page.evaluate(async()=>{
   const f=window.SolarPreview.fx,rows=[];
   for(const mode of ['dash','attack','skill','ultimate']){
    f.setSpeed(1);f.setMode(mode);const start=performance.now(),rate=f.timeline.timeScale(),updates=[];
    const previous=f.onUpdate;f.onUpdate=fx=>{updates.push({time:fx.time,contactCount:fx.state.contactCount});previous(fx);};
    f.play();while(f.playing&&performance.now()-start<10000)await new Promise(r=>setTimeout(r,20));
    const done=f.diagnostics();f.onUpdate=previous;
    rows.push({mode,rate,elapsedSeconds:(performance.now()-start)/1000,durationSeconds:done.durationSeconds,contactSeconds:done.contactSeconds,contacts:done.contactCount,registeredTimelines:done.registeredTimelines,updates:updates.length,done:f.state.done});
   }
   f.setMode('attack');f.seek(.48);const contact=f.diagnostics();
   f.setMode('aura');const auraRate=f.timeline.timeScale();
   f.setMode('skill');f.setSpeed(2);const doubleRate=f.timeline.timeScale();f.setSpeed(1);
   f.setMode('ultimate');f.seek(2.84);const area=f.diagnostics();
   return{rows,auraRate,doubleRate,basicContact:contact.bladeContact.intersects,areaTargets:area.targets.filter(t=>t.hit).length,
    bodyUniformScale:area.bodyUniformScale,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  for(const row of motion.rows){assert.equal(row.rate,2.6);assert.equal(row.done,true);assert.equal(row.registeredTimelines,0);assert.ok(row.updates>1);assert.ok(Math.abs(row.elapsedSeconds-row.durationSeconds)<.6,JSON.stringify(row));}
  assert.equal(motion.auraRate,1);assert.equal(motion.doubleRate,5.2);assert.equal(motion.basicContact,true);assert.equal(motion.areaTargets,5);assert.equal(motion.bodyUniformScale,true);assert.equal(motion.overflow,false);
  await page.locator('.battle-viewport').screenshot({path:path.join(out,name+'-ultimate.png')});
  await page.evaluate(()=>{window.SolarPreview.fx.setMode('attack');window.SolarPreview.fx.seek(.48);});
  await page.locator('.battle-viewport').screenshot({path:path.join(out,name+'-attack.png')});
  const cleanup=await page.evaluate(()=>{const f=window.SolarPreview.fx;f.cancel();const d=f.diagnostics();window.SolarPreview.dispose();return{timelineRemoved:d.registeredTimelines===0,disposed:f.disposed,frontDestroyed:f.front.destroyed,backDestroyed:f.back.destroyed};});
  assert.ok(Object.values(cleanup).every(Boolean));
  await page.goto(base+'/mercenary-codex/?view=limited#V-999');
  await page.locator('.limited-combat-note').waitFor();
  const catalog=await page.evaluate(()=>({text:document.querySelector('.limited-combat-note').textContent,lock:document.querySelector('.limited-lock')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth+1}));
  assert.match(catalog.text,/78회/);assert.match(catalog.text,/2.6배속/);assert.match(catalog.lock,/획득 · 편성 불가/);assert.equal(catalog.overflow,false);
  await page.locator('.combat-panel').screenshot({path:path.join(out,name+'-codex.png')});
  assert.deepEqual(errors,[]);reports.push({name,motion,cleanup,catalog,errors});console.log(JSON.stringify({name,modes:motion.rows.length,errors:errors.length,status:'PASS'}));await page.close();
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({source:'prepared SolarFX bundle and public codex projection, acquisition and deployment remain locked',reports},null,2)+'\n');
}finally{await browser.close();await new Promise(r=>server.close(r));}

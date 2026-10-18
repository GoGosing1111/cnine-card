import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),dir='preview/apocalypse-sahyeon-20261019-v1',out=process.env.SAHYEON_QA_OUTPUT||path.join(root,'docs/qa/apocalypse-sahyeon-20261019');fs.mkdirSync(out,{recursive:true});
const production=process.argv.includes('--production'),mobileOnly=process.argv.includes('--mobile'),quick=process.argv.includes('--quick');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1');if(req.method!=='GET')return res.writeHead(405).end();
 if(u.pathname.startsWith('/api/'))return res.writeHead(200,{'content-type':'application/json'}).end('{"ok":true,"items":[],"enabled":false}');
 let file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(!fs.existsSync(file))return res.writeHead(404).end();if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}catch(e){res.writeHead(500).end(e.message);}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});const reports=[];
try{
 const cases=production?[['desktop',1440,1100]]:mobileOnly?[['mobile',390,844]]:[['desktop',1440,1100],['mobile',390,844]];
 for(const [label,width,height]of cases){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'}),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({status:r.status(),url:r.url()});});
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{"ok":true,"items":[],"enabled":false}'}));
  const base=production?'https://cnine-card.pages.dev':'http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/'+dir+'/');await page.waitForFunction(()=>document.querySelector('.portrait img')?.complete);await page.screenshot({path:path.join(out,(production?'live-':'')+label+'-art.png')});
  await page.evaluate(()=>SahyeonReview.mount());await page.waitForFunction(()=>SahyeonReview.ready,null,{timeout:60000});await page.locator('#lab-modal').scrollIntoViewIfNeeded();
  const play=async(kind,captureTime)=>{
   await page.evaluate(k=>{void SahyeonReview.play(k);},kind);
   if(captureTime){try{await page.waitForFunction(t=>SahyeonReview.error||SahyeonReview.engine.activeSahyeonFX&&SahyeonReview.engine.sahyeonPlaybackTime>t,captureTime,{timeout:15000});}catch(e){console.log(JSON.stringify(await page.evaluate(()=>({error:SahyeonReview.error,status:document.getElementById('health').textContent,ready:SahyeonReview.ready,playing:SahyeonReview.playing,record:SahyeonReview.engine.lastSahyeonPlayback,records:SahyeonReview.records,fx:!!SahyeonReview.engine.activeSahyeonFX,time:SahyeonReview.engine.sahyeonPlaybackTime,timelines:SahyeonReview.engine.simpleTimelines.size,disposed:SahyeonReview.engine.disposed})))) ;console.log(JSON.stringify({errors,failed}));await page.screenshot({path:path.join(out,label+'-failure.png')});throw e;}assert.equal(await page.evaluate(()=>SahyeonReview.error),undefined);
    await page.evaluate(()=>{for(const e of SahyeonReview.engine.simpleTimelines)e.instance.pause();});
    await page.screenshot({path:path.join(out,(production?'live-':'')+label+'-'+kind+'.png')});
    await page.evaluate(()=>{for(const e of SahyeonReview.engine.simpleTimelines)e.instance.play();});
   }
   await page.waitForFunction(()=>!SahyeonReview.playing,null,{timeout:90000});assert.equal(await page.evaluate(()=>SahyeonReview.error),undefined);
   const record=await page.evaluate(()=>SahyeonReview.records.at(-1));assert.equal(record.impacts,1);assert(record.targets>0);
   if(kind==='ultimate'){
    const hp=await page.evaluate(()=>{const {engine,payload}=SahyeonReview;const event=payload.battleV2.result.timeline.find(e=>e.type==='APOCALYPSE_SKILL'&&e.kind==='ultimate');return event.hits.map(h=>({id:h.targetId,actual:engine.combatantById(h.targetId).hp,expected:h.targetHpAfter/payload.battleV2.teams.A.cards.find(c=>c.id===h.targetId).maxHp*100}));});
    for(const row of hp)assert(Math.abs(row.actual-row.expected)<.000001,JSON.stringify(row));record.hpSynchronized=hp.length;
   }
   return record;
  };
  const records=[];
  if(!production&&!quick){records.push(await play('seal',.45));records.push(await play('curse',1.22));}
  records.push(await play('ultimate',2.2));assert(records.at(-1).damage>0);
  if(!production&&!quick&&label==='desktop'){
   await page.evaluate(()=>{void SahyeonReview.play('ultimate');});await page.waitForFunction(()=>SahyeonReview.engine.activeSahyeonFX&&SahyeonReview.engine.sahyeonPlaybackTime>.5);
   await page.evaluate(()=>SahyeonReview.stop());assert.equal(await page.evaluate(()=>SahyeonReview.engine.effectLayer.children.filter(c=>c.label?.startsWith('SAHYEON_FX')).length),0);
   records.push(await play('ultimate'));records.push(await play('full'));
  }
  if(!production&&label==='mobile'){await page.locator('#reduced').check();records.push(await play('ultimate'));}
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  const layout=await page.evaluate(()=>{const host=document.getElementById('lab-modal').getBoundingClientRect();return [...document.querySelectorAll('#lab-modal .battle-v3-live-shell,#lab-modal canvas,#lab-modal [data-v3-roster-list]')].filter(el=>el.getBoundingClientRect().width>0).map(el=>{const r=el.getBoundingClientRect();return {kind:el.tagName,left:r.left,right:r.right,inside:r.left>=host.left-1&&r.right<=host.right+1};});});
  assert(layout.every(r=>r.inside),JSON.stringify(layout));
  const remaining=await page.evaluate(()=>SahyeonReview.engine.effectLayer.children.filter(c=>c.label?.startsWith('SAHYEON_FX')).length);assert.equal(remaining,0);
  reports.push({label,records,errors,failed,overflow,layout,remainingFx:remaining});console.log(JSON.stringify(reports.at(-1)));
  fs.writeFileSync(path.join(out,production?'production-browser.json':quick?'layout-browser.json':'browser.json'),JSON.stringify({accountWrites:0,production,unregistered:true,reports},null,2)+'\n');await page.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}

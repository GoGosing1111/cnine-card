import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {CODEX_MEDIA} from '../mercenary-codex/media-map.mjs';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity} from '../functions/_jokgak_city.js';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CODEX_QA_DIR;
assert.ok(out,'CODEX_QA_DIR required');fs.mkdirSync(out,{recursive:true});
const playwright=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),{chromium}=playwright.default||playwright;
const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61,updated_at:'2026-10-23T00:00:00Z'});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
const check=(yes,label)=>{assert.ok(yes,label);checks.push(label);};
try{
  for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),page=await context.newPage(),requests=[],writes=[];
    let release;const gate=new Promise(r=>release=r);let accountReady=false;
    const state={accountId:4242,available:true,loadouts:{PVE:{mercenaryCode:null,revision:1},PVP:{mercenaryCode:null,revision:1}},cards:catalog.cards.slice(0,2).map(c=>({...c,canDeploy:true,level:1,duplicates:0}))};
    page.on('pageerror',e=>errors.push(width+': '+e.message));page.on('request',r=>requests.push({path:new URL(r.url()).pathname,headers:r.headers()}));
    await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','isolated-local-qa');localStorage.setItem('cnine_card_user_v10',JSON.stringify({serverUserId:4242,nickname:'로딩 검수'}));});
    await page.route('**/api/**',async route=>{
      const req=route.request(),key=new URL(req.url()).pathname;
      if(key==='/api/mercenary-codex')return route.fulfill({json:catalog});
      if(key==='/api/mercenaries/v3/state'){await gate;accountReady=true;return route.fulfill({json:state});}
      if(key==='/api/mercenaries/v3/loadout'){
        const body=req.postDataJSON();writes.push(body);state.loadouts[body.mode]={mercenaryCode:body.mercenaryCode,revision:state.loadouts[body.mode].revision+1};return route.fulfill({json:{replayed:false}});
      }
      return route.fulfill({json:{visible:false,enabled:false,active:false,items:[],serverNow:Date.now()}});
    });
    try{
      await page.goto(origin+'/mercenary-codex/?view=all',{waitUntil:'domcontentloaded'});await page.locator('.roster-row').first().waitFor();
      check(!accountReady,width+': catalog visible before account response');
      check(await page.locator('.roster-row').count()===catalog.cards.length,width+': complete public list');
      await page.locator('#search').fill('은설');check(await page.locator('[data-code="V-973"]').count()===1,width+': search usable during account loading');await page.locator('#search').fill('');
      check(requests.filter(r=>r.path==='/api/mercenary-codex').length===1,width+': public catalog requested once');
      check(requests.find(r=>r.path==='/api/mercenary-codex').headers.authorization===undefined,width+': public request has no player token');
      check(!requests.some(r=>/jokgak-city-(render|life-ui|supply-ui)|jokgak-city-v1\.css/.test(r.path)),width+': inactive city does not load UI dependencies');
      const original='/'+catalog.cards[0].sourceArt,display=CODEX_MEDIA[original].display;
      if(width===390){
        check(await page.locator('#portraitDisplay img').count()===0,'mobile: hidden details have no images');
        check(!requests.some(r=>r.path===display),'mobile: display image is deferred until opening details');
      }else{
        await page.waitForFunction(()=>document.querySelector('#portraitDisplay .source-art')?.complete);
        check(!requests.some(r=>r.path===original),'desktop: selected card uses a display derivative');
      }
      release();await page.waitForFunction(()=>document.getElementById('ownedCount').textContent==='2');
      await page.locator('#ownedView').click();await page.locator('[data-code="'+state.cards[0].code+'"]').click();
      if(width===390)check(await page.locator('#inspectionSheet').evaluate(n=>n.open),'mobile: selected detail opens in existing sheet');
      await page.waitForFunction(()=>[...document.querySelectorAll('#portraitDisplay img')].every(n=>n.complete&&n.naturalWidth>0));
      check(!requests.some(r=>r.path===original),width+': opening a detail still avoids full original');
      for(const mode of ['PVE','PVP']){await page.locator('[data-equip][data-deploy-mode="'+mode+'"]').click();await page.waitForFunction(mode=>document.querySelector('[data-equip][data-deploy-mode="'+mode+'"]')?.textContent.includes('편성 완료'),mode);}
      check(writes.length===2&&writes[0].mode==='PVE'&&writes[1].mode==='PVP'&&writes.every(w=>w.mercenaryCode===state.cards[0].code&&w.requestId),width+': PVE/PVP save each sends one atomic request');
      await page.locator('[data-zoom]').click();await page.waitForFunction(()=>document.getElementById('originalArt').complete&&document.getElementById('originalArt').naturalWidth>0);
      check(requests.some(r=>r.path===original),width+': zoom fetches the untouched original on demand');await page.locator('#closeArt').click();
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+': no horizontal clipping');
      await page.screenshot({path:path.join(out,'codex-'+width+'.png'),fullPage:width===1440});
      if(width===390){await page.locator('#closeInspection').click();await page.waitForFunction(()=>document.querySelectorAll('#portraitDisplay img').length===0);check(true,'mobile: closed detail releases hidden images');}
    }finally{release();await context.close();}
  }
  // A failed private request must leave the public catalog searchable.
  {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route('**/api/**',r=>r.fulfill(new URL(r.request().url()).pathname==='/api/mercenary-codex'?{json:catalog}:{status:401,json:{error:'로그인이 필요합니다.'}}));
    await page.goto(origin+'/mercenary-codex/?view=all');await page.locator('.roster-row').first().waitFor();await page.locator('#search').fill('족로');
    check(await page.locator('[data-code="V-979"]').count()===1,'private failure: public search remains usable');await page.close();
  }
  // Notifications remain active without preloading the city renderer.
  {
    const page=await browser.newPage({viewport:{width:390,height:844}}),seen=[];let notification=null;
    page.on('pageerror',e=>errors.push('city: '+e.message));page.on('request',r=>seen.push(new URL(r.url()).pathname));
    await page.addInitScript(()=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify({serverUserId:4242}));});
    await page.route('**/__lazy-city/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><body><h1>진행 중인 콘텐츠</h1><script src="/js/jokgak-city-v1.js"></script>'}));
    await page.route('**/api/**',r=>r.fulfill({json:{active:false,mine:null,items:notification?[notification]:[],serverNow:Date.now()}}));
    await page.goto(origin+'/__lazy-city/');await page.waitForResponse(r=>r.url().endsWith('/notifications'));
    check(!seen.some(p=>/jokgak-city-(render|life-ui)|jokgak-city-v1\.css/.test(p)),'city: inactive poll avoids renderer, configuration UI and stylesheet');
    notification={id:'isolated-qa-notice',action:'attack',actorName:'검수 상대',location:'MARKET',health:75,maxHealth:100,createdAt:Date.now()};
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.locator('[data-city-notice-id="isolated-qa-notice"]').waitFor();
    check(seen.some(p=>p==='/css/jokgak-city-v1.css'),'city: real notice loads its styles');
    check(!seen.some(p=>p==='/js/jokgak-city-render-v1.mjs'),'city: notification does not load full city renderer');
    await page.locator('[data-notice-dismiss]').click();check(await page.locator('[data-city-notice-id]').count()===0,'city: loaded notice can be dismissed');await page.close();
  }
  // Entering the actual city still loads all renderer dependencies and mounts.
  {
    const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),actor=f.users.get(f.roles.CITIZEN),page=await browser.newPage();
    await f.join(actor.id);page.on('pageerror',e=>errors.push('city mount: '+e.message));
    await page.addInitScript(id=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify({serverUserId:id}));},actor.id);
    await page.route('**/__mount-city/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><main></main><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector("main").innerHTML=JokgakCity.view();JokgakCity.bind();</script>'}));
    await page.route('**/api/**',async r=>{
      const q=r.request(),p=new URL(q.url()).pathname.slice(5),result=await handleJokgakCity({path:p,env:f.env,deps:{...f.deps,authenticate:async()=>actor,json:(value,status=200)=>Response.json(value,{status})},request:new Request(q.url(),{method:q.method(),headers:q.headers(),...(['GET','HEAD'].includes(q.method())?{}:{body:q.postData()})})});
      return r.fulfill(result?{status:result.status,body:await result.text(),contentType:'application/json'}:{json:{}});
    });
    try{await page.goto(origin+'/__mount-city/');await page.locator('.jc-map-art').waitFor();await page.locator('[data-city-rules]').first().click();await page.locator('.jc-dialog').waitFor();check(true,'city: actual entry mounts map and opens rules with deferred renderer');}
    finally{await page.close();for(const fn of cleanup)await fn();}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

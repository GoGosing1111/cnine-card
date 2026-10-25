import {additions} from '../../../scripts/ops/pet-heukgu-registration-20261025.mjs';
import {execFileSync} from 'node:child_process';
// Local fixture only. Real /pet-codex/ and real OWNER pet management component.
// No registration, acquisition configuration, grants or battle actions are performed.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {petEquipmentFixture} from '../../../tests/helpers/pet-equipment-fixture.mjs';
import {PET_ART_CATALOG} from '../../../shared/pet-art-catalog-v1.mjs';
import {emptyPetCmsDocument,emptyPetDraft} from '../../../shared/pet-cms-v1.mjs';
import {ensurePetPotentialItem,handlePetPotential} from '../../../functions/_pet_potential.js';

assert(process.env.PLAYWRIGHT_MODULE,'Set PLAYWRIGHT_MODULE to the installed Playwright entry point.');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../../../',import.meta.url));
const out=process.env.QA_OUTPUT_DIR||fileURLToPath(new URL('.',import.meta.url));
await mkdir(out,{recursive:true});
const approved=JSON.parse(await readFile(path.join(root,'docs/qa/pet-heukgu-live-20261025/approval-20261025.json'))).assets;
const f=await petEquipmentFixture(),reports=[],pageErrors=[],consoleErrors=[],httpErrors=[],apiRequests=[],unrelatedApiStubs=[];
const old=PET_ART_CATALOG.find(p=>p.code==='PET-BONGSOON');
const existingPet={...emptyPetDraft(old.code),name:old.name,sourceArt:old.sourceArt,battleSprite:old.sourceArt,enabled:true,liveEnabled:true,buffs:[{type:'SPEED_PERCENT',percent:17}]};
const protectedRecords={
  pet_cms_preparation_v1:{revision:12,audit:[],document:{...emptyPetCmsDocument(),pets:[existingPet,...structuredClone(additions)]}},
  'pet_collection_v1:2':{revision:4,pets:{[old.code]:2}},
  'pet_loadout_v1:2':{revision:3,petCode:old.code,audit:[]},
  pet_opening_settings_v1:{version:1,revision:8,enabled:true,essencePerOpen:3,maxBatch:5,blankWeight:2,pool:[{code:old.code,weight:7}]},
  pet_potential_settings_v1:{version:1,revision:6,enabled:false,successPpm:null},
};
for(const [key,value]of Object.entries(protectedRecords))await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(2,$1,31,4)',['PET_SEAL_ORB']);
await ensurePetPotentialItem(f.env);
const snapshot=async()=>({meta:(await f.pg.query('SELECT * FROM app_meta ORDER BY key')).rows,inventory:(await f.pg.query('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code')).rows});
const before=await snapshot();
const user={id:2,serverUserId:2,nickname:'흑구 펫 도감 검수',role:'USER',coin:100000,pigCoin:0,masterStars:0,owned:[],quantities:{},history:[],attendance:{totalDays:0}};
const json=(res,body,status=200)=>{res.writeHead(status,{'content-type':'application/json;charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://qa.test'),p=url.pathname;
  if(p==='/qa-owner-pets/'){
    res.writeHead(200,{'content-type':'text/html;charset=utf-8','cache-control':'no-store'});
    return res.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OWNER 펫 관리 읽기 검수</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/admin/companion-admin-v2.css"><link rel="stylesheet" href="/css/collection-bonuses-v1.css"><style>body{margin:0;padding:16px;background:#080c17;color:#eef2ff;font-family:Arial,sans-serif}main{max-width:1400px;margin:auto}</style></head><body><main id="qa-cms"></main><script type="module">import {mountCompanionCms} from "/admin/companion-admin-v2.mjs";mountCompanionCms(document.getElementById("qa-cms"));</script></body></html>');
  }
  if(p.startsWith('/api/')){
    const key=p.slice(5);apiRequests.push({path:key,method:req.method});
    assert.equal(req.method,'GET','browser QA must remain read-only: '+key);
    if(key.startsWith('pets/v1/')){const r=await f.call(null,{path:key,owner:2});return json(res,r.body,r.status);}
    if(key==='admin/pets'){const r=await f.cmsCall();return json(res,r.body,r.status);}
    if(key==='admin/pets/potential'){
      const response=await handlePetPotential({path:key,request:new Request('https://qa.test/api/'+key),env:f.env,deps:{requirePermission:async()=>({id:1,role:'OWNER'}),json:(body,status=200)=>Response.json(body,{status})}});
      return json(res,await response.json(),response.status);
    }
    const bodies={
      'server-support/info':{serverNow:Date.now(),subscription:{revision:0,active:false,endsAt:0,magnetPetCode:null}},
      me:{user},'me/summary':{user,prison:{incarcerated:false}},
      'service/status':{maintenance:{active:false}},messages:{messages:[],unread:0},
      'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{items:[]},
      'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},
    };
    unrelatedApiStubs.push(key);return json(res,bodies[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
  }
  let route=decodeURIComponent(p);if(route.endsWith('/'))route+='index.html';
  const file=path.resolve(root,'.'+route);assert(file.startsWith(path.resolve(root)+path.sep),'outside fixture root');
  let data;try{data=await readFile(file)}catch(error){if(error.code!=='ENOENT')throw error;data=execFileSync('git',['show','HEAD:'+path.relative(root,file).split(path.sep).join('/')],{cwd:root,maxBuffer:40e6});}const types={'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
}catch(error){httpErrors.push({url:req.url,error:error.message});json(res,{error:error.message},404);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const observe=(page,label)=>{page.on('pageerror',error=>pageErrors.push(label+': '+error.message));page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(label+': '+msg.text());});page.on('dialog',d=>d.dismiss());};
const fit=async page=>{const widths=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));assert(widths.document<=widths.viewport+1,'horizontal overflow: '+JSON.stringify(widths));return widths;};
const shot=async(page,name)=>{await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});return name+'.png';};
try{
  for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}],['mobile-small',{width:320,height:740}]]){
    const context=await browser.newContext({viewport,hasTouch:label.startsWith('mobile'),isMobile:label.startsWith('mobile'),serviceWorkers:'block'});
    await context.addInitScript(user=>{
      localStorage.setItem('cnine_card_api_token','fixture-user');localStorage.setItem('cnine_admin_token','fixture-owner');
      localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_battle_sound','OFF');
      // Realtime account sockets are outside this catalog-only local fixture.
      window.CNineAccountSync={epoch:0,revision:'0'};
    },user);
    const page=await context.newPage();observe(page,label+' codex');
    await page.goto(base+'/pet-codex/',{waitUntil:'domcontentloaded'});
    await page.locator('[data-pet-select]').first().waitFor();
    assert.equal(await page.locator('[data-pet-select]').count(),PET_ART_CATALOG.length);
    await page.locator('[data-codex-search]').fill('흑구');assert.equal(await page.locator('[data-pet-select]').count(),approved.length);
    const pets=[];
    for(const art of approved){
      await page.locator('[data-pet-select="'+art.code+'"]').click();
      const hero=page.locator('[data-pet-art] img');
      await hero.evaluate(img=>img.decode());
      await hero.evaluate(img=>Promise.all(img.getAnimations().map(animation=>animation.finished)));
      const image=await hero.evaluate(img=>({src:new URL(img.src).pathname,width:img.naturalWidth,height:img.naturalHeight,fit:getComputedStyle(img).objectFit,visible:!img.hidden}));
      assert.equal(image.src,'/'+art.approvedAsset);assert.equal(image.width,1206);assert.equal(image.height,1305);assert(image.visible);
      const captionGap=await page.evaluate(()=>document.querySelector('[data-pet-caption]').getBoundingClientRect().top-document.querySelector('.pe-hero').getBoundingClientRect().bottom);
      assert(captionGap>=4,'Approved image must remain clear of its caption: '+captionGap);
      assert.match(await page.locator('[data-pet-caption]').textContent(),new RegExp(art.name));
      assert.match(await page.locator('[data-pet-detail]').textContent(),/미정|설정 대기/);
      assert(await page.locator('[data-pet-equip]').isDisabled());
      const widths=await fit(page),screenshot=await shot(page,label+'-'+art.code.toLowerCase());
      let mobileStageViewport=null;
      if(label.startsWith('mobile')){
        // The existing fixed footer is visible in full-page captures. Scroll the
        // actual stage into the usable viewport to verify the complete pet.
        await page.locator('.pe-stage').evaluate(stage=>window.scrollTo(0,stage.getBoundingClientRect().top+scrollY-60));
        const bounds=await page.evaluate(()=>{
          const image=document.querySelector('.pe-hero').getBoundingClientRect(),footer=document.querySelector('.pe-footer').getBoundingClientRect();
          return {imageTop:image.top,imageBottom:image.bottom,footerTop:footer.top,viewport:innerHeight};
        });
        assert(bounds.imageTop>=0&&bounds.imageBottom<=bounds.footerTop,'full pet must fit above the fixed footer after scrolling');
        const screenshot=label+'-'+art.code.toLowerCase()+'-stage-viewport.png';
        await page.screenshot({path:path.join(out,screenshot),fullPage:false});
        mobileStageViewport={...bounds,screenshot,note:'Existing fixed footer may overlap lower content at the initial scroll position; the complete image is visible after normal scrolling.'};
      }
      pets.push({code:art.code,name:art.name,image,captionGap,equipDisabled:true,buffUnconfigured:true,widths,screenshot,mobileStageViewport});
    }
    await page.locator('[data-codex-filter="owned"]').click();assert.equal(await page.locator('[data-pet-select]').count(),0,'Heukgu are not silently granted');
    await page.locator('[data-codex-search]').fill('');assert.equal(await page.locator('[data-pet-select]').count(),1,'existing owned pet is preserved');
    const cms=await context.newPage();observe(cms,label+' OWNER component');
    await cms.goto(base+'/qa-owner-pets/',{waitUntil:'domcontentloaded'});
    await cms.locator('[data-select-pet="'+old.code+'"]').waitFor();
    await cms.locator('[data-select-pet="PET-HEUKGU"]').click();
    const selected=cms.locator('.cp-editor img').first();await selected.evaluate(img=>img.decode());
    assert.equal(await selected.evaluate(img=>new URL(img.src).pathname),'/'+approved[0].approvedAsset);
    assert.equal(await selected.evaluate(img=>img.naturalWidth),1206);
    assert.equal(await cms.locator('[data-field="name"]').inputValue(),'흑구');
    assert.equal(await cms.locator('[data-field="liveEnabled"]').isChecked(),false);
    assert.equal(await cms.locator('[data-buff-percent="0"]').inputValue(),'');
    assert(await cms.locator('[data-save]').isDisabled(),'selection must not change settings');
    assert.equal(await cms.locator('[data-select-pet]').count(),2,'existing pet and registered Heukgu');
    const cmsWidths=await fit(cms),cmsScreenshot=await shot(cms,label+'-owner-heukgu-registered');
    reports.push({viewport:label,size:viewport,route:'/pet-codex/',catalogCount:PET_ART_CATALOG.length,pets,ownerCms:{mode:'actual component in local harness',registeredCode:'PET-HEUKGU',registeredDefinitions:2,sourceArtLoaded:true,buffUnconfigured:true,liveEffectsEnabled:false,saveDisabled:true,widths:cmsWidths,screenshot:cmsScreenshot}});
    await context.close();
  }
  assert.deepEqual(await snapshot(),before,'all persisted fixture records must stay unchanged');
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpErrors,[]);assert.deepEqual(consoleErrors,[]);
  const report={status:'PASSED',scope:'Local fixture; actual pet codex and actual OWNER pet management component. Read-only selection only.',fixtureOnlyStubs:['Realtime account socket disabled','Unrelated shell endpoints return inert fixture data'],protectedStateUnchanged:true,mutationRequests:apiRequests.filter(r=>r.method!=='GET'),reports,pageErrors,consoleErrors,httpErrors,unrelatedApiStubs:[...new Set(unrelatedApiStubs)],apiRequests};
  await writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,viewports:reports.length,petSelections:reports.reduce((n,r)=>n+r.pets.length,0),ownerCandidateChecks:reports.length*approved.length,output:out}));
}catch(error){
  const pages=browser.contexts().flatMap(c=>c.pages());for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:path.join(out,'failure-'+i+'.png'),fullPage:true}).catch(()=>{});
  await writeFile(path.join(out,'browser-failure.json'),JSON.stringify({error:error.stack,pageErrors,consoleErrors,httpErrors,apiRequests,reports},null,2)+'\n');throw error;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await f.close();}

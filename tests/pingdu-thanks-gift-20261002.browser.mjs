// Actual game shell, inventory, CMS markup and gift transactions, using local accounts only.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {pingduThanksGiftFixture} from './helpers/pingdu-thanks-gift-fixture.mjs';
import {PINGDU_THANKS_GIFT as gift,ensurePingduThanksGiftCatalog,grantPingduThanksGift,openPingduThanksGift} from '../functions/_pingdu_thanks_gift.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.PINGDU_THANKS_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'pingdu-thanks-gift-'));
fs.mkdirSync(out,{recursive:true});
const f=await pingduThanksGiftFixture();await ensurePingduThanksGiftCatalog(f.env);
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),api=read('functions/api/[[path]].js'),admin=read('admin/admin-v1276.js');
const legacyCommit=process.env.PINGDU_THANKS_LEGACY_COMMIT;
const legacy=legacyCommit?Object.fromEntries(['index.html','js/app.js','service-worker.js'].map(file=>[file,execFileSync('git',['show',legacyCommit+':'+file],{cwd:root,encoding:'utf8',maxBuffer:2_000_000})])):null;
let releasePhase='current',legacyShellOnce=false,failNextGiftModule=false;
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor,locks=[],requests=[];
const adminRoute=new AsyncFunction('deps',`const {env,request,requirePermission,readBody,json,isForgeTicketGrant,grantPingduThanksGift,withJointUserMutationLock}=deps;const path='admin/users/action';${api.slice(api.indexOf("    if(path==='admin/users/action'"),api.indexOf("    if(path==='admin/users/inventory-audit'"))}`);
const openRoute=new AsyncFunction('deps',`const {env,request,authenticate,readBody,json,openPingduThanksGift}=deps;const path='inventory/use';${api.slice(api.indexOf("    if(path==='inventory/use'"),api.indexOf('      if(itemCode===TOURNAMENT_GIFT.code)'))}}`);
const user={id:1,serverUserId:1,nickname:'감사 선물 검수',role:'USER',coin:123,cardShards:0,masterStars:17,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const profile=async()=>({...user,coin:(await f.one('SELECT coin FROM users WHERE id=1')).coin,masterStars:await f.quantity('MASTER_STAR')});
const inventory=async()=>{
  const result=await f.env.DB.prepare(`SELECT i.code,i.name,i.description,i.category,i.rarity,i.image_url AS image,COALESCE(ui.quantity,0) AS quantity,COALESCE(ui.unseen_quantity,0) AS unseenQuantity FROM inventory_items i LEFT JOIN cnine_user_inventory ui ON ui.item_code=i.code AND ui.user_id=1 WHERE i.is_active=1 ORDER BY i.sort_order`).all();
  const items=result.results.map(row=>({...row,quantity:Number(row.quantity),unseenQuantity:0,usable:row.category==='GIFT_BOX'}));
  return {items,unseenTotal:0,totalQuantity:items.reduce((sum,x)=>sum+x.quantity,0),ownedTypes:items.filter(x=>x.quantity>0).length};
};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml','.jpg':'image/jpeg'};
const send=(res,status,data,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(type==='application/json'?JSON.stringify(data):data);};
let loseNextOpenResponse=false;
const server=http.createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const shell=pathname==='/'?'index.html':pathname.slice(1);
  if(legacy&&legacy[shell]&&(releasePhase==='legacy'||(shell==='index.html'&&legacyShellOnce))){
    if(releasePhase!=='legacy')legacyShellOnce=false;
    return send(res,200,legacy[shell],mime[path.extname(shell)]);
  }
  if(pathname==='/js/pingdu-thanks-gift-v1.js'&&failNextGiftModule){failNextGiftModule=false;return send(res,503,'temporary resource failure','text/javascript');}
  if(pathname==='/qa/pingdu/admin'){
    const dialog=read('admin/index.html').match(/<dialog[^>]*id="userDialog"[\s\S]*?<\/dialog>/)?.[0];assert.ok(dialog);
    return send(res,200,`<!doctype html><html lang="ko"><head><base href="/admin/"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="admin-v945.css"><style>dialog{max-width:calc(100vw - 24px)}</style></head><body>${dialog}<script>
      const $=s=>document.querySelector(s),state={admin:{id:9},users:[{id:1,nickname:'감사 선물 검수',coin:123}]},esc=s=>String(s??'').replaceAll('<','&lt;'),fmt=s=>s||'-';
      const api=async(p,o={})=>{const r=await fetch('/api/'+p,o),d=await r.json();if(!r.ok)throw Error(d.error);return d};
      const loadBlackMiracleInventoryAudit=()=>{},loadUsers=async()=>{};
      ${admin.slice(admin.indexOf('function openUser('),admin.indexOf('function prisonAdminTime'))}
      openUser(1);</script></body></html>`,'text/html; charset=utf-8');
  }
  if(pathname==='/api/admin/users/action'||pathname==='/api/inventory/use'){
    let body='';for await(const chunk of req)body+=chunk;
    const request=new Request('http://localhost'+pathname,{method:'POST',body}),payload=JSON.parse(body);
    const deps={env:f.env,request,readBody:r=>r.json(),json:(b,status=200)=>Response.json(b,{status}),requirePermission:async()=>({id:9,role:'OWNER'}),authenticate:async()=>({id:1}),isForgeTicketGrant:()=>false,grantPingduThanksGift,openPingduThanksGift,withJointUserMutationLock:async(_env,id,lockPath,work)=>{locks.push({id,path:lockPath});return work();}};
    const response=await (pathname.includes('admin/')?adminRoute(deps):openRoute(deps));
    if(pathname==='/api/inventory/use'){
      requests.push(payload);
      if(loseNextOpenResponse&&response.ok){loseNextOpenResponse=false;return send(res,503,{error:'검수용 개봉 응답 유실'});}
    }
    return send(res,response.status,await response.json());
  }
  if(pathname==='/api/inventory')return send(res,200,await inventory());
  if(pathname==='/api/me')return send(res,200,{user:await profile()});
  if(pathname.startsWith('/api/')){
    const endpoint=pathname.slice(5),data={
      'service/status':{maintenance:{active:false}},'me/summary':{user:await profile(),prison:{incarcerated:false}},
      cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:false}},
      'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:true},alchemyFeature:{visible:false}},
      'live-operations':{items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},
      'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]}
    }[endpoint]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
    return send(res,200,data);
  }
  const file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(res,404,{});
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}catch(error){send(res,500,{error:error.message});}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],diagnostics=[];
const ready=page=>page.locator('#inventoryVault[aria-busy="false"]').waitFor({timeout:15000});
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    releasePhase=legacy?'legacy':'current';
    const page=await browser.newPage({viewport,serviceWorkers:'allow'}),errors=[],confirmed=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{confirmed.push(d.message());await d.accept();});
    page.on('pageerror',e=>diagnostics.push({kind:'pageerror',message:e.message}));
    page.on('console',message=>{if(message.type()==='error')diagnostics.push({kind:'console',message:message.text()});});
    await page.addInitScript(user=>{
      localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-gift-qa');
      localStorage.setItem('cnine_bgm_enabled','0');localStorage.setItem('cnine_battle_sound','OFF');
      HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
    },user);
    await page.goto(base+'/qa/pingdu/admin',{waitUntil:'domcontentloaded'});
    await page.locator('#inventoryItemCode').selectOption(gift.code);await page.locator('#inventoryItemReason').fill('감사 선물 격리 검수');
    await page.locator('#inventoryGrantBlock').screenshot({path:path.join(out,'cms-'+viewport.width+'.png')});
    await page.locator('#inventoryGrantBtn').click();await page.waitForFunction(()=>!document.getElementById('userDialog').open);
    assert.equal(await f.quantity(),1);for(const word of ['핑두의 감사 선물','3,000억','500만','미스틱 에너지 1,000개','리페어쿠폰 1개'])assert.ok(confirmed[0].includes(word));
    const before={coin:(await f.one('SELECT coin FROM users WHERE id=1')).coin,stars:await f.quantity('MASTER_STAR'),energy:await f.quantity('STARLIGHT_ARMOR_CORE'),coupons:await f.quantity('PINGDU_REPAIR_COUPON')};
    await page.goto(base+'/?screen=inventory',{waitUntil:'domcontentloaded'});await ready(page);
    const chooseAndUse=async()=>{
      await page.locator('[data-inventory-select="'+gift.code+'"]').click();
      const detail=viewport.width<700?'#inventoryDetailDialog':'#inventoryDetail';
      await page.locator(detail+' [data-inventory-use="'+gift.code+'"]').click();
    };
    let legacyErrorReproduced=false,oldShellRecovered=false,failedLoadRecovered=false;
    if(legacy){
      await page.evaluate(async()=>{await navigator.serviceWorker.register('/service-worker.js',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;});
      await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
      await chooseAndUse();assert.equal(confirmed.at(-1),'이 아이템의 사용 화면을 찾을 수 없습니다.');
      assert.equal(await f.quantity(),1);legacyErrorReproduced=true;
      releasePhase='current';legacyShellOnce=true;failNextGiftModule=true;
      await page.reload({waitUntil:'domcontentloaded'});
      await page.getByRole('button',{name:/인벤토리/}).first().click();await ready(page);
      assert.equal(await page.evaluate(()=>typeof window.PingduThanksGiftV1),'undefined','The legacy shell contains no eager gift module');
      const priorAlerts=confirmed.length,priorRequests=requests.length;
      const loadFailure=page.waitForEvent('dialog',{predicate:dialog=>dialog.message().includes('감사 선물 화면을 불러오지 못했습니다.')});
      await chooseAndUse();await loadFailure;assert.equal(confirmed.length,priorAlerts+1);
      assert.equal(confirmed.at(-1),'감사 선물 화면을 불러오지 못했습니다. 다시 눌러 주세요.');
      assert.equal(requests.length,priorRequests);assert.equal(await f.quantity(),1);
      failedLoadRecovered=true;oldShellRecovered=true;
    }
    assert.equal(await page.locator('#modal').isVisible(),false);
    await chooseAndUse();
    const panel=page.locator('.pingdu-thanks-gift-panel');await panel.locator('img').evaluate(img=>img.decode());await page.evaluate(()=>document.fonts.ready);
    assert.equal(await f.quantity(),1,'Preview cannot consume a box');
    assert.ok((await panel.innerText()).includes('3,000'));assert.ok((await panel.innerText()).includes('500'));
    const styles=await panel.evaluate(el=>({background:getComputedStyle(el).backgroundColor,button:getComputedStyle(el.querySelector('.pingdu-thanks-gift-confirm')).backgroundColor,closeWidth:el.querySelector('.pingdu-thanks-gift-close').getBoundingClientRect().width,overflow:el.scrollWidth-el.clientWidth}));
    assert.equal(styles.background,'rgb(17, 24, 40)');assert.equal(styles.button,'rgb(200, 255, 107)');assert.ok(styles.closeWidth>=44);assert.ok(styles.overflow<=1);
    await panel.screenshot({path:path.join(out,'open-'+viewport.width+'.png')});
    const requestStart=requests.length;
    if(viewport.width<700)loseNextOpenResponse=true;
    await page.locator('.pingdu-thanks-gift-confirm').click();
    if(viewport.width<700){
      await page.getByRole('button',{name:'개봉 결과 다시 확인'}).waitFor();assert.equal(await f.quantity(),0);
      await page.locator('.pingdu-thanks-gift-close').click();await page.goto(base+'/?screen=inventory',{waitUntil:'domcontentloaded'});await ready(page);
      assert.equal(await page.locator('#modal').isVisible(),false);await page.locator('[data-inventory-recover="'+gift.code+'"]').click();
      await page.getByRole('button',{name:'이전 개봉 결과 확인'}).click();
    }
    await page.waitForFunction(()=>document.querySelector('.pingdu-thanks-gift-confirm')?.textContent==='인벤토리로 돌아가기'&&!document.querySelector('.pingdu-thanks-gift-confirm').disabled);
    assert.equal(await f.quantity(),0);assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,before.coin+gift.coin);
    assert.equal(await f.quantity('MASTER_STAR'),before.stars+gift.masterStar);assert.equal(await f.quantity('STARLIGHT_ARMOR_CORE'),before.energy+gift.mysticEnergy);assert.equal(await f.quantity('PINGDU_REPAIR_COUPON'),before.coupons+1);
    const used=requests.slice(requestStart);assert.equal(used.length,viewport.width<700?2:1);assert.ok(used.every(x=>x.itemCode===gift.code&&x.count===1&&x.requestId===used[0].requestId));
    await panel.screenshot({path:path.join(out,'result-'+viewport.width+'.png')});
    await page.getByRole('button',{name:'인벤토리로 돌아가기'}).click();await ready(page);
    assert.equal(await page.locator('#inventoryGiftRecovery').isVisible(),false);assert.deepEqual(errors,[]);
    checks.push({width:viewport.width,height:viewport.height,legacyErrorReproduced,oldShellRecovered,failedLoadRecovered,installedServiceWorker:true,cmsGrant:true,allFourRewards:true,previewConsumesNothing:true,navyLimeMeta:true,closeTouchSize:styles.closeWidth,horizontalOverflow:styles.overflow,recoveredResponse:viewport.width<700,duplicateRewards:0,errors});await page.close();
  }
  fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({ok:true,checks,locks},null,2));console.log(JSON.stringify({ok:true,out,checks}));
}catch(error){
  const page=browser.contexts().flatMap(context=>context.pages()).at(-1);
  const state=page?await page.evaluate(()=>({url:location.href,body:document.body.innerText.slice(0,2500),appClass:document.body.className,inventory:document.querySelector('#inventoryVault')?.outerHTML.slice(0,500)})):null;
  fs.writeFileSync(path.join(out,'failure.txt'),String(error.stack));fs.writeFileSync(path.join(out,'failure-state.json'),JSON.stringify({diagnostics,state},null,2));
  if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;
}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));await f.pg.close();}

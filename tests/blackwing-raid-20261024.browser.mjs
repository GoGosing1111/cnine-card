// Loopback UI regression with synthetic accounts; never calls production APIs.
// Optional production static files are read through the local server only.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blackwingLiveFixture } from './helpers/blackwing-live-fixture.mjs';


import { REVIEW_DECK } from '../preview/lich-king-raid-v1/fixture.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const out=process.env.BLACKWING_QA_DIR;if(!out)throw Error('BLACKWING_QA_DIR is required outside the release tree');fs.mkdirSync(out,{recursive:true});
const staticOrigin=process.env.BLACKWING_STATIC_ORIGIN;
if(staticOrigin)assert.equal(new URL(staticOrigin).origin,'https://cnine-card.pages.dev');
const lich = await blackwingLiveFixture();
await lich.configure(process.env.BLACKWING_UI_ONLY==='1'?{enrageSeconds:300,mechanicTimePercent:100}:{enrageSeconds:600,mechanicTimePercent:200});
for(const [i,id] of [1,2,3,6,7,8].entries())lich.setDeck(id,{cards:[...REVIEW_DECK.slice(i%5),...REVIEW_DECK.slice(0,i%5)]});
const user = {id:1,serverUserId:1,nickname:'로컬 정벌 검수',role:'OWNER',coin:123456789,pigCoin:0,cardShards:12000,
  masterStars:2000,owned:REVIEW_DECK.map(c=>c.id),quantities:Object.fromEntries(REVIEW_DECK.map(c=>[c.id,1])),
  breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const calls = [];
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const json = (data,status=200) => {res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  try {
    if (url.pathname.startsWith('/api/')) {
      const key = url.pathname.slice(5), chunks=[]; for await(const chunk of req) chunks.push(chunk);
      calls.push(key);
      if (key.startsWith('raid/blackwing/') || key.startsWith('admin/raid/blackwing/')) {
        const body = Buffer.concat(chunks).toString();
        const request = new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
        const response=await lich.handle(request);return json(await response.json(),response.status);
      }
      return json({
        'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:REVIEW_DECK},
        packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},
        'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},
        'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},
        'raid/status':{current:null,settings:{enabled:true},participants:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]},
        'admin/dashboard':{role:'OWNER',admin:user,stats:{}},'admin/raid':{settings:{},bosses:[],current:null},
        'admin/raid/madara/settings':{settings:{mode:'OFF',testUserIds:[],weeklyRewardLimit:5},testUsers:[]},
        'admin/raid/lich/settings':{settings:{mode:'OFF',testUserIds:[],weeklyRewardLimit:7},testUsers:[]},
        'admin/mercenaries/opening':{mode:'OFF',rankCounts:{},ready:false},
      }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
    }
    if(staticOrigin){
      const response=await fetch(new URL(url.pathname+url.search,staticOrigin));
      res.writeHead(response.status,{'content-type':response.headers.get('content-type')||'application/octet-stream','cache-control':'no-store'});
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+path.sep)) {res.writeHead(403);return res.end();}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  } catch(error) {json({error:error.message},500);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});

const reports=[];
try {
 for(const [width,height] of [[1440,1000],[390,844]]) {
  const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
  await context.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-qa-1');localStorage.setItem('cnine_admin_token','local-qa-1');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('Blackwing'))console.log(m.text());});page.on('dialog',d=>d.accept());page.setDefaultTimeout(30000);
  try {
   await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));await page.locator('[data-pve-mode="raid"]').click();
   await page.locator('#blackwingRaidTab').waitFor({state:'visible'});await page.locator('#blackwingRaidTab').click();await page.locator('#pveBlackwingRaidView [data-create]').waitFor();
   await page.locator('#pveBlackwingRaidView [data-config]').filter({hasText:'TEST'}).waitFor();
   await page.locator('[data-role][value="GUARD"]').check();assert.match(await page.locator('[data-create]').innerText(),/수호/);
   await page.locator('[data-role][value="BREAKER"]').check();assert.match(await page.locator('[data-create]').innerText(),/파쇄/);
   await page.waitForFunction(()=>{const i=document.querySelector('.bw-boss-art');return i?.complete&&i.naturalWidth>0;});
   const lobbyLayout=await page.evaluate(()=>({overflow:document.querySelector('.bw-root').scrollWidth>document.querySelector('.bw-root').clientWidth,tabImage:getComputedStyle(document.querySelector('#blackwingRaidTab')).backgroundImage,tabFrame:getComputedStyle(document.querySelector('#blackwingRaidTab')).borderImageSource,buttonImage:getComputedStyle(document.querySelector('[data-create]')).backgroundImage,buttonFrame:getComputedStyle(document.querySelector('[data-create]')).borderImageSource,panelFrame:getComputedStyle(document.querySelector('.bw-preparation')).borderImageSource,buttonHeight:document.querySelector('[data-create]').getBoundingClientRect().height,bossPosition:getComputedStyle(document.querySelector('.bw-boss-art')).objectPosition}));
   assert.equal(lobbyLayout.overflow,false);assert.ok(!/blackwing.*button/.test(lobbyLayout.tabImage));assert.equal(lobbyLayout.buttonImage,'none');assert.ok(lobbyLayout.buttonHeight>=44);assert.ok(lobbyLayout.bossPosition.endsWith('0%'));
   assert.match(lobbyLayout.buttonFrame,/mercenary-codex\/command-20261021\/action-user-approved.webp/);assert.match(lobbyLayout.panelFrame,/mercenary-codex\/command-20261021\/panel-v3.webp/);assert.match(lobbyLayout.tabFrame,/action-user-approved.webp/);
   const tabStyles=await page.locator('.raid-content-tabs > button:visible').evaluateAll(tabs=>tabs.map(el=>({active:el.classList.contains('active'),frame:getComputedStyle(el).borderImageSource,labels:[...el.querySelectorAll('small,b')].map(label=>({color:getComputedStyle(label).color,fill:getComputedStyle(label).webkitTextFillColor}))})));
   for(const tab of tabStyles){assert.match(tab.frame,tab.active?/action-user-approved.webp/:/panel-v3.webp/);if(tab.active)for(const label of tab.labels){assert.equal(label.color,'rgb(24, 36, 10)');assert.equal(label.fill,'rgb(24, 36, 10)');}}
   await page.locator('.bw-heading').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`lobby-${width}.png`)});
   assert.ok(await page.locator('.bw-boss-art').isVisible());
   await page.locator('[data-create]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`roles-${width}.png`)});
   await page.locator('.bw-guide').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`guide-${width}.png`)});
   assert.equal(await page.locator('#pveRaidView').isVisible(),false);assert.equal(await page.locator('.bw-combat').isVisible(),false);
   await page.locator('#pveBlackwingRaidView [data-create]').click();await page.waitForFunction(()=>BlackwingRaidDiagnostics().roomId);const roomId=await page.evaluate(()=>BlackwingRaidDiagnostics().roomId);
   for(const[id,role]of [[2,'BREAKER'],[3,'GUARD'],[6,'GUARD'],[7,'SEALER'],[8,'SEALER']]){assert.equal((await lich.command('join',{roomId,role},id)).status,200);assert.equal((await lich.command('ready',{roomId,ready:true},id)).status,200);}
   await page.locator('#pveBlackwingRaidView [data-ready]').click();await page.locator('#pveBlackwingRaidView [data-start]:not([disabled])').waitFor();
   assert.equal(await page.locator('.bw-member img.bw-face').count(),6);assert.equal(await page.locator('.bw-lineup img.bw-face').count(),5);
   await page.waitForFunction(()=>[...document.querySelectorAll('.bw-member img.bw-face,.bw-lineup img.bw-face')].every(i=>i.complete&&i.naturalWidth>0));
   await page.locator('.bw-assembly').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`party-${width}.png`)});
   if(process.env.BLACKWING_UI_ONLY==='1'){
    await page.locator('[data-leave]').click();await page.locator('[data-create]').waitFor({state:'visible'});
    await page.locator('[data-role][value="BREAKER"]').check();await page.locator('[data-refresh]').click();
    await page.locator('[data-join]:not([disabled])').waitFor();
    await page.locator('[data-role][value="GUARD"]').check();assert.ok(await page.locator('[data-join]').isDisabled(),'a filled role must not offer an enabled join button');
    await page.locator('[data-role][value="BREAKER"]').check();await page.locator('[data-join]').click();
    await page.waitForFunction(()=>BlackwingRaidDiagnostics().state?.status==='LOBBY');
    assert.equal(await page.locator('.bw-member img').count(),6);
    await page.locator('[data-leave]').click();await page.locator('[data-create]').waitFor({state:'visible'});
    for(const id of [2,3,6,7,8])await lich.command('leave',{roomId},id);
    assert.deepEqual(errors,[]);reports.push({width,height,lobbyLayout,uiOnly:true,errors});continue;
   }
   await page.locator('#pveBlackwingRaidView [data-start]').click();
   await page.waitForFunction(()=>BlackwingRaidDiagnostics().battle.ready,{},{timeout:90000});await page.locator('.bw-battle-mount canvas').waitFor();
   await page.waitForTimeout(700);await page.screenshot({path:path.join(out,`battle-${width}.png`),fullPage:true});
   const geometry=await page.locator('.bw-combat').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,overflow:el.scrollWidth>el.clientWidth,body:el.parentElement===document.body,viewport:{w:innerWidth,h:innerHeight},inert:document.querySelector('#app').inert};});
   assert.equal(geometry.body,true);assert.equal(geometry.w,width);assert.equal(geometry.h,height);assert.equal(geometry.overflow,false);assert.equal(geometry.inert,true);assert.equal(await page.locator('.bw-battle-mount canvas').count(),1);
   for(let step=0;step<2;step++){
    const view=(await lich.call('state?roomId='+roomId)).body.state,o=view.challenge.oaths.BREAKER,id=o.order[o.progress],target=o.runes[o.progress];
    if(id==='1'){await page.locator('.bw-combat [data-action="RUNE"][data-target="'+target+'"]:not([disabled])').click();await page.waitForFunction(step=>BlackwingRaidDiagnostics().state.challenge.oaths.BREAKER.progress>step,step);}
    else{const other=(await lich.call('state?roomId='+roomId,{user:Number(id)})).body.state;await lich.command('action',{roomId,action:'RUNE',target:String(target),token:other.challenge.tokens.RUNE},Number(id));}
   }
   await page.locator('.bw-combat [data-action="CHARGE"]:not([disabled])').click();await page.waitForFunction(()=>BlackwingRaidDiagnostics().state.challenge.debt.packets===1);
   for(const effect of ['fire','slash']){const row=await lich.one('SELECT state_json FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId),r=JSON.parse(row.state_json);r.presentation={id:'qa-'+effect+'-'+width,key:'QA',title:'모르드레인 전투 리소스 검수',line:'',effect,at:Date.now()};r.revision++;await lich.run('UPDATE raid_blackwing_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(r),roomId);await page.waitForFunction(id=>BlackwingRaidDiagnostics().state.presentation.id===id,r.presentation.id);await page.waitForFunction(effect=>{const p=BlackwingRaidDiagnostics().battle.presentation;return p?.effect===effect&&p.fxVisible&&p.progress>.4&&p.progress<.85;},effect);const facing=await page.evaluate(()=>BlackwingRaidDiagnostics().battle.presentation);assert.equal(facing.bodyFacing,-1,'authored boss attack/cast faces the left-side allies');assert.equal(facing.idleFacing,-1,'idle and attack keep the same facing');assert.equal(facing.hudFacing,1,'boss health/name labels remain readable');await page.screenshot({path:path.join(out,`skill-${effect}-${width}.png`)});await page.waitForTimeout(1800);}
   const ready=await page.evaluate(()=>({state:BlackwingRaidDiagnostics().state.status,battle:BlackwingRaidDiagnostics().battle}));
   await page.locator('.bw-combat [data-exit]').click();await page.locator('#pveBlackwingRaidView [data-create]').waitFor();assert.equal(await page.locator('.bw-combat').isVisible(),false);assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);
   await page.locator('[data-raid-content="world"]').click();assert.equal(await page.locator('.bw-combat').count(),0);
   await page.goto(origin+'/admin/');await page.locator('#nav [data-view="raid"]').click();const panel=page.locator('#blackwingRaidAdmin');await panel.locator('form').waitFor({state:'visible'});
   await panel.locator('[name="mode"]').selectOption('OFF');await panel.locator('[type="submit"]').click();await panel.locator('[data-status]').filter({hasText:'저장 완료 · OFF'}).waitFor();assert.equal((await lich.call('feature')).body.visible,false);
   await panel.locator('[name="mode"]').selectOption('TEST');await panel.locator('[data-query]').fill('4');await panel.locator('[data-search]').click();await panel.locator('[data-add="4"]').click();await panel.locator('[type="submit"]').click();await panel.locator('[data-status]').filter({hasText:'저장 완료 · TEST'}).waitFor();assert.equal((await lich.call('feature',{user:4})).body.visible,true);
   await panel.locator('[data-remove="4"]').click();await panel.locator('[type="submit"]').click();await panel.locator('[data-status]').filter({hasText:'저장 완료'}).waitFor();await panel.scrollIntoViewIfNeeded();await panel.screenshot({path:path.join(out,`cms-${width}.png`)});
   assert.deepEqual(errors,[]);reports.push({width,height,geometry,ready,errors});
  }catch(e){await page.screenshot({path:path.join(out,`failure-${width}.png`),fullPage:true});fs.writeFileSync(path.join(out,`failure-${width}.json`),JSON.stringify({error:e.stack,errors,diagnostics:await page.evaluate(()=>globalThis.BlackwingRaidDiagnostics?.()),body:await page.locator('body').innerText()},null,2));throw e;}finally{await context.close();}
 }
 fs.writeFileSync(path.join(out,process.env.BLACKWING_UI_ONLY==='1'?'browser-ui.json':'browser.json'),JSON.stringify({at:new Date().toISOString(),reports},null,2));console.log(JSON.stringify(reports.map(r=>({width:r.width,height:r.height,geometry:r.geometry,canvases:r.ready?.battle.canvases,ready:r.ready?.battle.ready,errors:r.errors,uiOnly:r.uiOnly}))));
}finally{await browser.close();server.close();await lich.close();}

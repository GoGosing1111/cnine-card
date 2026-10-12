// Loopback-only UI regression with synthetic accounts; never calls production APIs.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { madaraLiveFixture } from './helpers/madara-live-fixture.mjs';


import { REVIEW_DECK } from '../preview/lich-king-raid-v1/fixture.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const out=process.env.MADARA_QA_DIR;if(!out)throw Error('MADARA_QA_DIR is required outside the release tree');fs.mkdirSync(out,{recursive:true});
const lich = await madaraLiveFixture();
await lich.configure();
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
      if (key.startsWith('raid/madara/') || key.startsWith('admin/raid/madara/')) {
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
        'admin/raid/lich/settings':{settings:{mode:'OFF',testUserIds:[],weeklyRewardLimit:7},testUsers:[]},
        'admin/mercenaries/opening':{mode:'OFF',rankCounts:{},ready:false},
      }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
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
try{
 for(const [width,height] of process.env.MADARA_CMS_ONLY?[]:[[1440,1000],[390,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
  await context.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-qa-1');localStorage.setItem('cnine_admin_token','local-qa-1');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('dialog',d=>d.accept());page.setDefaultTimeout(30000);
  const fullscreen = async () => {
    const geometry = await page.locator('#madara-live-app').evaluate(surface => {
      const r=surface.getBoundingClientRect();
      return {body:surface.parentElement===document.body,position:getComputedStyle(surface).position,x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight,inert:document.querySelector('#app').inert,locked:document.documentElement.style.overflow==='hidden',horizontalOverflow:surface.scrollWidth>surface.clientWidth};
    });
    assert.equal(geometry.body,true,'Combat must leave the nested raid hub and mount directly under body');
    assert.equal(geometry.position,'fixed');assert.equal(geometry.x,0);assert.equal(geometry.y,0);
    assert.equal(geometry.width,geometry.viewportWidth);assert.equal(geometry.height,geometry.viewportHeight);
    assert.equal(geometry.inert,true);assert.equal(geometry.locked,true);assert.equal(geometry.horizontalOverflow,false);
    assert.equal(await page.locator('#madara-battleMount canvas').count(),1);
  };
  const restored = async () => {
    assert.equal(await page.locator('#pveMadaraRaidView > #madara-live-app').count(),1);
    assert.equal(await page.locator('body > #madara-live-app').count(),0);
    assert.equal(await page.locator('#app').evaluate(app=>app.inert),false);
    assert.notEqual(await page.evaluate(()=>document.documentElement.style.overflow),'hidden');
  };
  await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
  await page.locator('[data-pve-mode="raid"]').click();await page.locator('#madaraRaidTab').waitFor({state:'visible'});await page.locator('#madaraRaidTab').click();
  await page.locator('#madara-createButton:not([disabled])').waitFor();assert.equal(await page.locator('#pveRaidView').isVisible(),false);assert.equal(page.url(),origin+'/');
  assert.match(await page.locator('#pveMadaraRaidView .mr-development').innerText(),/TEST/);assert.equal(await page.locator('#madara-showcaseButton').isVisible(),false);
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(out,`entry-${width}.png`),fullPage:true});
  await page.locator('#madara-createButton').click();await page.locator('#madara-entryDialog[open]').waitFor();assert.match(await page.locator('#madara-entryDialog h2').innerText(),/차감 없이/);
  await page.locator('#madara-confirmEntry').click();await page.locator('#madara-assembly').waitFor({state:'visible'});const roomId=(await page.locator('#madara-roomCode').innerText()).trim();
  for(const [uid,role] of [[2,'ASSAULT'],[3,'RESCUE']])assert.equal((await lich.command('join',{roomId,role},uid)).status,200);
  let kickedContext,kickedPage;
  if(width===1440){
    kickedContext=await browser.newContext({viewport:{width:1100,height:850},serviceWorkers:'block'});
    await kickedContext.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify({...user,id:3,serverUserId:3,role:'USER'}));localStorage.setItem('cnine_card_api_token','local-qa-3');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
    await kickedContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    kickedPage=await kickedContext.newPage();kickedPage.on('pageerror',e=>errors.push(e.stack));
    await kickedPage.goto(origin+'/');await kickedPage.waitForFunction(()=>typeof renderShell==='function');await kickedPage.evaluate(()=>renderShell('battle'));
    await kickedPage.locator('[data-pve-mode="raid"]').click();await kickedPage.locator('#madaraRaidTab').click();await kickedPage.locator('#madara-assembly').waitFor({state:'visible'});
  }
  await page.locator('#madara-refreshRooms').click();await page.waitForFunction(()=>document.querySelectorAll('#madara-lobbyMembers li').length===3);
  await page.locator('#madara-lobbyMembers [data-kick="3"]').click();await page.locator('#madara-confirmKick').click();await page.waitForFunction(()=>document.querySelectorAll('#madara-lobbyMembers li').length===2);
  assert.equal((await lich.command('join',{roomId,role:'RESCUE'},3)).status,403);assert.equal((await lich.command('join',{roomId,role:'RESCUE'},6)).status,200);
  if(kickedPage){await kickedPage.locator('#madara-createButton').waitFor({state:'visible'});await kickedPage.screenshot({path:path.join(out,'kicked-participant.png')});await kickedContext.close();}
  for(const uid of [2,6])assert.equal((await lich.command('ready',{roomId,ready:true},uid)).status,200);
  await page.screenshot({path:path.join(out,`lobby-${width}.png`),fullPage:true});
  await page.locator('#madara-readyButton').click();await page.locator('#madara-startButton:not([disabled])').waitFor();await page.locator('#madara-startButton').click();
  await page.locator('#madara-battleMount canvas').waitFor({timeout:90000});await page.locator('#madara-taskList .mr-task').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('#madara-battleMount .battle-v3-header strong')?.textContent==='마다라 레이드',{},{timeout:90000});
  await page.waitForFunction(()=>{const img=document.querySelector('#madara-mechanicArt');return img.complete&&img.naturalWidth>0;});
  await page.locator('#madara-battleMount').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`battle-${width}.png`),fullPage:true});assert.equal(await page.locator('#madara-battleMount canvas').count(),1);
  await fullscreen();
  await page.locator('#madara-taskList').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`actions-${width}.png`),fullPage:true});
  const actionCount=calls.filter(k=>k==='raid/madara/action').length;
  await page.locator('#madara-taskList button:not([disabled])').first().click();
  await page.waitForTimeout(100);assert.equal(calls.filter(k=>k==='raid/madara/action').length,actionCount+1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#madara-guideButton').click();await page.locator('#madara-closeGuide').click();
  await page.keyboard.press('Escape');await page.locator('#madara-leaveDialog[open]').waitFor();await page.locator('#madara-cancelLeave').click();await fullscreen();
  if(width===1440){
    await page.reload();await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
    await page.locator('[data-pve-mode="raid"]').click();
    await page.locator('#madara-battleMount canvas').waitFor();await fullscreen();
  }
  // Navigation elsewhere can be triggered by the shell; its controls must be inert during combat.
  if(width===1440)await page.evaluate(()=>renderShell('home'));
  else await page.locator('[data-raid-content="world"]').evaluate(button=>button.click());
  assert.equal(await page.locator('body > #madara-live-app').count(),0);assert.equal(await page.locator('#app').evaluate(app=>app.inert),false);
  const count=calls.filter(k=>k==='raid/madara/state').length;await page.waitForTimeout(2200);assert.equal(calls.filter(k=>k==='raid/madara/state').length,count);
  if(width===1440){await page.evaluate(()=>renderShell('battle'));await page.locator('[data-pve-mode="raid"]').click();}
  if(width!==1440)await page.locator('#madaraRaidTab').click();
  await page.locator('#madara-combat').waitFor({state:'visible'});assert.equal(await page.locator('#madara-battleMount canvas').count()<=1,true);
  await page.locator('#madara-battleMount canvas').waitFor();await fullscreen();
  if(width===1440){
    assert.equal((await lich.command('leave',{roomId},2)).status,200);
    await page.locator('#madara-resultDialog[open]').waitFor();await fullscreen();await page.locator('#madara-retryButton').click();
  }else{
    await page.locator('#madara-leaveButton').click();await page.locator('#madara-confirmLeave').click();
  }
  await page.locator('#madara-createButton').waitFor({state:'visible'});await restored();
  await page.screenshot({path:path.join(out,`returned-${width}.png`),fullPage:true});
  assert.deepEqual(errors,[]);reports.push({width,errors,lobbyInline:true,combatFullscreen:true,recovery:true,kick:true,pollingStopped:true,returnRestored:true});await context.close();
 }
 for(const [width,height] of process.env.MADARA_GAME_ONLY?[]:[[1440,1000],[390,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
  await context.addInitScript(()=>localStorage.setItem('cnine_admin_token','local-qa-1'));
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('dialog',d=>d.accept());
  await page.route('**/api/admin/raid/madara/settings',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'요청을 완료하지 못했습니다. 같은 요청으로 다시 시도하세요.',code:'MADARA_RETRYABLE'})}),{times:1});
  await page.goto(origin+'/admin/');await page.locator('#nav [data-view="raid"]').click();
  const panel=page.locator('#madaraRaidAdmin');await panel.locator('[data-retry]').waitFor({state:'visible'});
  assert.equal(await panel.locator('form').isVisible(),false);assert.match(await panel.locator('[data-state]').innerText(),/불러오기 실패/);
  await panel.locator('header').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`cms-error-${width}.png`)});
  await panel.locator('[data-retry]').click();await panel.locator('form').waitFor({state:'visible'});
  assert.equal(await panel.locator('[data-load-recovery]').isVisible(),false);
  await panel.locator('[name="mode"][value="ON"]').check();await panel.locator('[name="bossCombatPower"]').fill('880000');
  await panel.locator('[name="enrageSeconds"]').fill('480');await panel.locator('[name="coinReward"]').fill('500000000000');
  await panel.locator('[data-query]').fill('4');await panel.locator('[data-search]').click();await panel.locator('[data-add="4"]').click();
  await panel.locator('[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#madaraRaidAdmin [data-status]').textContent.startsWith('저장 완료 · ON'));
  assert.equal((await lich.call('feature',{user:4})).body.visible,true);
  await panel.locator('[name="mode"][value="OFF"]').check();await panel.locator('[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#madaraRaidAdmin [data-status]').textContent.startsWith('저장 완료 · OFF'));
  assert.equal((await lich.call('feature')).body.visible,false);
  await panel.locator('[name="mode"][value="TEST"]').check();await panel.locator('[data-remove="4"]').click();await panel.locator('[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#madaraRaidAdmin [data-status]').textContent.startsWith('저장 완료 · TEST'));
  await page.reload();await page.locator('#nav [data-view="raid"]').click();await panel.locator('form').waitFor({state:'visible'});
  assert.equal(await panel.locator('[name="mode"][value="TEST"]').isChecked(),true);assert.equal(await panel.locator('[name="bossCombatPower"]').inputValue(),'880000');
  assert.equal(await panel.locator('[name="enrageSeconds"]').inputValue(),'480');assert.equal(await panel.locator('[name="coinReward"]').inputValue(),'500000000000');
  assert.equal((await lich.call('feature',{user:4})).body.visible,false);
  await panel.locator('header').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`cms-${width}.png`)});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);reports.push({width,cms:true,initialFailureRecovery:true,modes:true,persistence:true,testerSearch:true,errors});await context.close();
 }
}catch(error){for(const context of browser.contexts())for(const page of context.pages()){console.log('PAGE',await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});}throw error;}
finally{await browser.close();await new Promise(r=>server.close(r));await lich.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({out,reports}));}

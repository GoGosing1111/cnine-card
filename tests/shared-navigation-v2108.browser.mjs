// Real index.html, app.js, route adapter, native operations and optional tour.
// All account/API traffic is intercepted; this never touches a real account.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.LOBBY_QA_ORIGIN||'http://127.0.0.1:4197';
const out=process.env.LOBBY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'adventure-lobby-qa-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
const user={id:4242,serverUserId:4242,nickname:'검수 플레이어의 긴 닉네임',role:'USER',coin:1234567890,cardShards:123456,masterStars:2300,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const avatar={name:'서리의 지휘관',lobbyImage:'/assets/ui/avatars-v1/lobby-v1/avatar-f01-azure-frost-strategist-lobby-v1-640.webp'};
async function launch(viewport){
 const page=await browser.newPage({viewport,deviceScaleFactor:1,serviceWorkers:'block'}),writes=[],requests=[];
 page.on('pageerror',e=>errors.push(e.stack));
 await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','lobby-local-qa');},user);
 await page.route('**/api/**',r=>{
  const key=new URL(r.request().url()).pathname.slice(5);requests.push(key);
  if(!['GET','HEAD'].includes(r.request().method()))writes.push({key,method:r.request().method()});
  const data={
   'service/status':{maintenance:{active:false}},
   'me/summary':{user,prison:{incarcerated:false}},me:{user},
   cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},
   'chief/status':{chief:{active:true,ordinal:3,nickname:'오늘의 족장',startsAt:new Date(Date.now()-172800000).toISOString(),remainingMs:86400000,viewerAvatar:avatar}},
   'shell/summary':{inventory:{},messages:{unread:3},avatarFeature:{visible:true},alchemyFeature:{visible:false}},
   'live-operations':{serverNow:new Date().toISOString(),items:[{kind:'AUCTION',title:'신화 장비 경매 진행 중',detail:'현재 최고 입찰 12억 코인',deadlineAt:new Date(Date.now()+5400000).toISOString()},{kind:'TERRITORY',phase:'FORMATION',title:'영토전 편성 접수 중',detail:'우리 진영과 함께 전선에 참여하세요.',deadlineAt:new Date(Date.now()+1800000).toISOString()}]},
   'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},
   'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]},
  }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
  return r.fulfill({json:data});
 });
 await page.goto(base+'/',{waitUntil:'domcontentloaded'});
 await page.locator('soop-adventure-lobby .stage-character').waitFor();
 await page.locator('soop-adventure-lobby #chief-name').filter({hasText:'오늘의 족장'}).waitFor();
 await page.locator('[data-live-operation-kind="AUCTION"]').waitFor();
 await page.evaluate(()=>document.fonts.ready);
 return {page,writes,requests};
}
// Native content must reach the bottom dock even when it hides the common
// heading in favor of its own header (loadout and prisoner camp).
try{
 for(const viewport of [{width:1440,height:560},{width:1024,height:768},{width:390,height:844},{width:320,height:740}]){
  const {page}=await launch(viewport),size=viewport.width+'x'+viewport.height,menu=page.locator('soop-adventure-lobby');
  for(const route of ['messages','buy','inventory','dex','battle','character','prisoncamp','clan','avatar']){
   await page.evaluate(id=>SoopketmonV21ExactShell.navigate(id),route);await page.waitForTimeout(600);
   check(await menu.count()===1,size+' '+route+' single shared navigation');
   check(!await page.locator('.header.top-hud').isVisible()&&!await page.locator('.bottom-dock').isVisible(),size+' '+route+' no legacy header or rail');
   check(await page.locator('.v21-route-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),size+' '+route+' no clipped native columns');
   const sizes=await page.evaluate(()=>{const body=document.querySelector('.v21-route-body').getBoundingClientRect(),view=document.querySelector('.screen-viewport').getBoundingClientRect(),host=document.querySelector('soop-adventure-lobby'),nav=host.shadowRoot.querySelector('.mobile-dock').getBoundingClientRect();return {body:body.toJSON(),view:view.toJSON(),dock:nav.toJSON(),background:getComputedStyle(host).backgroundColor};});
   check(Math.abs(sizes.body.bottom-sizes.view.bottom)<2,size+' '+route+' content fills the available height');
   check(sizes.body.width<=viewport.width&&sizes.body.right<=viewport.width+1,size+' '+route+' native body fits the viewport');
   check(sizes.background==='rgba(0, 0, 0, 0)',size+' '+route+' shared chrome cannot paint over native content');
   if(viewport.width<=980)check(Math.abs(sizes.view.bottom-sizes.dock.y)<2,size+' '+route+' bottom controls are outside the scrolling content');
   if(viewport.width>980){const all=await menu.locator('.all-menu').boundingBox();check(all.y>=0&&all.y+all.height<=viewport.height,size+' '+route+' all-menu never scrolls off screen');await menu.locator('.sidebar [data-category="shop"]').click();}
   else{await menu.locator('.mobile-dock [data-category="all"]').click();await menu.locator('.category-jump[data-category="shop"]').click();}
   check(await menu.locator('.menu-result').count()===5,size+' '+route+' sidebar opens only shop destinations');await page.keyboard.press('Escape');
   if(await page.locator('.v21-route-command-head [data-v21-all]').isVisible()){
    await page.locator('.v21-route-command-head [data-v21-all]').click();check(await menu.locator('#directory-title').textContent()==='전체 메뉴',size+' '+route+' native all-menu button uses the new dialog');await page.keyboard.press('Escape');
   }
   await page.screenshot({path:path.join(out,'route-'+route+'-'+size+'.png')});
  }
  await menu.locator(viewport.width>980?'.sidebar [data-home]':'.mobile-dock [data-home]').click();await menu.locator('.stage-character').waitFor();
  check(await page.locator('.v21-production-shell').getAttribute('data-route')==='home',size+' sidebar returns to actual lobby');
  // Direct links also start with the shared shell.
  await page.goto(base+'/?screen=messages',{waitUntil:'domcontentloaded'});await page.locator('.v21-production-shell[data-route="messages"] #messageList').waitFor();
  check(await page.locator('soop-adventure-lobby .topbar').isVisible(),size+' messages deep link uses new chrome');await page.close();
 }
 check(!errors.length,'no shared route JavaScript errors: '+errors.join(' | '));
 fs.writeFileSync(path.join(out,'shared-results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,out,errors}));
}finally{await browser.close();}

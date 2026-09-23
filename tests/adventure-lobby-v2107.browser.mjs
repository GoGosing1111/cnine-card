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
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740},{width:768,height:1024},{width:1440,height:560}]){
  const {page,writes,requests}=await launch(viewport),size=viewport.width+'x'+viewport.height,lobby=page.locator('soop-adventure-lobby');
  const openCategory=async category=>{
   if(await lobby.locator('#menu-dialog').evaluate(e=>e.open))await lobby.locator('#close-menu').click();
   const direct=lobby.locator((viewport.width>980?'.sidebar ':'.mobile-dock ')+`[data-category="${category}"]`);
   if(await direct.count())await direct.click();
   else{await lobby.locator((viewport.width>980?'.sidebar ':'.mobile-dock ')+'[data-category="all"]').click();await lobby.locator(`.category-jump[data-category="${category}"]`).click();}
  };
  check(await lobby.locator('dialog[open]').count()===0,size+' tutorial never opens automatically');
  check(await lobby.locator('#guide-frame').getAttribute('src')===null,size+' tutorial iframe loads only on request');
  check(await lobby.locator('main .lobby-shortcuts,main .growth-section,main .directory').count()===0,size+' main canvas contains no duplicate menu groups');
  check(await lobby.locator('.review-ribbon').count()===0,size+' live lobby has no review banner');
  check(await lobby.locator('#player-name').textContent()===user.nickname,size+' real account name');
  check(await lobby.locator('#wallet-coin').getAttribute('aria-label')==='1,234,567,890',size+' exact balance remains accessible');
  check((await lobby.locator('.stage-character').getAttribute('src')).includes(avatar.lobbyImage),size+' equipped player avatar artwork');
  check(await lobby.locator('.stage-character').evaluate(e=>e.complete&&e.naturalWidth>0),size+' avatar image loads');
  check(await page.locator('[data-live-operations-list]').count()===1,size+' native operation list has one light-DOM owner');
  check(await lobby.locator('.lobby-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),size+' live inner viewport does not overflow');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),size+' full app has no horizontal overflow');
  check(await page.locator('[slot="operations"][data-live-operations-surface="lobby-clarity"]').evaluate(e=>e.getBoundingClientRect().height<=64),size+' content status bar remains about 60px tall');
  await page.evaluate(()=>{localStorage.setItem('soop-lobby-bgm-muted-v1','1');lobbyBgm.applySettings({enabled:true,tracks:[{title:'검수',url:'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA'}]});lobbyBgm.syncRoute();});
  const bgm=page.locator('#lobbyBgmToggleV1803');await bgm.waitFor();
  const bgmBox=await bgm.boundingBox(),chiefBox=await lobby.locator('#chief-shortcut').boundingBox(),headerBox=await lobby.locator('.topbar').boundingBox();
  check(bgmBox.y>=chiefBox.y+chiefBox.height+8&&bgmBox.y>headerBox.y+headerBox.height&&bgmBox.x+bgmBox.width<=viewport.width,size+' BGM sits below chief and clear of tutorial/inbox');
  await bgm.click();check(await bgm.getAttribute('aria-pressed')==='false',size+' BGM sound toggle still works');await bgm.click();
  check(await page.evaluate(()=>localStorage.getItem('soop-lobby-bgm-muted-v1'))==='1',size+' BGM mute preference persists');
  await page.waitForTimeout(350);
  await page.screenshot({path:path.join(out,'live-'+size+'.png')});
  await lobby.locator('.operations-scene').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'live-operations-'+size+'.png')});
  const clock=page.locator('[data-live-operation-kind="AUCTION"] [data-live-operation-deadline]'),before=await clock.textContent();
  await page.waitForFunction(before=>document.querySelector('[data-live-operation-kind="AUCTION"] [data-live-operation-deadline]').textContent!==before,before);
  check(true,size+' original auction countdown continues ticking');
  await page.evaluate(()=>renderLiveOperations({items:['AUCTION','TERRITORY','SIEGE','SEAL','RAID'].map(kind=>({kind,title:kind+' 검수 콘텐츠',detail:'검수 중',deadlineAt:new Date(Date.now()+300000).toISOString()}))}));
  const row=await page.locator('[data-live-operation-kind]').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().top));
  check(row.length===5&&row.every(top=>Math.abs(top-row[0])<1),size+' all five active content kinds remain in one horizontal row');
  await page.evaluate(()=>loadLiveOperations(true));
  await openCategory('all');
  const allRoutes=await lobby.locator('.menu-result').evaluateAll(els=>els.map(e=>({route:e.dataset.route,icon:e.querySelector('svg').innerHTML})));
  const uniqueIconCount=new Set(allRoutes.map(e=>e.icon)).size;
  check(allRoutes.length>0&&new Set(allRoutes.map(e=>e.route)).size===allRoutes.length,size+' all-menu retains every visible route exactly once');
  check(uniqueIconCount===allRoutes.length,size+` all-menu entry retains its own icon (${allRoutes.length} routes / ${uniqueIconCount} icons)`);
  check(await lobby.locator('[data-route="chuseok"]').count()===0&&await lobby.locator('[data-route="alchemy"]').count()===0,size+' full directory excludes hidden features');
  await lobby.locator('#menu-search').fill('강화');
  check(await lobby.locator('.menu-result[data-route="equipmentForge"]').count()===1,size+' all-menu search still spans all categories');
  for(const category of ['inventory','pve','pvp','cards','equipment','shop','rewards','social','administration']){
   await openCategory(category);
   check(await lobby.locator('.menu-result').evaluateAll((els,category)=>els.length>0&&els.every(e=>e.dataset.menuCategory===category),category),size+' '+category+' shows only its own destinations');
   check(await lobby.locator('#category-tabs,.category-divider').count()===0,size+' '+category+' has no all-menu category list');
   check(await lobby.locator('#menu-search').inputValue()==='',size+' changing category clears earlier searches');
   if(category==='pvp')check(await lobby.locator('.menu-result').evaluateAll(els=>{const routes=els.map(e=>e.dataset.route);return ['pvp','rank','territory'].every(id=>routes.includes(id));}),size+' duel contains ranked play, ranking and territory');
   if(category==='pve')check(await lobby.locator('.menu-result[data-route="territory"],.menu-result[data-route="pvp"]').count()===0,size+' adventure excludes player battles');
   if(category==='inventory')check(await lobby.locator('.menu-result[data-route="inventory"]').count()===1,size+' inventory has its own all-menu group');
   if(category==='cards'){
    check(await lobby.locator('.menu-result[data-route="dex"],.menu-result[data-route="upgrade"],.menu-result[data-route="mercenaryDex"]').count()===3,size+' cards contains card and integrated mercenary progression');
    check(await lobby.locator('.menu-result[data-route="character"],.menu-result[data-route="equipmentForge"]').count()===0,size+' cards excludes equipment destinations');
   }
   if(category==='equipment'){
    check(await lobby.locator('.menu-result[data-route="character"],.menu-result[data-route="vehicle"],.menu-result[data-route="equipmentForge"]').count()===3,size+' equipment contains loadout, crafting and forge');
    check(await lobby.locator('.menu-result[data-route="dex"],.menu-result[data-route="mercenaryDex"]').count()===0,size+' equipment excludes card and mercenary destinations');
   }
   if(['cards','equipment'].includes(category))await page.screenshot({path:path.join(out,`live-${category}-${size}.png`)});
   if(category==='shop'){
    check(JSON.stringify(await lobby.locator('.menu-result').evaluateAll(els=>els.map(e=>e.dataset.route)))===JSON.stringify(['buy','lootShop','mineral','prediction','auction']),size+' shop contains its five destinations and excludes inventory');
    await page.screenshot({path:path.join(out,'live-shop-'+size+'.png')});
    await lobby.locator('#menu-search').fill('토벌');
    check(await lobby.locator('.menu-result').count()===0&&await lobby.locator('#empty-search').isVisible(),size+' category search cannot spill into combat');
   }
   if(category==='pve')await page.screenshot({path:path.join(out,'live-combat-'+size+'.png')});
  }
  check(await lobby.locator('#directory-title').textContent()==='행정부',size+' administration has its own directory');
  const administration=await lobby.locator('.menu-result').evaluateAll(els=>els.map(e=>e.dataset.route));
  check(['treasury','prison','prisoncamp'].every(id=>administration.includes(id)),size+' native administrative routes retained');
  await openCategory('cards');
  await lobby.locator('#menu-search').fill('강화');
  await page.evaluate(()=>{window.__lobbyBefore=document.querySelector('soop-adventure-lobby');saveUser({...loadUser(),coin:333333333});updateMessageNewBadges(7);renderShell('buy');});
  await page.waitForTimeout(250);
  check(await lobby.locator('#menu-search').inputValue()==='강화'&&await page.evaluate(()=>window.__lobbyBefore===document.querySelector('soop-adventure-lobby')),size+' account/background refresh preserves mounted search');
  check(await lobby.locator('#wallet-coin').getAttribute('aria-label')==='333,333,333',size+' account refresh updates displayed balance');
  await page.evaluate(()=>updateMessageNewBadges(7));
  check(await lobby.locator('#inbox-count').textContent()==='7',size+' native unread count reaches lobby');
  await lobby.locator('#clear-search').click();
  check(await lobby.locator('[data-route="chuseok"]').count()===0&&await lobby.locator('[data-route="alchemy"]').count()===0,size+' hidden feature routes remain hidden');
  await lobby.locator('#close-menu').click();
  await lobby.locator('#chief-shortcut').click();
  check(await page.locator('.v21-chief-dialog').isVisible(),size+' compact chief name opens original details');
  await page.locator('.v21-chief-dialog [data-v21-close]').click();
  await lobby.locator('#start-tutorial').click();
  const guide=page.frameLocator('soop-adventure-lobby #guide-frame');
  await guide.locator('.first-journey').waitFor();
  check(await lobby.locator('#guide-dialog').isVisible()&&await guide.locator('.first-journey ol li').count()===4,size+' original first proposal opens as the separate tutorial window');
  check(await lobby.locator('main .guide-steps,main .first-journey,main .welcome-strip,main .launch-copy').count()===0,size+' lobby contains no onboarding copy');
  if([390,1440].includes(viewport.width))await page.screenshot({path:path.join(out,'live-guide-'+size+'.png')});
  await guide.locator('#start-tutorial').click();
  for(let step=0;step<5;step++){
   await page.waitForTimeout(150);
   check((await guide.locator('#tutorial-progress').textContent()).includes((step+1)+' / 5'),size+' live tutorial step '+(step+1));
   const geometry=await guide.locator('body').evaluate(()=>{const s=document,a=s.querySelector('.tutorial-spotlight').getBoundingClientRect(),b=s.querySelector('.tutorial-card').getBoundingClientRect();return {fits:b.top>=0&&b.left>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1,target:a.top>=0&&a.bottom<=innerHeight+1,overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top};});
   check(geometry.fits&&geometry.target&&!geometry.overlap,size+' live spotlight/card fit at step '+(step+1));
   if(step===2){await page.evaluate(()=>window.SoopketmonV21ExactShell.enhance('home'));check(await guide.locator('#tutorial-dialog').evaluate(e=>e.open),size+' chief refresh does not dismiss tutorial');}
   if(step===2&&[390,1440].includes(viewport.width))await page.screenshot({path:path.join(out,'live-tutorial-'+size+'.png')});
   await guide.locator('#tutorial-next').click();
  }
  check(await guide.locator('dialog[open]').count()===0,size+' live guide completes');
  await lobby.locator('#close-guide').click();
  await page.locator('[data-live-operation-kind="AUCTION"]').click();
  await page.locator('.v21-production-shell[data-route="auction"] #auctionRootV1553').waitFor();
  check(!await page.locator('.v21-production-shell>.header.top-hud').isVisible()&&await lobby.locator('.topbar').isVisible(),size+' auction retains the shared header');
  check(await bgm.count()===0,size+' BGM stops and removes toggle outside lobby');
  await page.locator('.v21-route-command-head [data-v21-home]').click();
  await lobby.locator('.stage-character').waitFor();
  check(await lobby.locator('dialog[open]').count()===0,size+' returning from auction does not open guide');
  await lobby.locator(viewport.width>980?'.sidebar [data-category="pve"]':'.mobile-dock [data-category="pve"]').click();
  await lobby.locator('#menu-dialog .menu-result[data-route="deck"]').click();
  await page.locator('.v21-production-shell[data-route="battle"]').waitFor();
  check(await page.locator('soop-adventure-lobby').count()===1&&await page.locator('.v21-route-body #pveHuntView').count()===1,size+' PVE deck entry retains shared navigation and original battle surface');
  check(writes.length===0,size+' lobby and guide never mutate account or place bids');
  check(requests.includes('live-operations')&&requests.includes('chief/status'),size+' existing operations/chief APIs reused');
  await page.close();
 }
 check(errors.length===0,'no full-app JavaScript errors: '+errors.join(' | '));
 fs.writeFileSync(path.join(out,'live-results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));
 console.log(JSON.stringify({passed:checks.length,out,errors}));
}finally{await browser.close();}

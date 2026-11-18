import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium,webkit} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {out,root,source,base,code,files,name,role,tag} from './state.mjs';
const [mode,device]=process.argv.slice(2),before=JSON.parse(fs.readFileSync(path.join(out,'baseline.json')));
assert(['before','after','live'].includes(mode));assert(['pc','ios','android','windows','h5','cms-pc','cms-mobile'].includes(device));
const mobile=!['pc','windows','cms-pc'].includes(device),cms=device.startsWith('cms'),ios=device==='ios';
const origin=mode==='live'?'https://cnine-card.pages.dev':'https://'+before.production.pages.id.slice(0,8)+'.cnine-card.pages.dev';
const current=before.catalog.find(x=>x.code===code);
const suffix=mode!=='before'?'?v='+tag:'';
const avatar={code,serial:'A-40',name:mode==='before'?current.name:name,role:mode==='before'?current.role_label:role,active:!!current.is_active,public:!!current.is_public,saleEnabled:!!current.sale_enabled,acquisitionType:'UNSET',owned:true,equipped:true,version:current.version+(mode!=='before'?1:0),lobbyImage:base+files[0]+suffix,lobbyMobileImage:base+files[1]+suffix,equipmentImage:base+files[2]+suffix,coinGainCap:175,rankXpAllowed:true,effects:[['DROP_RATE_PERCENT',50],['COIN_GAIN_PERCENT',175],['RAID_EXTRA_ENTRY',15],['BATTLE_POWER_PERCENT',7.7],['ACCOUNT_RANK_XP_PERCENT',30]].map(([type,value])=>({type,value}))};
const cards=JSON.parse(fs.readFileSync(path.join(root,'operations/all-platform-runtime-performance-20261108/public-cards.json'))).cards.slice(0,2);
const packs=JSON.parse(fs.readFileSync(path.join(root,'operations/all-platform-runtime-performance-20261108/public-packs.json'))).packs.slice(0,2);
const user={id:20,serverUserId:20,nickname:'딜러 남수댕 원화 검수',role:'USER',coin:1234,pigCoin:0,masterStars:0,cardShards:0,owned:cards.map(c=>String(c.id)),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const report={mode,device,origin,conditions:'Windows headless Chrome/WebKit; production entry routes and production renderers; synthetic API and equipped account only. Image delivery fixed 25 ms latency + 2 MB/s. Not a physical phone or installed Windows client.',requests:[],images:[],rounds:[],errors:[]};
if(mode==='live')report.conditions='Windows headless Chrome/WebKit; canonical live production routes/renderers and unmocked CDN images; synthetic API/equipped account only. Real network with no throttling, not physical devices or installed Windows app.';
const browser=ios?await webkit.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true});
const frames=page=>page.evaluate(()=>new Promise(resolve=>{const start=performance.now(),a=[];let last=start;const tick=t=>{if(t>last)a.push(t-last);last=t;if(t-start<500){requestAnimationFrame(tick);return;}a.sort((x,y)=>x-y);resolve({count:a.length,p95Ms:+a[Math.floor(a.length*.95)].toFixed(1),maxMs:+Math.max(...a).toFixed(1),over50:a.filter(x=>x>50).length});};requestAnimationFrame(tick);}));
const decode=async loc=>{await loc.waitFor({state:'visible'});return loc.evaluate(async i=>{await i.decode();if(!i.naturalWidth)throw Error('Image failed');return {src:i.currentSrc,width:i.naturalWidth,height:i.naturalHeight};});};
try{
 const context=await browser.newContext({viewport:{width:mobile?390:1440,height:mobile?844:900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',locale:'ko-KR'}),page=await context.newPage();page.setDefaultTimeout(22000);
 page.on('pageerror',e=>report.errors.push(e.message.slice(0,220)));page.on('dialog',d=>d.dismiss());
 await context.addInitScript(({user,avatar})=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','isolated-avatar-resource-qa');localStorage.setItem('cnine_admin_token','isolated-avatar-resource-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');localStorage.setItem('cnine_soop_watch_notice:20261026-v1:'+user.id,'shown');sessionStorage.setItem('cnine:lobby-avatar:v1',JSON.stringify({owner:user.id,avatar}));},{user,avatar});
 await context.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname.replace(/^.*?\/api\//,'');report.requests.push(p);
  const lookup={'me':{user},'me/summary':{user,prison:{incarcerated:false}},'service/status':{maintenance:{active:false}},cards:{cards},packs:{packs},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:true,shopEnabled:false}},'sync/ticket':{error:'isolated fixture'},'chief/status':{chief:{active:false,viewerAvatar:avatar}},'character/loadout':{instances:[],loadout:{},titles:[],vehicles:[],bonuses:{},equippedAvatar:avatar,avatarFeature:{visible:true,shopEnabled:false}},'avatar/catalog':{avatars:[avatar],feature:{visible:true,shopEnabled:false},equippedAvatarCode:code,equipCooldown:{remainingMs:0}},'admin/avatars':{settings:{mode:'ON',shopEnabled:false,version:1},avatars:[avatar]}};
  await route.fulfill({status:p==='sync/ticket'?423:200,json:lookup[p]||{ok:true,permissions:['*'],user:{...user,role:'OWNER'},stats:{},items:[],visible:false,enabled:false,serverNow:new Date().toISOString()}});
 });
 if(mode!=='live')await context.route('**/assets/ui/avatars-v1/santa-20261114/sudaeng-*',async route=>{
  const filename=path.basename(new URL(route.request().url()).pathname),b=fs.readFileSync(mode==='before'?path.join(out,'before',filename):path.join(source,base,filename));
  const start=Date.now();await new Promise(r=>setTimeout(r,25+b.length/2000));await route.fulfill({status:200,contentType:'image/webp',body:b});report.images.push({file:filename,bytes:b.length,deliveryMs:Date.now()-start});
 });
 await page.goto(origin+(cms?'/admin/':device==='h5'?'/onestore/':'/')+(cms?'':'?screen=home'+(device==='windows'?'&source=windows-client':'')),{waitUntil:'domcontentloaded',timeout:45000});
 if(cms){
  const button=page.locator('#nav [data-view="avatars"]');await button.waitFor({state:'attached'});const start=Date.now();await button.evaluate(b=>b.click());
  const card=page.locator('[data-avatar-code="'+code+'"]');await card.waitFor();await card.scrollIntoViewIfNeeded();report.image=await decode(card.locator('img'));report.firstEntryMs=Date.now()-start;
  assert.deepEqual(await card.locator('input[data-effect-value]').evaluateAll(a=>a.map(x=>Number(x.value))),[50,175,15,7.7,30]);
  assert.equal(await card.locator('[data-field="public"]').isChecked(),avatar.public);assert.equal(await card.locator('[data-field="saleEnabled"]').isChecked(),avatar.saleEnabled);
  assert((await card.textContent()).includes(avatar.name),'CMS displays the current avatar name');
  await card.screenshot({path:path.join(out,mode+'-'+device+'.png')});report.frames=await frames(page);
 }else{
  const lobby=page.locator('soop-adventure-lobby'),all=()=>page.locator('soop-adventure-lobby [data-category="all"]:visible').first();
  report.lobbyImage=await decode(lobby.locator('.stage-character'));report.coldStartToLobbyMs=Math.round(await page.evaluate(()=>performance.now()));
  assert(report.lobbyImage.src.includes(mobile?files[1]:files[0]));
  await page.screenshot({path:path.join(out,mode+'-'+device+'-lobby.png')});
  for(let n=0;n<2;n++){
   await all().click();const search=page.locator('soop-adventure-lobby #menu-search');if(await search.isVisible())await search.fill('장비');
   const entry=page.locator('soop-adventure-lobby [data-route="character"]:visible').first();await entry.waitFor();
   const start=Date.now();await entry.click();const art=page.locator('.clv2-quartermaster.is-equipped-avatar');const img=await decode(art);const ms=Date.now()-start;
   assert(img.src.includes(files[2]));const sampled=await frames(page);
   if(n===0){await art.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,mode+'-'+device+'-equipment.png')});}
   const home=page.locator('button:visible,a:visible').filter({hasText:/^로비$/}).first();
   await home.click();await decode(page.locator('soop-adventure-lobby .stage-character'));
   const count=report.requests.filter(p=>p.startsWith('character/')).length;await page.waitForTimeout(1200);
   const exit=await page.evaluate(()=>({equipmentRoots:document.querySelectorAll('#characterSystemRoot').length,equipmentAnimations:document.getAnimations().filter(a=>a.effect?.target?.closest?.('#characterSystemRoot')).length}));exit.newCharacterRequests=report.requests.filter(p=>p.startsWith('character/')).length-count;
   assert.deepEqual(exit,{equipmentRoots:0,equipmentAnimations:0,newCharacterRequests:0});report.rounds.push({round:n?'reentry':'first',clickToDecodedMs:ms,image:img,frames:sampled,exit});
  }
 }
 fs.writeFileSync(path.join(out,mode+'-'+device+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode,device,coldStart:report.coldStartToLobbyMs,rounds:report.rounds.map(x=>({round:x.round,ms:x.clickToDecodedMs,frames:x.frames,exit:x.exit})),cmsMs:report.firstEntryMs,errors:report.errors}));
}catch(e){await fs.promises.writeFile(path.join(out,'failed-'+mode+'-'+device+'.json'),JSON.stringify(report,null,2));console.error(e.message,JSON.stringify({requests:[...new Set(report.requests)].slice(0,28),errors:report.errors}));process.exitCode=1;}finally{await browser.close();}

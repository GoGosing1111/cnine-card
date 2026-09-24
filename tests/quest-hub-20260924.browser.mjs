// Real game/CMS entrypoints with isolated mock API traffic. No live account writes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {questPeriod,WEEKLY_QUESTS,QUEST_REWARDS,defaultQuestSettings} from '../functions/_quest_hub.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=fs.mkdtempSync(path.join(os.tmpdir(),'quest-hub-qa-'));
const server=http.createServer((req,res)=>{
 let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return}
 try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)}catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
const check=(condition,label)=>{assert.ok(condition,label);checks.push(label)};
const user={id:4242,serverUserId:4242,nickname:'퀘스트 검수',role:'USER',coin:1234567890,pigCoins:0,cardShards:123456,masterStars:2300,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
function status(){return {period:questPeriod(Date.parse('2026-09-24T03:00:00Z')),verified:true,excluded:false,daily:{id:'DAILY_POST',title:'PLAY DK 게시글 작성',target:15,unit:'개',count:9,rewardType:'COIN',rewardAmount:10000000000,rewardLabel:'코인',enabled:true,blocked:false,claimed:false,description:'하루에 글 15개를 작성하고 일일 보상을 받으세요. 매일 00:00 KST에 초기화됩니다.'},weekly:WEEKLY_QUESTS.map(q=>({...q,enabled:false,rewardAmount:0,rewardType:'COIN',count:q.id==='CORE_RAID'?2:q.id==='CLAN'?1:0,available:q.id!=='POST',claimed:false,blocked:false,days:[]}))}}
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,serviceWorkers:'block'}),data=status(),writes=[];let failCheck=false;
  page.on('pageerror',error=>errors.push(error.stack));
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','quest-local-qa');},user);
  await page.route('**/api/**',async r=>{
   const key=new URL(r.request().url()).pathname.slice(5);if(r.request().method()!=='GET')writes.push(key);
   if(key==='quests/status')return r.fulfill({json:data});
   if(key==='playdk-daily-quest/check'){if(failCheck)return r.fulfill({status:502,json:{error:'DK 집계를 확인하지 못했습니다. 다시 확인해 주세요.'}});data.daily.count=15;data.daily.checkedAt=new Date().toISOString();return r.fulfill({json:{ok:true}})}
   if(key==='playdk-daily-quest/claim'){data.daily.claimed=true;return r.fulfill({json:{ok:true,rewardCoin:10000000000,user:{...user,coin:11234567890}}})}
   if(key==='quests/weekly/check'){Object.assign(data.weekly[0],{count:214,checkedAt:new Date().toISOString(),available:true,days:data.period.days.map(date=>({date,count:date===data.period.today?64:50}))});return r.fulfill({json:{ok:true}})}
   if(key==='quests/weekly/claim'){const body=r.request().postDataJSON();data.weekly.find(q=>q.id===body.questId).claimed=true;return r.fulfill({json:{ok:true,messageId:99,delivery:'MESSAGE'}})}
   const fixture={'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:true,ordinal:3,nickname:'오늘의 족장',remainingMs:86400000,viewerAvatar:{name:'검수',lobbyImage:'/assets/ui/avatars-v1/lobby-v1/avatar-f01-azure-frost-strategist-lobby-v1-640.webp'}}},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:true},alchemyFeature:{visible:false}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]}};
   if(key==='chief/status')fixture[key].chief.active=false;
   return r.fulfill({json:fixture[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}}});
  });
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  const lobby=page.locator('soop-adventure-lobby');await lobby.locator('.stage-character').waitFor();
  await lobby.locator((viewport.width>980?'.sidebar ':'.mobile-dock ')+'[data-category="all"]').click();
  await lobby.locator('.menu-result[data-route="dailyquest"]').click();await page.locator('.qh-detail').waitFor();await page.evaluate(()=>document.fonts.ready);
  const size=viewport.width+'x'+viewport.height;
  check(await page.locator('.qh-progress-number').innerText()==='9\n/ 15개',size+' actual lobby route mounts daily target');
  check(await page.locator('.qh-claim').isDisabled(),size+' incomplete daily claim disabled');
  check(await page.locator('.qh-week>div').count()===7,size+' daily shares the weekly calendar layout');
  check((await page.locator('.qh-week .is-today span').innerText())==='9개',size+' daily calendar shows only today count');
  check((await page.locator('.qh-record-note').innerText()).includes('오늘 작성한 글만'),size+' daily and weekly reset rules remain distinct');
  await page.screenshot({path:path.join(out,'daily-'+size+'.png'),fullPage:true});
  failCheck=true;await page.locator('.qh-refresh').click();await page.locator('.qh-notice.is-error').waitFor();check((await page.locator('.qh-notice').innerText()).includes('DK'),size+' DK error displayed without changing progress');
  failCheck=false;await page.locator('.qh-refresh').click();await page.waitForFunction(()=>!document.querySelector('.qh-claim').disabled);
  await page.locator('.qh-claim').click();await page.waitForFunction(()=>document.querySelector('.qh-claim').textContent==='수령 완료');
  check(writes.filter(key=>key==='playdk-daily-quest/claim').length===1,size+' daily claim once');
  await page.locator('[data-qh-tab=weekly]').click();check(await page.locator('.qh-mission').count()===4,size+' four separate weekly objectives');
  check((await page.locator('.qh-period').innerText()).includes('2026.09.21 — 2026.09.27'),size+' Monday-Sunday dates');
  check(await page.locator('.qh-claim').isDisabled(),size+' default reward OFF blocks claim');
  await page.locator('.qh-refresh').click();await page.waitForFunction(()=>document.querySelector('.qh-progress-number strong').textContent==='214');
  check(await page.locator('.qh-claim').isDisabled(),size+' completed target still respects OFF');
  await page.locator('.qh-heading').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'weekly-'+size+'.png'),fullPage:true});
  await page.locator('.qh-actions').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'weekly-detail-'+size+'.png')});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),size+' no horizontal overflow');
  check(await page.locator('.qh-actions button').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),size+' touch targets remain accessible');
  Object.assign(data.weekly[2],{enabled:true,rewardAmount:100000000000,rewardLabel:'코인',count:1});
  await page.locator('[data-qh-select=TERRITORY]').click();await page.locator('.qh-refresh').click();await page.waitForFunction(()=>!document.querySelector('.qh-claim').disabled);
  await page.locator('.qh-claim').click();await page.waitForFunction(()=>document.querySelector('.qh-claim').textContent==='수령 완료');
  check((await page.locator('.qh-notice').innerText()).includes('메시지함'),size+' configured weekly reward goes to inbox');
  check(writes.filter(key=>key==='quests/weekly/claim').length===1,size+' weekly single-claim interaction');
  data.verified=false;data.daily.blocked=true;data.weekly.forEach(q=>q.blocked=true);
  await page.locator('.qh-refresh').click();await page.locator('.qh-verify').waitFor();
  check(await page.locator('.qh-claim').isDisabled(),size+' unverified account sees guidance without claim access');
  await page.locator('[data-qh-tab=daily]').click();check(await page.locator('.qh-detail').isVisible(),size+' unverified account can still open daily UI');
  await page.close();
 }
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});let config=defaultQuestSettings(),saves=[],dailySaves=[];
  page.on('pageerror',error=>errors.push(error.stack));page.on('dialog',dialog=>dialog.dismiss());
  await page.addInitScript(()=>localStorage.setItem('cnine_admin_token','quest-cms-local-qa'));
  await page.route('**/api/**',r=>{
   const key=new URL(r.request().url()).pathname.slice(5);
   if(key==='admin/mercenaries/opening')return r.fulfill({json:{mode:'OFF',ready:false,rankCounts:{},blockers:[]}});
   if(key==='admin/weekly-quests'){
    if(r.request().method()==='PATCH'){const body=r.request().postDataJSON();saves.push(body);config={revision:config.revision+1,...body.settings};return r.fulfill({json:{ok:true,settings:config}})}
    return r.fulfill({json:{settings:config,definitions:WEEKLY_QUESTS,rewardTypes:QUEST_REWARDS,period:questPeriod(),canEdit:true}});
   }
   if(key==='admin/daily-quests'&&r.request().method()==='PATCH'){dailySaves.push(r.request().postDataJSON());return r.fulfill({json:{ok:true}})}
   const fixture={'admin/dashboard':{role:'OWNER',admin:{id:1,nickname:'검수 운영자',role:'OWNER'},stats:{users:1,usersToday:0,draws24h:0,cards:0,totalCoin:0,banned:0,coupons:0,urOwned:0,ssrOwned:0}},'admin/daily-quests':{settings:{requiredPosts:15,postRewardCoin:10000000000,postEnabled:true,enabled:true,boardSlugs:['skm'],checkCooldownSeconds:20,adminTestAllowed:true},stats:{},users:[],claims:[]}};
   return r.fulfill({json:fixture[key]||{settings:{},stats:{},items:[],users:[],claims:[],cards:[],packs:[],members:[]}});
  });
  await page.goto(base+'/admin/',{waitUntil:'domcontentloaded'});await page.locator('#cms').waitFor();
  await page.locator('#nav [data-view=dailyquests]').click();await page.locator('#weeklyQuestSettings fieldset').first().waitFor();
  check(await page.locator('#weeklyQuestSettings fieldset').count()===4,'CMS '+viewport.width+' four separate reward settings');
  check(await page.locator('#dqRequiredPosts').getAttribute('readonly')!==null,'CMS fixed daily target');
  check(await page.locator('.dailyQuestAdminPanel.qw-admin [data-quest=DAILY_POST]').count()===1,'CMS '+viewport.width+' daily uses the weekly reward-card layout');
  check(await page.locator('#dqPostRewardCoin').inputValue()==='10000000000','CMS existing daily reward preserved');
  await page.locator('[data-quest=POST] [name=rewardType]').selectOption('MASTER_STAR');await page.locator('[data-quest=POST] [name=rewardAmount]').fill('50000');
  await page.locator('#weeklyQuestSettings button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('[data-qw-status]').textContent.includes('저장했습니다'));
  check(saves.length===1&&saves[0].settings.quests.POST.rewardAmount===50000&&!saves[0].settings.quests.POST.enabled,'CMS saves reward without automatically enabling');
  await page.locator('#saveDailyQuestBtn').click();await page.waitForFunction(()=>!document.querySelector('#saveDailyQuestBtn').disabled);
  check(dailySaves.length===1&&dailySaves[0].settings.postRewardCoin===10000000000&&dailySaves[0].settings.requiredPosts===15,'CMS daily save keeps reward and fixed target');
  check(config.quests.POST.rewardAmount===50000&&!config.quests.POST.enabled,'CMS daily save does not alter weekly rewards');
  check(await page.locator('.dailyQuestAdminPanel').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'CMS '+viewport.width+' daily panel no overflow');
  await page.locator('.dailyQuestAdminPanel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'cms-daily-'+viewport.width+'.png'),fullPage:true});
  check(await page.locator('#weeklyQuestSettings').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'CMS '+viewport.width+' reward panel no overflow');
  await page.locator('#weeklyQuestSettings').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'cms-'+viewport.width+'.png'),fullPage:true});await page.close();
 }
 check(errors.length===0,'no uncaught browser errors: '+errors.join('; '));console.log(JSON.stringify({checks:checks.length,output:out,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}

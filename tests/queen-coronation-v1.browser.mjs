// Focused UI regression against the real index/loader/lobby. All APIs are fixtures.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.QUEEN_QA_ORIGIN||'http://127.0.0.1:4197',out=process.env.QUEEN_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'queen-coronation-qa-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],errors=[];
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
const user={id:4242,serverUserId:4242,nickname:'검수 플레이어',role:'USER',coin:1234567890,cardShards:12345,masterStars:2300,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const avatar={name:'서리의 지휘관',lobbyImage:'/assets/ui/avatars-v1/lobby-v1/avatar-f01-azure-frost-strategist-lobby-v1-640.webp'};
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740}]){
  let current={active:true,status:'ACTIVE',ordinal:7,nickname:'왕실 검수 여왕',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+6*86400000).toISOString(),remainingMs:6*86400000,viewerAvatar:avatar,inaugurationVersion:42};
  const page=await browser.newPage({viewport,deviceScaleFactor:1,serviceWorkers:'block'}),writes=[],size=`${viewport.width}x${viewport.height}`;
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','queen-local-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
  await page.route('**/api/**',route=>{
   const key=new URL(route.request().url()).pathname.slice(5);if(!['GET','HEAD'].includes(route.request().method()))writes.push(key);
   const data={
    'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'loot-shop/balance':{pigCoins:4200},
    'chief/status':{chief:current},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:true},alchemyFeature:{visible:false}},
    'live-operations':{serverNow:new Date().toISOString(),items:[{kind:'AUCTION',title:'장비 경매 진행 중',detail:'검수 콘텐츠 현황',deadlineAt:new Date(Date.now()+5400000).toISOString()}]},
    'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]}
   }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
   return route.fulfill({json:data});
  });
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  const lobby=page.locator('soop-adventure-lobby'),dialog=page.locator('#chiefElectionPopup');
  await dialog.waitFor();await lobby.locator('#chief-name').filter({hasText:'왕실 검수 여왕'}).waitFor();
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(3300);
  check(await dialog.evaluate(el=>el.open&&el.matches(':modal')),size+' automatic coronation is an accessible top-layer dialog');
  check(await dialog.locator('.queen-coronation-art img').evaluate(el=>el.complete&&el.naturalWidth>0),size+' dedicated coronation illustration loads');
  check(await page.evaluate(()=>document.fonts.check('900 70px SoopRoyal','여왕즉위')),size+' bundled Korean royal font loads');
  check(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),size+' ceremony has no horizontal overflow');
  await page.screenshot({path:path.join(out,`coronation-${size}.png`)});
  await dialog.locator('#chiefHideToday').check();await dialog.locator('#chiefPopupClose').click();await dialog.waitFor({state:'detached'});
  await page.waitForTimeout(400);
  check(await lobby.locator('#chief-new-reign').isVisible(),size+' first-day ribbon is visible');
  check(await lobby.locator('.stage-character').getAttribute('src').then(src=>src.includes(avatar.lobbyImage)),size+' equipped avatar is preserved');
  const plaque=await lobby.locator('#chief-shortcut').boundingBox(),operations=await lobby.locator('.operations-scene').boundingBox();
  check(plaque.x>=0&&plaque.x+plaque.width<=viewport.width&&plaque.y+plaque.height<=operations.y,size+' royal plaque clears the viewport and content controls');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),size+' lobby has no horizontal overflow');
  await page.screenshot({path:path.join(out,`lobby-${size}.png`)});
  await lobby.locator('#chief-shortcut').click();await page.locator('[data-v21-queen-coronation]').click();await dialog.waitFor();
  check(true,size+' explicit replay opens despite automatic dismissal');
  await dialog.locator('.queen-skip').click();check(await dialog.evaluate(el=>el.classList.contains('is-settled')),size+' skip immediately settles animation');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  check(await page.locator('[data-v21-queen-coronation]').evaluate(el=>el===document.activeElement),size+' closing restores replay-button focus');
  current={...current,status:'SUSPENDED',active:false};await page.locator('[data-v21-queen-coronation]').click();
  await page.locator('.queen-replay-status').filter({hasText:'현재 즉위식을 볼 수 있는 여왕이 없습니다.'}).waitFor();check(await dialog.count()===0,size+' replay rejects suspended server state');
  await page.locator('[data-v21-close]').click();
  await page.emulateMedia({reducedMotion:'reduce'});current={...current,active:true,status:'ACTIVE'};
  await lobby.locator('#chief-shortcut').click();await page.locator('[data-v21-queen-coronation]').click();await dialog.waitFor();
  check(await dialog.locator('.queen-gold-word').evaluate(el=>getComputedStyle(el).animationName==='none'),size+' reduced motion disables animation');
  await dialog.locator('.queen-close').click();await dialog.waitFor({state:'detached'});
  check(writes.length===0,size+' viewing and replay make no account writes');
  await page.close();
 }
 check(errors.length===0,'no application JavaScript errors: '+errors.join(' | '));
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,out,errors}));
}finally{await browser.close();}

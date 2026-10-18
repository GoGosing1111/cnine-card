import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const checks=[],errors=[],out='C:/Users/User/.codex/tmp/chief-header-20261019/qa';
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
const user={id:4242,serverUserId:4242,nickname:'검수 플레이어',role:'USER',coin:3800000000000,cardShards:2171000,masterStars:80726000,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true,accountRank:{level:250,code:'MARSHAL',name:'원수',progress:{percent:100,maxed:true}}};
const chief={active:true,status:'ACTIVE',reignStyle:'GENERAL',ordinal:12,nickname:'검수 장군',startsAt:new Date(Date.now()-172800000).toISOString(),endsAt:new Date(Date.now()+6.7*86400000).toISOString(),remainingMs:6.7*86400000,viewerAvatar:null,inaugurationVersion:40};
try{
 for(const viewport of [{width:1168,height:820},{width:390,height:844},{width:320,height:740}]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'}),size=viewport.width+'x'+viewport.height;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-header-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
  await page.route('**/api/**',route=>{
   const key=new URL(route.request().url()).pathname.slice(5);
   const data={
    'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'loot-shop/balance':{pigCoins:200},
    'chief/status':{chief},'account-rank/status':{accountRank:user.accountRank},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:true},alchemyFeature:{visible:false}},'live-operations':{serverNow:new Date().toISOString(),items:[]},
    'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]}
   }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
   return route.fulfill({json:data});
  });
  await page.goto('http://127.0.0.1:8953/',{waitUntil:'domcontentloaded'});
  const lobby=page.locator('soop-adventure-lobby');
  await lobby.locator('#chief-name').filter({hasText:'검수 장군'}).waitFor();
  await page.evaluate(()=>{lobbyBgm.applySettings({enabled:true,tracks:Array.from({length:5},(_,i)=>({title:'검수 '+(i+1),url:'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA'}))});lobbyBgm.syncRoute();});
  const bgm=page.locator('#lobbyBgmToggleV1803');await bgm.waitFor();await page.evaluate(()=>document.fonts.ready);
  const b=await bgm.boundingBox(),h=await lobby.locator('.topbar').boundingBox(),c=await lobby.locator('#chief-shortcut').boundingBox();
  check(b.y>=h.y+h.height&&b.y>=c.y+c.height&&b.x>=0&&b.x+b.width<=viewport.width,size+' BGM remains clear of header and ruler');
  check(await lobby.locator('.queen-plaque-term').evaluate(el=>el.scrollWidth<=el.clientWidth+1),size+' remaining term is fully readable');
  check(await bgm.getAttribute('aria-pressed')==='true',size+' BGM remains muted');
  await page.screenshot({path:out+'/controls-'+size+'.png'});
  await lobby.locator('#chief-shortcut').focus();await page.keyboard.press('Enter');
  await page.locator('.v21-chief-dialog').waitFor();check(true,size+' keyboard opens ruler detail');
  await page.locator('[data-v21-close]').click();
  await lobby.locator('.inbox').click();await page.locator('.v21-production-shell[data-route="messages"]').waitFor();
  check(await lobby.locator('#chief-shortcut').isVisible(),size+' ruler remains accessible from shared navigation');
  const route=await page.locator('.v21-route-command-head').boundingBox(),header=await lobby.locator('.topbar').boundingBox();
  check(route.y>=header.y+header.height-1,size+' route content clears measured header height');
  await lobby.locator('#chief-shortcut').click();await page.locator('.v21-chief-dialog').waitFor();
  check(true,size+' ruler detail opens from messages');await page.locator('[data-v21-close]').click();
  await page.close();
 }
 check(errors.length===0,'no JavaScript errors: '+errors.join(' | '));
 fs.writeFileSync(out+'/controls.json',JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}));
}finally{await browser.close();}

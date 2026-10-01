// Actual desktop/mobile navigation and legion entry; all account calls are local fixtures.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.LOBBY_QA_ORIGIN||'http://127.0.0.1:4197';
const out=process.env.LOBBY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'retired-content-qa-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const user={id:4242,serverUserId:4242,nickname:'메뉴 검수',role:'OWNER',coin:1234567890,cardShards:1234,masterStars:2300,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const checks=[];
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const page=await browser.newPage({viewport,serviceWorkers:'block'}),requests=[],errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-menu-qa');},user);
    await page.route('**/api/**',route=>{
      const key=new URL(route.request().url()).pathname.slice(5);requests.push({key,method:route.request().method()});
      const data={
        'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},
        cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},
        'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:true},alchemyFeature:{visible:false}},
        'live-operations':{items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},
        'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]},
        'legion-hunt/status':{canEnter:true,access:{mode:'ON'}},
        'legion-hunt/bootstrap':{access:{mode:'ON'},entries:{limit:3,remaining:3},difficulties:[{id:'normal',name:'일반',description:'섬의 군단을 돌파하세요.',huntDurationMs:780000}],loadout:{accountNickname:user.nickname,power:{deck:1000000},cards:Array.from({length:5},(_,i)=>({id:i+1,title:'편성 카드 '+(i+1),rarity:'ZENITH',image:'assets/ui/idle-dungeon/moon-citadel-v1.png'})),mercenary:null,characterBonus:{}}}
      }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
      return route.fulfill({json:data});
    });
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const lobby=page.locator('soop-adventure-lobby');await lobby.locator('.stage-character').waitFor();
    if(viewport.width>980)await lobby.locator('.sidebar [data-category="pve"]').click();
    else {await lobby.locator('.mobile-dock [data-category="all"]').click();await lobby.locator('.category-jump[data-category="pve"]').click();}
    const legion=lobby.locator('.menu-result[data-route="legion"]');await legion.waitFor();
    assert.match(await legion.innerText(),/군단토벌/);assert.equal(await lobby.locator('.menu-result[data-route="idle"]').count(),0);
    await page.screenshot({path:path.join(out,'adventure-'+viewport.width+'.png')});
    await legion.click();await page.locator('.legion-hunt-portal[open] .legion-account').filter({hasText:user.nickname}).waitFor();
    assert.equal(await page.locator('.legion-hunt-portal').count(),1);
    assert.equal(requests.filter(r=>r.key==='legion-hunt/bootstrap').length,1);
    assert.ok(!requests.some(r=>r.key==='legion-hunt/start'),'opening menu must not start combat');
    const box=await page.locator('.legion-hunt-portal').boundingBox();assert.ok(box.x>=-1&&box.width<=viewport.width+1);
    await page.screenshot({path:path.join(out,'legion-entry-'+viewport.width+'.png')});
    await page.locator('[data-hunt-close]').click();
    if(viewport.width>980)await lobby.locator('.sidebar [data-category="administration"]').click();
    else {await lobby.locator('.mobile-dock [data-category="all"]').click();await lobby.locator('.category-jump[data-category="administration"]').click();}
    assert.equal(await lobby.locator('.menu-result[data-route="treasury"]').count(),0);
    assert.ok((await lobby.locator('.menu-result').allTextContents()).some(s=>s.includes('쿠데타')));
    assert.ok(!requests.some(r=>r.key.startsWith('idle-dungeon')||r.key.startsWith('administration/treasury')));
    assert.deepEqual(errors,[]);
    checks.push({width:viewport.width,legionMenu:true,legionLobby:true,retiredMenusAbsent:true,retiredApiCalls:0});
    await page.close();
  }
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({ok:true,out,checks}));
}finally{await browser.close();}

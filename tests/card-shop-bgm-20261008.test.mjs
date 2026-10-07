// Exercise the shipped app with isolated API responses; Chromium is hard-muted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.CARD_SHOP_BGM_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'card-shop-bgm-'));
fs.mkdirSync(out,{recursive:true});
const settings={enabled:true,volumePercent:25,loopPlaylist:true,tracks:[{title:'DEMO 5',url:'/assets/bgm/demo-5-20261008.mp3'}]};
const user={id:4242,serverUserId:4242,nickname:'BGM 검수',role:'USER',coin:1234567890,cardShards:0,masterStars:0,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};

for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
  test(`${name}: visible store toggle shares mute state, preserves one playing track across lobby/store, and stops elsewhere`,async t=>{
    const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
    t.after(()=>browser.close());
    const page=await browser.newPage({viewport,serviceWorkers:'block'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({user,settings})=>{
      localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','isolated-bgm-qa');
      localStorage.setItem('cnine_battle_sound','OFF');if(localStorage.getItem('soop-lobby-bgm-muted-v1')===null)localStorage.setItem('soop-lobby-bgm-muted-v1','1');localStorage.setItem('soop-lobby-bgm-settings-v1',JSON.stringify(settings));
      const Native=window.Audio;window.qaAudio=[];window.qaAudioLoads=0;window.Audio=function(...args){const audio=new Native(...args),load=audio.load.bind(audio);audio.load=()=>{qaAudioLoads++;return load();};qaAudio.push(audio);return audio;};
    },{user,settings});
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!=='http://card-shop.test')return route.abort();
      if(url.pathname.startsWith('/api/')) {
        const key=url.pathname.slice(5),data={
          'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},
          cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},
          'user/runtime-command':{lobbyBgm:settings},
          'chief/status':{chief:{active:true,ordinal:3,nickname:'검수 족장',remainingMs:86400000}},
          'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false},alchemyFeature:{visible:false}},
          'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},
          'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]}
        }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
        return route.fulfill({json:data});
      }
      const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
      return route.fulfill({path:file});
    });
    await page.goto('http://card-shop.test/?screen=buy');
    const button=page.locator('#cardShopBgmToggleV1803');
    await button.waitFor({state:'visible'});assert.equal(await button.textContent(),'🔇BGM OFF');
    await page.locator('.v21-store-pack-selector').waitFor();await page.evaluate(()=>document.fonts.ready);
    const bounds=await button.boundingBox(),title=await page.locator('.pack-selector-head h2').boundingBox();
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y>=0&&bounds.y+bounds.height<viewport.height);
    assert.ok(Math.abs((bounds.y+bounds.height/2)-(title.y+title.height/2))<10,'button beside the shop title');
    assert.ok(bounds.height>=44,'touch target');
    await page.screenshot({path:path.join(out,name+'-off.png')});
    await button.click();
    await page.waitForFunction(()=>qaAudio.some(a=>a.src.includes('demo-5-20261008.mp3')&&!a.paused&&a.currentTime>.1));
    assert.equal(await button.getAttribute('aria-label'),'카드상점 배경음 끄기');assert.equal(await button.textContent(),'🎵BGM ON');
    await page.evaluate(()=>{window.qaBgmAudio=qaAudio.find(a=>a.src.includes('demo-5-20261008.mp3'));window.qaBgmTime=qaBgmAudio.currentTime;window.qaInitialLoads=qaAudioLoads;});
    const playing=await page.evaluate(()=>({volume:qaBgmAudio.volume,loop:qaBgmAudio.loop,players:qaAudio.filter(a=>a.src.includes('demo-5-20261008.mp3')).length}));
    assert.deepEqual(playing,{volume:.25,loop:true,players:1});
    await page.screenshot({path:path.join(out,name+'-on.png')});
    await page.evaluate(()=>SoopketmonV21ExactShell.navigate('home'));
    await page.locator('#lobbyBgmToggleV1803').waitFor({state:'visible'});
    assert.equal(await page.locator('#lobbyBgmToggleV1803').textContent(),'🎵BGM ON');
    assert.ok(await page.evaluate(()=>!qaBgmAudio.paused&&qaBgmAudio.currentTime>=qaBgmTime&&qaAudioLoads===qaInitialLoads));
    await page.locator('#lobbyBgmToggleV1803').click();
    assert.ok(await page.evaluate(()=>qaBgmAudio.paused&&lobbyBgm.isMuted()));
    await page.evaluate(()=>SoopketmonV21ExactShell.navigate('buy'));
    await button.waitFor({state:'visible'});assert.equal(await button.textContent(),'🔇BGM OFF');
    await button.click();await page.waitForFunction(()=>!qaBgmAudio.paused);
    // A pack change replaces the store body but must not create/reset the player.
    await page.locator('.pack-choice').nth(1).click();await button.waitFor({state:'visible'});
    assert.equal(await button.count(),1);
    const changedPack=await page.evaluate(()=>({paused:qaBgmAudio.paused,time:qaBgmAudio.currentTime,before:qaBgmTime,loads:qaAudioLoads,beforeLoads:qaInitialLoads,active:lobbyBgm.active,route:SoopketmonV21ExactShell.currentRoute}));
    t.diagnostic(JSON.stringify({changedPack}));assert.ok(!changedPack.paused&&changedPack.time>=changedPack.before&&changedPack.loads===changedPack.beforeLoads);
    const idle=await page.evaluate(async()=>{
      const button=document.getElementById('cardShopBgmToggleV1803'),icon=button.firstChild;let mutations=0;
      const observer=new MutationObserver(rows=>mutations+=rows.length);observer.observe(button,{childList:true,subtree:true});
      for(let i=0;i<20;i++)lobbyBgm.syncRoute();await new Promise(r=>setTimeout(r,0));observer.disconnect();
      return {mutations,sameIcon:icon===button.firstChild};
    });assert.deepEqual(idle,{mutations:0,sameIcon:true});
    await page.evaluate(()=>SoopketmonV21ExactShell.navigate('messages'));
    await page.locator('.v21-live-route[data-live-route="messages"]').waitFor();
    await page.waitForFunction(()=>!lobbyBgm.active&&qaBgmAudio.paused&&!qaBgmAudio.getAttribute('src'));
    assert.equal(await page.locator('#cardShopBgmToggleV1803,#lobbyBgmToggleV1803').count(),0);
    await page.evaluate(()=>SoopketmonV21ExactShell.navigate('buy'));await button.waitFor({state:'visible'});
    await button.click();assert.ok(await page.evaluate(()=>lobbyBgm.isMuted()));
    // The app deliberately restores the lobby on reload. Both controls retain OFF.
    await page.reload();await page.locator('#lobbyBgmToggleV1803').waitFor({state:'visible'});
    assert.equal(await page.locator('#lobbyBgmToggleV1803').textContent(),'🔇BGM OFF');
    await page.evaluate(()=>SoopketmonV21ExactShell.navigate('buy'));await button.waitFor({state:'visible'});assert.equal(await button.textContent(),'🔇BGM OFF');
    await page.evaluate(()=>lobbyBgm.applySettings({enabled:false,tracks:[]}));assert.equal(await button.count(),0);
    assert.ok(await page.evaluate(()=>qaAudio.every(a=>a.paused)));
    assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify({name,bounds,playing,idle,errors,out}));
  });
}

// Exercise the shipped app with isolated API responses; Chromium is hard-muted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.CARD_SHOP_BGM_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'card-shop-bgm-'));
fs.mkdirSync(out,{recursive:true});
const settings={enabled:true,volumePercent:15,loopPlaylist:true,tracks:[{title:'DEMO 5',url:'/assets/bgm/demo-5-20261008.mp3'}]};
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/bgm/soopketmon-ost-20261008.json'),'utf8'));
const playlistSettings={...settings,tracks:manifest.tracks.map(({title,url})=>({title,url}))};
const user={id:4242,serverUserId:4242,nickname:'BGM 검수',role:'USER',coin:1234567890,cardShards:0,masterStars:0,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};

test('OST filenames, URL encoding and original MP3 bytes match the user-provided manifest',()=>{
  assert.equal(manifest.tracks.length,5);
  for(const [index,track] of manifest.tracks.entries()){
    assert.equal(track.title,`숲켓몬 OST${index+1}`);assert.equal(track.file,`assets/bgm/${track.title}.mp3`);
    assert.equal(decodeURIComponent(track.url),'/'+track.file);
    const bytes=fs.readFileSync(path.join(root,track.file));
    assert.equal(bytes.length,track.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),track.sha256);
  }
});

test('devices that ignore media volume use one Web Audio gain node for the same player',async t=>{
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});t.after(()=>browser.close());
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='http://bgm-gain.test')return route.abort();
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<html><body><main class="pc-lobby-scene"><div data-lobby-bgm-host style="width:240px;height:50px"></div></main></body></html>'});
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root)||!fs.existsSync(file))return route.fulfill({status:404});
    return route.fulfill({path:file,contentType:'audio/mpeg'});
  });
  await page.goto('http://bgm-gain.test/');
  await page.evaluate(()=>{
    localStorage.setItem('soop-lobby-bgm-muted-v1','1');
    const NativeAudio=window.Audio,NativeContext=window.AudioContext;window.qaGainNodes=[];
    window.Audio=function(){const a=new NativeAudio();Object.defineProperty(a,'volume',{get:()=>1,set:()=>{}});window.qaGainAudio=a;return a;};
    window.AudioContext=class extends NativeContext{createGain(){const node=super.createGain();qaGainNodes.push(node);return node;}};
  });
  await page.addScriptTag({path:path.join(root,'js/lobby-bgm-v1803.js')});
  await page.evaluate(settings=>lobbyBgm.applySettings(settings),playlistSettings);
  await page.locator('#lobbyBgmPlaylistV1').click();
  await page.locator('[data-bgm-power]').click();
  await page.waitForFunction(()=>!qaGainAudio.paused&&qaGainAudio.currentTime>.05);
  assert.equal(await page.evaluate(()=>qaGainNodes.length),1);
  assert.ok(Math.abs(await page.evaluate(()=>qaGainNodes[0].gain.value)-.15)<.00001);
  await page.locator('#bgmPlayerVolume').fill('80');
  assert.ok(Math.abs(await page.evaluate(()=>qaGainNodes[0].gain.value)-.8)<.00001);
  await page.locator('[data-bgm-volume-reset]').click();
  assert.ok(Math.abs(await page.evaluate(()=>qaGainNodes[0].gain.value)-.15)<.00001);
  assert.equal(await page.evaluate(()=>qaGainNodes.length),1);
  await page.locator('[data-bgm-power]').click();assert.ok(await page.evaluate(()=>qaGainAudio.paused&&qaGainAudio.muted));
});

for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
  test(`${name}: shared mute, selectable OST playlist, remembered track and uninterrupted lobby/store playback`,async t=>{
    let liveSettings=settings;
    const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
    t.after(()=>browser.close());
    const page=await browser.newPage({viewport,serviceWorkers:'block'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({user,settings})=>{
      localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','isolated-bgm-qa');
      localStorage.setItem('cnine_battle_sound','OFF');if(localStorage.getItem('soop-lobby-bgm-muted-v1')===null)localStorage.setItem('soop-lobby-bgm-muted-v1','1');if(!localStorage.getItem('soop-lobby-bgm-settings-v1'))localStorage.setItem('soop-lobby-bgm-settings-v1',JSON.stringify(settings));
      const Native=window.Audio;window.qaAudio=[];window.qaAudioLoads=0;window.Audio=function(...args){const audio=new Native(...args),load=audio.load.bind(audio);audio.load=()=>{qaAudioLoads++;return load();};qaAudio.push(audio);return audio;};
    },{user,settings});
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!=='http://card-shop.test')return route.abort();
      if(url.pathname.startsWith('/api/')) {
        const key=url.pathname.slice(5),data={
          'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},
          cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},
          'user/runtime-command':{lobbyBgm:liveSettings},
          'chief/status':{chief:{active:true,ordinal:3,nickname:'검수 족장',remainingMs:86400000}},
          'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false},alchemyFeature:{visible:false}},
          'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},
          'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]}
        }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
        return route.fulfill({json:data});
      }
      const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
      if(file.endsWith('.mp3')){
        const bytes=fs.readFileSync(file),range=/^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range||'');
        if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;return route.fulfill({status:206,contentType:'audio/mpeg',headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`},body:bytes.subarray(start,end+1)});}
        return route.fulfill({contentType:'audio/mpeg',headers:{'accept-ranges':'bytes'},body:bytes});
      }
      return route.fulfill({path:file});
    });
    await page.goto('http://card-shop.test/?screen=buy');
    const button=page.locator('#cardShopBgmToggleV1803');
    await button.waitFor({state:'visible'});assert.equal(await button.textContent(),'🔇BGM OFF');
    await page.locator('.v21-store-pack-selector').waitFor();await page.evaluate(()=>document.fonts.ready);
    const bounds=await button.boundingBox(),title=await page.locator('.pack-selector-head h2').boundingBox();
    t.diagnostic(JSON.stringify({initialBounds:bounds,style:await button.evaluate(el=>({minHeight:getComputedStyle(el).minHeight,height:getComputedStyle(el).height,zoom:getComputedStyle(el).zoom,parentZoom:getComputedStyle(el.parentElement).zoom}))}));
    await page.screenshot({path:path.join(out,name+'-off.png')});
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y>=0&&bounds.y+bounds.height<viewport.height);
    assert.ok(Math.abs((bounds.y+bounds.height/2)-(title.y+title.height/2))<10,'button beside the shop title');
    assert.ok(bounds.height>=44,'touch target');
    await page.screenshot({path:path.join(out,name+'-off.png')});
    await button.click();
    await page.waitForFunction(()=>qaAudio.some(a=>a.src.includes('demo-5-20261008.mp3')&&!a.paused&&a.currentTime>.1));
    assert.equal(await button.getAttribute('aria-label'),'카드상점 배경음 끄기');assert.equal(await button.textContent(),'🎵BGM ON');
    await page.evaluate(()=>{window.qaBgmAudio=qaAudio.find(a=>a.src.includes('demo-5-20261008.mp3'));window.qaBgmTime=qaBgmAudio.currentTime;window.qaInitialLoads=qaAudioLoads;});
    const playing=await page.evaluate(()=>({volume:qaBgmAudio.volume,loop:qaBgmAudio.loop,players:qaAudio.filter(a=>a.src.includes('demo-5-20261008.mp3')).length}));
    assert.deepEqual(playing,{volume:.15,loop:true,players:1});
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

    liveSettings=playlistSettings;
    await page.evaluate(settings=>lobbyBgm.applySettings(settings),playlistSettings);
    const open=page.locator('#lobbyBgmPlaylistV1'),dialog=page.locator('#lobbyBgmPlayerV1');
    await open.click();await dialog.waitFor({state:'visible'});
    assert.deepEqual(await dialog.locator('.bgm-track-name').allTextContents(),manifest.tracks.map(t=>t.title));
    await dialog.locator('[data-bgm-track="1"]').click();
    assert.equal(await dialog.locator('[data-bgm-now-title]').textContent(),'숲켓몬 OST2');
    assert.ok(await page.evaluate(()=>lobbyBgm.isMuted()&&qaAudio.every(a=>a.paused)),'selecting a track preserves OFF');
    const slider=dialog.locator('#bgmPlayerVolume');
    assert.equal(await slider.inputValue(),'15');
    await slider.fill('60');assert.ok(await page.evaluate(()=>lobbyBgm.isMuted()&&qaAudio.every(a=>a.paused)),'volume changes preserve OFF');
    assert.equal(await dialog.locator('.bgm-volume output').textContent(),'60%');
    await dialog.locator('[data-bgm-volume-reset]').click();assert.equal(await slider.inputValue(),'15');
    await page.screenshot({path:path.join(out,name+'-playlist-muted.png')});
    await dialog.locator('[data-bgm-power]').click();
    const media=[];
    for(const [index,track] of manifest.tracks.entries()){
      await dialog.locator(`[data-bgm-track="${index}"]`).click();
      await page.waitForFunction(url=>qaAudio.some(a=>a.getAttribute('src')===url&&!a.paused&&a.currentTime>.08&&a.duration>30),track.url);
      assert.equal(await page.evaluate(()=>lobbyBgm.currentTrack.title),track.title);
      assert.equal(await dialog.locator(`[data-bgm-track="${index}"]`).getAttribute('aria-current'),'true');
      const evidence=await page.evaluate(url=>{const a=qaAudio.find(a=>a.getAttribute('src')===url);return {duration:a.duration,volume:a.volume,error:a.error?.code||null,players:qaAudio.filter(a=>!a.paused).length};},track.url);
      assert.equal(evidence.volume,.15);assert.equal(evidence.error,null);assert.equal(evidence.players,1);
      media.push({title:track.title,...evidence});
    }
    // The last track flows into OST1, then manual previous/next wrap in both directions.
    await page.evaluate(()=>{const a=qaAudio.find(a=>!a.paused);a.currentTime=a.duration-.06;});
    try{await page.waitForFunction(url=>lobbyBgm.currentTrack.url===url&&qaAudio.some(a=>a.getAttribute('src')===url&&!a.paused&&a.currentTime>.05),manifest.tracks[0].url,{timeout:10000});}
    catch(error){t.diagnostic(JSON.stringify(await page.evaluate(()=>({currentTrack:lobbyBgm.currentTrack,active:lobbyBgm.active,muted:lobbyBgm.isMuted(),hidden:document.hidden,audio:qaAudio.map(a=>({src:a.getAttribute('src'),time:a.currentTime,duration:a.duration,loop:a.loop,ended:a.ended,paused:a.paused,ready:a.readyState,error:a.error?.code}))}))));throw error;}
    await dialog.locator('[data-bgm-prev]').click();assert.equal(await page.evaluate(()=>lobbyBgm.currentTrack.title),'숲켓몬 OST5');
    await dialog.locator('[data-bgm-next]').click();assert.equal(await page.evaluate(()=>lobbyBgm.currentTrack.title),'숲켓몬 OST1');
    await dialog.locator('[data-bgm-track="2"]').click();
    await page.waitForFunction(url=>qaAudio.some(a=>a.getAttribute('src')===url&&a.currentTime>.05),manifest.tracks[2].url);
    await page.evaluate(()=>{window.qaPlaylistAudio=qaAudio.find(a=>!a.paused);qaPlaylistAudio.currentTime=30;window.qaPlaylistLoads=qaAudioLoads;});
    await slider.fill('65');assert.equal(await page.evaluate(()=>qaPlaylistAudio.volume),.65);
    await slider.press('ArrowRight');assert.equal(await page.evaluate(()=>qaPlaylistAudio.volume),.66);
    await page.evaluate(settings=>lobbyBgm.applySettings(settings),playlistSettings);
    await page.evaluate(settings=>lobbyBgm.applySettings({...settings,tracks:[...settings.tracks].reverse()}),playlistSettings);
    assert.ok(await page.evaluate(()=>qaPlaylistAudio.currentTime>=30&&qaAudioLoads===qaPlaylistLoads),'CMS refresh/reorder preserves the chosen URL and playback');
    assert.equal(await page.evaluate(()=>qaPlaylistAudio.volume),.66,'CMS polling preserves personal volume');
    await page.evaluate(settings=>lobbyBgm.applySettings(settings),playlistSettings);
    const panelBounds=await dialog.boundingBox();
    assert.ok(panelBounds.x>=0&&panelBounds.y>=0&&panelBounds.x+panelBounds.width<=viewport.width&&panelBounds.y+panelBounds.height<=viewport.height);
    assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    await page.screenshot({path:path.join(out,name+'-playlist-playing.png')});
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
    assert.ok(await open.evaluate(el=>document.activeElement===el),'Escape returns focus to the playlist button');
    await page.evaluate(()=>SoopketmonV21ExactShell.navigate('home'));
    await page.locator('#lobbyBgmToggleV1803').waitFor({state:'visible'});
    assert.ok(await page.evaluate(()=>lobbyBgm.currentTrack.title==='숲켓몬 OST3'&&!qaPlaylistAudio.paused&&qaPlaylistAudio.currentTime>=30&&qaAudioLoads===qaPlaylistLoads));
    await open.click();await dialog.waitFor({state:'visible'});
    await page.screenshot({path:path.join(out,name+'-lobby-playlist.png')});
    await dialog.locator('[data-bgm-power]').click();assert.ok(await page.evaluate(()=>lobbyBgm.isMuted()));
    await page.reload();await page.locator('#lobbyBgmToggleV1803').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>lobbyBgm.currentTrack.title),'숲켓몬 OST3');assert.ok(await page.evaluate(()=>lobbyBgm.isMuted()));
    await open.click();await dialog.waitFor({state:'visible'});
    assert.equal(await dialog.locator('[data-bgm-now-title]').textContent(),'숲켓몬 OST3');
    assert.equal(await slider.inputValue(),'66','personal volume survives reload');
    await dialog.locator('[data-bgm-power]').click();
    await page.waitForFunction(()=>qaAudio.some(a=>!a.paused&&a.currentTime>.05&&a.volume===.66));
    await slider.fill('100');assert.equal(await page.evaluate(()=>qaAudio.find(a=>!a.paused).volume),1);
    await slider.fill('0');assert.equal(await page.evaluate(()=>qaAudio.find(a=>!a.paused).volume),0);
    await dialog.locator('[data-bgm-volume-reset]').click();
    assert.equal(await slider.inputValue(),'15');assert.equal(await page.evaluate(()=>qaAudio.find(a=>!a.paused).volume),.15);
    await dialog.locator('[data-bgm-power]').click();
    await page.evaluate(()=>lobbyBgm.applySettings({enabled:false,tracks:[]}));
    assert.equal(await dialog.count(),0);assert.equal(await open.count(),0);assert.ok(await page.evaluate(()=>qaAudio.every(a=>a.paused)));
    // Bad assets exhaust the list once and leave a visible recovery message.
    await page.evaluate(()=>lobbyBgm.applySettings({enabled:true,volumePercent:25,tracks:[{title:'숲켓몬 OST1',url:'/missing-ost-a.mp3'},{title:'숲켓몬 OST2',url:'/missing-ost-b.mp3'}]}));
    await open.click();await dialog.locator('[data-bgm-power]').click();
    await page.waitForFunction(()=>document.querySelector('[data-bgm-status]')?.textContent.includes('재생할 수 없습니다'));
    await page.evaluate(()=>lobbyBgm.stop());assert.equal(await dialog.count(),0);
    assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify({name,bounds,playing,idle,errors,out}));
    t.diagnostic(JSON.stringify({name,panelBounds,media}));
  });
}

// Loopback-only latency regression in the actual inline V3 raid, PC and mobile.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),out=fs.mkdtempSync(path.join(os.tmpdir(),'lich-input-ui-'));
let h; const held=new Map();
const user={id:3,serverUserId:3,nickname:'검수 구출대',role:'USER',coin:123456789,cardShards:12000,masterStars:2000,
  owned:REVIEW_DECK.map(c=>c.id),quantities:Object.fromEntries(REVIEW_DECK.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://'+req.headers.host);
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  try{
    if(url.pathname.startsWith('/api/')){
      const key=url.pathname.slice(5),chunks=[];for await(const chunk of req)chunks.push(chunk);
      if(key.startsWith('raid/lich/')||key.startsWith('admin/raid/lich/')){
        const body=Buffer.concat(chunks).toString(),request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
        const response=await h.handle(request),value=await response.json();
        const hold=key==='raid/lich/action'&&held.get(JSON.parse(body).action);
        if(hold&&!hold.reached){hold.reached=true;hold.arrived();await hold.promise;}
        return json(value,response.status);
      }
      return json({'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:REVIEW_DECK},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},'loot-shop/balance':{pigCoins:0},'live-operations':{serverNow:new Date().toISOString(),items:[]},'raid/status':{current:null,settings:{enabled:true},participants:[]},'raid/core/feature':{visible:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
    }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
  }catch(error){json({error:error.message},500);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
const holdResponse=action=>{
  let release,arrived;const promise=new Promise(r=>release=r),arrival=new Promise(r=>arrived=r);
  const value={promise,arrival,arrived,release,reached:false};held.set(action,value);return value;
};
try{
  for(const [width,height]of [[1440,1000],[390,844]]){
    h=await lichLiveFixture();for(const id of [1,2,3])h.setDeck(id,accountDeck(id));
    const roomId=await h.party();for(const id of [1,2,3])await h.command('ready',{roomId,ready:true},id);
    assert.equal((await h.command('start',{roomId})).status,200);
    const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
    await context.addInitScript(({user,roomId})=>{
      localStorage.setItem('cnine_card_user_v10',JSON.stringify({...user,id:3,serverUserId:3,role:'USER'}));localStorage.setItem('cnine_card_api_token','local-qa-3');sessionStorage.setItem('lichLiveRoom',roomId);
      localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
    },{user,roomId});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
    await page.locator('[data-pve-mode="raid"]').click();await page.locator('#lichRaidTab').waitFor({state:'visible'});await page.locator('#lichRaidTab').click();
    await page.waitForFunction(()=>globalThis.LichRaidLive?.diagnostics().mounted,{},{timeout:30000});
    const read=async()=>JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).state_json);
    let room=await read(),now=Date.now();
    // Enter a real round, then align overlapping rescue duties while retaining
    // the real authority, role checks, tokens, V3 renderer and client transport.
    room.step='TRANSITION';room.challenge.deadline=now;room.clock=now;room.endsAt=now+120000;
    await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);await h.call('status?roomId='+roomId);
    room=await read();now=Date.now();Object.assign(room.challenge,{sealed:true,prison:false,hasPrison:false,breathResolved:true,prisonBroken:true,plagueAt:now-2200,interrupted:true,curseAt:now-500,curseDeadline:now+6000,deadline:now+20000});
    room.challenge.seals.forEach(t=>t.index=3);room.challenge.chains.forEach(t=>t.broken=true);room.clock=now;
    await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);
    await page.evaluate(()=>LichRaidLive.sync());
    const state=await page.evaluate(()=>LichRaidLive.diagnostics().state),get=action=>state.controls.find(a=>a.action===action);
    const soul=get('RESCUE'),curse=get('CLEANSE'),plague=get('TRANSFER');
    const rescueHold=holdResponse('RESCUE');
    await page.locator('[data-action="RESCUE"][data-target="'+soul.rune+'"]').click();await rescueHold.arrival;
    assert.equal(await page.locator('[data-action="CLEANSE"]').first().isDisabled(),false,'pending soul response must not disable the curse');
    await page.screenshot({path:path.join(out,'overlapping-duties-'+width+'.png'),fullPage:true});
    await page.locator('[data-action="CLEANSE"][data-target="'+curse.rune+'"]').click();
    await page.locator('[data-action="TRANSFER"][data-target="'+plague.rune+'"]').click();
    await page.waitForFunction(()=>LichRaidLive.diagnostics().state.step==='EXPOSED',{},{timeout:6000});
    assert.equal(rescueHold.reached,true);assert.equal((await read()).doom,0);
    assert.equal(await page.locator('[data-action="STRIKE"]').isDisabled(),false,'new damage window opens while the old mechanic response is pending');
    const strikeHold=holdResponse('STRIKE');await page.locator('[data-action="STRIKE"]').click();await strikeHold.arrival;
    assert.equal(await page.locator('[data-action="BURST"]').isDisabled(),true,'same attack opportunity remains deduplicated');
    await page.waitForFunction(()=>!document.querySelector('[data-action="STRIKE"]').disabled,{},{timeout:4000});
    assert.equal(strikeHold.reached,true,'polling observes the accepted attack and its next cooldown while response is delayed');
    assert.equal(await page.locator('[data-input-status]').isVisible(),false,'old inputs must not cover new controls with a waiting banner');
    await page.screenshot({path:path.join(out,'attack-ready-'+width+'.png'),fullPage:true});
    rescueHold.release();strikeHold.release();held.clear();
    await page.waitForFunction(()=>LichRaidLive.diagnostics().inflightActions?.length===0);
    assert.equal((await page.evaluate(()=>LichRaidLive.diagnostics().state)).step,'EXPOSED','old responses cannot restore old phase');
    assert.equal((await read()).doom,0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);reports.push({width,independentMechanics:true,phaseWhileResponsePending:true,pollingDuringInput:true,attackCooldown:true,sameAttackDedup:true,lateResponseIgnored:true,pageErrors:errors});
    await context.close();await h.close();h=null;
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports},null,2));console.log(JSON.stringify({out,reports}));
}catch(error){console.error('Artifacts:',out);throw error;}
finally{for(const item of held.values())item.release();await browser.close();await new Promise(resolve=>server.close(resolve));if(h)await h.close();}

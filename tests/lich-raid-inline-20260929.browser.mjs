// Loopback-only UI regression with synthetic accounts; never calls production APIs.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lichLiveFixture } from './helpers/lich-live-fixture.mjs';
import { coreLifecycleFixture } from './helpers/core-raid-lifecycle-fixture.mjs';
import { handleRaidCoreProtocol } from '../functions/_raid_core_protocol.js';
import { REVIEW_DECK } from '../preview/lich-king-raid-v1/fixture.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lich-inline-'));
const lich = await lichLiveFixture(), core = await coreLifecycleFixture();
await lich.configure();
const user = {id:1,serverUserId:1,nickname:'로컬 정벌 검수',role:'OWNER',coin:123456789,cardShards:12000,
  masterStars:2000,owned:REVIEW_DECK.map(c=>c.id),quantities:Object.fromEntries(REVIEW_DECK.map(c=>[c.id,1])),
  breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const calls = [];
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const json = (data,status=200) => {res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  try {
    if (url.pathname.startsWith('/api/')) {
      const key = url.pathname.slice(5), chunks=[]; for await(const chunk of req) chunks.push(chunk);
      calls.push(key);
      if (key.startsWith('raid/lich/') || key.startsWith('raid/core/')) {
        const body = Buffer.concat(chunks).toString();
        const request = new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
        if(key.startsWith('raid/lich/')) {const response=await lich.handle(request);return json(await response.json(),response.status);}
        const response=await handleRaidCoreProtocol({path:key,request,env:core.env,deps:core.deps});
        return json(response.body,response.status);
      }
      return json({
        'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:REVIEW_DECK},
        packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},
        'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},
        'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},
        'raid/status':{current:null,settings:{enabled:true},participants:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]},
      }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
    }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+path.sep)) {res.writeHead(403);return res.end();}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  } catch(error) {json({error:error.message},500);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const reports=[];
try {
  for(const [width,height] of [[1440,1000],[390,844]]) {
    const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
    await context.addInitScript(user=>{
      localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));
      localStorage.setItem('cnine_card_api_token','local-qa-1');
      localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
    },user);
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',async response=>{if(response.url().includes('/api/raid/lich/')&&response.status()>=400)console.log(response.status(),await response.text());});
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin+'/');
    await page.waitForFunction(()=>typeof renderShell==='function');
    await page.evaluate(()=>renderShell('battle'));
    await page.locator('[data-pve-mode="raid"]').click();
    await page.locator('#lichRaidTab').waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.getElementById('coreRaidTab').hidden);
    const url=page.url();
    const before=await page.locator('[data-raid-content="world"]').evaluate(node=>getComputedStyle(node).borderRadius);
    await page.locator('#lichRaidTab').click();
    await page.locator('#lich-enterButton').waitFor({state:'visible'});
    assert.equal(page.url(),url);assert.equal(context.pages().length,1);assert.equal(await page.locator('#pveLichRaidView iframe').count(),0);
    assert.equal(await page.locator('#pveRaidView').isVisible(),false);
    assert.equal(await page.locator('#lichRaidTab').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('[data-raid-content="world"]').evaluate(node=>getComputedStyle(node).borderRadius),before);
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('#pveRaidHubView').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,`entry-${width}.png`),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#lich-enterButton').click();
    await page.waitForFunction(()=>document.getElementById('lich-ticketCount').textContent!=='—');
    await page.screenshot({path:path.join(out,`lobby-${width}.png`),fullPage:true});
    await page.locator('#lich-guideButton').click();
    assert.equal(await page.locator('#lich-guideDialog').evaluate(dialog=>dialog.open),true);
    await page.locator('#lich-closeGuide').click();
    await page.locator('[data-raid-content="world"]').click();
    assert.equal(await page.locator('#pveRaidView').isVisible(),true);
    const statusCalls=calls.filter(key=>key==='raid/lich/status').length;
    await page.waitForTimeout(3200);
    assert.equal(calls.filter(key=>key==='raid/lich/status').length,statusCalls,'hidden Lich must stop polling');
    await page.locator('#coreRaidTab').click();
    await page.waitForFunction(()=>!document.getElementById('pveCoreRaidView').hidden);
    assert.equal(await page.locator('#pveLichRaidView').isVisible(),false);
    await page.locator('#lichRaidTab').click();
    await page.locator('#lich-enterButton').waitFor({state:'visible'});
    await page.locator('[data-pve-mode="deck"]').click();
    assert.equal(await page.locator('#pveRaidHubView').isVisible(),false);
    await page.locator('[data-pve-mode="raid"]').click();
    await page.locator('#lich-enterButton').waitFor({state:'visible'});
    if(width===1440) {
      // Use the same existing V3 runtime and catalog through the new inline mount.
      await page.evaluate(async()=>{await ProjectVBattleV3Live.ensureRuntime();window.qaRuntime=ProjectVPixiBattle;window.qaCatalog=cnineCardCatalog;});
      await page.locator('#lich-enterButton').click();
      await page.locator('#lich-createButton').click();
      await page.locator('#lich-assembly').waitFor({state:'visible'});
      const roomId=await page.evaluate(()=>LichRaidLive.diagnostics().state.id);
      for(const member of [2,3])await lich.command('join',{roomId},member);
      await lich.command('assign',{roomId,targetId:'2',role:'WARDEN'});
      await lich.command('assign',{roomId,targetId:'3',role:'RESCUE'});
      for(const member of [2,3])await lich.command('ready',{roomId,ready:true},member);
      await page.evaluate(()=>LichRaidLive.sync());
      await page.locator('#lich-readyButton').click();
      await page.locator('#lich-startButton').click();
      await page.waitForFunction(()=>LichRaidLive?.diagnostics().mounted,{},{timeout:60000});
      assert.equal(await page.evaluate(()=>ProjectVPixiBattle===qaRuntime&&cnineCardCatalog===qaCatalog),true);
      assert.equal(await page.locator('#lich-battleMount canvas').count(),1);
      await page.screenshot({path:path.join(out,'combat-1440.png'),fullPage:true});
      await page.locator('#lich-leaveButton').click();
      await page.locator('#lich-browse').waitFor({state:'visible'});
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    reports.push({width,errors,urlUnchanged:page.url()===url,pollingStopped:true});
    await context.close();
  }
  console.log(JSON.stringify({out,reports},null,2));
} finally {
  await browser.close();await new Promise(resolve=>server.close(resolve));await lich.close();await core.db.close();
}

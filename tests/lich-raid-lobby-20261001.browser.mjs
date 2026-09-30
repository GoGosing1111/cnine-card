// Loopback-only three-account regression. Real catalog art/V3 assets; no production API calls.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {coreLifecycleFixture} from './helpers/core-raid-lifecycle-fixture.mjs';
import {handleRaidCoreProtocol} from '../functions/_raid_core_protocol.js';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const out=fs.mkdtempSync(path.join(os.tmpdir(),'lich-lobby-v2-'));
const lich=await lichLiveFixture(),core=await coreLifecycleFixture();
await lich.configure();
for(const id of [1,2,3])lich.setDeck(id,accountDeck(id));
let roomId=""; const calls=[];
let actionDelay=0;
const user=id=>({id,serverUserId:id,nickname:['','검수 공대장','검수 봉인대','검수 구출대'][id],role:id===1?'OWNER':'USER',
  coin:123456789,cardShards:12000,masterStars:2000,owned:REVIEW_DECK.map(c=>c.id),quantities:Object.fromEntries(REVIEW_DECK.map(c=>[c.id,1])),
  breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://'+req.headers.host);
  const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  try{
    if(url.pathname.startsWith('/api/')){
      const key=url.pathname.slice(5),chunks=[];for await(const chunk of req)chunks.push(chunk);
      const id=Number(req.headers.authorization?.match(/local-qa-(\d+)/)?.[1]||1);
      calls.push({key,id,method:req.method,time:Date.now()});
      if(key.startsWith('raid/lich/')||key.startsWith('raid/core/')){
        if(key==='raid/lich/action'&&actionDelay)await new Promise(resolve=>setTimeout(resolve,actionDelay));
        const body=Buffer.concat(chunks).toString(),request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
        if(key.startsWith('raid/lich/')){const response=await lich.handle(request);return json(await response.json(),response.status);}
        const response=await handleRaidCoreProtocol({path:key,request,env:core.env,deps:core.deps});return json(response.body,response.status);
      }
      const u=user(id);
      return json({'loot-shop/balance':{pigCoins:1234},'service/status':{maintenance:{active:false}},'me/summary':{user:u,prison:{incarcerated:false}},me:{user:u},cards:{cards:REVIEW_DECK},
        packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},
        'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},
        'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},
        'raid/status':{current:null,settings:{enabled:true},participants:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]},
      }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
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
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const clients=[],reports=[];

const open = async (id,width,height) => {
 const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
 await context.addInitScript(u=>{
  localStorage.setItem('cnine_card_user_v10',JSON.stringify(u));localStorage.setItem('cnine_card_api_token','local-qa-'+u.id);
  localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
 },user(id));
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 clients.push({id,page,context,errors,width,height});
 await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
 await page.locator('[data-pve-mode="raid"]').click();await page.locator('#lichRaidTab').waitFor({state:'visible'});await page.locator('#lichRaidTab').click();
 await page.locator('#lich-browse').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.getElementById('lich-ticketCount').textContent!=='—');
 await page.evaluate(()=>document.fonts.ready);
 const typography=await page.evaluate(()=>({font:getComputedStyle(document.querySelector('#lich-lobby h1')).fontFamily,loaded:[...document.fonts].some(f=>f.family==='LichSans'&&f.status==='loaded'),overflow:document.documentElement.scrollWidth>innerWidth}));
 assert.match(typography.font,/LichSans/);assert.equal(typography.loaded,true);assert.equal(typography.overflow,false);
 assert.equal(await page.locator('#pveRaidHubView #pveLichRaidView').count(),1);
 return page;
};
const state=page=>page.evaluate(()=>LichRaidLive.diagnostics().state);
const shot=async(page,name)=>{await page.locator('#pveLichRaidView').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,name),fullPage:true});};
try{
 const host=await open(1,1440,1000),warden=await open(2,390,844),rescue=await open(3,360,800);
 await shot(host,'browse-empty-1440.png');
 assert.equal(await host.locator('#lich-createButton').isEnabled(),true);
 await host.locator('#lich-createButton').click();await host.locator('#lich-assembly').waitFor({state:'visible'});
 roomId=(await state(host)).id;assert.ok(roomId);
 assert.equal(await host.locator('#lich-startButton').isDisabled(),true);
 for(const page of [warden,rescue]){
  await page.evaluate(()=>LichRaidLive.sync());await page.locator('[data-join="'+roomId+'"]').waitFor();
  if(page===warden)await shot(page,'browse-390.png');
  await page.locator('[data-join="'+roomId+'"]').click();await page.locator('#lich-assembly').waitFor({state:'visible'});
  await page.waitForFunction(()=>LichRaidLive.diagnostics().state.me.role==='UNASSIGNED');
  assert.equal(await page.locator('#lich-readyButton').isDisabled(),true);
  await page.locator('#lich-loadoutPanel').waitFor({state:'visible'});
 }
 await host.evaluate(()=>LichRaidLive.sync());
 await host.locator('#lich-memberList [data-assign-role="WARDEN"][data-target="2"]').click();
 await host.waitForFunction(()=>LichRaidLive.diagnostics().state.members.find(m=>m.id==='2').role==='WARDEN');
 await host.locator('#lich-memberList [data-assign-role="RESCUE"][data-target="3"]').press('Space');
 await host.waitForFunction(()=>LichRaidLive.diagnostics().state.members.find(m=>m.id==='3').role==='RESCUE');
 for(const page of [warden,rescue])await page.evaluate(()=>LichRaidLive.sync());
 assert.equal(await warden.locator('#lich-myRoleName').textContent(),'봉인대');
 assert.equal(await rescue.locator('#lich-myRoleName').textContent(),'구출대');
 assert.equal(await host.locator('#lich-startButton').isDisabled(),true);
 for(const [page,id] of [[host,1],[warden,2],[rescue,3]]){
  await page.locator('#lich-loadoutPanel').waitFor({state:'visible'});
  await page.locator('#lich-loadoutPanel').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>[...document.querySelectorAll('#lich-loadoutList img')].every(img=>img.complete&&img.naturalWidth>0));
  const portraits=await page.locator('#lich-loadoutList img').evaluateAll(images=>images.map(img=>({src:img.getAttribute('src'),ok:img.complete&&img.naturalWidth>0})));
  assert.equal(portraits.length,7);assert.ok(portraits.every(p=>p.ok));
  const images=portraits.map(p=>p.src);assert.ok(images.includes('/assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png'));
  assert.equal(images.some(src=>/battle.*sd|characters\//.test(src)),false,'lobby displays original art');
  await page.locator('#lich-readyButton').click();await page.waitForFunction(()=>LichRaidLive.diagnostics().state.me.ready);
  reports.push({id,ownFormation:true,roleAssigned:true,prepared:true});
 }
 await host.evaluate(()=>LichRaidLive.sync());
 assert.equal(await host.locator('#lich-startButton').isEnabled(),true);
 assert.equal(await host.locator('#lich-startHint').textContent(),'모든 작전 준비 완료');
 await host.locator('#lich-readyButton').click();await host.waitForFunction(()=>!LichRaidLive.diagnostics().state.me.ready);
 assert.equal(await host.locator('#lich-startButton').isDisabled(),true);
 await host.locator('#lich-readyButton').click();await host.waitForFunction(()=>LichRaidLive.diagnostics().state.me.ready);
 await shot(host,'assembly-1440.png');await shot(warden,'assembly-390.png');await shot(rescue,'assembly-360.png');
 await host.setViewportSize({width:390,height:844});await shot(host,'assembly-host-390.png');
 const mobile=await host.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('#lich-memberList [data-assign-role],#lich-readyButton,#lich-startButton')].map(b=>({label:b.getAttribute('aria-label')||b.textContent,height:b.getBoundingClientRect().height}))}));
 assert.equal(mobile.overflow,false);assert.ok(mobile.buttons.every(b=>b.height>=44));
 await host.setViewportSize({width:1440,height:1000});
 await host.locator('#lich-startButton').click();await host.waitForFunction(()=>LichRaidLive.diagnostics().mounted,{},{timeout:60000});
 const battlefield=await host.locator('#pveLichRaidView').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
 assert.deepEqual(battlefield,{x:0,y:0,width:1440,height:1000});
 await host.locator('#lich-leaveButton').click();await host.locator('#lich-browse').waitFor({state:'visible'});
 assert.equal(await host.locator('#pveRaidHubView #pveLichRaidView').count(),1);assert.equal(await host.evaluate(()=>document.body.style.overflow),'');
 for(const client of clients)assert.deepEqual(client.errors,[]);
 console.log(JSON.stringify({out,reports,fonts:'self-hosted Noto Sans KR / Barlow Condensed',creation:true,join:true,keyboardAssignment:true,readyGate:true,mobile44px:true,fullScreenEntry:true,lobbyReturn:true,errors:[]},null,2));
}catch(error){
 for(const {page,id,errors}of clients){console.error(JSON.stringify({id,errors,state:await state(page).catch(()=>null)}));await page.screenshot({path:path.join(out,'failure-'+id+'.png'),fullPage:true}).catch(()=>{});}
 console.error('Lich lobby artifacts:',out);throw error;
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));await lich.close();await core.db.close();
}

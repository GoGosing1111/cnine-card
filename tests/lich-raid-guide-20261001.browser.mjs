// Focused beginner-guide QA in the real game shell. Loopback fixtures only, sound OFF.
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
const out=fs.mkdtempSync(path.join(os.tmpdir(),'lich-guide-v2-'));
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

const shot=async(page,name)=>page.screenshot({path:path.join(out,name),fullPage:true});
const jump=async(page,name)=>{
 const nav=page.locator('#lich-guideDialog [data-guide-to="'+name+'"]');
 await nav.click();
 const target=await page.evaluate(()=>({text:document.activeElement.textContent,y:document.activeElement.getBoundingClientRect().top,scrollTop:document.getElementById('lich-guideScroll').scrollTop}));
 assert.ok(target.scrollTop>=0);assert.ok(target.y>0&&target.y<await page.evaluate(()=>innerHeight));
 return target;
};
const geometry=page=>page.locator('#lich-guideDialog').evaluate(dialog=>{
 const box=dialog.getBoundingClientRect(),scroll=dialog.querySelector('.guide-scroll'),close=dialog.querySelector('.guide-close').getBoundingClientRect();
 const textOverflow=[...scroll.querySelectorAll('p,dd,h3,h4')].filter(node=>node.scrollWidth>node.clientWidth+1).map(node=>node.textContent);
 return{inside:box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,overflow:scroll.scrollWidth>scroll.clientWidth+1,textOverflow,closeHeight:close.height,closeWidth:close.width,scrollable:scroll.scrollHeight>scroll.clientHeight};
});
try{
 const host=await open(1,1440,1000),rescue=await open(3,390,844);
 for(const [page,width]of[[host,1440],[rescue,390]]){
  await page.locator('#lich-guideButton').click();await page.locator('#lich-guideDialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#lich-guideScroll').evaluate(node=>node.scrollTop),0);
  await shot(page,'start-'+width+'.png');
  const before=calls.filter(call=>call.method==='POST').length;
  await page.locator('#lich-guideDialog [data-guide-to="roles"]').press('Space');
  assert.match(await page.evaluate(()=>document.activeElement.textContent),/내가 맡은 역할/);
  await shot(page,'roles-'+width+'.png');
  assert.match((await jump(page,'phases')).text,/실제 전투 순서/);await shot(page,'phases-'+width+'.png');
  assert.match((await jump(page,'supplies')).text,/공대 공용 자원/);await shot(page,'supplies-'+width+'.png');
  assert.match((await jump(page,'failure')).text,/무엇 때문에 패배/);
  await page.locator('#lich-guideScroll').evaluate(node=>node.scrollTop=node.scrollHeight);
  await shot(page,'failures-'+width+'.png');
  const layout=await geometry(page);
  assert.equal(layout.inside,true);assert.equal(layout.overflow,false);assert.deepEqual(layout.textOverflow,[]);assert.equal(layout.scrollable,true);assert.ok(layout.closeHeight>=44&&layout.closeWidth>=44);
  assert.equal(calls.filter(call=>call.method==='POST').length,before,'reading the guide never issues battle commands');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#lich-guideDialog').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'lich-guideButton');
  reports.push({width,chapters:5,keyboardNavigation:true,escapeAndFocusReturn:true,layout});
 }
 roomId=await lich.party();
 for(const id of[1,2,3])assert.equal((await lich.command('ready',{roomId,ready:true},id)).status,200);
 for(const page of[host,rescue])await page.evaluate(()=>LichRaidLive.sync());
 assert.equal((await lich.command('start',{roomId})).status,200);
 for(const [page,role]of[[host,'정벌대'],[rescue,'구출대']]){
  await page.evaluate(()=>LichRaidLive.sync());await page.locator('#lich-combatGuide').waitFor({state:'visible'});
  await page.locator('#lich-combatGuide').click();
  assert.match(await page.locator('#lich-guideRole').textContent(),new RegExp(role));
  assert.match(await page.locator('#lich-guideNotice').textContent(),/전투 중.*계속 흐릅니다/);
  const target=await page.locator('#lich-guideDialog [data-guide-section="'+(role==='정벌대'?'ASSAULT':'RESCUE')+'"]').boundingBox();
  assert.ok(target.y>0&&target.y<await page.evaluate(()=>innerHeight));
  await shot(page,'combat-'+role+'.png');
  await jump(page,'start');assert.match((await jump(page,'roles')).text,new RegExp(role));
  await page.locator('#lich-closeGuide').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'lich-combatGuide');
 }
 for(const client of clients)assert.deepEqual(client.errors,[]);
 console.log(JSON.stringify({out,reports,contextualRoleShortcut:true,activeBattleNotice:true,combatEntryAndClose:true,noBattleCommandsFromGuide:true,errors:[]},null,2));
}catch(error){
 for(const{page,id,errors}of clients){console.error(JSON.stringify({id,errors}));await shot(page,'failure-'+id+'.png').catch(()=>{});}
 throw error;
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));lich.close();core.close();
}

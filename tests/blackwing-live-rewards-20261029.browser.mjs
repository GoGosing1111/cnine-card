// Actual shipped UI, loopback-only APIs and synthetic accounts.
import assert from 'node:assert/strict';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {rewardFixture,readyBlackwingClear,choicePolicy} from './helpers/blackwing-rewards-fixture.mjs';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {madaraLiveFixture} from './helpers/madara-live-fixture.mjs';
import {coreRewardFixture} from './helpers/core-reward-fixture.mjs';
import {handleRewardReveal} from '../functions/_reward_reveal.js';
import {blackwingWeeklyReward} from '../functions/_raid_blackwing_rewards.js';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),out=process.env.BLACKWING_QA_DIR;
assert(out);fs.mkdirSync(out,{recursive:true});
const staticOrigin=process.env.BLACKWING_STATIC_ORIGIN;if(staticOrigin)assert.equal(staticOrigin,'https://cnine-card.pages.dev');
let h,l,m,c,user;
const reports=[],calls=[],serverErrors=[];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://'+req.headers.host),json=(v,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(v));};
 try{
  if(url.pathname==='/__cms'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/core-raid-rewards-v1.css"><link rel="stylesheet" href="/admin/reward-reveal-admin-v1.css"><body><main style="max-width:1100px;margin:auto;padding:12px"><section id="view-raid"></section><section id="reward-root"></section></main><script type="module" src="/admin/blackwing-raid-admin-v1.mjs"></script><script type="module">import {mountRewardRevealCms} from "/admin/reward-reveal-admin-v1.mjs";mountRewardRevealCms(document.getElementById("reward-root"));</script></body></html>');}
  if(url.pathname.startsWith('/api/')){
   const key=url.pathname.slice(5),chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString(),request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});calls.push({key,method:req.method});
   let response;
   if(key.startsWith('raid/blackwing/')||key.startsWith('admin/raid/blackwing/'))response=await h.handle(request);
   else if(key.startsWith('raid/lich/')||key.startsWith('admin/raid/lich/'))response=await l.handle(request);
   else if(key.startsWith('raid/madara/')||key.startsWith('admin/raid/madara/'))response=await m.handle(request);
   else if(key.startsWith('raid/core/'))response=await c.call(key+url.search,body?JSON.parse(body):undefined,{user:Number((req.headers.authorization||'').replace('Bearer local-qa-',''))||1,session:req.headers['x-core-raid-session']});
   else if(key.startsWith('rewards/reveal/')||key==='admin/reward-reveal'){
    const f=key.startsWith('admin/')?c:h;
    response=await handleRewardReveal({path:key,request,env:f.env,deps:{...f.deps,withUserMutationLock:async(_env,_id,_path,fn)=>fn()}});
   }
   if(response)return response instanceof Response?json(await response.json(),response.status):json(response.body,response.status);
   return json({'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:REVIEW_DECK},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'loot-shop/balance':{pigCoins:0},'raid/status':{current:null,settings:{enabled:true},participants:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
  }
  if(staticOrigin){const r=await fetch(new URL(url.pathname+url.search,staticOrigin),{signal:AbortSignal.timeout(30000)});res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream'});return res.end(Buffer.from(await r.arrayBuffer()));}
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){const f=path.resolve('C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site','.'+decodeURIComponent(url.pathname));if(fs.existsSync(f))file=fs.statSync(f).isDirectory()?path.join(f,'index.html'):f;}
  if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){serverErrors.push({path:url.pathname,error:e.stack});json({error:e.message},500);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
async function contextFor(actor,width,height){
 user={id:actor,serverUserId:actor,nickname:'합성 검수 '+actor,role:'OWNER',coin:123456789,cardShards:100,masterStars:2000,owned:REVIEW_DECK.map(c=>c.id),quantities:Object.fromEntries(REVIEW_DECK.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
 const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
 await context.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-qa-'+user.id);localStorage.setItem('cnine_admin_token','local-qa-1');localStorage.setItem('cnine_soop_watch_notice:20261026-v1:'+user.id+':local-qa-'+user.id,'shown');localStorage.setItem('cnine_soop_watch_notice:20261026-v1:'+user.id,'shown');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>serverErrors.push({page:true,error:e.stack}));return {context,page};
}
async function hub(page,tab){await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));await page.locator('[data-pve-mode="raid"]').click();await page.locator('#'+tab).click();}
async function shot(page,name,width){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow '+name);await page.screenshot({path:path.join(out,name+'-'+width+'.png'),fullPage:true});}
try{
 for(const[width,height]of process.env.BLACKWING_LAYOUT_ONLY==='1'?[[320,568],[844,390]]:staticOrigin?[[390,844]]:[[1440,1000],[390,844]]){
  h=await rewardFixture();l=await lichLiveFixture();m=await madaraLiveFixture();c=await coreRewardFixture();
  await l.configure({mode:'ON'});await m.configure({mode:'ON'});await c.run("INSERT INTO users(id,nickname,role) VALUES(3,'입장권 없는 검수','OWNER')");
  await c.run('INSERT INTO app_meta(key,value) VALUES(?,?)','reward_reveal_policy_v1:BLACKWING',JSON.stringify(choicePolicy()));
  for(const e of choicePolicy().entries)await c.run("INSERT INTO inventory_items(code,name,is_active) VALUES(?,?,1)",e.rewardRef,e.rewardRef);
  if(process.env.BLACKWING_LAYOUT_ONLY!=='1'){const cms=await contextFor(1,width,height);await cms.page.goto(origin+'/__cms');
  const panel=cms.page.locator('#blackwingRaidAdmin');await panel.locator('[name="mode"]').waitFor();assert.equal(await panel.locator('[name="mode"]').inputValue(),'ON');assert.equal(await panel.locator('[name="weeklyRewardLimit"]').inputValue(),'3');
  assert.equal(await panel.locator('[name="coinReward"]').inputValue(),'200000000000');assert.equal(await panel.locator('[name="pigCoinReward"]').inputValue(),'100');await panel.locator('button[type="submit"]').click();await panel.locator('[data-status]').filter({hasText:'저장 완료'}).waitFor();await panel.locator('[data-load]').first().click();await panel.locator('[data-status]').filter({hasText:'저장된 운영 상태'}).waitFor();
  await cms.page.locator('[data-content="BLACKWING"]').click();const cp=cms.page.locator('#reward-reveal-BLACKWING');await cp.locator('[name="minimumQuantity"]').waitFor();assert.equal(await cp.locator('[name="minimumQuantity"]').inputValue(),'30000000000');assert.equal(await cp.locator('[data-row]').count(),6);
  await cp.locator('button[type="submit"]').click();await cms.page.locator('[data-reveal-status]').filter({hasText:'설정을 저장했습니다'}).waitFor();await cp.locator('[data-action="reload"]').click();await shot(cms.page,'cms',width);await cms.context.close();}
  const final=await readyBlackwingClear(h),battle=await contextFor(final.actor,width,height),page=battle.page;
  await hub(page,'blackwingRaidTab');await page.locator('[data-action="STRIKE"]').waitFor();await page.waitForFunction(()=>globalThis.BlackwingRaidDiagnostics?.().battle.ready,{},{timeout:90000});await page.locator('[data-action="STRIKE"]').click();
  await page.locator('.reliquary-close').waitFor();await page.locator('.reliquary-close').click();const paid=await page.locator('[data-clear-reward]').innerText();assert.match(paid,/200,000,000,000/);assert.match(paid,/피그코인 100/);assert.match(paid,/2,000,000/);assert.match(paid,/펫 정수 5/);assert.match(paid,/1\/3회/);await page.waitForTimeout(250);
  const layout=await page.locator('.bw-result').evaluate(el=>{const buttons=[...el.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {label:b.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});return {buttons,commandVisible:document.querySelector('.bw-arena').getBoundingClientRect().height>0};});
  assert.equal(layout.commandVisible,false);for(let i=0;i<layout.buttons.length;i++){const b=layout.buttons[i];assert.ok(b.x>=0&&b.right<=width&&b.height>=44);if(i)assert.ok(b.y-layout.buttons[i-1].bottom>=12,'result button spacing');}await shot(page,'blackwing-clear',width);await page.locator('.bw-result [data-log-open]').click();await page.locator('[data-log-close]').click();
  await page.locator('[data-result-exit]').click();await page.locator('.content-reward-inbox').waitFor();await page.locator('.content-reward-inbox summary').click();await page.locator('.content-reward-inbox [data-reveal-offer] button').click();await page.locator('.reliquary.is-ready').waitFor();await page.waitForTimeout(1800);await shot(page,'blackwing-choice',width);await page.locator('.reliquary-choice[data-slot="0"]').click();await page.locator('.reliquary-done').waitFor();await shot(page,'blackwing-prize',width);await page.locator('.reliquary-done').click();
  assert.equal((await blackwingWeeklyReward(h.env,final.actor,3)).used,1);await page.reload();await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));await page.locator('[data-pve-mode="raid"]').click();await page.locator('#blackwingRaidTab').click();await page.locator('[data-config]').filter({hasText:'1/3'}).waitFor();assert.equal(await page.locator('.content-reward-inbox:visible').count(),0);await shot(page,'blackwing-lobby',width);await battle.context.close();
  if(process.env.BLACKWING_LAYOUT_ONLY==='1'){reports.push({width,height,layout});await Promise.all([h.close(),l.close(),m.close(),c.close()]);h=l=m=c=null;continue;}
  const entry=await contextFor(3,width,height),p=entry.page;
  await p.goto(origin+'/raid/lich-king/');await p.locator('#createButton').click();await p.locator('#lobbyLeave').waitFor({state:'visible'});assert.equal(Number((await l.one('SELECT COUNT(*) n FROM inventory_logs')).n),0);await shot(p,'lich-free-entry',width);
  await hub(p,'madaraRaidTab');await p.locator('#madara-createButton').click();await p.locator('#madara-confirmEntry').click();await p.locator('#madara-assembly').waitFor({state:'visible'});assert.equal(Number((await m.one('SELECT COUNT(*) n FROM inventory_logs')).n),0);await shot(p,'madara-free-entry',width);
  await hub(p,'coreRaidTab');await p.locator('[data-core-action="open"]').click();await p.locator('.core-lobby-command').waitFor();assert.equal(Number((await c.row('SELECT COUNT(*) n FROM inventory_logs')).n),0);await shot(p,'core-free-entry',width);await entry.context.close();
  reports.push({width,height,layout,blackwingPaid:paid,choiceSavedAndClaimed:true,weeklyLimit:3,weeklyUsedAfterChoice:1,cmsSaveReload:true,freeEntry:['CORE','LICH','MADARA'],productionAccountWrites:0});
  await Promise.all([h.close(),l.close(),m.close(),c.close()]);h=l=m=c=null;
 }
 assert.deepEqual(serverErrors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports,calls,serverErrors},null,2));console.log(JSON.stringify({reports,serverErrors}));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,reports,calls,serverErrors},null,2));throw error;}
finally{await browser.close();await new Promise(r=>server.close(r));for(const f of[h,l,m,c])if(f)await f.close();}

// Actual index/lobby/rank dialog. API traffic stays in isolated local fixtures.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {publicAccountRank,LEGACY_MAX_RANK_TICKS} from '../functions/_account_rank.js';
import {RANKS} from '../shared/account-ranks-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.RANK_QA_DIR;assert.ok(out,'Set RANK_QA_DIR outside deployment checkout');await mkdir(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local'),file=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));assert.ok(file.startsWith(root));const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],errors=[];
const user={id:4242,serverUserId:4242,nickname:'계급 개편 검수',role:'USER',coin:1234567890,cardShards:0,masterStars:0,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true,accountRank:publicAccountRank(LEGACY_MAX_RANK_TICKS)};
try{
 for(const [width,height,reduced] of [[1440,1000,false],[390,844,false],[390,844,true]]){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'}),rankWrites=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','rank-local-qa');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const key=url.pathname.slice(5);if(key.startsWith('account-rank/')&&route.request().method()!=='GET')rankWrites.push(key);
   const data={'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},'account-rank/status':{accountRank:user.accountRank,ranks:RANKS},'account-rank/presets':{slots:5,presets:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
   return route.fulfill({json:data});
  });
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('soop-adventure-lobby #account-rank-button').click();
  const dialog=page.locator('.account-rank-dialog');await dialog.waitFor();
  assert.match(await dialog.locator('.ar-progress').textContent(),/400 \/ 3,040 EXP/);
  assert.equal(await dialog.locator('[data-rank]').count(),21);
  for(const code of ['COLONEL','MARSHAL']){
   await dialog.locator('[data-rank="'+code+'"]').click();
   const art=dialog.locator('.ar-stage>img');await art.evaluate(e=>e.decode());
   assert.ok((await art.getAttribute('src')).endsWith(code.toLowerCase()+'-384'+(reduced?'-still':'')+'.webp'));
  }
  const benefits=await dialog.locator('.ar-effects').textContent();assert.match(benefits,/6\.75%/);assert.match(benefits,/드랍률\+5%/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await dialog.evaluate(e=>e.getBoundingClientRect().left>=0&&e.getBoundingClientRect().right<=innerWidth));
  assert.ok(await dialog.locator('.ar-main').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({path:resolve(out,'rank-'+width+(reduced?'-reduced':'')+'.png')});
  await dialog.locator('.ar-main').evaluate(e=>e.scrollTop=e.scrollHeight);
  assert.ok(await dialog.locator('.ar-effects>small').isVisible());
  await dialog.locator('[data-close]').click();assert.equal(await page.locator('dialog.account-rank-dialog[open]').count(),0);
  assert.deepEqual(rankWrites,[]);checks.push({width,height,reducedMotion:reduced,rankCount:21,benefitsVisible:true,noOverflow:true,noWrites:true});await page.close();
 }
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'browser-verification.json'),JSON.stringify({checks,errors},null,2)+'\n');console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

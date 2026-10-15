import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {coreRewardFixture} from './helpers/core-reward-fixture.mjs';
import {handleRewardReveal,prepareRewardRevealContext,prepareRewardRevealOffer} from '../functions/_reward_reveal.js';
import {CORE_REWARD_DEFAULT} from '../shared/core-raid-reward-policy-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.REWARD_REVEAL_QA_OUTPUT||await fs.mkdtemp(path.join(os.tmpdir(),'reward-reveal-qa-'));
await fs.mkdir(out,{recursive:true});const f=await coreRewardFixture();
await f.run("INSERT INTO character_garage_items VALUES(1,'보레아스 - Ω','MYTHIC','assets/tire/boreas-omega-v1.png',0,1,1)");
await f.run("UPDATE character_equipment_items SET image_url='assets/ui/core-raid-rewards-v2/master-star.svg' WHERE id=1");
await f.run("UPDATE inventory_items SET image_url='assets/items/emperor-energy-v1.webp' WHERE code='MAT'");
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/reward-reveal-admin-v1.css"><style>body{margin:0;background:#0b1220;color:#e8edf4}main{width:min(1200px,100%);box-sizing:border-box;padding:24px;margin:auto}button,input,select{font-family:inherit}*{box-sizing:border-box}</style>';
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/__qa/cms'){res.setHeader('content-type','text/html; charset=utf-8');res.end(head+'<main id="studio"></main><script type="module">import {mountRewardRevealCms} from "/admin/reward-reveal-admin-v1.mjs";await mountRewardRevealCms(document.querySelector("main"));</script>');return;}
  if(url.pathname==='/__qa/player'){res.setHeader('content-type','text/html; charset=utf-8');res.end(head+'<main><h1>격전지 보상 검수</h1><div id="reward"></div></main><script type="module">import {mountRewardRevealButton,mountRewardRevealInbox} from "/js/content-reward-reveal-v1.mjs";const lifecycle=new AbortController();mountRewardRevealInbox(document.querySelector("main"),{signal:lifecycle.signal});mountRewardRevealButton(document.querySelector("#reward"),{offerId:new URL(location.href).searchParams.get("offerId")},{signal:lifecycle.signal});window.closeReview=()=>lifecycle.abort();</script>');return;}
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   const request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}:{}),duplex:'half'});
   const result=await handleRewardReveal({path:url.pathname.slice(5),request,env:f.env,deps:{authenticate:async()=>({id:1,role:'OWNER'}),json:(b,s=200,h={})=>Response.json(b,{status:s,headers:h}),withUserMutationLock:async(_e,_u,_p,work)=>work()}});
   if(result){res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;}
   res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root))throw Error('Forbidden');
  const data=await fs.readFile(file);res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(data);
 }catch(error){res.writeHead(500,{'content-type':'text/plain'});res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});const checks=[],errors=[];
try{
 for(const [label,width,height,content]of [['desktop',1440,960,'COOP_NORMAL'],['mobile',390,844,'MADARA']]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<650,hasTouch:width<650,serviceWorkers:'block'});
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(label+': '+error.message));
  await page.goto(origin+'/__qa/cms');await page.locator('[data-content="'+content+'"]').click();const editor=page.locator('#reward-reveal-'+content);await editor.locator('form').waitFor();
  assert.equal(await page.locator('.reveal-cms-contents button').count(),6);
  await editor.locator('[name=minimumQuantity]').fill('1000');await editor.locator('[name=enabled]').selectOption('true');
  for(const [type,ref]of [['VEHICLE','1'],['EQUIPMENT','1'],['INVENTORY_ITEM','MAT']]){await editor.locator('[name=addType]').selectOption(type);await editor.locator('[name=addRef]').selectOption(ref);await editor.locator('[data-action=add]').click();}
  await editor.locator('[data-row="0"] [data-key=weight]').fill('25');await editor.locator('[data-row="1"] [data-key=weight]').fill('10');
  assert.match(await editor.locator('.cr-admin-rate').first().textContent(),/%/);
  await editor.locator('button[type=submit]').click();await page.waitForFunction(id=>document.querySelector('#reward-reveal-'+id+' .cr-admin-status').textContent.includes('켰습니다'),content);
  const stored=JSON.parse((await f.row('SELECT value FROM app_meta WHERE key=?','reward_reveal_policy_v1:'+content)).value);assert.equal(stored.entries.length,3);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'CMS horizontal overflow');
  await page.screenshot({path:path.join(out,label+'-cms.png'),fullPage:true});
  await editor.locator('[data-action=preview]').click();await page.locator('.reliquary.is-ready').waitFor({timeout:25000});await page.waitForTimeout(1250);await page.screenshot({path:path.join(out,label+'-seals.png')});
  await page.locator('[data-slot="1"]').click();await page.waitForTimeout(1300);await page.screenshot({path:path.join(out,label+'-opening.png')});
  await page.locator('.reliquary.is-revealed .reliquary-done').waitFor();await page.waitForTimeout(1100);
  assert.match(await page.locator('.reliquary-prize-copy h2').textContent(),/보레아스/);assert.equal(await page.locator('.reliquary-prize-image').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  const bounds=await page.locator('.reliquary-done').boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height,'result action within viewport');
  await page.screenshot({path:path.join(out,label+'-result.png')});await page.locator('.reliquary-done').click();
  const p={...structuredClone(CORE_REWARD_DEFAULT),enabled:true,minimum:{rewardType:'COIN',quantity:9,weight:1}};
  await f.run('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','reward_reveal_policy_v1:LICH',JSON.stringify(p));
  const c=await prepareRewardRevealContext(f.env,'LICH',p,true),plan=prepareRewardRevealOffer(f.env,c,{userId:1,roomId:crypto.randomUUID(),baseReward:{coin:100,masterStars:50},quota:{period:'week',limit:7,used:1,remaining:6},finishedAt:Date.now()});await f.env.DB.batch([...c.statements,...plan.statements]);
  await page.goto(origin+'/__qa/player?offerId='+plan.offer.offerId);await page.locator('#reward button').click();await page.locator('.reliquary.is-ready').waitFor({timeout:25000});await page.locator('.reliquary-close').click();
  await page.reload();await page.locator('.content-reward-inbox:not([hidden])').waitFor();await page.locator('#reward button').click();await page.locator('.reliquary.is-ready').waitFor();await page.locator('[data-slot="0"]').click();await page.locator('.reliquary.is-revealed').waitFor();await page.locator('.reliquary-done').click();
  assert.match(await page.locator('#reward p').textContent(),/지급 완료/);await page.locator('#reward button').click();await page.locator('.reliquary.is-revealed').waitFor();await page.evaluate(()=>window.closeReview());assert.equal(await page.locator('dialog.reliquary').count(),0);
  checks.push({label,width,height,candidates:stored.entries.length,preview:true,persistedReopen:true,claimReplay:true,abortCloses:true});await context.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'checks.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({out,checks,errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await f.close();}

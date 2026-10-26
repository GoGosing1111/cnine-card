// Review the shipped workshop renderer with isolated GET-only recipe data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {MERCENARY_CRAFTS,mercenaryCraftDraft,mercenaryCraftRecipe} from '../../../shared/mercenary-craft-v1.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),out=path.join(root,'docs/qa/mercenary-selector-ui-20261026');
const fallback='C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site',mode=process.argv[2]||'local';
assert(['local','public'].includes(mode));
const selected=[...MERCENARY_CRAFTS.slice(0,3),...['V-996','V-999','V-989','V-979'].map(code=>MERCENARY_CRAFTS.find(d=>d.scope==='SSS_LIMITED_SHARD'&&d.code===code))];
const inventory={},recipes=selected.map((d,i)=>{
 const prime=d.scope==='PRIME_MATERIAL',draft=mercenaryCraftDraft(d),code=d.requiredMaterial||'MERCENARY_SSS_CARD_SHARD';
 inventory[code]={quantity:100};
 const policy={...draft,isPublic:true,...(prime?{}:{coinCost:100,masterStarCost:1,successRate:100,isActive:true,materials:[{itemCode:code,quantity:1}]})};
 const limit=prime?null:i===0?8:i===1?2:10,remaining=prime?null:[4,2,null,1,0,0,2][i];
 const stock={limit,remaining,crafted:prime?0:limit-remaining,soldOut:remaining===0};
 return mercenaryCraftRecipe(d,policy,{id:i+1,materials:[{item_code:code,item_name:prime?'기운잃은 프라임 카드':d.scope==='SSS_LIMITED_SHARD'?'SSS 리미티드 조각':'SSS 용병 조각',image_url:'assets/items/sss-limited-shard-20261020/item.webp',rarity:'SPECIAL'}]},stock);
});
const state={wallet:{coin:1000000,masterStars:100,cardShards:0},inventory,recipes,synthesis:[]};
const styles=['css/command-ui-v1.css','css/workshop-v1676.css','css/workshop-v1881.css','css/workshop-workbench-v1.css','css/mercenary-shard-craft-v1.css'];
const scripts=['js/workshop-recipes-v1.js','js/workshop-v1881.js'];
const cache=new Map(),errors=[],failed=[],reports=[];let writes=0,reads=0;
async function content(file,variant){
 if(variant==='before'&&['css/workshop-v1881.css','js/workshop-v1881.js'].includes(file))return execFileSync('git',['show','HEAD:'+file],{cwd:root,maxBuffer:5000000});
 if(mode==='public'){
  if(!cache.has(file)){const r=await fetch('https://cnine-card.pages.dev/'+file+'?selector-qa=20261026',{signal:AbortSignal.timeout(45000)});assert.equal(r.status,200,file);cache.set(file,Buffer.from(await r.arrayBuffer()));}
  return cache.get(file);
 }
 const filePath=fs.existsSync(path.join(root,file))?path.join(root,file):path.join(fallback,file);return fs.readFileSync(filePath);
}
const html=variant=>`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(f=>`<link rel="stylesheet" href="/${f}?variant=${variant}">`).join('')}<style>*{box-sizing:border-box}body{margin:0;background:#080d17;color:#eaf4ff;font-family:Arial,sans-serif}#view{max-width:1380px;margin:auto;padding:20px}@media(max-width:600px){#view{padding:10px}}</style><main id="view"></main><script>localStorage.setItem('cnine_card_api_token','local-account-7');window.loadUser=()=>({id:7});window.apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,o);if(!r.ok)throw new Error('Unexpected request');return r.json()};</script>${scripts.map(f=>`<script src="/${f}?variant=${variant}"></script>`).join('')}<script>document.getElementById('view').innerHTML=workshopView(loadUser(),{workshopSection:'MERCENARY_CRAFT'});bindWorkshopView();</script></html>`;
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1');
 if(req.method!=='GET'){writes++;res.writeHead(405);return res.end('Review is read only');}
 if(u.pathname==='/qa'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html(u.searchParams.get('variant')||'after'));}
 if(u.pathname==='/api/workshop'){reads++;res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(state));}
 const file=decodeURIComponent(u.pathname).replace(/^\/+/,''),resolved=path.resolve(root,file);assert(resolved.startsWith(root+path.sep));
 const data=await content(file,u.searchParams.get('variant'));res.writeHead(200,{'content-type':({'.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.webp':'image/webp','.png':'image/png','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});res.end(data);
 }catch(e){failed.push({url:req.url,message:e.message});res.writeHead(500);res.end('Review resource missing');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--explicitly-allowed-ports='+server.address().port]});
try{
 for(const width of mode==='public'?[390]:[1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000},hasTouch:width<700,serviceWorkers:'block',reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  if(mode==='local'&&width===1440){await page.goto(origin+'/qa?variant=before');await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();await page.locator('.ws-mercenary-select button').last().waitFor();assert.match(await page.locator('.ws-mercenary-select button').first().evaluate(b=>getComputedStyle(b).borderImageSource),/jokro-craft/);await page.locator('.ws-mercenary-select').screenshot({path:out+'/before-1440.png'});}
  await page.goto(origin+'/qa');await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();const nav=page.locator('.ws-mercenary-select');await nav.locator('button').last().waitFor();assert.equal(await nav.locator('button').count(),7);
  await page.waitForFunction(()=>[...document.querySelectorAll('.ws-mercenary-select img')].every(i=>i.complete&&i.naturalWidth>0));
  const first=nav.locator('button').first();assert.match(await first.evaluate(b=>getComputedStyle(b).borderImageSource),/action-user-approved.webp/);assert.match(await nav.locator('button').nth(1).evaluate(b=>getComputedStyle(b).borderImageSource),/panel-v3.webp/);
  assert.equal(await first.locator('b').evaluate(b=>getComputedStyle(b).color),'rgb(24, 36, 10)');
  const beforeReads=reads;
  for(let i=0;i<7;i++){const b=nav.locator('button').nth(i);await b.click();assert.equal(await nav.locator('[aria-pressed=true]').count(),1);assert.equal(await b.getAttribute('aria-pressed'),'true');assert.match(await b.evaluate(e=>getComputedStyle(e).borderImageSource),/action-user-approved.webp/);if([2,4,5].includes(i))assert(await page.locator('#wsMaterialCraft').isDisabled());}
  assert.equal(reads,beforeReads,'Selection must not make new API requests');
  await nav.locator('button').nth(2).focus();await page.keyboard.press('Enter');assert.equal(await nav.locator('button').nth(2).getAttribute('aria-pressed'),'true');assert.equal(await nav.locator('button').nth(2).evaluate(b=>b===document.activeElement),true);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
  const labels=await nav.innerText();assert.match(labels,/제작 OFF/);assert.match(labels,/한정 수량 소진/);assert.match(labels,/남은 4 \/ 8장/);
  await nav.screenshot({path:out+'/'+mode+'-'+width+'-selector.png'});await page.locator('#workshopRootV1881').screenshot({path:out+'/'+mode+'-'+width+'-workshop.png'});
  reports.push({width,buttons:7,allSelectionsWork:true,approvedNormalAndSelectedImages:true,darkSelectedText:true,focusPreserved:true,lockedAndSoldOutPreserved:true,extraSelectionReads:reads-beforeReads,horizontalOverflow:overflow});await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.equal(writes,0);fs.writeFileSync(out+'/'+mode+'-browser.json',JSON.stringify({status:'PASS',mode,reports,errors,failed,apiWrites:writes,productionWrites:0,fixture:'Isolated GET-only recipes; actual workshop renderer and styles',visualApprovalByUser:false},null,2)+'\n');console.log(JSON.stringify({status:'PASS',mode,reports,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {TROPHY_CATALOG} from '../../tmp/cardgu-live-20261027/js/player-card-model-v2052.js';
const root='C:/Users/User/Downloads/upload/cnine-card/tmp/cardgu-live-20261027',out=fileURLToPath(new URL('./',import.meta.url)),mode=process.argv[2]||'local',publicMode=mode==='public';
const at='2026-11-01T03:00:00.000Z',zero={coinPercent:0,dropPercent:0,accountXpPercent:0},errors=[],failed=[],checks=[],cache=new Map();
const profile=kind=>({player:{id:7,nickname:kind==='old'?'기존 수상자':'트로피 컬렉션'},ranked:{season:'공식 랭크 시즌',bestRank:1,longestStreak:3,currentStreak:3,wins:20,losses:2,history:[]},clanHistory:[],trophyBonuses:zero,trophies:TROPHY_CATALOG.map(t=>({...t,count:kind==='new'?1:kind==='old'&&t.edition==='legacy'?1:0,owned:kind==='new'||kind==='old'&&t.edition==='legacy',progress:kind==='new'?(t.code==='BLACKWING_CLEAR_15'?15:3):0,goal:t.code==='BLACKWING_CLEAR_15'?15:t.code==='CHALLENGER_STREAK_3_V2'?3:1,acquiredAt:kind==='new'?at:kind==='old'&&t.edition==='legacy'?'2026-10-30T00:00:00Z':null,availableFrom:t.edition==='new'?at:null,availableUntil:t.edition==='legacy'?at:null,effect:{description:'드랍률 증가 +0% · 계정 경험치 보너스 +0% · 코인 보너스 +0%'}}))});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local'),f=url.pathname.slice(1);
 if(url.pathname==='/qa'){res.writeHead(200,{'content-type':mime['.html']}).end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#070e18;color:white;font-family:Arial,sans-serif}button{font:inherit}*{box-sizing:border-box}h2,h3,p,dl{margin:0}</style><link rel="stylesheet" href="/css/player-card-v2052.css"><button id="open">명함 열기</button><script src="/js/player-card-v2052.js"></script></html>');return;}
 if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 let bytes;if(publicMode){const response=await fetch('https://cnine-card.pages.dev/'+f+'?trophyRenewal=20261101',{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,f);bytes=Buffer.from(await response.arrayBuffer());}
 else{const p=path.resolve(root,f);assert(p.startsWith(path.resolve(root)+path.sep));if(fs.existsSync(p))bytes=fs.readFileSync(p);else{if(!cache.has(f))cache.set(f,execFileSync('git',['-c','gc.auto=0','show','HEAD:'+f],{cwd:root,windowsHide:true,maxBuffer:30e6,stdio:['ignore','pipe','pipe']}));bytes=cache.get(f);}}
 res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream','cache-control':'no-store'}).end(bytes);
 }catch(e){failed.push(String(e.message));res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 for(const [engine,width]of publicMode?[[webkit,390]]:[[chromium,1440],[chromium,390],[webkit,320]]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'chrome'}:{})}),page=await browser.newPage({viewport:{width,height:width===1440?1100:844}}),tag=mode+'-'+(engine===webkit?'webkit-':'')+width;
  try{
   page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
   await page.evaluate(p=>{document.querySelector('#open').onclick=()=>PlayerCallingCard.open({previewData:p});},profile('new'));await page.locator('#open').focus();await page.locator('#open').click();
   const shelf=page.locator('[data-pc-shelf]:not([hidden])');assert.equal(await page.locator('[data-pc-shelf-count]').textContent(),'1 / 4');
   assert.deepEqual(await shelf.locator('.pc-trophy-name').allTextContents(),['흑익의 맹약','불멸의 왕조','챔피언스리그 우승','클랜의 영광']);
   await shelf.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));assert(await shelf.locator('img').evaluateAll(imgs=>imgs.every(img=>img.naturalWidth===512)));
   await shelf.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,tag+'-new.png')});
   await shelf.locator('[data-pc-trophy="0"]').click();assert.match(await page.locator('#pc-trophy-detail').textContent(),/15.*15회/);assert.match(await page.locator('#pc-trophy-detail').textContent(),/추가 이후/);
   await page.locator('[data-pc-page=next]').click();await page.locator('[data-pc-page=next]').click();await page.locator('[data-pc-page=next]').click();
   assert.equal(await page.locator('[data-pc-shelf-count]').textContent(),'4 / 4');assert.equal(await shelf.locator('.pc-trophy-name').filter({hasText:'(구)'}).count(),3);await shelf.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
   await shelf.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,tag+'-legacy.png')});
   const oldIndex=TROPHY_CATALOG.findIndex(t=>t.code==='CHALLENGER_STREAK_3');await shelf.locator('[data-pc-trophy="'+oldIndex+'"]').click();assert.match(await page.locator('#pc-trophy-detail').textContent(),/\(구\) 푸른 왕조/);assert.match(await page.locator('#pc-trophy-detail').textContent(),/신규 지급 종료/);
   assert(await page.locator('#player-card-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await page.keyboard.press('Escape');assert.equal(await page.locator('#player-card-dialog').isVisible(),false);if(engine===chromium)assert.equal(await page.locator('#open').evaluate(e=>e===document.activeElement),true);
   await page.evaluate(p=>PlayerCallingCard.open({previewData:p}),profile('old'));assert.equal(await shelf.locator('.is-owned').count(),0);await page.locator('[data-pc-page=next]').click();await page.locator('[data-pc-page=next]').click();await page.locator('[data-pc-page=next]').click();assert.equal(await shelf.locator('.is-owned').count(),3);
   await page.keyboard.press('Escape');checks.push({width,engine:engine===webkit?'webkit':'chromium',newArt:true,pages:4,legacyNames:true,oldOwnersPreserved:true,details:true,keyboard:true,noHorizontalOverflow:true,operatingAccountWrites:0});
  }catch(e){await page.screenshot({path:path.join(out,tag+'-failure.png'),fullPage:true});fs.writeFileSync(path.join(out,tag+'-failure.json'),JSON.stringify({message:e.message,errors,failed,text:await page.locator('body').innerText()},null,2));throw e;}finally{await page.close();await browser.close();}
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);fs.writeFileSync(path.join(out,mode+'-browser.json'),JSON.stringify({checks,errors,failed},null,2)+'\n');console.log(JSON.stringify({checks}));
}finally{await new Promise(r=>server.close(r));}

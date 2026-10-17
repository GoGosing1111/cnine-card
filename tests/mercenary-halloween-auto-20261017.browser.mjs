import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK} from '../shared/mercenary-halloween-pack-v1.mjs';
import {handleHalloweenPack} from '../functions/_mercenary_halloween_pack.js';

const root=process.cwd(),out=process.env.QA_OUT||'C:/Users/User/.codex/tmp/halloween-auto-20261017/qa';fs.mkdirSync(out,{recursive:true});
const cleanup=[];let samples=[],posts=0;
const f=await halloweenFixture({after:fn=>cleanup.push(fn)},{randomInt:()=>samples.shift()??0});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.mp4':'video/mp4'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host),json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
  if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  if(['/qa','/cms'].includes(url.pathname)){
   const script=url.pathname==='/qa'?`import {mountHalloweenPack} from '/js/mercenary-halloween-pack-live.mjs';window.ready=mountHalloweenPack({accountId:1,getAccountId:()=>1,api});`:`import {createHalloweenMercenaryEditor} from '/admin/mercenary-halloween-admin-v1.mjs';let editor;const host=document.getElementById('editor');function render(){host.innerHTML=editor.html();editor.mount(host.querySelector('[data-halloween-root]'));}editor=createHalloweenMercenaryEditor({onRender:render,request:options=>api('admin/mercenaries/halloween-pack',options)});render();`;
   const transport=`async function api(path,options={}){const r=await fetch('/api/'+path,{...options,headers:{'content-type':'application/json'},...(options.body?{body:typeof options.body==='string'?options.body:JSON.stringify(options.body)}:{})});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error),d,{status:r.status});return d;}`;
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><link rel="stylesheet" href="/admin/mercenary-limited-admin-v1.css"><body style="margin:0;background:#090c18;color:#eee"><main id="editor" class="mc-admin" style="padding:12px;max-width:1000px;margin:auto"></main><script type="module">${transport}${script}</script></body></html>`);
  }
  if(url.pathname==='/api/'+HALLOWEEN_PACK.featurePath)return json(await f.state());
  if(url.pathname==='/api/'+HALLOWEEN_PACK.openPath){posts++;const chunks=[];for await(const chunk of req)chunks.push(chunk);return json(await f.service.open(f.env,f.user,JSON.parse(Buffer.concat(chunks))));}
  if(url.pathname==='/api/'+HALLOWEEN_PACK.receiptPath)return json(await f.service.receipt(f.env,f.user,url.searchParams.get('requestId')));
  if(url.pathname==='/api/'+HALLOWEEN_PACK.adminPath){const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request(url,{method:req.method,headers:{origin:url.origin,'content-type':'application/json'},...(req.method==='PATCH'?{body:Buffer.concat(chunks)}:{})});const result=await handleHalloweenPack({path:HALLOWEEN_PACK.adminPath,request,env:f.env,deps:{requirePermission:async()=>f.user,json:(body,status=200)=>({body,status})}});return json(result.body,result.status);}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(!fs.existsSync(file))return res.writeHead(404).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(e.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message,code:e.code}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const width of (process.env.QA_WIDTHS||'1440,390').split(',').map(Number)){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1050},serviceWorkers:'block'}),page=await context.newPage(),errors=[],failed=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/\.(png|webp|mp4|mjs|css)(\?|$)/.test(r.url()))failed.push(r.url());});
  f.settings.mode='OFF';f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,['V-999','V-996'].includes(code)?100:code==='V-989'?50:10000]));f.settings.normalSssRatePpm=887400;await f.configure(7);
  await page.goto(base+'/cms');await page.locator('[data-halloween-mode]').waitFor();await page.locator('[data-halloween-mode]').selectOption('ON');assert.match(await page.locator('[data-halloween-draft]').innerText(),/미저장 선택: ON/);assert.match(await page.locator('.mlc-hero b').innerText(),/OFF/);
  await page.locator('[data-halloween-save]').click();await page.waitForFunction(()=>document.querySelector('[data-halloween-notice]')?.textContent.includes('합계'));assert.equal((await f.state()).settings.mode,'OFF');
  await page.locator('[data-halloween-remainder]').click();assert.equal(await page.locator('[data-halloween-fallback]').inputValue(),'92.975');await page.locator('[data-halloween-save]').click();await page.waitForFunction(()=>document.querySelector('[data-halloween-notice]')?.textContent.includes('저장 완료 · 판매 상태 ON'));assert.equal((await f.state()).settings.mode,'ON');assert.equal((await f.state()).readiness.ready,true);
  await page.locator('[data-halloween-mode]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'cms-'+width+'.png')});
  f.settings.mode='ON';f.settings.normalSssRatePpm=929750;f.settings.normalRankRatesPpm={C:0,B:0,A:0,S:0,SS:500000,SSS:400000};f.settings.missRatePpm=100000;await f.configure(10);
  // Reproduce the live global lockout: Namsudaeng is sold out, other cards remain.
  await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=10 WHERE code='V-986'");
  assert.equal((await f.state()).userOpeningEnabled,true);
  const cancelledId=crypto.randomUUID();
  await f.pg.query("INSERT INTO joint_operations_v1(request_id,user_id,kind,input_hash,plan_json,status,created_at) VALUES($1,1,'MERCENARY_HALLOWEEN_OPEN','qa','{}','CANCELLED','2026-10-17')",[cancelledId]);
  await page.evaluate(body=>localStorage.setItem('cnine.halloween-pack.pending:1',JSON.stringify({accountId:1,body})),{requestId:cancelledId,count:1,expectedRevision:10});
  const beforeRecovery=posts;
  await page.goto(base+'/qa');await page.locator('[data-hwp-buy="10"]:not([disabled])').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-hwp-status]')?.textContent.includes('취소된 이전 요청을 정리'));
  assert.equal(posts,beforeRecovery);assert.equal(await page.evaluate(()=>localStorage.getItem('cnine.halloween-pack.pending:1')),null);
  await page.locator('[data-hwp-auto-toggle]').click();await page.locator('[data-hwp-auto-repeats]').fill('2');assert.match(await page.locator('[data-hwp-auto-quote]').innerText(),/총 20회 · 최대 1,800 코인/);
  await page.locator('.hwp-dialog').screenshot({path:path.join(out,'auto-settings-'+width+'.png')});
  const before=posts;await page.locator('[data-hwp-auto-start]').click();assert.match(await page.locator('[data-hwp-confirm-text]').innerText(),/10회씩 2회 반복/);await page.locator('.hwp-confirm-inner').screenshot({path:path.join(out,'auto-confirm-'+width+'.png')});await page.keyboard.press('Escape');assert.equal(posts,before);
  samples=[0,0,5000000000,9999999999,0,...Array(8).fill([0,0]).flat()];
  await page.locator('[data-hwp-auto-start]').click();await page.locator('[data-hwp-confirm-start]').click();await page.locator('.hwp-result').nth(9).waitFor();await page.waitForFunction(()=>document.querySelector('.hwp-video')?.dataset.cinematic==='SS'&&document.querySelector('video')?.currentTime>0);
  assert.equal(posts,before+1);assert.match(await page.locator('[data-hwp-auto-progress]').innerText(),/1 \/ 2회 반복 · 10회 개봉 · 900 코인 사용/);assert.equal(await page.locator('video').evaluate(v=>v.muted),true);
  await page.locator('[data-hwp-pause]').click();assert.equal(await page.locator('video').evaluate(v=>v.paused),true);assert.equal(posts,before+1);await page.locator('[data-hwp-skip]').click();
  await page.waitForFunction(()=>document.querySelector('.hwp-video')?.dataset.cinematic==='SSS'&&document.querySelector('video')?.currentTime>0);assert.equal(posts,before+1);
  await page.locator('.hwp-dialog').screenshot({path:path.join(out,'sss-auto-'+width+'.png')});await page.locator('[data-hwp-auto-stop]').click();await page.locator('[data-hwp-skip]').click();await page.locator('[data-hwp-auto-toggle]:not([disabled])').waitFor();assert.equal(posts,before+1);assert.match(await page.locator('[data-hwp-status]').innerText(),/총 10회/);
  // Let a real SS video finish naturally; only then may the second batch start.
  samples=[0,0,9900000000];const second=posts;
  await page.locator('[data-hwp-auto-toggle]').click();await page.locator('[data-hwp-auto-count]').selectOption('1');await page.locator('[data-hwp-auto-repeats]').fill('2');await page.locator('[data-hwp-auto-start]').click();await page.locator('[data-hwp-confirm-start]').click();await page.waitForFunction(()=>document.querySelector('.hwp-video')?.dataset.cinematic==='SS'&&document.querySelector('video')?.currentTime>0);assert.equal(posts,second+1);
  await page.waitForFunction(()=>document.querySelector('[data-hwp-status]')?.textContent.includes('설정한 자동뽑기를 완료했습니다.'),{},{timeout:25000});assert.equal(posts,second+2);assert.match(await page.locator('[data-hwp-status]').innerText(),/총 2회 · 200 코인/);
  // A completed but locally pending result restores on entry without a POST.
  await page.evaluate(()=>{const r=JSON.parse(localStorage.getItem('cnine.halloween-pack.receipt:1'));localStorage.setItem('cnine.halloween-pack.pending:1',JSON.stringify({accountId:1,body:{requestId:r.requestId,count:r.count,expectedRevision:r.revision}}));});
  const beforeReload=posts;await page.reload();await page.locator('[data-hwp-auto-toggle]:not([disabled])').waitFor();
  await page.waitForFunction(()=>document.querySelector('.hwp-result')&&localStorage.getItem('cnine.halloween-pack.pending:1')===null);
  assert.equal(posts,beforeReload);assert.equal(await page.locator('[data-hwp-auto-running]').isVisible(),false);
  await page.locator('[data-hwp-auto-toggle]').click();assert.equal(await page.locator('[data-hwp-auto-start]').isEnabled(),true);
  await page.locator('.hwp-dialog').screenshot({path:path.join(out,'recovered-auto-'+width+'.png')});
  // Missing/unsubmitted requests stay pending until the player explicitly recovers.
  const missingId=crypto.randomUUID();await page.evaluate(body=>localStorage.setItem('cnine.halloween-pack.pending:1',JSON.stringify({accountId:1,body})),{requestId:missingId,count:1,expectedRevision:10});
  await page.reload();await page.waitForFunction(()=>document.querySelector('[data-hwp-status]')?.textContent.includes('이전 개봉이 아직 확인되지'));
  assert.equal(posts,beforeReload);samples=[9900000000];await page.locator('[data-hwp-recover]').click();
  await page.waitForFunction(()=>document.querySelector('.hwp-result')&&localStorage.getItem('cnine.halloween-pack.pending:1')===null);
  assert.equal(posts,beforeReload+1);assert.equal((await f.pg.query('SELECT status FROM joint_operations_v1 WHERE request_id=$1',[missingId])).rows[0].status,'COMPLETED');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.querySelector('.hwp-dialog').scrollWidth>document.querySelector('.hwp-dialog').clientWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  reports.push({width,partialStockKeepsOpeningEnabled:true,cancelledRequestClearedWithoutPost:true,completedRequestRecoveredWithoutPost:true,unknownRequestRequiresExplicitRecovery:true,cmsIncompleteOnBlocked:true,cmsRemainder:'92.975',cmsOwnerOnSavedInIsolatedDatabase:true,confirmationCancelNoPurchase:true,ssThenSssVideo:true,noPurchaseDuringVideo:true,stopAfterCurrentBatch:true,ssNaturalEndResumes:true,completedSingleDraws:2,errors,failed});await context.close();
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));for(const fn of cleanup)await fn();}

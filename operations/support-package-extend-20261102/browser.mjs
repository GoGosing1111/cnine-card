import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {packageFixture} from '../../output/revan-live-20261027/release-checkout/tests/helpers/support-package-fixture.mjs';
const root=path.resolve('C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout'),publicAssets=process.argv.includes('--public'),out=fileURLToPath(new URL(publicAssets?'public/':'browser/',import.meta.url));fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
let fixture;const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(url.pathname==='/qa')return res.writeHead(200,{'content-type':mime['.html']}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#080e19;color:#e4e8f0;margin:0"><div id="host"></div><script type="module">
 import {mountServerSupportNavigation} from '/js/server-support-v1.mjs';
 localStorage.setItem('cnine_card_api_token','qa-2');const root=document.getElementById('host').attachShadow({mode:'open'});root.innerHTML='<dialog id="menu-dialog" data-menu-category="all" style="background:#111b2c;border:1px solid #76849a;color:#fff;min-width:280px"><h2>전체 메뉴</h2></dialog>';
 const request=async(path,options={})=>{const response=await fetch('/api/'+path,{method:options.method||'GET',headers:{'content-type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error);return data;};
 window.view=mountServerSupportNavigation({root,getUser:()=>({id:2}),request});root.getElementById('menu-dialog').showModal();
 </script></body></html>`);
 if(url.pathname.startsWith('/api/')){
  const endpoint=url.pathname.slice(5);if(endpoint.startsWith('sync/'))return res.writeHead(200,{'content-type':mime['.json']}).end('{}');
  assert.equal(req.method,'GET','Browser verification must not submit orders');
  const response=await fixture.handle(new Request('https://support.test/api/'+endpoint,{headers:{authorization:'Bearer qa-2',origin:'https://support.test','user-agent':req.headers['user-agent']||''}}));return res.writeHead(response.status,{'content-type':mime['.json']}).end(await response.text());
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));assert(file.startsWith(root+path.sep));const rel=path.relative(root,file).replaceAll('\\','/');
 const bytes=publicAssets?await(async()=>{const r=await fetch('https://cnine-card.pages.dev'+url.pathname+url.search,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,rel);return Buffer.from(await r.arrayBuffer());})():fs.existsSync(file)?fs.readFileSync(file):execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false','show','HEAD:'+rel],{cwd:root,windowsHide:true,maxBuffer:20e6,stdio:['ignore','pipe','ignore']});
 return res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}).end(bytes);
 }catch(e){res.writeHead(500,{'content-type':mime['.json']}).end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,reports=[];
const profiles=publicAssets?[{name:'public-mobile',width:390,engine:'webkit'}]:[{name:'desktop',width:1440,engine:'chromium'},{name:'mobile',width:390,engine:'chromium'},{name:'safari',width:390,engine:'webkit'}];
try{for(const p of profiles){
 fixture=await packageFixture({postgres:true});fixture.clock.now=Date.parse('2026-11-03T00:00:00+09:00');await fixture.activate();
 const browser=await (p.engine==='webkit'?webkit:chromium).launch({headless:true,...(p.engine==='chromium'?{channel:'chrome'}:{})});
 try{const context=await browser.newContext({viewport:{width:p.width,height:p.width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],failed=[];
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
  await page.goto(base+'/qa');try{await page.getByRole('button',{name:'서버 안내',exact:true}).click({timeout:7000});}catch(e){console.error(JSON.stringify({profile:p.name,errors,failed,html:await page.evaluate(()=>document.getElementById('host').shadowRoot?.innerHTML),status:await fixture.call('server-support/status',{user:2})}));throw e;}await page.locator('[data-ss-package]').waitFor();await page.locator('[data-ss-package]').click();await page.locator('[data-package-apply]').waitFor();
  assert.equal(await page.locator('.spkg-event-deadline time').getAttribute('datetime'),'2026-11-04T00:00:00+09:00');assert.match(await page.locator('.spkg-event-deadline').innerText(),/11월 4일 00:00 판매 종료/);assert.match(await page.locator('.spkg-event-deadline small').innerText(),/11월 3일에서 4일/);
  assert.match(await page.locator('.spkg-rewards').innerText(),/500조/);assert.match(await page.locator('.spkg-hero strong').innerText(),/49,800/);assert.equal(await page.locator('[data-package-apply]').isEnabled(),true);
  await page.locator('.spkg-rewards img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));assert.equal(await page.locator('.spkg').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  await page.locator('.ss-dialog').screenshot({path:path.join(out,p.name+'-extended.png')});
  fixture.clock.now=Date.parse('2026-11-04T00:00:00+09:00');await page.reload();await page.getByRole('button',{name:'서버 안내',exact:true}).click();await page.locator('[data-ss-support]').waitFor();assert.equal(await page.locator('[data-ss-package]').count(),0);
  await page.locator('.ss-dialog').screenshot({path:path.join(out,p.name+'-closed.png')});assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  reports.push({profile:p.name,width:p.width,engine:p.engine,oldDeadlineStillOpen:true,newDeadlineDisplayed:'2026-11-04T00:00:00+09:00',newDeadlineHidesPackage:true,priceWon:49800,coins:'500000000000000',imagesLoaded:true,noOverflow:true,errors,failed,publicAssets,productionWrites:0});await context.close();
 }finally{await browser.close();await fixture.close();fixture=null;}
}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'PASS',reports,productionWrites:0,messagesSent:0},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(reports));
}finally{await new Promise(r=>server.close(r));if(fixture)await fixture.close();}

import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {superstarFixture} from './helpers/superstar-pack-bulk-fixture.mjs';
import {handleSuperstarPackDraw,superstarPackCatalogRow} from '../functions/_superstar_pack.js';
const root=process.cwd(),out=path.resolve(process.argv[2]),cleanup=[],reports=[];
const production=JSON.parse(fs.readFileSync(path.join(out,'before/production.json'))),pack=superstarPackCatalogRow(production.settings),f=await superstarFixture({after:fn=>cleanup.push(fn)},{...production.settings,types:0});
for(const c of production.cards)await f.p('INSERT INTO cards(id,title,image_url,focus_x,focus_y,power_type,base_power) VALUES(?,?,?,?,?,?,?)',c.id,c.title,c.image,c.focusX,c.focusY,c.powerType,c.basePower).run();
const source=fs.readFileSync('js/app.js','utf8'),section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const binding=source.split('\n').find(line=>line.includes("querySelectorAll('[data-superstar-bulk]')"));
let posts=0,loseResponse=false,delay=0;const requests=[];
const harness=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/superstar-pack-v1894.css"><style>body{margin:0;background:#060c16;color:#fff;font-family:Arial,sans-serif}#shop{padding:16px}.draw-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.draw-options button{min-height:60px}.draw-options button small{display:block}.hero-pack-zone img{width:180px}</style><div id="shop"></div><div id="modal"></div><script>
var fixtureUser={serverUserId:1,nickname:'검수',coin:100000000000000,owned:[],quantities:{},history:[]},API_MODE=true,drawRequestInFlight=false,notices=[];
var loadUser=()=>fixtureUser,saveUser=u=>fixtureUser=u,readPendingDraw=()=>null,clearApiCache=()=>{},mergeClientCards=()=>{},showSupplyNotice=m=>notices.push(m),openPack=()=>{},escapeHtml=s=>String(s),packArt=()=>'<img src="/assets/ui/packs/reverse-call-20261016/superstar-768.webp" alt="슈퍼스타팩">';
var PACK=${JSON.stringify(pack)},getPack=()=>PACK,superstarPackAccess=()=>({owner:false,early:false});
var apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json',...o.headers}}),v=await r.json();if(!r.ok)throw Object.assign(Error(v.error),v,{status:r.status});return v;};
</script><script src="/js/superstar-test-integration.js"></script><script>document.getElementById('shop').innerHTML=superstarPackHero(PACK);${binding}</script></html>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.avif':'image/avif'},assetCache=new Map();
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host),send=(body,status=200)=>res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(body));
 if(url.pathname==='/test')return res.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(harness);
 if(url.pathname==='/js/superstar-test-integration.js')return res.writeHead(200,{'content-type':'text/javascript'}).end(section('const AUTO_DRAW_LOCK_KEY=','function loadAutoDrawPrefs(){')+section('function readAutoDrawLock(){','function preserveAutoDrawLeaseOnUnload(){')+section('const SUPERSTAR_PENDING_DRAW_KEY=','window.SuperstarPackV1894=')+section('function hasPendingUltimateBulk(){','openPack=async function(')+section('function superstarPackHero(pack) {','function limitedMercenaryPackHero'));
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(url.pathname==='/api/superstar-pack/draw'){
  posts++;let body='';for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));
  const r=await handleSuperstarPackDraw({env:f.env,deps:f.deps,request:new Request(url,{method:'POST',headers:req.headers,body})});
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));if(loseResponse){loseResponse=false;return send({error:'시험 응답 유실'},503);}return send(r.body,r.status);
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 if(fs.existsSync(file)&&fs.statSync(file).isFile())return fs.createReadStream(file).pipe(res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}));
 if(url.pathname.startsWith('/assets/')){if(!assetCache.has(url.pathname)){const r=await fetch('https://cnine-card.pages.dev'+url.pathname);assetCache.set(url.pathname,{status:r.status,mime:r.headers.get('content-type'),data:Buffer.from(await r.arrayBuffer())});}const a=assetCache.get(url.pathname);return res.writeHead(a.status,{'content-type':a.mime}).end(a.data);}
 res.writeHead(404).end();
}catch(e){res.writeHead(500,{'content-type':'application/json'}).end(JSON.stringify({error:e.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:width>600?1000:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'/test');assert.equal(await page.locator('[data-superstar-bulk]').count(),2);assert.equal(await page.locator('.superstar-draw').count(),2);
  if(width===390){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
  for(const count of [1000,10000]){
   const before=posts;await page.locator(`[data-superstar-bulk="${count}"]`).click();await page.locator('.ultimate-bulk-dialog[data-pack="superstar"]').waitFor();assert.equal(posts,before,'opening modal never charges');
   assert.match(await page.locator('.ub-quote').innerText(),new RegExp((count*pack.price).toLocaleString('ko-KR')));assert.equal(await page.locator('[data-ub-count="100000"]').count(),0);
   if(width===1440&&count===1000){const other=await context.newPage();await other.goto(base+'/test');await other.locator('[data-superstar-bulk="1000"]').click();assert.equal(await other.locator('.ultimate-bulk-dialog').count(),0);assert.match(await other.evaluate(()=>notices.at(-1)),/다른 창/);await other.close();}
   await page.locator('#ub-count').fill('2000');assert.equal(await page.locator('.ub-start').isDisabled(),true);await page.locator(`[data-ub-count="${count}"]`).click();
   const start=performance.now();await page.locator('.ub-start').click();await page.locator('.ub-results h3').filter({hasText:count.toLocaleString('ko-KR')+'회 개봉 완료'}).waitFor();const ms=performance.now()-start;
   assert.equal(posts,before+1);assert.equal(await page.locator('.ub-card').count(),7);assert.equal(await page.locator('video').count(),0);assert.equal(await page.locator('[data-ub-detail-rows] tr').count(),0);
   await page.locator('.ub-details summary').click();assert.equal(await page.locator('[data-ub-detail-rows] tr').count(),7);await page.locator('.ub-details summary').click();
   assert.equal(await page.locator('.ultimate-bulk-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+2),false);assert.equal(await page.evaluate(()=>localStorage.getItem('cnine:superstar-bulk:v1:1')),null);assert.deepEqual(errors,[]);
   if(count===10000){await page.locator('.ultimate-bulk-dialog').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,`screen-${width}.png`)});}
   reports.push({width,count,ms:Math.round(ms),posts:posts-before,images:7,overflow:false,errors});await page.locator('.ub-close').click();assert.equal(await page.evaluate(()=>drawRequestInFlight||superstarPackOpeningBusy),false);
  }
  if(width===390){
   loseResponse=true;const charges=Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n);await page.locator('[data-superstar-bulk="1000"]').click();await page.locator('.ub-start').click();await page.locator('.ub-status').filter({hasText:'같은 요청을 보관'}).waitFor();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('cnine:superstar-bulk:v1:1')));await page.reload();await page.locator('[data-superstar-bulk="10000"]').click();assert.match(await page.locator('.ub-start').innerText(),/이전/);await page.locator('.ub-start').click();await page.locator('.ub-results h3').filter({hasText:'1,000회 개봉 완료'}).waitFor();assert.equal(requests.at(-1).requestId,saved.requestId);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),charges+1);reports.push({recovery:'lost POST + reload + same-ID replay',extraCharges:0});await page.locator('.ub-close').click();
   delay=200;await page.locator('[data-superstar-bulk="1000"]').click();await page.locator('.ub-start').click();await page.evaluate(()=>fixtureUser.serverUserId=2);await page.locator('.ub-status').filter({hasText:'계정이 변경'}).waitFor();assert.notEqual(await page.evaluate(()=>localStorage.getItem('cnine:superstar-bulk:v1:1')),null);reports.push({accountSwitch:'original account request retained, result not applied'});delay=0;
  }
  await context.close();
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({at:new Date().toISOString(),realModules:true,productionWrites:0,reports},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));for(const fn of cleanup)await fn();}

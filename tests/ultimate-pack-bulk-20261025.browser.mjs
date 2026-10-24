import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {ultimateFixture} from './helpers/ultimate-pack-bulk-fixture.mjs';
const root=process.cwd(),out=path.resolve(process.argv[2]||'docs/qa/ultimate-pack-bulk-20261025'),cleanup=[],reports=[];fs.mkdirSync(out,{recursive:true});
const f=await ultimateFixture({after:fn=>cleanup.push(fn)});await f.p("UPDATE card_packs SET price=3000 WHERE id='ultimate'").run();
const source=fs.readFileSync('js/app.js','utf8'),section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const production=JSON.parse(fs.readFileSync(path.join(out,'production-before.json'))),images=production.context.poolsByGrade.flatMap(([,rows])=>rows).filter(c=>c.image),example=images.find(c=>c.grade==='SSR')||images[0];
await f.p('UPDATE cards SET image_url=?',example.image).run();
const pack={id:'ultimate',theme:'ultimate',name:'얼티메이트 카드팩',subtitle:'ULTIMATE PACK',price:3000,description:'상위 등급 카드팩',guarantee10:'UR',guarantee20:'SSR'};
let posts=0,receipts=0,loseResponse=false,delay=0;const requests=[];
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.avif':'image/avif'};
const harness=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#060c16;color:#fff;font-family:Arial,sans-serif}.v21-live-route{padding:16px}.draw-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}button{min-height:48px}.hero-pack-zone img{width:200px}.btn small{display:block}@media(max-width:600px){.draw-options{grid-template-columns:repeat(2,minmax(0,1fr))}}</style><div id="app"><div class="v21-live-route" data-live-route="buy"><div class="v21-route-body v21-card-store" id="shop"></div></div></div><div id="modal"></div><script>
var fixtureUser={serverUserId:1,coin:100000000000000,owned:[],quantities:{},breakthroughs:{}},API_MODE=true,drawRequestInFlight=false,applied=[],notices=[];
var loadUser=()=>fixtureUser,saveUser=u=>fixtureUser=u,readPendingDraw=()=>null,clearApiCache=()=>{},mergeClientCards=()=>{},mergeApiUserSummary=(s,b)=>({...b,...s}),showSupplyNotice=m=>notices.push(m),openPack=()=>{},escapeHtml=s=>String(s),packArt=()=>'<img src="/assets/ui/packs/reverse-call-20261016/ultimate-768.webp" alt="팩">';
var PACK=${JSON.stringify(pack)},getPack=()=>PACK;
var apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json',...o.headers}}),v=await r.json();if(!r.ok)throw Object.assign(Error(v.error),v,{status:r.status});if(p==='draw/ultimate-bulk')applied.push(v);return v;};
</script><script src="/js/ultimate-test-integration.js"></script><script>
document.getElementById('shop').innerHTML=standardPackHero(PACK);
</script><script src="/js/soopketmon-v21-login-shop-adapter.js"></script></html>`;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host),send=(v,status=200)=>res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(v));
  if(url.pathname==='/test')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(harness);
  if(url.pathname==='/js/ultimate-test-integration.js')return res.writeHead(200,{'content-type':'text/javascript'}).end(section("const AUTO_DRAW_LOCK_KEY=",'function loadAutoDrawPrefs(){')+section('function readAutoDrawLock(){','function preserveAutoDrawLeaseOnUnload(){')+section('function hasPendingUltimateBulk(){','openPack=async function(')+section('function standardPackHero(pack) {','function buyView(user) {'));
  if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  if(url.pathname==='/api/draw/ultimate-bulk'){posts++;let raw='';for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw);requests.push(b);const r=await f.service.open(f.env,f.user,b);if(delay)await new Promise(resolve=>setTimeout(resolve,delay));if(loseResponse){loseResponse=false;return send({error:'테스트 응답 유실'},503);}return send(r);}
  if(url.pathname==='/api/draw/ultimate-bulk/receipt'){receipts++;return send(await f.service.receipt(f.env,f.user,url.searchParams.get('requestId')));}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  if(fs.existsSync(file)&&fs.statSync(file).isFile()){res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);return;}
  if(url.pathname.startsWith('/assets/')){const r=await fetch('https://cnine-card.pages.dev'+url.pathname);res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream'}).end(Buffer.from(await r.arrayBuffer()));return;}
  res.writeHead(404).end();
 }catch(e){res.writeHead(e.status||500,{'content-type':'application/json'}).end(JSON.stringify({error:e.message,code:e.code}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:width>600?1000:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'/test');await page.locator('[data-count="100000"]').waitFor();assert.equal(await page.locator('.v21-bulk-draw').count(),3);
  await page.locator('[data-count="100000"]').click();await page.locator('.ultimate-bulk-dialog').waitFor();assert.match(await page.locator('.ub-quote').innerText(),/100,000장 · 300,000,000 코인/);
  if(width===1440){const other=await context.newPage();await other.goto(base+'/test');await other.locator('[data-count="100000"]').click();assert.equal(await other.locator('.ultimate-bulk-dialog').count(),0);assert.match(await other.evaluate(()=>notices.at(-1)),/다른 창/);await other.close();reports.push({crossTab:'existing production lock excludes second tab'});}
  await page.locator('#ub-count').fill('100001');assert.equal(await page.locator('.ub-start').isDisabled(),true);await page.locator('[data-ub-count="100000"]').click();
  if(width===390){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
  const before=posts,start=performance.now();await page.locator('.ub-start').click();await page.locator('.ub-results h3').filter({hasText:'100,000장 개봉 완료'}).waitFor();const ms=performance.now()-start;
  assert.equal(posts,before+1);assert.equal(await page.locator('[data-ub-featured] .ub-card').count(),24);assert.equal(await page.locator('video').count(),0);assert.equal(await page.locator('[data-ub-detail-rows] tr').count(),0);assert(await page.evaluate(()=>Object.values(fixtureUser.quantities).reduce((a,b)=>a+b,0))>=100000);
  await page.locator('.ub-details summary').click();assert.equal(await page.locator('[data-ub-detail-rows] tr').count(),50);await page.locator('[data-ub-detail-next]').click();assert.match(await page.locator('[data-ub-detail-page]').innerText(),/2/);
  await page.locator('.ub-details summary').click();await page.locator('[data-ub-feature-next]').click();assert.match(await page.locator('[data-ub-feature-page]').innerText(),/2/);
  const overflow=await page.locator('.ultimate-bulk-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+2);assert.equal(overflow,false);assert.equal(await page.evaluate(()=>localStorage.getItem('cnine:ultimate-bulk:v1:1')),null);assert.equal(errors.length,0,JSON.stringify(errors));
  await page.locator('.ultimate-bulk-dialog').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'desktop-mobile-'+width+'.png')});reports.push({width,ms:Math.round(ms),posts:posts-before,featuredImages:await page.locator('.ub-card img').count(),overflow,errors});
  await page.locator('.ub-results').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'results-'+width+'.png')});
  await page.locator('.ub-close').click();assert.equal(await page.evaluate(()=>drawRequestInFlight),false);assert.equal(await page.evaluate(()=>readAutoDrawLock()),null);
  // Uncertain POST: reload keeps the original ID and GET restores it with no charge.
  if(width===390){loseResponse=true;await page.locator('[data-count="1000"]').click();const initial=posts;await page.locator('.ub-start').click();await page.locator('.ub-status').filter({hasText:'같은 요청을 보관'}).waitFor();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('cnine:ultimate-bulk:v1:1')));await page.reload();await page.locator('[data-count="100000"]').click();assert.match(await page.locator('.ub-start').innerText(),/이전/);await page.locator('.ub-start').click();await page.locator('.ub-results h3').filter({hasText:'1,000장 개봉 완료'}).waitFor();assert.equal(posts,initial+1);assert.equal(requests.at(-1).requestId,saved.requestId);reports.push({recovery:'lost POST + reload + GET',extraCharges:0});await page.locator('.ub-close').click();}
  // Other ordinary packs retain the existing 1,000-card queue UI.
  await page.evaluate(()=>{PACK={...PACK,id:'advanced',theme:'advanced'};document.getElementById('shop').innerHTML=standardPackHero(PACK);SoopketmonV21LoginShop.enhanceCardStore();});assert.equal(await page.locator('[data-count="100000"]').count(),0);assert.equal(await page.locator('.v21-bulk-draw').count(),1);
  await context.close();
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({at:new Date().toISOString(),reports,productionAccountWrites:0,realModules:true},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));for(const fn of cleanup)await fn();}

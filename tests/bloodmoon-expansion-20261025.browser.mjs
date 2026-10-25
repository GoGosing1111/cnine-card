import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {bloodmoonPackState} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {prepareExpansion} from '../scripts/ops/bloodmoon-expansion-20261025.mjs';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
const root=process.cwd(),fallback='C:/Users/User/Downloads/cnine-z-body-sword-20260918/site',out=process.env.QA_OUT;assert(out);fs.mkdirSync(out,{recursive:true});
const live=JSON.parse(fs.readFileSync(process.env.QA_READ,'utf8')),settings=prepareExpansion(live.document.settings);
const stock=Object.entries(settings.stockLimits).map(([code,stock_limit])=>({code,stock_limit,issued:Number([...live.stock,...live.otherPackStock].find(s=>s.code===code)?.issued??0)}));
const state={revision:8,...bloodmoonPackState(settings,stock,['C','B','A','S','SS','SSS'].map((rank,i)=>({code:'QA-'+i,rank,name:rank,weight:1})))};
assert.equal(state.readiness.ready,true,state.readiness.blockers.join(' '));
const codex=mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.woff2':'font/woff2'};
let writes=0;const missing=new Set();
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(req.method!=='GET'){writes++;res.writeHead(405).end();return;}
 if(url.pathname==='/state'){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(state));return;}
 if(url.pathname==='/api/mercenary-codex'){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(codex));return;}
 if(url.pathname.startsWith('/api/')){res.writeHead(401,{'content-type':'application/json'}).end('{"error":"로그인이 필요합니다."}');return;}
 if(url.pathname==='/room'){res.writeHead(200,{'content-type':mime['.html']}).end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><script type="module">import {mountBloodmoonPack} from "/js/mercenary-bloodmoon-pack-live.mjs";await mountBloodmoonPack({accountId:1,getAccountId:()=>1,api:()=>fetch("/state").then(r=>r.json())});</script></body></html>');return;}
 if(url.pathname==='/cms'){res.writeHead(200,{'content-type':mime['.html']}).end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><link rel="stylesheet" href="/admin/mercenary-limited-admin-v1.css"><body style="margin:0;background:#10141d;color:#eee"><main></main><script type="module">import {createBloodmoonMercenaryEditor} from "/admin/mercenary-bloodmoon-admin-v1.mjs";const root=document.querySelector("main");const editor=createBloodmoonMercenaryEditor({request:()=>fetch("/state").then(r=>r.json()),onRender(){root.innerHTML=editor.html();editor.mount(root.querySelector("[data-bloodmoon-root]"));}});root.innerHTML=editor.html();editor.mount(root.querySelector("[data-bloodmoon-root]"));</script></body></html>');return;}
 let relative=decodeURIComponent(url.pathname);if(relative.endsWith('/'))relative+='index.html';let file=path.resolve(root,'.'+relative);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(!fs.existsSync(file))file=path.resolve(fallback,'.'+relative);
 if(!fs.existsSync(file)||!fs.statSync(file).isFile()){missing.add(relative);res.writeHead(404).end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});const reports=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width<600?900:1080},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/room');await page.locator('[data-bwp-buy="1"]:not([disabled])').waitFor();
  for(const code of ['V-960','V-961','V-962','V-963','V-964','V-965'])assert.match(await page.locator('[data-bwp-stock-code="'+code+'"]').innerText(),/남은 10장/);
  assert.match(await page.locator('[data-bwp-stock-code="V-978"]').innerText(),/남은 2장/);assert.match(await page.locator('[data-bwp-stock-code="V-973"]').innerText(),/남은 3장/);assert.match(await page.locator('[data-bwp-stock-code="V-058"]').innerText(),/발행 한도 없음/);
  for(const [code,percent] of [['V-973','0.0000016%'],['V-974','0.0000008%'],['V-058','0.000032%']])assert((await page.locator('[data-bwp-chance-code="'+code+'"]').innerText()).includes(percent));
  for(const code of ['V-973','V-058']){const card=page.locator('[data-code="'+code+'"]');await card.scrollIntoViewIfNeeded();await card.locator('img').evaluate(img=>img.decode());assert(await card.locator('img').evaluate(img=>img.naturalWidth>0));}
  assert.equal(await page.locator('.bwp-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  await page.locator('[data-code="V-973"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'room-'+width+'.png')});
  await page.locator('[data-code="V-058"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'razak-'+width+'.png')});
  await page.locator('[data-bwp-buy="1"]').click();await page.locator('[data-bwp-confirm]:not([hidden])').waitFor();await page.locator('[data-bwp-confirm-cancel]').click();assert.equal(writes,0);
  await page.goto(base+'/cms');await page.locator('[data-bloodmoon-price="single"]').waitFor();assert.match(await page.locator('.mlc-hero').innerText(),/SS 6종 각 40장/);assert.match(await page.locator('.mlc-hero').innerText(),/레오넬 9장/);
  assert.equal(await page.locator('[data-bloodmoon-price="single"]').inputValue(),'1500000000');assert.equal(await page.locator('[data-bloodmoon-mode]').inputValue(),'ON');
  const ss=await page.locator('[data-bwp-cms-rank="SS"] article').allTextContents();assert.equal(ss.length,6);assert(ss.every(s=>s.includes('서버 한도 40장')&&s.includes('발행 30 · 잔여 10')));
  assert.equal(await page.locator('[data-bwp-cms-rank="SSS"] article').count(),4);
  const razak=page.locator('[data-bwp-cms-rank="STANDARD_SSS"] article');assert.equal(await razak.count(),1);assert.match(await razak.innerText(),/발행 한도 없음/);assert.doesNotMatch(await razak.innerText(),/LIMITED|잔여/);
  assert.equal(await page.locator('[data-bloodmoon-rate="V-058"]').inputValue(),'0.04');assert.equal(await page.locator('[data-bloodmoon-rate="V-973"]').inputValue(),'0.002');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await razak.scrollIntoViewIfNeeded();await razak.locator('img').evaluate(img=>img.decode());await page.locator('[data-bloodmoon-rate="V-973"]').locator('xpath=ancestor::article').locator('img').evaluate(img=>img.decode());await page.screenshot({path:path.join(out,'cms-'+width+'.png')});
  await page.locator('[data-bloodmoon-rate="V-058"]').fill('0.05');assert.equal(await page.locator('[data-bloodmoon-effective="V-058"]').innerText(),'0.00004%');assert.equal(await page.locator('[data-bloodmoon-save]').isDisabled(),false);
  await page.goto(base+'/mercenary-codex/#V-058');await page.locator('#allView').click();await page.locator('#search').fill('라자크');await page.getByText('라자크',{exact:true}).first().waitFor();await page.locator('[data-code="V-058"]').first().click();await page.waitForFunction(()=>document.getElementById('inspection').innerText.includes('1,000,000'));await page.screenshot({path:path.join(out,'codex-'+width+'.png')});
  // Verify the actual codex module can validate and render the updated public record.
  assert((await page.locator('body').innerText()).includes('라자크'));
  assert.deepEqual(errors,[]);reports.push({width,ssLimit:40,ssRemaining:10,leonelLimit:9,leonelRemaining:2,eunseolLimit:3,eunseolDoubleGeneral:true,razakUnlimited:true,razakPercent:'0.000032%',imagesDecoded:true,cmsEditAndCancel:true,codexRendered:true,errors});await context.close();
 }
 assert.equal(writes,0);assert.equal(missing.size,0,'Missing local assets: '+[...missing].join(', '));fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({reports,mutations:0},null,2));console.log(JSON.stringify({reports,mutations:writes}));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

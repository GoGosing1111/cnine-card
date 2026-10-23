import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity} from '../functions/_jokgak_city.js';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CITY_QA_DIR;
assert.ok(out);fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],errors=[];
try{
 for(const width of [1440,390]){
  const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),gang=f.roles.GANG,police=f.roles.POLICE;
  await f.join(gang);await f.join(police);
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390,isMobile:width===390,reducedMotion:'reduce'});
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.addInitScript(({now,id})=>{Date.now=()=>now;window.loadUser=()=>({serverUserId:id,nickname:'도시 검수'});}, {now:f.now,id:gang});
   await page.route('**/api/**',async route=>{
    const req=route.request(),response=await handleJokgakCity({path:new URL(req.url()).pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>f.users.get(gang),json:(v,s=200)=>Response.json(v,{status:s})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});
    await route.fulfill(response?{status:response.status,body:await response.text(),contentType:'application/json'}:{json:{enabled:false,items:[],cards:[]}});
   });
   await page.route('**/__city-counter-qa/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080c17"><main></main><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector("main").innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>'}));
   await page.goto(origin+'/__city-counter-qa/',{waitUntil:'domcontentloaded'});
   await page.locator('[data-city-person="'+police+'"]').click();
   const target=page.locator('.jc-target');assert.match(await target.textContent(),/경찰 상대 한정: 갱단 전투력 \+30%/);
   assert.match(await target.textContent(),/경찰 승진 전투력 무효/);assert.match(await target.textContent(),/도시 체력 피해 40/);
   await target.screenshot({path:path.join(out,width+'-target.png')});
   await page.locator('[data-city-rules]').first().click();const rule=page.locator('.jc-guide>li').filter({hasText:'갱단의 경찰 대응'});
   await rule.scrollIntoViewIfNeeded();assert.match(await rule.textContent(),/다른 직업 상대에는 적용되지 않습니다/);
   assert.match(await rule.textContent(),/위장 표시가 아닌 실제 직업/);
   assert.ok(await page.locator('.jc-dialog-body').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
   await page.locator('.jc-dialog').screenshot({path:path.join(out,width+'-rules.png')});
   await page.locator('.jc-dialog header [data-city-dialog-close]').click();
   await page.locator('.jc-desk-launchers [data-city-desk="police"]').click();
   const warning=page.locator('.jc-desk .jc-work-warning');assert.match(await warning.textContent(),/갱단 상대 교전에서는 무효화됩니다/);
   await warning.scrollIntoViewIfNeeded();assert.ok(await page.locator('.jc-desk-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
   await page.locator('.jc-desk').screenshot({path:path.join(out,width+'-police.png')});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   checks.push({width,target:true,rules:true,police:true,overflow:false});
  }finally{await page.close();for(const fn of cleanup)await fn();}
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,fixture:'Actual city UI and local DB fixture; no live account actions'},null,2)+'\n');console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

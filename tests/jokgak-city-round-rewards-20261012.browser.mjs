import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CITY_QA_DIR||path.join(root,'docs/qa/jokgak-city-round-rewards-20261012');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(500).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],owner={id:80,role:'OWNER'};
try{
  for(const width of [1440,390]){
    const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),context=await browser.newContext({viewport:{width,height:1000},isMobile:width<600,hasTouch:width<600});
    try{
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>localStorage.setItem('cnine_admin_token','CITY_ROUND_QA_ONLY'));
      await page.route('**/api/**',async route=>{
        const req=route.request(),response=await handleJokgakCity({path:new URL(req.url()).pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>owner,json:(data,status=200)=>Response.json(data,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});
        await route.fulfill(response?{status:response.status,body:await response.text(),contentType:'application/json'}:{json:{}});
      });
      await page.route('**/admin/',route=>{
        const html=fs.readFileSync(path.join(root,'admin/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script type="module" src="/admin/jokgak-city-admin-v1.mjs"></script></body>');
        return route.fulfill({body:html,contentType:'text/html'});
      });
      await page.goto(origin+'/admin/#jokgak-city',{waitUntil:'domcontentloaded'});
      await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.body.classList.add('auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});
      await page.locator('[data-tab="roundRewards"]').click();await page.locator('.city-cms-round-rank').first().waitFor();
      const field=p=>page.locator('[data-path="'+p+'"]');
      assert.equal(await page.locator('.city-cms-round-rank').count(),5);assert.equal(await field('roundRewards.participation.enabled').isChecked(),false);
      assert.match(await page.locator('.city-cms-content').textContent(),/최소 공격 횟数|최소 공격 횟수/);
      await field('roundRewards.participation.enabled').check();await page.locator('.city-cms-save button').click();await page.locator('.city-cms-note.is-error').filter({hasText:'1회 이상'}).waitFor();
      await field('roundRewards.participation.minAttacks').fill('12');await field('roundRewards.participation.coin').fill('500000000000');
      await page.locator('[data-round-add="roundRewards.participation"]').click();await field('roundRewards.participation.items.0.quantity').fill('3');
      await field('roundRewards.top5.enabled').check();
      for(let i=0;i<5;i++)await field('roundRewards.top5.ranks.'+i+'.coin').fill(String((5-i)*100000000000));
      await page.locator('[data-round-add="roundRewards.top5.ranks.0"]').click();await field('roundRewards.top5.ranks.0.items.0.quantity').fill('7');
      await page.locator('[data-tab="career"]').click();await page.locator('[data-tab="roundRewards"]').click();assert.equal(await field('roundRewards.participation.minAttacks').inputValue(),'12');
      await page.locator('.city-cms-save button').click();await page.locator('.city-cms-note').filter({hasText:'저장 완료'}).waitFor();
      const saved=(await readCitySettings(f.env)).policy;assert.equal(saved.roundRewards.participation.minAttacks,12);assert.equal(saved.roundRewards.top5.ranks[0].items[0].quantity,7);assert.equal(saved.mode,'ON');assert.equal(saved.rewards.enabled,false);
      await page.locator('[data-reload]').click();await page.locator('.city-cms-note').filter({hasText:'불러왔습니다'}).waitFor();assert.equal(await field('roundRewards.top5.ranks.4.coin').inputValue(),'100000000000');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(out,width+'-round-rewards.png'),fullPage:true});
      checks.push(width+': attack threshold, all five cash ranks, coin/items, validation, tab persistence, save/reload and no page overflow');
      const v=(await readCitySettings(f.env)).policy;v.roundRewards.participation.minAttacks=15;await saveCitySettings(f.env,owner,v,f.now);
      await field('roundRewards.participation.minAttacks').fill('13');await page.locator('.city-cms-save button').click();await page.locator('.city-cms-note.is-error').filter({hasText:'다른 창'}).waitFor();assert.equal((await readCitySettings(f.env)).policy.roundRewards.participation.minAttacks,15);
      await page.evaluate(()=>document.getElementById('roleBadge').textContent='ADMIN');await page.locator('#view-jokgak-city').waitFor({state:'hidden'});checks.push(width+': stale save rejected and OWNER panel removed after role downgrade');
    }finally{await context.close();for(const fn of cleanup)await fn();}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors},null,2)+'\n');console.log(JSON.stringify({out,checks,errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

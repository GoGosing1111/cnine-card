import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {primeRequiemLevelFixture} from './helpers/prime-requiem-level-fixture-20261026.mjs';
const root=process.cwd(),out=path.resolve(process.argv[2]||path.join(root,'docs/qa/prime-requiem-level-20261026'));fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/favicon.ico')return res.writeHead(204).end();let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[];let f;
try{
 for(const width of [1440,390]){
  f=await primeRequiemLevelFixture(null);const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],broken=[];
  await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');window.CNineAccountSync={epoch:0,revision:'0',accountId:7};});
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/api/')){const endpoint=url.pathname.slice(5);if(endpoint.startsWith('mercenaries/v3/leveling/')){const result=await f.call(endpoint.split('/').at(-1),request.method()==='POST'?request.postDataJSON():undefined);return route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.body)});}return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,revision:0,visible:false,seasonPassVisible:false})});}return route.continue();});
  page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400&&/\.(png|webp|mjs|css)(\?|$)/.test(response.url()))broken.push(response.url());});
  await page.goto(base+'/mercenary-codex/leveling/?code=V-975');await page.locator('[data-target="V-975"]').waitFor({timeout:10000});
  assert.match(await page.locator('.stage-identity').innerText(),/프라임 레퀴엠/);assert.match(await page.locator('.stage-code').innerText(),/SSS/);assert.match(await page.locator('.xp-display').innerText(),/1,500 EXP/);assert.match(await page.locator('.xp-display').innerText(),/요구량 ×5/);
  assert.equal(await page.locator('[data-quantity="V-001"]').count(),0);assert.equal(await page.locator('[data-quantity="V-975"]').getAttribute('max'),'0');
  await page.locator('[data-quantity="V-049"]').fill('15');assert.equal(await page.locator('#train').isEnabled(),true);await page.locator('#train').click();
  await page.waitForFunction(()=>document.querySelector('.level-display strong')?.textContent==='Lv.2');assert.equal((await f.call('state')).body.cards.find(c=>c.code==='V-975').growth.level,2);
  await page.locator('.growth-stage').screenshot({path:path.join(out,'growth-'+width+'.png')});await page.locator('.control-panel').screenshot({path:path.join(out,'materials-'+width+'.png')});
  await page.reload();await page.waitForFunction(()=>document.querySelector('.level-display strong')?.textContent==='Lv.2');assert.match(await page.locator('.stage-identity').innerText(),/프라임 레퀴엠/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(broken,[]);
  report.push({width,ownedPrimeRequiemVisible:true,limitedXp1500:true,normalSssTraining:true,originalProtected:true,levelUp:2,reloadPreserved:true,overflow:false,errors,broken});await context.close();await f.close();f=null;
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));if(f)await f.close();}

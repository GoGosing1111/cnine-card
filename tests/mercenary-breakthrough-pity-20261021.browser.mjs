import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mercenaryPityFixture,seedLegacyFailures} from './helpers/mercenary-pity-fixture.mjs';

const root=process.cwd(),out=path.join(root,'docs/qa/mercenary-breakthrough-pity-20261021');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/favicon.ico')return res.writeHead(204).end();let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
let f,currentPage;
try{
 for(const width of [1440,390]){
  f=await mercenaryPityFixture(null);
  await seedLegacyFailures(f,{count:10});await seedLegacyFailures(f,{code:'V-055',level:20,count:19});await seedLegacyFailures(f,{code:'V-996',level:20,count:20});
  const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[],broken=[];
  currentPage=page;
  await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');window.CNineAccountSync={epoch:0,revision:'0',accountId:7};});
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/api/')){const endpoint=url.pathname.slice(5);if(endpoint.startsWith('mercenaries/v3/leveling/')){const result=await f.call(endpoint.split('/').at(-1)+url.search,req.method()==='POST'?req.postDataJSON():undefined);return route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.body)});}return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,revision:0,visible:false,seasonPassVisible:false})});}return route.continue();});
  page.on('pageerror',error=>errors.push(error.message));page.on('response',r=>{if(r.status()>=400&&/\.(png|webp|mjs|css)(\?|$)/.test(r.url()))broken.push(r.url());});
  await page.goto(base+'/mercenary-codex/leveling/?code=V-049');await page.locator('[data-breakthrough-pity]').waitFor();
  assert.match(await page.locator('[data-breakthrough-pity]').innerText(),/실패 누적 10 \/ 10회/);assert.match(await page.locator('.breakthrough-brief').innerText(),/100% · 천장/);
  await page.locator('.control-panel').screenshot({path:path.join(out,'guaranteed-'+width+'.png')});
  await page.getByRole('button',{name:'Lv.5 확정 돌파 시작',exact:true}).click({trial:true});
  await page.screenshot({path:path.join(out,'action-visible-'+width+'.png')});
  await page.getByRole('button',{name:'Lv.5 확정 돌파 시작',exact:true}).click();await page.getByRole('button',{name:/바로 결과 보기/}).click();
  assert.match(await page.locator('.break-result-note').innerText(),/천장 적용 · 확정 성공/);
  await page.locator('.break-result').screenshot({path:path.join(out,'success-'+width+'.png')});
  await page.getByRole('button',{name:/성장실로 돌아가기/}).click();await page.waitForFunction(()=>document.querySelector('.level-display strong')?.textContent==='Lv.6');
  assert.match(await page.locator('[data-breakthrough-pity]').innerText(),/Lv.10 실패 누적 0 \/ 10회/);
  await page.locator('[data-target="V-055"]').click();assert.match(await page.locator('[data-breakthrough-pity]').innerText(),/19 \/ 20회/);assert.match(await page.locator('.breakthrough-brief dd').first().innerText(),/^10%$/);
  await page.locator('.control-panel').screenshot({path:path.join(out,'level20-before-'+width+'.png')});
  await page.locator('[data-target="V-996"]').click();assert.match(await page.locator('[data-breakthrough-pity]').innerText(),/20 \/ 20회/);
  await page.getByRole('button',{name:'Lv.20 확정 돌파 시작',exact:true}).click();await page.getByRole('button',{name:/바로 결과 보기/}).click();assert.equal(await page.locator('#break-title').innerText(),'최종 돌파 성공');
  await page.getByRole('button',{name:/성장실로 돌아가기/}).click();await page.waitForFunction(()=>document.querySelector('[data-breakthrough-pity]')===null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(broken,[]);
  report.push({width,retroactive10:true,effectiveChance100:true,guaranteedSuccess:true,counterReset:true,level20Threshold:true,finalComplete:true,overflow:false,errors,broken});await context.close();await f.close();f=null;
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){if(currentPage&&!currentPage.isClosed())console.log(JSON.stringify({body:(await currentPage.locator('#app').innerText()).slice(-2200),dialog:await currentPage.locator('dialog').count()}));throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));if(f)await f.close();}

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mercenaryPityFixture,seedLegacyFailures} from './helpers/mercenary-pity-fixture.mjs';

const root=process.cwd(),artRoot='C:/Users/User/Downloads/cnine-z-body-sword-20260918/site';
const out=path.join(root,'docs/qa/mercenary-level-cap21-20261025');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  if(!fs.existsSync(file)&&url.pathname.startsWith('/assets/'))file=path.resolve(artRoot,'.'+decodeURIComponent(url.pathname));
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[];let fixture;
try{
 for(const width of [1440,390]){
  fixture=await mercenaryPityFixture(null);await seedLegacyFailures(fixture,{level:20,count:20});
  await fixture.setState('V-055',{level:20,experience:0,breakthroughMask:15,revision:1});
  const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[],broken=[];
  await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');window.CNineAccountSync={epoch:0,revision:'0',accountId:7};});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();
   if(url.pathname.startsWith('/api/')){
    const endpoint=url.pathname.slice(5);
    if(endpoint.startsWith('mercenaries/v3/leveling/')){const r=await fixture.call(endpoint.split('/').at(-1)+url.search,req.method()==='POST'?req.postDataJSON():undefined);return route.fulfill({status:r.status,contentType:'application/json',body:JSON.stringify(r.body)});}
    return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,revision:0,visible:false,seasonPassVisible:false})});
   }
   return route.continue();
  });
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/\.(png|webp|mjs|css)(\?|$)/.test(r.url()))broken.push(r.url());});
  await page.goto(base+'/mercenary-codex/leveling/?code=V-049');await page.locator('[data-breakthrough-pity]').waitFor();
  assert.equal(await page.locator('.level-display strong').innerText(),'Lv.20');
  await page.getByRole('button',{name:'Lv.20 확정 돌파 시작',exact:true}).click();
  await page.getByRole('button',{name:/바로 결과 보기/}).click();
  assert.match(await page.locator('.break-result-level').innerText(),/Lv\.21\s*MAX/);
  await page.screenshot({path:path.join(out,'result-'+width+'.png')});
  await page.getByRole('button',{name:/성장실로 돌아가기/}).click();
  await page.waitForFunction(()=>document.querySelector('.level-display strong')?.textContent==='Lv.21');
  assert.equal(await page.locator('.level-display i').innerText(),'/ 21');
  assert.equal(await page.locator('#train').isVisible(),false);assert.equal(await page.locator('#breakthrough').isDisabled(),true);
  assert.match(await page.locator('.control-heading').innerText(),/최대 21레벨/);
  assert.equal(await page.locator('[data-inspect-level="21"]').count(),1);assert.equal(await page.locator('[data-inspect-level="22"]').count(),0);
  await page.locator('[data-target="V-055"]').click();assert.equal(await page.locator('.level-display strong').innerText(),'Lv.21');
  assert.equal(await page.locator('#breakthrough').isDisabled(),true);
  await page.locator('.level-display').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'complete-'+width+'.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);assert.deepEqual(broken,[]);
  report.push({width,finalSuccessLevel:21,terminalActionsDisabled:true,legacyCompleteLevel:21,roadmapMax:21,overflow:false,errors,broken});
  await context.close();await fixture.close();fixture=null;
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));if(fixture)await fixture.close();}

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {passFixture} from './helpers/supporter-pass-fixture.mjs';

const root=process.cwd(),out=path.join(root,'docs/qa/supporter-pass-sales-start-20261020');fs.mkdirSync(out,{recursive:true});
let f,dropResponse=false,posts=0;
const sale=Date.parse('2026-10-11T00:59:06.414+09:00');
async function anchor(){const row=await f.one('SELECT value FROM app_meta WHERE key=?','supporter_season_pass_v1'),config=JSON.parse(row.value);await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...config,revision:config.revision+1,salesStartsAt:sale}),'supporter_season_pass_v1');}
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://'+req.headers.host);
    if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
    if(url.pathname==='/qa'){
      res.writeHead(200,{'content-type':mime['.html']});return res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/server-support-v1.css"><link rel="stylesheet" href="/css/supporter-season-pass-v1.css"><body style="margin:0;background:#090c18"><dialog class="ss-dialog" data-ss-page="pass"><div class="ss-dialog-body" id="pass"></div></dialog><script type="module">
      import {mountSeasonPass} from '/js/supporter-season-pass-v1.mjs';
      async function api(path,options={}){const response=await fetch('/api/'+path,{method:options.method||'GET',headers:{'content-type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error),{status:response.status,retryable:response.status>=500});return data;}
      const info=await api('server-support/info');window.pass=mountSeasonPass(document.getElementById('pass'),{data:info.seasonPass,userId:2,request:api});document.querySelector('dialog').showModal();
      </script></body></html>`);
    }
    if(url.pathname.startsWith('/api/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?JSON.parse(Buffer.concat(chunks)):undefined;
      const endpoint=url.pathname.slice(5);if(endpoint==='server-support/pass/claim-all')posts++;
      const result=await f.call(endpoint,{user:2,body,method:req.method});
      if(endpoint==='server-support/pass/claim-all'&&dropResponse&&result.status===200){dropResponse=false;res.writeHead(503,{'content-type':'application/json'});return res.end(JSON.stringify({error:'검수: 확정 후 응답 유실'}));}
      res.writeHead(result.status,{'content-type':'application/json'});return res.end(JSON.stringify(result.body));
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(!fs.existsSync(file))return res.writeHead(404).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
  }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
try{
  for(const width of [1440,390]){
    f=await passFixture({postgres:true});await f.save(f.document([{code:'COIN:',quantity:10000},{code:'INVENTORY_ITEM:MASTER_STAR',quantity:3}]));f.clock.now=Date.parse('2026-10-17T13:00:00+09:00');await f.grant();await f.claim();await anchor();f.clock.now=Date.parse('2026-10-20T13:00:00+09:00');
    const context=await browser.newContext({viewport:{width,height:width<600?844:1050},serviceWorkers:'block'}),page=await context.newPage(),errors=[],failed=[];
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/\.(png|webp|svg|mjs|css)(\?|$)/.test(r.url()))failed.push(r.url());});
    await page.goto(base+'/qa');await page.locator('[data-pass-claim-all]:not([disabled])').waitFor();assert.match(await page.locator('.sp-catchup').innerText(),/미수령 9일/);
    assert.match(await page.locator('.sp-catchup').innerText(),/판매 시작일 2026-10-11부터 오늘까지/);
    assert.match(await page.locator('.sp-footer').innerText(),/패스 최초 판매일을 1일차/);
    assert.equal(await page.locator('.sp-day-action[data-pass-claim="7"]').isEnabled(),true);
    assert.match(await page.locator('[data-pass-claim-all]').evaluate(el=>getComputedStyle(el).backgroundImage),/season-pass-catchup-20261017/);
    await page.locator('.ss-dialog').screenshot({path:path.join(out,'pass-'+width+'.png')});await page.locator('.sp-catchup').scrollIntoViewIfNeeded();await page.locator('.sp-catchup').screenshot({path:path.join(out,'catchup-'+width+'.png')});
    await page.locator('[data-pass-day="2"]').click();assert.equal(await page.locator('.sp-featured [data-pass-claim="2"]').isEnabled(),true);
    assert.equal(await page.locator('.sp-day-action[data-pass-claim="1"]').isEnabled(),false);
    dropResponse=true;const before=posts;await page.locator('[data-pass-claim-all]').click();await page.locator('[data-pass-retry]').waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-pass-status]').textContent.includes('응답 유실'));
    assert.equal(posts,before+1);assert.equal((await f.pass()).claimableCount,0);assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),101234);
    await page.reload();await page.locator('[data-pass-retry]').waitFor();assert.equal(posts,before+1);await page.locator('.sp-recovery').screenshot({path:path.join(out,'recovery-'+width+'.png')});
    await page.locator('[data-pass-retry]').click();await page.waitForFunction(()=>!document.querySelector('[data-pass-retry]')&&document.querySelector('[data-pass-status]').textContent.includes('9일차분 보상 수령 완료'));
    assert.equal(posts,before+2);assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),101234);
    f.clock.now+=86400000;await page.reload();await page.locator('[data-pass-claim-all]:not([disabled])').waitFor();const today=posts;
    await page.locator('[data-pass-claim-all]').evaluate(el=>{el.click();el.click();});await page.waitForFunction(()=>document.querySelector('[data-pass-status]').textContent.includes('1일차분 보상 수령 완료'));
    assert.equal(posts,today+1);assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),111234);
    assert.equal(await page.evaluate(()=>document.querySelector('.ss-dialog').scrollWidth>document.querySelector('.ss-dialog').clientWidth+1),false);
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);reports.push({width,missedDaysClaimed:9,oldRewardExcluded:true,lostResponseRecoveredOnce:true,reloadDidNotSubmit:true,doubleClickSingleRequest:true,imageButton:true,errors,failed});
    await context.close();await f.close();f=null;
  }
  // A single click completes multiple bounded transactions when equipment rewards are large.
  f=await passFixture({postgres:true});await f.save(f.document([{code:'EQUIPMENT:1',quantity:20}]));f.clock.now=Date.parse('2026-10-14T13:00:00+09:00');await f.grant();await anchor();
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(base+'/qa');await page.locator('[data-pass-claim-all]:not([disabled])').waitFor();const before=posts;
  await page.locator('[data-pass-claim-all]').click();await page.waitForFunction(()=>document.querySelector('[data-pass-status]').textContent.includes('4일차분 보상 수령 완료'));
  assert.equal(posts,before+2);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=2')).n),80);reports.push({boundedBatches:2,oneClick:true,equipment:80});
  fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));if(f)await f.close();}

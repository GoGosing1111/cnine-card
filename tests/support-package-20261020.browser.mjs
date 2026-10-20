import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {packageFixture} from './helpers/support-package-fixture.mjs';
const root=process.cwd(),out=path.join(root,'docs/qa/support-package-20261020');fs.mkdirSync(out,{recursive:true});
let f,lose=false,posts=0,alerts=0;
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const styles='<link rel="stylesheet" href="/css/server-support-v1.css"><link rel="stylesheet" href="/css/supporter-season-pass-v1.css"><link rel="stylesheet" href="/css/support-package-v1.css">';
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(url.pathname==='/qa'){
  res.writeHead(200,{'content-type':mime['.html']});return res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#080e19;color:#e4e8f0;margin:0"><div id="host"></div><script type="module">
  import {mountServerSupportNavigation} from '/js/server-support-v1.mjs';
  const userId=${Number(url.searchParams.get('u'))||2};localStorage.setItem('cnine_card_api_token','qa-'+userId);
  const root=document.getElementById('host').attachShadow({mode:'open'});root.innerHTML='<dialog id="menu-dialog" data-menu-category="all" style="background:#111b2c;border:1px solid #76849a;color:#fff;min-width:280px"><h2>전체 메뉴</h2></dialog>';
  window.api=async(path,options={})=>{const r=await fetch('/api/'+path,{method:options.method||'GET',headers:{'content-type':'application/json',authorization:'Bearer qa-'+userId},...(options.body?{body:JSON.stringify(options.body)}:{})});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),{status:r.status,retryable:data.retryable,code:data.code});return data;};
  window.view=mountServerSupportNavigation({root,getUser:()=>({id:userId}),request:window.api,onOpenMessages:()=>window.messagesOpened=true});root.getElementById('menu-dialog').showModal();
  </script></body></html>`);
 }
 if(url.pathname==='/qa-admin'){
  res.writeHead(200,{'content-type':mime['.html']});return res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<body style="background:#080e19;color:#e4e8f0;margin:12px"><nav id="nav"></nav><h1 id="pageTitle"></h1><main id="cms"></main><script>localStorage.setItem('cnine_admin_token','qa-1');window.__SOOP_CMS_IDENTITY__={id:1,role:'OWNER'};</script><script type="module" src="/admin/server-support-admin-v1.mjs"></script></body></html>`);
 }
 if(url.pathname.startsWith('/api/')){
  const endpoint=url.pathname.slice(5);if(endpoint.startsWith('sync/'))return res.writeHead(200,{'content-type':'application/json'}).end('{}');
  const chunks=[];for await(const c of req)chunks.push(c);const body=chunks.length?JSON.parse(Buffer.concat(chunks)):undefined;
  if(endpoint.endsWith('/alerts'))alerts++;if(endpoint==='server-support/package/apply')posts++;
  const result=await f.call(endpoint,{user:Number(req.headers.authorization?.replace('Bearer qa-',''))||1,body,method:req.method});
  if(lose&&endpoint==='server-support/package/apply'&&result.status===200){lose=false;return res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({error:'검수 응답 유실',retryable:true}));}
  return res.writeHead(result.status,{'content-type':'application/json'}).end(JSON.stringify(result.body));
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(!fs.existsSync(file))return res.writeHead(404).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}catch(e){res.writeHead(500,{'content-type':'application/json'}).end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
try{for(const width of [1440,390]){
 f=await packageFixture({postgres:true});await f.activate();
 const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],failed=[];
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/\.(webp|png|css|mjs)(\?|$)/.test(r.url()))failed.push(r.url());});
 const alertsBefore=alerts;await page.goto(base+'/qa');await page.getByRole('button',{name:'서버 안내',exact:true}).click();await page.locator('[data-ss-package]').waitFor();
 const support=await page.locator('[data-ss-support]').boundingBox(),pkg=await page.locator('[data-ss-package]').boundingBox();assert.equal(pkg.width,support.width);assert.equal(pkg.height,support.height);assert.equal(alerts,alertsBefore);
 await page.locator('.ss-dialog').screenshot({path:path.join(out,'server-info-'+width+'.png')});
 await page.locator('[data-ss-package]').click();await page.locator('[data-package-apply]').waitFor();await page.locator('.ss-dialog').screenshot({path:path.join(out,'package-'+width+'.png')});
 assert.match(await page.locator('.spkg-rewards').innerText(),/50조/);assert.equal(await page.locator('.spkg-rewards img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)),true);
 lose=true;await page.locator('[data-package-apply]').click();await page.getByText('검수 응답 유실',{exact:true}).waitFor();const onePost=posts;
 await page.reload();await page.getByRole('button',{name:'서버 안내',exact:true}).click();await page.locator('[data-ss-package]').click();await page.getByRole('button',{name:'이전 신청 결과 확인'}).waitFor();assert.equal(posts,onePost);await page.getByRole('button',{name:'이전 신청 결과 확인'}).click();await page.getByText('저장된 신청 결과를 확인했습니다.',{exact:true}).waitFor();
 assert.equal(Number((await f.one("SELECT COUNT(*) n FROM user_messages WHERE campaign_key LIKE 'support_package_owner_alert_v1:%'")).n),1);
 await page.locator('.ss-dialog').screenshot({path:path.join(out,'received-'+width+'.png')});
 const owner=await context.newPage();owner.on('pageerror',e=>errors.push(e.message));await owner.goto(base+'/qa?u=1');await owner.getByRole('dialog',{name:'패키지 구매 접수 알림'}).waitFor();await owner.locator('.spkg-alert').screenshot({path:path.join(out,'owner-popup-'+width+'.png')});
 assert.match(await owner.locator('.spkg-alert').innerText(),/후원 검수 계정/);assert.equal(await owner.locator('.spkg-alert').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 await owner.getByRole('button',{name:'확인 · 닫기'}).click();await owner.reload();await owner.getByRole('button',{name:'서버 안내',exact:true}).waitFor();assert.equal(await owner.locator('.spkg-alert').count(),0);
 await owner.evaluate(()=>localStorage.removeItem('cnine_support_package_alert_seen_v1:1'));
 const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));await admin.goto(base+'/qa-admin');await admin.getByRole('dialog',{name:'패키지 구매 접수 알림'}).waitFor();await admin.getByRole('button',{name:'CMS 접수 내역 보기'}).click();await admin.locator('[data-package-order]:not([disabled])').waitFor();
 await admin.locator('[data-package-order]').click();await admin.locator('[data-package-admin-form] input[name=note]').fill('검수 입금 내역');await admin.locator('[data-package-admin-form] input[name=paid]').check();await admin.locator('[data-package-admin-form]').screenshot({path:path.join(out,'cms-confirm-'+width+'.png')});await admin.locator('[data-package-process=FULFILL]').click();await admin.getByText('50조 코인 · 엠퍼러 에너지 200개 · SSS 리미티드 조각 5개 지급 완료',{exact:true}).waitFor();
 assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),50000000001234);
 await page.goto(base+'/qa?u=3');await page.getByRole('button',{name:'서버 안내',exact:true}).click();await page.locator('[data-ss-support]').waitFor();assert.equal(await page.locator('[data-ss-package]').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);reports.push({width,equalButtonSize:{width:pkg.width,height:pkg.height},inactiveHidden:true,ordinaryNoAlertPolling:true,imagesLoaded:true,lostResponseRecovery:true,ownerPopupOnce:true,cmsPopupAndPayment:true,errors,failed});await context.close();await f.close();f=null;
}fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));}finally{await browser.close();await new Promise(r=>server.close(r));if(f)await f.close();}

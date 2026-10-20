import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {applicationFixture} from './helpers/supporter-application-fixture.mjs';

const root=process.cwd(),out=path.join(root,'docs/qa/message-system-cleanup-20261020');
fs.mkdirSync(out,{recursive:true});
const app=fs.readFileSync('js/app.js','utf8');
const source=app.slice(app.indexOf('function messagesView()'),app.indexOf('// V1799: 2차 인증은 PLAY DK 단독 운영.'));
const mime={'.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
let fixture,failOnce=false,cleanupRequests=0;
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://'+req.headers.host);
    if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
    if(url.pathname==='/qa')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/soopketmon-v21-messages-attendance.css"><style>body{margin:0;padding:20px;min-width:0;background:#070b10}#main{max-width:1160px;margin:auto}@media(max-width:600px){body{padding:8px}}</style><body><main id="main" class="v21-production-shell" data-soopketmon-v21-shell="approved-v21"></main><script>
      const loadUser=()=>({}),summaryBar=()=>'',clearApiCache=()=>{},escapeHtml=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
      let messageUnreadCount=0;const updateMessageNewBadges=n=>{messageUnreadCount=n;},renderShell=()=>{document.getElementById('main').innerHTML=messagesView();loadMessages();};
      const apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json',authorization:'Bearer qa-2'}}),d=await r.json();if(!r.ok)throw Object.assign(Error(d.error),d);return d;};
      ${source}
      renderShell();
      </script></body></html>`);
    if(url.pathname==='/api/messages'){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=chunks.length?Buffer.concat(chunks):undefined;
      if(body&&JSON.parse(body).action==='HIDE_COMPLETED'){
        cleanupRequests++;
        if(failOnce){failOnce=false;return res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({error:'검수용 일시 오류'}));}
        await new Promise(resolve=>setTimeout(resolve,200));
      }
      const response=await fixture.handle(new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}));
      return res.writeHead(response.status,{'content-type':'application/json'}).end(await response.text());
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
  }catch(error){res.writeHead(500,{'content-type':'application/json'}).end(JSON.stringify({error:error.message}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
try{
  for(const width of [1440,390]){
    fixture=await applicationFixture({postgres:true});cleanupRequests=0;
    const now=new Date(fixture.clock.now).toISOString();
    for(const [id,title,isRead,type,coupon] of [
      [1,'확인한 운영 안내',1,'NOTICE',null],[2,'새로운 운영 안내',0,'NOTICE',null],
      [3,'아직 받지 않은 코인 보상',0,'ITEM_REWARD',null],[4,'수령 완료한 보상',1,'ITEM_REWARD',null],
      [5,'보관 중인 쿠폰',1,'NOTICE','KEEP-COUPON'],[6,'계좌 안내',1,'SUPPORT_BANK_ACCOUNT',null],
      [7,'지급 기록 확인이 필요한 보상',1,'ITEM_REWARD',null],
      [8,'패키지 구매 접수',0,'SYSTEM',null],[9,'패키지 구매 처리 완료',1,'SYSTEM',null],
      [10,'리버스랜드 쿠폰 발급',0,'SOOPKETLAND_COUPON','ISSUED-COUPON']
    ])await fixture.run('INSERT INTO user_messages(id,user_id,title,body,message_type,is_read,coupon_code,created_at) VALUES(?,2,?,?,?,?,?,?)',id,title,'메시지의 내용을 확인하고 필요한 보상을 수령하세요.',type,isRead,coupon,now);
    for(const id of [3,4,7])await fixture.run("INSERT INTO user_message_rewards VALUES(?,?,2,'COIN',50,?)",id,id,id===3?null:now);
    await fixture.run("INSERT INTO user_message_reward_claim_receipts_v1222 VALUES(4,4,2,'COIN',50,?)",now);
    const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],dialogs=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    let acceptConfirm=true;
    page.on('dialog',async dialog=>{dialogs.push(dialog.message());if(dialog.type()==='confirm'&&!acceptConfirm)await dialog.dismiss();else await dialog.accept();});
    await page.goto(base+'/qa');
    const button=page.locator('#deleteCompletedMessages');
    await page.waitForFunction(()=>document.getElementById('deleteCompletedMessages')?.dataset.count==='8');
    await page.locator('.user-message[data-id="2"] p').click();
    await page.locator('.user-message[data-id="2"].read').waitFor();
    assert.equal(await button.getAttribute('data-count'),'8');
    acceptConfirm=false;await button.click();assert.equal(cleanupRequests,0);
    assert.equal(await page.locator('.user-message').count(),10);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    const rect=await button.boundingBox();assert(rect.height>=44&&rect.x>=0&&rect.x+rect.width<=width);
    assert.match(await button.evaluate(e=>getComputedStyle(e).backgroundImage),/completed-cleanup-20261020.webp/);
    assert.equal(await page.evaluate(async()=>{const image=new Image();image.src='/assets/ui/message-center/completed-cleanup-20261020.webp';await image.decode();return image.naturalWidth;}),960);
    await page.keyboard.press('Tab');await button.focus();assert.equal(await button.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
    await page.screenshot({path:path.join(out,'inbox-'+width+'.png'),fullPage:true});
    acceptConfirm=true;failOnce=true;await button.press('Enter');
    await page.waitForFunction(()=>document.getElementById('deleteCompletedMessages')?.dataset.count==='8'&&!document.getElementById('deleteCompletedMessages').disabled);
    assert.equal(cleanupRequests,1);assert.equal(await page.locator('.user-message').count(),10);
    await button.click();
    await button.evaluate(e=>e.click());
    await page.waitForFunction(()=>document.getElementById('deleteCompletedMessages')?.dataset.count==='0');
    assert.equal(cleanupRequests,2);assert.equal(await button.isDisabled(),true);
    assert.deepEqual(await page.locator('.user-message').evaluateAll(elements=>elements.map(e=>Number(e.dataset.id)).sort((a,b)=>a-b)),[3,7]);
    await page.reload();await page.locator('.user-message[data-id="3"]').waitFor();
    assert.equal(await button.isDisabled(),true);assert.deepEqual(errors,[]);
    assert(dialogs.some(message=>message.includes('8건의 메시지를 삭제')));
    assert(dialogs.some(message=>message.includes('읽음 여부와 관계없이')));
    await page.screenshot({path:path.join(out,'cleaned-'+width+'.png'),fullPage:true});
    // Bank instructions now count as eligible; their existing five-minute expiry
    // must remove that count as well, without leaving an enabled empty action.
    await fixture.run("INSERT INTO user_messages(id,user_id,title,body,message_type,is_read,created_at) VALUES(11,2,'새 계좌 안내','검수','SUPPORT_BANK_ACCOUNT',0,?)",now);
    await page.clock.install();
    await page.reload();
    await page.waitForFunction(()=>document.getElementById('deleteCompletedMessages')?.dataset.count==='1');
    fixture.clock.now+=301000;await page.clock.fastForward(301000);
    await page.waitForFunction(()=>!document.querySelector('.user-message[data-id="11"]'));
    assert.equal(await button.getAttribute('data-count'),'0');assert.equal(await button.isDisabled(),true);
    assert.deepEqual(errors,[]);
    reports.push({width,buttonHeight:rect.height,unreadSystemIncluded:true,couponIncluded:true,purchaseIncluded:true,readCountStable:true,cancelPreserves:true,errorRetry:true,doubleClickSingleRequest:true,protectedMessagesPreserved:true,receiptPreserved:true,emptyDisabled:true,expiryCountUpdated:true,imageLoaded:true,keyboardFocus:true,horizontalOverflow:false,errors});
    await context.close();await fixture.close();fixture=null;
  }
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fixture?.close();}

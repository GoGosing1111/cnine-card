import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {predictionSubsidyFixture} from './helpers/prediction-subsidy-fixture.mjs';
import {sendPackageNotice} from '../scripts/ops/support-package-notice-core.mjs';
import {PACKAGE_NOTICE_CAMPAIGN} from '../shared/support-package-notice-v1.mjs';
const root=process.cwd(),out=path.join(root,'docs/qa/support-package-prediction-20261020');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const inboxSource=source.slice(source.indexOf('let supportMessageExpiryView='),source.indexOf('// V1799: 2차 인증은 PLAY DK 단독 운영.'));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
let messages,prediction;
const api=`window.apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json',authorization:'Bearer qa-'+(p==='messages'?2:3)}}),d=await r.json();if(!r.ok)throw Object.assign(Error(d.error),d);return d;};`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(url.pathname==='/qa-prediction')return res.writeHead(200,{'content-type':mime['.html']}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/coin-prediction-v2033.css"><body style="margin:0;background:#edf0f5;font-family:Arial,sans-serif"><main id="host"></main><script>${api}</script><script src="/js/coin-prediction-model-v2033.js"></script><script src="/js/coin-prediction-v2033.js"></script><script>host.innerHTML=coinPredictionView({id:3});bindCoinPredictionView();</script></body></html>`);
 if(url.pathname==='/qa-inbox')return res.writeHead(200,{'content-type':mime['.html']}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/soopketmon-v21-messages-attendance.css"><body style="padding:20px;min-width:0"><main class="message-center"><h1>메시지함</h1><span id="unread"></span><div id="messageList"></div></main><script>${api}
 let messageUnreadCount=0;const escapeHtml=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const clearApiCache=()=>{},messageRewardMeta=()=>null,claimableMessageRewards=()=>[],updateMessageNewBadges=n=>{messageUnreadCount=n;document.getElementById('unread').textContent='읽지 않음 '+n;};
 ${inboxSource}
 loadMessages();</script></body></html>`);
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const c of req)chunks.push(c);const request=new Request(url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
  const response=await (url.pathname==='/api/messages'?messages:prediction).handle(request);return res.writeHead(response.status,{'content-type':'application/json'}).end(await response.text());
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}catch(e){res.writeHead(500,{'content-type':'application/json'}).end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
try{for(const width of [1440,390]){
 messages=await packageFixture({postgres:true});await messages.activate();await sendPackageNotice(messages.env,{now:messages.clock.now});
 await messages.run("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key,is_read,created_at) VALUES(2,'SYSTEM','기존 메시지','이 메시지는 읽어도 보존됩니다.','SYSTEM','ordinary',0,?)",new Date(messages.clock.now).toISOString());
 prediction=await predictionSubsidyFixture({postgres:true});await prediction.event({title:'승부예측 잔액 확인'});
 await prediction.run('UPDATE users SET coin=100001000000000 WHERE id=3');await prediction.run("INSERT INTO app_meta(key,value) VALUES('support_package_order_v1:3_browser',?)",JSON.stringify({status:'FULFILLED'}));
 await prediction.run("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(3,100000000000000,100001000000000,'시즌패스 패키지 구매 3_browser')");
 const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.goto(base+'/qa-prediction');await page.locator('#cpWallet').filter({hasText:'1,000,000,000'}).waitFor();assert.equal(await page.locator('#cpPackageCoin').innerText(),'패키지 100조 코인 제외');assert.equal(await page.locator('#cpPackageCoin').isVisible(),true);
 await page.locator('[data-cp-option]').first().click();await page.getByRole('button',{name:'최대',exact:true}).click();assert.equal(await page.locator('#cpBetAmount').inputValue(),'1000000000');
 await page.locator('#cpBetAmount').fill('1000000001');assert.equal(await page.locator('[data-cp-submit]').isDisabled(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(out,'prediction-'+width+'.png'),fullPage:true});
 await page.goto(base+'/qa-inbox');await page.getByRole('heading',{name:'[시즌패스 구매자 전용] 리버스콜 코인 패키지 안내',exact:true}).waitFor();
 const notice=page.locator('.user-message').filter({hasText:'리버스콜 코인 패키지 안내'});assert.match(await notice.innerText(),/100조/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.screenshot({path:path.join(out,'notice-'+width+'.png'),fullPage:true});await notice.locator('p').click();await notice.waitFor({state:'detached'});
 assert.equal(Number((await messages.one('SELECT COUNT(*) n FROM user_messages WHERE campaign_key=?',PACKAGE_NOTICE_CAMPAIGN)).n),0);assert.equal(await page.locator('#unread').innerText(),'읽지 않음 1');
 await page.locator('.user-message p').click();await page.locator('.user-message.read').waitFor();assert.equal(await page.locator('.user-message').count(),1);
 await page.reload();await page.getByRole('heading',{name:'기존 메시지',exact:true}).waitFor();assert.equal(await page.locator('.user-message').count(),1);
 assert.equal((await sendPackageNotice(messages.env,{now:messages.clock.now})).replayed,true);assert.deepEqual(errors,[]);
 reports.push({width,predictionAvailable:1000000000,packageExcluded:100000000000000,quickMaxUsesAvailable:true,overspendDisabled:true,noticeReadDeletes:true,otherMessagePreserved:true,noResend:true,noHorizontalOverflow:true,errors});
 await context.close();await messages.close();await prediction.close();messages=null;prediction=null;
}fs.writeFileSync(path.join(out,'notice-prediction-browser.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));}
finally{await browser.close();await new Promise(r=>server.close(r));await messages?.close();await prediction?.close();}

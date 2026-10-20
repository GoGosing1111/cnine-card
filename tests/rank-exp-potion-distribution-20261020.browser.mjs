import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/rank-exp-potion-distribution-20261020');
fs.mkdirSync(out,{recursive:true});
// Actual CMS markup, styles, primary controller and overriding coupon controller.
// Isolated API responses: no production coupon is issued and no account is changed.
const html=fs.readFileSync(path.join(root,'admin/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,tag=>/src="(?:admin-v1276|admin-v1062-coupon-bulk-delete)\.js/.test(tag)?tag:'');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const itemCode='RANK_EXP_POTION_2X_60M';
let issued=[],requests=[],grants=[],failGrant=false;
const user={id:1,nickname:'경험치 물약 검수',role:'USER',status:'ACTIVE',coin:1234,card_shards:0,created_at:'2026-10-20 00:00:00'};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  let body='';for await(const chunk of req)body+=chunk;
  res.setHeader('content-type','application/json');
  if(url.pathname==='/api/admin/dashboard')return res.end(JSON.stringify({role:'OWNER',admin:{id:9,role:'OWNER',nickname:'검수 운영자'},stats:{users:1,cards:0,totalCoin:0,draws24h:0,banned:0,coupons:issued.length,urOwned:0,ssrOwned:0}}));
  if(url.pathname==='/api/admin/users')return res.end(JSON.stringify({users:[user]}));
  if(['/api/admin/coupons','/api/admin/coupons-v2'].includes(url.pathname)&&req.method==='GET')return res.end(JSON.stringify({coupons:issued}));
  if(url.pathname==='/api/admin/coupon-create-permanent-v3'){
   const data=JSON.parse(body);requests.push(data);
   const coupon={id:1,code:data.code,reward_type:data.rewardType,reward_amount:data.rewardAmount,max_uses:data.maxUses,used_count:0,is_active:1};
   issued.push(coupon);res.statusCode=201;return res.end(JSON.stringify({ok:true,coupon,rewardLabel:'계급 경험치 2배 물약 (60분)'}));
  }
  if(url.pathname==='/api/admin/users/action'){
   const data=JSON.parse(body);grants.push(data);
   if(failGrant){failGrant=false;res.statusCode=409;return res.end(JSON.stringify({error:'지급 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도하세요.'}));}
   return res.end(JSON.stringify({ok:true,itemCode,amount:data.amount,balance:data.amount}));
  }
  return res.end(JSON.stringify({items:[],cards:[],members:[],logs:[],requests:[],pending:[],count:0,settings:{},enabled:false}));
 }
 if(url.pathname==='/admin/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(html);}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
 res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  issued=[];requests=[];grants=[];failGrant=width>700;
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',isMobile:width<700,hasTouch:width<700});
  await context.addInitScript(()=>{localStorage.setItem('cnine_admin_token','isolated-rank-potion-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const page=await context.newPage(),errors=[],dialogs=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  await page.goto(base+'/admin/');
  await page.locator('#cms').waitFor({state:'visible'});
  await page.locator('#nav [data-view="coupons"]').click();
  await page.locator('#couponRewardType').selectOption(itemCode);
  assert.equal(await page.locator('#couponRewardAmount').inputValue(),'1');
  assert.equal(await page.locator('#couponRewardAmount').getAttribute('max'),'9999');
  assert.equal(await page.locator('#rankPotionCouponNote').isVisible(),true);
  await page.locator('#couponCode').fill('EXP2-UI-QA');
  await page.locator('#couponRewardAmount').fill('2');
  await page.locator('#couponMax').fill('100');
  await page.locator('.couponForm').screenshot({path:path.join(out,label+'-coupon.png')});
  await page.locator('#createPermanentCouponBtn').click();
  await page.waitForFunction(()=>document.getElementById('couponCode').value===''&&!document.getElementById('createPermanentCouponBtn').disabled);
  assert.equal(requests.length,1);assert.equal(requests[0].rewardType,itemCode);assert.equal(requests[0].rewardAmount,2);
  await page.locator('#nav [data-view="coupons"]').click();
  await page.waitForFunction(()=>!!document.querySelector('[data-coupon-toggle]'));
  assert.match(await page.locator('#coupons').innerText(),/계급 경험치 2배 물약/);
  await page.locator('#coupons').screenshot({path:path.join(out,label+'-issued.png')});
  await page.locator('#nav [data-view="users"]').click();
  // Existing mobile CMS sticky sidebar overlaps the user table's action column.
  // Keyboard activation opens the unchanged account dialog for this scoped check.
  if(width<700)await page.locator('[data-user="1"]').press('Enter');
  else await page.locator('[data-user="1"]').click();
  await page.locator('#inventoryItemCode').selectOption(itemCode);
  await page.locator('#inventoryItemAmount').fill('3');
  await page.locator('#inventoryItemReason').fill('경험치 물약 검수 지급');
  assert.equal(await page.locator('#rankPotionGrantNote').isVisible(),true);
  assert.equal(await page.locator('#rankPotionGrantNote img').evaluate(el=>el.complete&&el.naturalWidth>0),true);
  await page.locator('#inventoryGrantBlock').screenshot({path:path.join(out,label+'-grant.png')});
  await page.locator('#inventoryGrantBtn').click();
  if(width>700){
   await page.waitForFunction(()=>!document.getElementById('inventoryGrantBtn').disabled);
   assert(dialogs.some(s=>s.includes('같은 내용으로 다시 시도')));
   assert.equal(await page.locator('#userDialog').evaluate(el=>el.open),true);
   await page.locator('#inventoryGrantBtn').click();
  }
  await page.waitForFunction(()=>!document.getElementById('userDialog').open&&!document.getElementById('inventoryGrantBtn').disabled);
  assert.equal(grants.length,width>700?2:1);assert.equal(grants[0].userId,1);assert.equal(grants[0].itemCode,itemCode);assert.equal(grants[0].amount,3);
  if(width>700)assert.equal(grants[0].requestId,grants[1].requestId);
  assert.match(grants[0].requestId,/^[a-f0-9-]{36}$/);
  assert(dialogs.some(s=>s.includes('사용할 때 효과가 시작')));
  assert(dialogs.some(s=>s.includes('현재 보유 3개')));
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('cnine:rank-potion-grant:'))),false);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert.equal(overflow,false);assert.deepEqual(errors,[]);
  reports.push({label,width,height,coupon:requests[0],grant:grants[0],grantRequests:grants.length,retryKeyPreserved:width>700?grants[0].requestId===grants[1].requestId:null,mobileAccountEntry:width<700?'keyboard (existing sticky sidebar overlap)':null,artLoaded:true,overflow,errors});await context.close();
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({status:'PASSED',scope:'Real CMS with isolated API responses',reports},null,2)+'\n');
 console.log(JSON.stringify({status:'PASSED',reports,out},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

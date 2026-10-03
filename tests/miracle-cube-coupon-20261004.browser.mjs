import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/miracle-cube-coupon-20261004');fs.mkdirSync(out,{recursive:true});
// Use the real CMS markup/styles and both coupon controllers. Unrelated feature
// controllers are omitted from this isolated, authenticated UI fixture.
const html=fs.readFileSync(path.join(root,'admin/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,tag=>/src="(?:admin-v1276|admin-v1062-coupon-bulk-delete)\.js/.test(tag)?tag:'');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
let identity={role:'OWNER',nickname:'핑크빛유두'},issued=[],requests=[];
const fixtureCoupon={id:1,code:'MIRACLE-UI-QA',reward_type:'MIRACLE_CUBE',reward_amount:3,reward_coin:0,max_uses:10,used_count:0,is_active:1};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  let body='';for await(const chunk of req)body+=chunk;res.setHeader('content-type','application/json');
  if(url.pathname==='/api/admin/dashboard')return res.end(JSON.stringify({role:identity.role,admin:{id:99,...identity},stats:{users:2,cards:0,totalCoin:0,draws24h:0,banned:0,coupons:issued.length,urOwned:0,ssrOwned:0}}));
  if(['/api/admin/coupons','/api/admin/coupons-v2'].includes(url.pathname)&&req.method==='GET')return res.end(JSON.stringify({coupons:issued}));
  if(url.pathname==='/api/admin/coupon-create-permanent-v3'){
   const data=JSON.parse(body);requests.push(data);const coupon={...fixtureCoupon,code:data.code,reward_amount:data.rewardAmount,max_uses:data.maxUses};issued.push(coupon);res.statusCode=201;return res.end(JSON.stringify({ok:true,coupon,rewardLabel:'미라클 큐브'}));
  }
  return res.end(JSON.stringify({items:[],cards:[],members:[],logs:[],requests:[],pending:[],count:0,settings:{},enabled:false}));
 }
 if(url.pathname==='/admin/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(html)}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
 res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  identity={role:'OWNER',nickname:'핑크빛유두'};issued=[];requests=[];
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',isMobile:width<700,hasTouch:width<700});
  await context.addInitScript(()=>{localStorage.setItem('cnine_admin_token','isolated-coupon-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1')});
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const page=await context.newPage(),errors=[],alerts=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{alerts.push(d.message());await d.accept()});
  await page.goto(base+'/admin/');await page.locator('#cms').waitFor({state:'visible'});
  await page.locator('#nav [data-view="coupons"]').click();
  await page.locator('#couponRewardType').selectOption('MIRACLE_CUBE');
  assert.equal(await page.locator('#couponRewardAmount').inputValue(),'1');assert.equal(await page.locator('#couponRewardAmount').getAttribute('max'),'100000');
  assert.equal(await page.locator('#miracleCubeCouponNote').isVisible(),true);
  await page.locator('#couponCode').fill('MIRACLE-UI-QA');await page.locator('#couponRewardAmount').fill('3');await page.locator('#couponMax').fill('10');
  await page.locator('.couponForm').screenshot({path:path.join(out,label+'-form.png')});
  await page.locator('#createPermanentCouponBtn').click();await page.waitForFunction(()=>document.getElementById('couponCode').value===''&&!document.getElementById('createPermanentCouponBtn').disabled);
  assert.equal(requests.length,1);assert.equal(requests[0].rewardType,'MIRACLE_CUBE');assert.equal(requests[0].rewardAmount,3);assert.equal(requests[0].maxUses,10);
  assert(alerts.some(s=>s.includes('미라클 큐브 3개')));assert.match(await page.locator('#coupons').innerText(),/미라클 큐브/);
  await page.locator('#nav [data-view="coupons"]').click();await page.waitForFunction(()=>!!document.querySelector('[data-coupon-toggle]'));
  assert.match(await page.locator('#coupons').innerText(),/미라클 큐브/);await page.locator('#coupons').screenshot({path:path.join(out,label+'-issued.png')});
  for(const other of [{role:'OWNER',nickname:'다른관리자'},{role:'ADMIN',nickname:'핑크빛유두'}]){
   identity=other;await page.reload();await page.locator('#cms').waitFor({state:'visible'});await page.locator('#nav [data-view="coupons"]').click();
   assert.equal(await page.locator('#couponRewardType option[value="MIRACLE_CUBE"]').count(),0);assert.equal(await page.locator('#miracleCubeCouponNote').isVisible(),false);
   await page.waitForFunction(()=>!!document.querySelector('[data-coupon-toggle]'));assert.equal(await page.locator('[data-coupon-toggle]').isDisabled(),true);
   await page.evaluate(()=>{const option=document.createElement('option');option.value='MIRACLE_CUBE';option.textContent='tampered';document.getElementById('couponRewardType').append(option);document.getElementById('couponRewardType').value='MIRACLE_CUBE'});
   await page.locator('#couponCode').fill('FORGED-UI-QA');await page.locator('#createPermanentCouponBtn').click();assert.equal(requests.length,1);assert(alerts.at(-1).includes('OWNER 핑크빛유두'));
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);assert.deepEqual(errors,[]);
  reports.push({label,width,height,issued:requests[0],otherOwnerHidden:true,adminHidden:true,tamperedUiBlocked:true,overflow,errors});await context.close();
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({status:'PASSED',scope:'Actual CMS markup, styles, primary and bulk coupon controllers with isolated API responses',reports},null,2)+'\n');console.log(JSON.stringify({status:'PASSED',reports,out},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}

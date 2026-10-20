import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {LAND_PRIZES,storedLandWeights,LAND_COUPON_TTL_MS,landCouponTiming} from '../functions/_soopket_land.js';
const out=process.env.SOOPKETLAND_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'land-expiry-'));
const base=process.env.SOOPKETLAND_PREVIEW_ORIGIN||'http://127.0.0.1:4328';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const failures=[];
try{
 for(const viewport of [{width:1440,height:1080},{width:390,height:844}]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1});
  page.on('pageerror',e=>failures.push(e.message));
  await page.goto(base+'/preview/soopketland-v2039/');
  await page.waitForFunction(()=>window.SoopketLand?.diagnostics().webgl);
  assert.match(await page.locator('.sl-use-note').innerText(),/발급 후 8시간/);
  await page.selectOption('#previewPrize','PINGDU_REPAIR_COUPON');
  await page.locator('[data-sl-play]').click();await page.locator('[data-sl-skip]').click();
  await page.locator('[data-sl-result] .sl-receipt').waitFor();
  assert.match(await page.locator('[data-sl-result] .sl-expiry').innerText(),/남음/);
  await page.locator('[data-sl-result]').screenshot({path:path.join(out,`result-${viewport.width}.png`)});
  // A fast local clock must not shorten the server-authoritative eight hours.
  await page.evaluate(()=>{const actual=Date.now.bind(Date);Date.now=()=>actual()+3600000;});
  const current=Date.now(),weights=storedLandWeights(null),total=Object.values(weights).reduce((a,b)=>a+b,0);
  const history=[current-LAND_COUPON_TTL_MS-60000,current-LAND_COUPON_TTL_MS+5000,current].map((at,i)=>{
   const createdAt=new Date(at).toISOString();
   return {requestId:'preview-expiry-'+i,code:'DEMO-EXPIRY-'+i,delivery:'VIEWER_COUPON',couponUses:150,createdAt,...landCouponTiming(createdAt,current),prize:{...LAND_PRIZES.find(p=>p.key==='PINGDU_REPAIR_COUPON'),amount:1}};
  });
  const data={access:{allowed:true,isOwner:true},serverNow:new Date(current).toISOString(),couponTtlHours:8,tickets:0,nextCouponUses:0,dailyAllowance:{enabled:true},history,prizes:LAND_PRIZES.map(p=>({...p,percent:weights[p.key]/total*100})),owner:{accounts:[],missing:[],self:{id:1,nickname:'검수 OWNER'},weights,coupons:history.map(r=>({code:r.code,created_at:r.createdAt,expiresAt:r.expiresAt,expired:r.expired,is_active:1,max_uses:150,used_count:0,reward_json:JSON.stringify(r.prize)}))}};
  await page.evaluate(data=>window.SoopketLand.preview(async()=>data,document.querySelector('#previewRoot')),data);
  const receipts=page.locator('[data-sl-history] .sl-receipt'),ownerRows=page.locator('.sl-issued>div');
  assert.equal(await receipts.nth(0).locator('[data-sl-copy]').count(),0);
  assert.match(await receipts.nth(0).innerText(),/자동 소멸됨/);
  assert.match(await receipts.nth(2).locator('.sl-expiry').innerText(),/0[78]:[05][09]:\d{2} 남음/);
  assert.equal(await receipts.nth(1).locator('[data-sl-copy]').isEnabled(),true);
  await page.locator('.sl-owner summary').click();
  assert.equal(await ownerRows.nth(0).locator('button').isDisabled(),true);
  await page.waitForFunction(()=>document.querySelectorAll('[data-sl-history] .sl-receipt')[1]?.classList.contains('is-expired'),null,{timeout:10000});
  assert.equal(await receipts.nth(1).locator('[data-sl-copy]').isDisabled(),true);
  assert.equal(await receipts.nth(1).locator('.sl-code').isVisible(),false);
  assert.equal(await receipts.nth(1).locator('.sl-sharing-note').isVisible(),false);
  assert.match(await ownerRows.nth(1).locator('button').innerText(),/자동 소멸/);
  assert.equal(await ownerRows.nth(1).locator('button').isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[data-sl-history]').screenshot({path:path.join(out,`history-${viewport.width}.png`)});
  await page.locator('.sl-issued').screenshot({path:path.join(out,`owner-${viewport.width}.png`)});
  await page.evaluate(()=>window.SoopketLand.stop());assert.equal(await page.evaluate(()=>window.SoopketLand.diagnostics().active),false);
  await page.close();
 }
 assert.deepEqual(failures,[]);
 const report={ok:true,viewports:[1440,390],checks:['8-hour notice','server-clock countdown','automatic expiry without refresh','copy and use disabled','expired OWNER controls','no overflow','no page errors']};
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/retired-content-20261019');fs.mkdirSync(out,{recursive:true});
const original=fs.readFileSync(path.join(root,'admin/index.html'),'utf8');
assert.doesNotMatch(original,/storageCleanupPanel|(?:chicken-event|golden-axe)-v1\.js|monster-siege-admin/);
// Real settings markup/styles and CMS controller, unrelated feature plugins omitted.
const html=original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,tag=>/src="admin-v1276\.js/.test(tag)?tag:'');
const requests=[],writes=[];
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  requests.push(url.pathname);let body='';for await(const chunk of req)body+=chunk;
  res.setHeader('content-type','application/json');
  if(req.method!=='GET')writes.push({path:url.pathname,body:JSON.parse(body||'{}')});
  if(url.pathname==='/api/admin/dashboard')return res.end(JSON.stringify({role:'OWNER',admin:{id:1,role:'OWNER',nickname:'QA 운영자'},stats:{users:2,cards:0,totalCoin:0,draws24h:0,banned:0,coupons:0,urOwned:0,ssrOwned:0}}));
  if(url.pathname==='/api/admin/settings')return res.end(JSON.stringify({settings:{new_user_coin:5000,maintenance_mode:'0'}}));
  if(url.pathname==='/api/admin/breakthrough-settings')return res.end(JSON.stringify({config:{SR:[{cost:50,rate:100}]}}));
  if(url.pathname==='/api/events/golden-axe/item-options')return res.end(JSON.stringify({choices:[{code:'VEHICLE_PART_TIRE',name:'타이어 부품',image:'/assets/ui/workshop/vehicle-part-tire-v1668.png'},{code:'VEHICLE_PART_ENGINE',name:'엔진 부품',image:'/assets/ui/workshop/vehicle-part-engine-v1668.png'}]}));
  if(url.pathname==='/api/events/golden-axe/use-item')return res.end(JSON.stringify({reward:{name:'엔진 부품',quantity:150}}));
  return res.end(JSON.stringify({items:[],cards:[],members:[],coupons:[],logs:[],requests:[],pending:[],count:0,settings:{},enabled:false}));
 }
 if(url.pathname==='/admin/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(html);}
 if(url.pathname==='/qa-voucher'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/inventory-v2125.css"><body><dialog id="inventoryDetailDialog" class="iv25-dialog"><div class="iv25-dialog-head"><b>아이템 상세</b><button onclick="this.closest('dialog').close()">닫기</button></div><div id="inventoryDialogContent"></div></dialog><script type="module">import {openEventVoucher} from '/js/event-vouchers-v1.js';openEventVoucher({itemCode:'VEHICLE_PARTS_150_CHOICE',userId:7,dialog:document.querySelector('dialog'),body:document.querySelector('#inventoryDialogContent'),token:()=>'',refresh:async()=>{document.querySelector('#inventoryDialogContent').textContent='Refreshed inventory detail';},inventoryStyle:true});</script></body></html>`);}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
 res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),report=[];
try{
 for(const [label,width,height] of [['desktop',1440,960],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',isMobile:width<700,hasTouch:width<700});
  await context.addInitScript(()=>localStorage.setItem('cnine_admin_token','isolated-removal-qa'));
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const page=await context.newPage(),errors=[],dialogs=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  await page.goto(base+'/admin/');await page.locator('#cms').waitFor({state:'visible'});await page.locator('#nav [data-view="settings"]').click();
  await page.locator('#view-settings').waitFor({state:'visible'});await page.waitForFunction(()=>document.getElementById('newUserCoin').value==='5000');
  assert.equal(await page.locator('#maintenance').inputValue(),'0');
  assert.equal(await page.locator('#storageCleanupPanel,#chickenEventAdmin,#goldenAxeAdmin,[data-view="monstersiege"]').count(),0);
  assert.doesNotMatch(await page.locator('#view-settings').innerText(),/치킨|금도끼|은도끼|DB 용량 정리/);
  await page.locator('#view-settings .sectionIntro').evaluate(el=>el.scrollIntoView({block:'start'}));
  if(width<700){
   const navHeight=await page.locator('.layout>aside').evaluate(el=>el.getBoundingClientRect().height);assert.ok(navHeight<=160);
   await page.evaluate(offset=>scrollBy(0,-offset),navHeight+14);
  }
  await page.waitForTimeout(300);await page.screenshot({path:path.join(out,label+'-settings.png')});
  const settingsWidth=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
  await page.locator('#nav [data-view="coupons"]').click();assert.equal(await page.locator('#couponRewardType option[value="PINGDU_OLD_AXE"],#couponRewardType option[value="PINGDU_BAEMIN_TICKET"]').count(),0);
  await page.locator('#nav [data-view="logs"]').click();await page.locator('#view-logs').waitFor({state:'visible'});
  assert.ok(!requests.some(p=>/admin\/(?:siege|storage-cleanup|chicken-event|golden-axe)/.test(p)));
  await page.goto(base+'/qa-voucher');await page.locator('[data-target="VEHICLE_PART_ENGINE"]').waitFor({state:'visible'});
  await page.locator('[data-target="VEHICLE_PART_ENGINE"]').click();await page.screenshot({path:path.join(out,label+'-voucher.png')});
  const voucherWidth=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,dialog:document.querySelector('dialog').getBoundingClientRect().width}));assert.ok(voucherWidth.dialog<=width);
  await page.locator('[data-confirm]').click();await page.getByRole('heading',{name:'부품 지급 완료'}).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);report.push({label,settingsWidth,voucherWidth,errors,removedPanelsAbsent:true,activeSettingsAndLogsWork:true,voucherUsable:true});await context.close();
 }
 assert.equal(writes.length,2);assert.ok(writes.every(w=>w.path==='/api/events/golden-axe/use-item'&&w.body.itemCode==='VEHICLE_PARTS_150_CHOICE'&&w.body.target==='VEHICLE_PART_ENGINE'));
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({isolatedMockApi:true,productionWrites:0,report},null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

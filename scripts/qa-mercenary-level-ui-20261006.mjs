import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {levelDemo} from '../mercenary-codex/leveling/demo.mjs';
import {mercenaryLevelDraft} from '../shared/mercenary-level-v1.mjs';

const root=process.cwd(),out=path.resolve(process.env.LEVEL_UI_QA_OUTPUT||'../growth-ui-qa');
const require=createRequire(import.meta.url);
let chromium;
try { ({chromium}=require('playwright')); }
catch { ({chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{
  try {
    const u=new URL(req.url,'http://localhost');
    if(u.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({visible:false}));return;}
    let f=path.resolve(root,'.'+decodeURIComponent(u.pathname));
    if(!f.startsWith(root+path.sep))throw Error('outside root');
    if((await fs.stat(f)).isDirectory())f=path.join(f,'index.html');
    res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.webp':'image/webp','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(f)]||'application/octet-stream');res.end(await fs.readFile(f));
  }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
const shot=(page,name,fullPage=false)=>page.screenshot({path:path.join(out,name+'.png'),fullPage});
const noOverflow=async page=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
const result=async page=>{await page.locator('.break-reveal[data-phase="result"]').waitFor();await page.waitForTimeout(850);};
const finish=async page=>{await page.locator('.break-continue').click();await page.locator('.break-reveal').waitFor({state:'detached'});};
const toolsOpen=async page=>{if(await page.locator('.qa').getAttribute('open')===null)await page.locator('.qa>summary').click();};
async function drag(page,touch,fraction) {
  const box=await page.locator('.break-slider').boundingBox(),x=box.x+25,y=box.y+box.height/2,to=x+(box.width-56)*fraction;
  if(touch){const session=await page.context().newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(to-x)*i/8,y}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}
  else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(to,y,{steps:12});await page.mouse.up();}
}
try {
  for(const [name,width,height,touch] of [['desktop',1440,1000,false],['mobile',390,844,true],['narrow',320,700,true]]){
    const page=await browser.newPage({viewport:{width,height},hasTouch:touch}),errors=[],writes=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method()))writes.push(r.url());});
    await page.goto(base+'/mercenary-codex/leveling/?preview=1');await page.locator('.hero-card img').waitFor();await page.evaluate(()=>document.fonts.ready);await noOverflow(page);
    assert.equal(await page.locator('soop-adventure-lobby').count(),1);
    const nav=page.locator('soop-adventure-lobby');await nav.locator(width>980?'.all-menu':'.mobile-dock [data-category="all"]').click();await nav.locator('#menu-dialog[open]').waitFor();await nav.locator('#close-menu').click();
    await page.locator('#search').fill('없는용병');assert.equal(await page.locator('.roster-row:visible').count(),0);await page.locator('#search').fill('');
    await shot(page,name+'-growth',true);
    assert.equal(await page.locator('.material').count(),2);
    await page.locator('[data-quantity="V-004"]').fill('-1');assert.equal(await page.locator('#train').isDisabled(),true);
    await page.locator('[data-quantity="V-004"]').fill('0.5');assert.equal(await page.locator('#train').isDisabled(),true);
    await page.locator('[data-quantity="V-004"]').fill('31');assert.equal(await page.locator('#train').isDisabled(),true);
    await page.locator('[data-quantity="V-004"]').fill('15');assert.equal(await page.locator('#train').isDisabled(),true);await page.locator('#overflow').check();assert.equal(await page.locator('#train').isDisabled(),false);
    if(touch)await shot(page,name+'-materials');
    await page.locator('#train').click();assert.match(await page.locator('#notice').textContent(),/Lv.5/);assert.equal(await page.locator('#breakthrough').isDisabled(),false);
    await page.locator('#breakthrough').click();await page.locator('.break-reveal[data-phase="sealed"]').waitFor();await noOverflow(page);
    await drag(page,touch,.4);assert.equal(await page.locator('.break-slider').getAttribute('aria-valuenow'),'0');assert.equal(await page.locator('.break-reveal').getAttribute('data-phase'),'sealed');
    if(name!=='narrow')await shot(page,name+'-sealed');
    await page.locator('.break-sound').click();assert.equal(await page.locator('.break-sound').getAttribute('aria-pressed'),'true');await page.locator('.break-sound').click();
    await drag(page,touch,1.02);await page.locator('.break-reveal[data-phase="opening"]').waitFor();
    if(name==='desktop'){await page.waitForTimeout(400);await shot(page,'desktop-opening');}
    await result(page);assert.equal(await page.locator('#break-title').textContent(),'돌파 성공');assert.match(await page.locator('.break-result-effect').textContent(),/최대 체력 증가 5%/);
    const fits=await page.locator('.break-continue').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;});assert.equal(fits,true);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.querySelector('.break-reveal')?.contains(document.activeElement)),true);
    await shot(page,name+'-success');await finish(page);assert.match(await page.locator('#notice').textContent(),/Lv.5 돌파 성공/);
    await toolsOpen(page);await page.locator('[data-jump="10"]').click();await page.locator('#qa-result').selectOption('failure');await page.locator('#breakthrough').click();await page.locator('.break-reveal[data-phase="sealed"]').waitFor();
    await page.locator('.break-slider').press('Enter');await result(page);assert.equal(await page.locator('#break-title').textContent(),'돌파 실패');assert.match(await page.locator('.break-result-level').textContent(),/Lv.10.*유지.*경험치 0%/);await shot(page,name+'-failure');await finish(page);
    assert.match(await page.locator('#notice').textContent(),/Lv.10 유지.*0%/);assert.equal(await page.locator('.milestone.unlocked').count(),1);assert.equal(await page.locator('#breakthrough').isDisabled(),true);
    if(name==='desktop'){
      for(const level of [10,15,20]){await page.locator('[data-jump="'+level+'"]').click();await page.locator('#qa-result').selectOption('success');await page.locator('#breakthrough').click();await page.locator('.break-skip').click();await result(page);await finish(page);}
      assert.match(await page.locator('#notice').textContent(),/최종 돌파 완료/);assert.equal(await page.locator('.milestone.unlocked').count(),4);assert.equal(await page.locator('#train').isDisabled(),true);await page.evaluate(()=>scrollTo(0,0));await shot(page,'desktop-complete',true);
    }
    await page.locator('[data-target="V-013"]').click();assert.equal(await page.locator('.material').count(),1);assert.equal(await page.locator('[data-quantity="V-004"]').count(),0);
    await page.locator('#demo-break').click();await page.locator('.break-reveal').waitFor();await page.keyboard.press('Escape');await result(page);await page.keyboard.press('Escape');await page.locator('.break-reveal').waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),'');assert.equal(writes.length,0);assert.deepEqual(errors,[]);
    report.push({screen:name,viewport:{width,height},commonNavigation:true,rankFilter:true,materialValidation:true,overflowConsent:true,partialSlideReset:true,input:touch?'native touch':'mouse',keyboardAndEscape:true,success:true,failureKeepsPreviousBonus:true,skip:true,focusContained:true,soundToggle:true,noPreviewWrites:true,noHorizontalOverflow:true});await page.close();
  }
  const page=await browser.newPage({viewport:{width:1024,height:768},reducedMotion:'reduce'});
  await page.goto(base+'/mercenary-codex/leveling/?preview=1');await page.locator('.hero-card').waitFor();await noOverflow(page);await shot(page,'tablet-growth',true);
  await page.locator('#demo-break').click();await page.locator('.break-reveal[data-phase="sealed"]').waitFor();assert.equal(await page.locator('.break-particles').isVisible(),false);
  await page.locator('.break-slider').press('End');await page.locator('.break-reveal[data-phase="result"]').waitFor();await finish(page);
  await page.locator('#demo-break').click();await page.locator('.break-reveal').waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('cnine:route-will-change')));await page.locator('.break-reveal').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),'');
  const off={...levelDemo(),userId:7,enabled:false,policy:mercenaryLevelDraft()};let state=off;
  await page.route('**/api/mercenaries/v3/leveling/state',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(state)}));
  await page.goto(base+'/mercenary-codex/leveling/');await page.locator('.hero-card').waitFor();assert.equal(await page.locator('#train').isDisabled(),true);assert.match(await page.locator('.next-bonus').textContent(),/효과 미정/);assert.equal(await page.locator('.qa').count(),0);await shot(page,'live-off',true);
  state={...off,cards:[]};await page.reload();await page.getByText('함께 성장할 용병을 기다립니다').waitFor();await noOverflow(page);
  await page.unroute('**/api/mercenaries/v3/leveling/state');await page.route('**/api/mercenaries/v3/leveling/state',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'일시적으로 성장실을 불러올 수 없습니다.'})}));
  await page.reload();await page.getByText('성장실을 불러오지 못했습니다').waitFor();await noOverflow(page);
  report.push({screen:'tablet/off/error',reducedMotion:true,keyboardEnd:true,routeCleanup:true,offDisabled:true,unsetNumbers:true,emptyState:true,loadError:true});await page.close();
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({date:new Date().toISOString(),results:report},null,2));console.log(JSON.stringify({passed:report.length,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

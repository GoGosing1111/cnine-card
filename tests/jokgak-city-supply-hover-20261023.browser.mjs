import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity} from '../functions/_jokgak_city.js';
import {processCitySupply} from '../functions/_jokgak_city_supply.js';
import {cityShift} from '../shared/jokgak-city-v1.mjs';

const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CITY_QA_DIR;
assert.ok(out);fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],errors=[];
try{
 for(const width of [1440,390]){
  const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)});
  f.setTime(cityShift(f.now).startsAt+60000);f.deps.citySupplyRandom=()=>0;await f.join(1,'POLICE');
  const supply=await processCitySupply(f.env,{now:f.now});f.setTime(supply.records[0].drop.dropsAt+1000);
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390,isMobile:width===390,reducedMotion:'reduce'});
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.addInitScript(now=>{Date.now=()=>now;window.loadUser=()=>({serverUserId:1,nickname:'참가자 1'});window.ensureFeatureResources=async()=>{};},f.now);
   await page.route('**/api/**',async route=>{
    const req=route.request(),response=await handleJokgakCity({path:new URL(req.url()).pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>f.users.get(1),json:(v,s=200)=>Response.json(v,{status:s})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});
    await route.fulfill(response?{status:response.status,body:await response.text(),contentType:'application/json'}:{json:{enabled:false,items:[],cards:[]}});
   });
   await page.route('**/__city-hover-qa/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080c17"><main></main><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector("main").innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>'}));
   await page.goto(origin+'/__city-hover-qa/',{waitUntil:'domcontentloaded'});
   const pin=page.locator('.jc-supply-pin');await pin.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.jc-supply-pin img,.jc-map-art')].every(n=>n.naturalWidth>0));
   await page.evaluate(()=>document.fonts.ready);await pin.scrollIntoViewIfNeeded();
   const read=()=>pin.evaluate(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return {background:s.backgroundColor,image:s.backgroundImage,transform:s.transform,outline:s.outlineStyle,width:r.width,height:r.height};});
   const assertClear=async state=>{const value=await read();assert.equal(value.background,'rgba(0, 0, 0, 0)',width+': '+state+' must retain transparent artwork background');assert.equal(value.image,'none');return value;};
   const rest=await assertClear('rest');assert.ok(rest.width>=44&&rest.height>=44);
   await pin.hover();await page.waitForTimeout(180);const hover=await assertClear('hover');assert.equal(hover.transform,rest.transform);
   await page.locator('.jc-map-panel').screenshot({path:path.join(out,width+'-hover.png')});
   await page.mouse.down();await page.waitForTimeout(180);const active=await assertClear('pressed');assert.equal(active.transform,rest.transform,'Map pin must not jump when pressed');
   await page.mouse.up();
   await page.keyboard.press('Tab');await pin.focus();const focus=await assertClear('focus');assert.notEqual(focus.outline,'none','Keyboard focus remains visible');
   if(width===390){await pin.tap();await assertClear('after touch');}
   await page.locator('.jc-pin.selected[data-city-place="POLICE"]').waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   checks.push({width,rest,hover,active,focus,locationSelection:true,touch:width===390});
  }finally{await page.close();for(const fn of cleanup)await fn();}
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,fixture:'Actual city UI and local fixture only; no live account requests'},null,2)+'\n');
 console.log(JSON.stringify({screens:[1440,390],checks:'transparent rest/hover/press/focus/touch, stable anchor, location selection, focus outline, no overflow',errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

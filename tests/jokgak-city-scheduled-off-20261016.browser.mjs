import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCityOffSchedule} from '../functions/_jokgak_city_scheduled_off.js';
import {readCitySettings} from '../functions/_jokgak_city_settings.js';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/jokgak-city-scheduled-off-20261016');await mkdir(out,{recursive:true});
const cleanups=[],f=await cityFixture({after:fn=>cleanups.push(fn)}),noon=Date.parse('2026-10-16T03:00:00Z');f.setTime(noon-3600000);
const before=(await readCitySettings(f.env)).raw,packets=[],errors=[];let loseNext=false;
const html='<!doctype html><html lang="ko"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>족각도시 CMS 예약 OFF 검수</title><link rel="stylesheet" href="/admin/jokgak-city-admin-v1.css"><style>body{margin:0;background:#080e18;font-family:Arial,sans-serif}</style><main id="test" class="city-cms"></main><script type="module">import {mountCityCms} from "/admin/jokgak-city-admin-v1.mjs";mountCityCms(document.querySelector("main"));</script></html>';
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.end(html);return;}
  if(url.pathname.startsWith('/api/')){
   const parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts).toString();
   if(req.method==='PATCH'&&url.pathname.endsWith('/schedule-off'))packets.push(JSON.parse(body));
   const response=await handleJokgakCity({path:url.pathname.slice(5),request:new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),env:f.env,deps:{...f.deps,authenticate:async()=>({id:1,role:'OWNER'}),json:(v,status=200)=>Response.json(v,{status})}})||Response.json({ok:true});
   if(loseNext&&req.method==='PATCH'&&url.pathname.endsWith('/schedule-off')){loseNext=false;res.writeHead(200,{'content-type':'application/json'});res.end('{');return;}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('path');
  res.setHeader('content-type',file.endsWith('.mjs')||file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(await readFile(file));
 }catch(e){res.writeHead(500);res.end(e.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1080},timezoneId:'UTC'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.locator('[data-off-save]:enabled').waitFor();await page.locator('[data-path="rules.moveCooldownMs"]').waitFor();
 await page.locator('#city-off-at').fill('2026-10-16T12:00');await page.locator('[data-off-save]').click();await page.getByText('예약 저장 완료 · 2026-10-16 12:00 KST',{exact:true}).waitFor();
 assert.equal((await readCityOffSchedule(f.env)).state.pending.offAt,noon);await page.screenshot({path:path.join(out,'desktop.png')});
 await page.reload();await page.locator('[data-off-save]:enabled').waitFor();assert.equal(await page.locator('#city-off-at').inputValue(),'2026-10-16T12:00');
 await page.locator('#city-off-at').fill('2026-10-16T12:30');await page.locator('[data-off-save]').click();await page.getByText('예약 저장 완료 · 2026-10-16 12:30 KST',{exact:true}).waitFor();
 await page.locator('#city-off-at').fill('2026-10-16T12:45');loseNext=true;await page.locator('[data-off-save]').click();await page.locator('[data-off-feedback].is-error').waitFor();await page.locator('[data-off-save]').click();await page.getByText('예약 저장 완료 · 2026-10-16 12:45 KST',{exact:true}).waitFor();assert.deepEqual(packets.at(-1),packets.at(-2));
 await page.locator('[data-path="rules.moveCooldownMs"]').fill('9');await page.locator('[data-off-cancel]').click();await page.getByText('예약이 취소되었습니다.',{exact:true}).waitFor();assert.equal((await readCityOffSchedule(f.env)).state.pending,null);assert.match(await page.locator('[data-dirty]').textContent(),/저장하지 않은/);
 await page.locator('#city-off-at').fill('2026-10-16T10:00');const previous=packets.length;await page.locator('[data-off-save]').click();assert.equal(packets.length,previous);
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/New_York'}),m=await mobile.newPage();m.on('pageerror',e=>errors.push(e.message));
 await m.goto(origin);await m.locator('[data-off-save]:enabled').waitFor();await m.locator('#city-off-at').fill('2026-10-16T12:00');await m.locator('[data-off-save]').click();await m.getByText('예약 저장 완료 · 2026-10-16 12:00 KST',{exact:true}).waitFor();
 assert.equal((await readCityOffSchedule(f.env)).state.pending.offAt,noon);assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await m.screenshot({path:path.join(out,'mobile.png')});
 assert.equal((await readCitySettings(f.env)).raw,before);assert.deepEqual(errors,[]);
 await writeFile(path.join(out,'result.json'),JSON.stringify({verifiedAt:new Date().toISOString(),viewports:['1440x1080','390x844'],timezones:['UTC','America/New_York'],checks:['KST noon save','reload persistence','reschedule','lost response exact retry','cancel','independent policy dirty state','past input rejected','mobile no overflow','current mode preserved'],schedule:(await readCityOffSchedule(f.env)).state,pageErrors:errors},null,2));
 console.log('CMS browser checks passed: desktop/mobile, KST, save/change/cancel, retry, independent policy.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));for(const cleanup of cleanups)await cleanup();}

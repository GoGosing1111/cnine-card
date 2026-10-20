import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {emptySupport,supportKey} from '../shared/server-support-v1.mjs';

const out=process.env.LEGION_ENERGY_QA_OUTPUT;
assert(out);await fs.mkdir(out,{recursive:true});
const root=fileURLToPath(new URL('../',import.meta.url));
const midnight=Date.parse('2026-10-22T00:00:00+09:00'),before=midnight-1000;
const f=await legionFixture({withMercenary:true}),reports=[];
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/qa.html'){
      res.setHeader('content-type','text/html; charset=utf-8');
      return res.end('<!doctype html><html lang="ko"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/legion-hunt-entry-v2.css"><style>body{margin:0;background:#091018;color:#eee;font-family:Arial,sans-serif}</style><body></body></html>');
    }
    if(pathname.startsWith('/api/legion-hunt/')){
      let body='';for await(const chunk of req)body+=chunk;
      const r=await f.call(pathname.slice(5),body?JSON.parse(body):undefined);
      res.writeHead(r.status,{'content-type':'application/json'});return res.end(JSON.stringify(r.body));
    }
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403);return res.end();}
    const data=await fs.readFile(file);res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
  const cfg=await f.configure();cfg.mode='ON';
  assert.equal((await f.call('admin/legion-hunt',{policy:cfg},{method:'PATCH'})).status,200);
  f.setUser(f.player);
  for(const width of [1440,390])for(const maximum of [10,13]){
    f.clock.now=before;
    await f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(
      supportKey(2),JSON.stringify({...emptySupport(),startsAt:maximum===13?before-1000:0,endsAt:maximum===13?midnight+86400000:0})).run();
    await f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(
      'legion_hunt_owner_session_v1:2',JSON.stringify({energy:{version:1,current:0,maximum,updatedAt:before-60000}})).run();
    const page=await browser.newPage({viewport:{width,height:960},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(at=>{window.qaNow=at;Date.now=()=>window.qaNow;},before);
    await page.goto(origin+'/qa.html');
    await page.evaluate(async()=>{
      localStorage.setItem('cnine_card_api_token','local-qa-2');
      (await import('/js/legion-hunt-entry-v1.mjs')).openLegionHunt();
    });
    await page.waitForFunction(max=>document.querySelector('.legion-entries')?.textContent.includes('0 / '+max),maximum);
    assert.equal(await page.locator('[data-hunt-enter]').isDisabled(),true);
    const empty=await page.locator('.legion-entries').textContent();
    f.clock.now=midnight;await page.evaluate(at=>{window.qaNow=at;},midnight);
    await page.waitForFunction(max=>document.querySelector('.legion-entries')?.textContent.includes(max+' / '+max),maximum);
    assert.equal(await page.locator('[data-hunt-enter]').isDisabled(),false);
    const full=await page.locator('.legion-entries').textContent();
    assert.match(full,/3시간마다 1회.*매일 0시 최대 회복/);
    assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.current,maximum);
    await page.waitForFunction(()=>[...document.images].filter(i=>i.getBoundingClientRect().width>0).every(i=>i.complete));
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    assert.equal(overflow,false);assert.deepEqual(errors,[]);
    const bounds=await page.locator('.legion-entries').boundingBox();
    assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
    await page.screenshot({path:path.join(out,`legion-${width}-max${maximum}-midnight.png`),fullPage:true});
    reports.push({width,maximum,empty,full,entryEnabledAtMidnight:true,overflow,errors});
    await page.close();
  }
  await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(reports,null,2));
  console.log(JSON.stringify(reports));
}finally{
  await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await f.close();
}

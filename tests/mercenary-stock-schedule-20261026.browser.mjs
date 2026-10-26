import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {changeMercenaryStockSchedule} from '../functions/_mercenary_stock_schedule.js';
const root=process.cwd(),out=process.env.QA_OUT;assert(out);fs.mkdirSync(out,{recursive:true});
let cleanup;const f=await bloodmoonFixture({after(fn){cleanup=fn;}}),requests=[],reports=[];let loseNext=false;
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/state'){
   if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);requests.push(input);await changeMercenaryStockSchedule(f.env,f.user,input);if(loseNext){loseNext=false;res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({error:'검수용 응답 누락'}));return;}}
   res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(await f.state()));return;
  }
  if(url.pathname==='/cms'){
   res.writeHead(200,{'content-type':mime['.html']}).end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><link rel="stylesheet" href="/admin/mercenary-limited-admin-v1.css"><body style="margin:0;background:#10141d;color:#eee"><main></main><script type="module">import {createBloodmoonMercenaryEditor} from "/admin/mercenary-bloodmoon-admin-v1.mjs";const root=document.querySelector("main");const editor=createBloodmoonMercenaryEditor({request:async options=>{const res=await fetch("/state",options);const data=await res.json();if(!res.ok)throw Object.assign(Error(data.error),{status:res.status});return data;},onRender(){root.innerHTML=editor.html();editor.mount(root.querySelector("[data-bloodmoon-root]"));}});root.innerHTML=editor.html();editor.mount(root.querySelector("[data-bloodmoon-root]"));</script></body></html>');return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(error){res.writeHead(error.status||500,{'content-type':'application/json'}).end(JSON.stringify({error:error.message}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(base+'/cms');await page.locator('[data-stock-date]').waitFor();
  const date=new Date(Date.now()+86400000+9*3600000).toISOString().slice(0,16);
  await page.locator('[data-stock-date]').fill(date);await page.locator('[data-stock-reason]').fill('한국시간 정시 수량 예약 검수');
  for(const n of [960,961,962,963,964,965,978])await page.locator('[data-stock-code="V-'+n+'"]').fill(n===978?'1':'10');
  assert.match(await page.locator('[data-stock-summary]').innerText(),/7종 · 총 61장/);
  await page.locator('[data-stock-schedule]').screenshot({path:path.join(out,'cms-'+width+'-draft.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.equal(await page.locator('[data-stock-create]').evaluate(el=>getComputedStyle(el).color),'rgb(24, 36, 10)');
  const before=requests.length;loseNext=width===1440;await page.locator('[data-stock-create]').click();
  if(width===1440){await page.getByRole('button',{name:'같은 예약 결과 다시 확인'}).waitFor();await page.getByRole('button',{name:'같은 예약 결과 다시 확인'}).click();}
  await page.getByText('예약을 등록했습니다. 실행 시각 전에는 수량이 증가하지 않습니다.',{exact:true}).waitFor();
  if(width===1440)assert.equal(requests[before].requestId,requests[before+1].requestId);
  const schedules=(await f.state()).stockScheduleHistory.filter(s=>s.status==='SCHEDULED');assert.equal(schedules.length,1);assert.equal(schedules[0].changes.length,7);assert.equal((await f.state()).stock.find(s=>s.code==='V-960').limit,40);
  await page.locator('[data-stock-schedule]').screenshot({path:path.join(out,'cms-'+width+'-scheduled.png')});
  await page.locator('[data-stock-cancel]').click();await page.getByText('예약을 취소했습니다.',{exact:true}).waitFor();assert.equal((await f.state()).stockScheduleHistory.filter(s=>s.status==='SCHEDULED').length,0);
  assert.deepEqual(errors,[]);reports.push({width,registered:7,totalAdded:61,cancelled:true,lostResponseRecovered:width===1440,errors});await context.close();
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({reports,productionWrites:0},null,2)+'\n');console.log(JSON.stringify(reports));
}finally{await browser.close();await new Promise(r=>server.close(r));await cleanup();}

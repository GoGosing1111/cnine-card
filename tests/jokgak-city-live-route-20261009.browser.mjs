// Production shell + actual city handler/atomic writes, isolated SQLite accounts.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity} from '../functions/_jokgak_city.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.CITY_QA_ORIGIN||'http://127.0.0.1:8918',out=process.env.CITY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'jokgak-live-route-'));
const after=[],f=await cityFixture({after:fn=>after.push(fn)});f.setTime(Date.now());f.deps.now=Date.now;await f.join(1);await f.join(2);await f.join(3);
const fixture=JSON.parse(fs.readFileSync(new URL('../preview/jokgak-city-v1/battle-fixture.json',import.meta.url),'utf8'));
f.deps.prepareCityBattle=async()=>({...fixture,attackerNickname:'검수 시민',defenderNickname:'검수 상대'});
const actor={id:1,serverUserId:1,nickname:'검수 시민',role:'USER',coin:123456,cardShards:0,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const checks=[],errors=[],requests=[];let holdAttack=null;
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(actor=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(actor));localStorage.setItem('cnine_card_api_token','ISOLATED_QA');localStorage.setItem('cnine_battle_sound','OFF');},actor);
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),key=url.pathname.slice(5);
    if(key.startsWith('jokgak-city/')){
      requests.push(key);const response=await handleJokgakCity({path:key,request:new Request(request.url(),{method:request.method(),headers:request.headers(),...(['GET','HEAD'].includes(request.method())?{}:{body:request.postData()})}),env:f.env,deps:{...f.deps,authenticate:async()=>f.users.get(1),json:(data,status=200)=>Response.json(data,{status})}});
      if(key==='jokgak-city/attack'&&holdAttack)await holdAttack;
      await route.fulfill({status:response.status,body:await response.text(),contentType:'application/json'});return;
    }
    const data={'service/status':{maintenance:{active:false}},'me/summary':{user:actor,prison:{active:false}},me:{user:actor,prison:{active:false}},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:0}},'burning-event/status':{enabled:false},'user/runtime-command':{},'live-operations':{items:[]},'loot-shop/balance':{pigCoins:0}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
    await route.fulfill({json:data});
  });
  await page.goto(origin+'/?screen=jokgakCity',{waitUntil:'domcontentloaded'});await page.locator('.jc-person').first().waitFor({timeout:30000});
  assert.equal(await page.locator('.jc-preview').count(),0);checks.push('live route mounts actual handler, with no demo provider');
  await page.locator('[data-city-person="2"]').click();await page.waitForFunction(()=>document.querySelector('.jc-map-art')?.naturalWidth>0);console.log(JSON.stringify(await page.locator('.jc-map-art').evaluate(el=>({src:el.src,display:getComputedStyle(el).display,opacity:getComputedStyle(el).opacity,visibility:getComputedStyle(el).visibility,width:el.naturalWidth}))));await page.screenshot({path:path.join(out,'live-shell.png'),fullPage:true});
  await page.locator('[data-city-action="attack"]').click();await page.locator('.jc-battle-result').waitFor({timeout:120000});await page.locator('.jc-battle-result button').click();await page.locator('.jc-person').first().waitFor();
  assert.equal((await f.p("SELECT COUNT(*) n FROM jokgak_city_actions_v1 WHERE action='attack'").first()).n,1);checks.push('live attack commits one receipt and returns from V3 replay');
  await page.evaluate(()=>renderShell('home'));await page.locator('#jokgakCity').waitFor({state:'detached'});
  await f.p('UPDATE jokgak_city_players_v1 SET next_action_at=0,protected_until=0 WHERE user_id IN (1,3)').run();await f.action(3,'attack',{targetId:1});
  await page.locator('.jc-dispatch').waitFor({timeout:20000});assert.equal(await page.locator('#jokgakCity').count(),0);await page.screenshot({path:path.join(out,'live-home-attack-notice.png'),fullPage:true});checks.push('real target notification is delivered while another content is displayed');
  await page.locator('[data-notice-record]').click();assert.ok(await page.locator('.jc-dialog').textContent().then(s=>s.includes('방어')));checks.push('defender can read outcome without forced navigation');
  await page.locator('.jc-dialog [data-city-dialog-close]').last().click();
  await f.p('UPDATE jokgak_city_players_v1 SET health=100,next_action_at=0,protected_until=0 WHERE user_id IN (1,2)').run();
  await page.evaluate(()=>renderShell('jokgakCity'));await page.locator('[data-city-person="2"]').click();
  let releaseAttack;holdAttack=new Promise(resolve=>{releaseAttack=resolve;});
  const sent=page.waitForRequest(request=>request.url().endsWith('/jokgak-city/attack'));
  await page.locator('[data-city-action="attack"]').click();await sent;
  await page.evaluate(()=>renderShell('home'));releaseAttack();
  await page.waitForFunction(()=>!JSON.parse(localStorage.getItem('jokgak:pending:1')||'null'));
  assert.equal(await page.locator('.jc-battle').count(),0);assert.equal(await page.locator('#jokgakCity').count(),0);
  assert.equal((await f.p("SELECT COUNT(*) n FROM jokgak_city_actions_v1 WHERE action='attack' AND user_id=1").first()).n,2);
  checks.push('leaving during an attack response keeps the saved receipt without reopening the city');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'live-route-report.json'),JSON.stringify({checks,errors,requests},null,2));console.log(JSON.stringify({checks,errors,requests}));
}finally{await browser.close();for(const fn of after)await fn();}

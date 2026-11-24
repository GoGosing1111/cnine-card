import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.CITY_QA_ORIGIN||'http://127.0.0.1:8918',out=process.env.CITY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'city-life-'));
fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
const owner={id:80,role:'OWNER',nickname:'도시 관리자'};
try{
  for(const width of [1440,390]){
    const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),context=await browser.newContext({viewport:{width,height:960},isMobile:width<600,hasTouch:width<600});let actor=f.users.get(1);
    try{
      const p=(await readCitySettings(f.env)).policy;p.mode='TEST';p.testUserIds=[1,2];await saveCitySettings(f.env,owner,p,f.now);await f.join(1);await f.join(2);
      const setLife=async patch=>{const row=await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(1)).first();await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...JSON.parse(row.value),...patch}),cityLifeKey(1)).run();};
      await setLife({hunger:15,wellness:65});
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(now=>{window.__CITY_TIME__=now;Date.now=()=>window.__CITY_TIME__;localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_admin_token','CITY_LIFE_ISOLATED');},f.now);
      const advance=async ms=>{f.advance(ms);await page.evaluate(now=>window.__CITY_TIME__=now,f.now);};
      await page.route('**/api/**',async route=>{
        const req=route.request(),url=new URL(req.url());const response=await handleJokgakCity({path:url.pathname.slice(5),env:f.env,deps:{...f.deps,authenticate:async()=>actor,json:(data,status=200)=>Response.json(data,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});
        await route.fulfill(response?{status:response.status,body:await response.text(),contentType:'application/json'}:{json:{items:[],cards:[],visible:false,enabled:false}});
      });
      await page.route('**/__city-life-qa/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080d18"><main></main><script>function loadUser(){return '+JSON.stringify(actor)+'}</script><script src="/js/jokgak-city-v1.js?v=life-qa"></script><script>document.querySelector("main").innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>'}));
      page.setDefaultTimeout(10000);
      const panel=page.locator('dialog.jc-desk[open]'), dialog=page.locator('dialog.jc-dialog[open]');
      const cash=page.locator('.jc-dashboard [data-city-cash]'), condition=page.locator('.jc-dashboard [data-city-condition]');
      const vital=(label)=>page.locator('.jc-dashboard-vitals > div').filter({has:page.locator('span',{hasText:label})}).locator('b');
      const act=(action,product)=>page.locator('[data-city-action="'+action+'"]'+(product?'[data-city-product="'+product+'"]':'')).first();
      const visit=async()=>{await page.goto(origin+'/__city-life-qa/',{waitUntil:'domcontentloaded'});await cash.waitFor();};
      const refresh=async()=>{const updated=page.waitForResponse(r=>r.url().includes('/api/jokgak-city/status?')&&r.ok());await page.locator('[data-city-refresh]').first().click();await updated;};
      const openDesk=async(tab)=>{
        const button=tab==='services'?page.locator('.jc-service-launch'):page.locator('.jc-desk-launchers [data-city-desk="'+tab+'"]');
        await button.click();await panel.waitFor();
      };
      const closeDesk=async()=>panel.locator('[data-city-desk-close]').click();
      const close=async()=>dialog.locator('[data-city-dialog-close]').last().click();
      const go=async(place)=>{
        await advance(6000);
        const pin=page.locator('.jc-pin[data-city-place="'+place+'"]');
        if(await pin.evaluate(n=>n.classList.contains('current'))) return;
        await pin.click();await page.locator('.jc-pin.selected[data-city-place="'+place+'"]').waitFor();
        await act('move').click();await page.locator('.jc-pin.current[data-city-place="'+place+'"]').waitFor();
      };
      const takeService=async(action,product)=>{
        await act(action,product).click();
        if(['eat','buy','treat'].includes(action))await dialog.locator('[data-city-confirm]').click();
        await dialog.locator('h2').filter({hasText:'완료'}).waitFor();await close();
      };
      const boardAction=async(action,product)=>{
        const submitted=page.waitForResponse(r=>r.url().endsWith('/api/jokgak-city/'+action)&&r.request().method()==='POST');
        await act(action,product).click();const response=await submitted;
        assert.equal(response.status(),200,await response.text());
        await panel.locator('[data-city-board-feedback]:visible').waitFor();
      };
      const travelBoard=async (place,section)=>{
        await advance(6000);await section.locator('[data-city-board-go="'+place+'"]').click();
        await page.locator('.jc-pin.current[data-city-place="'+place+'"]').waitFor();
      };
      const fits=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('.jc-desk-content')].every(n=>n.scrollWidth<=n.clientWidth+1));
      const shot=name=>page.screenshot({path:path.join(out,width+'-'+name+'.png'),animations:'disabled'});
      await visit();await cash.filter({hasText:'10,000원'}).waitFor();
      assert.equal(await page.locator('.jc-pin').count(),11);assert.match(await condition.textContent(),/배고픔/);
      assert.match(await vital('포만감').textContent(),/^15 /);assert.match(await page.locator('.jc-dashboard').innerText(),/테스트 현금/);
      await openDesk('profile');assert.ok(await panel.locator('.jc-profile-job').textContent());assert.doesNotMatch(await panel.innerText(),/참가자 [12]\b/);
      await closeDesk();await shot('profile');checks.push(width+': dashboard, eleven places and anonymous profile');
      await go('RESTAURANT');await openDesk('services');await takeService('eat');await closeDesk();
      assert.match(await vital('포만감').textContent(),/^75 /);assert.equal(await cash.textContent(),'9,000원');
      await go('SHOP');await openDesk('services');await takeService('buy','LUNCHBOX');await closeDesk();
      await advance(6000);await openDesk('inventory');await panel.locator('.jc-bag').getByText('휴대 도시락',{exact:false}).waitFor();
      await takeService('use','LUNCHBOX');await closeDesk();assert.match(await vital('포만감').textContent(),/^100 /);
      assert.equal(await cash.textContent(),'7,500원');assert.equal((await f.p('SELECT coin FROM users WHERE id=1').first()).coin,123456);
      checks.push(width+': restaurant meal, shop purchase and inventory consumption');
      await advance(6000);await f.p("UPDATE jokgak_city_players_v1 SET location='SHOP',health=10,health_at=? WHERE user_id=1",f.now).run();
      await f.p("UPDATE jokgak_city_players_v1 SET location='SHOP' WHERE user_id=2").run();
      const fight=await f.action(2,'attack',{targetId:1});
      const notice=await page.evaluate(async()=>{const r=await (await fetch('/api/jokgak-city/notifications')).json();return r.items.find(i=>i.action==='attack');});
      assert.equal(notice.actorName,'익명 참가자');await page.evaluate(n=>JokgakCity.showNotice(n),notice);
      const theft=page.locator('.jc-dispatch .jc-theft');await theft.waitFor();const lost='−'+fight.theft.amount.toLocaleString('ko-KR');
      assert.ok((await theft.textContent()).includes(lost));await shot('cash-loss');
      await page.locator('[data-notice-record]').click();assert.ok((await dialog.locator('.jc-theft').textContent()).includes(lost));await close();
      await refresh();await page.locator('.jc-death-screen').waitFor();assert.equal(await page.locator('[data-death-clock]').textContent(),'03:00');
      assert.match(await page.locator('.jc-death-screen').innerText(),/병원/);assert.doesNotMatch(await page.locator('.jc-death-screen').innerText(),/참가자 2/);
      await advance(60000);await visit();await page.locator('[data-death-clock]').filter({hasText:'02:00'}).waitFor();
      await page.evaluate(()=>{JokgakCity.stop();document.querySelector('main').replaceChildren();});
      await page.locator('.jc-death-global').waitFor();assert.equal(await page.locator('[data-global-death-clock]').textContent(),'02:00');
      checks.push(width+': anonymous combat notice, exact cash loss and persistent death countdown');
      await advance(120000);await visit();await page.locator('.jc-death-screen').waitFor({state:'detached'});
      await cash.filter({hasText:(7500-fight.theft.amount).toLocaleString('ko-KR')}).waitFor();
      if(await act('join').isVisible()){await act('join').click();await dialog.locator('[data-city-confirm]').click();await act('join').waitFor({state:'detached'});}
      await setLife({wellness:20,hunger:5,at:f.now});await f.p("UPDATE jokgak_city_players_v1 SET location='HOME' WHERE user_id=1").run();
      await refresh();await page.locator('.jc-pin.current[data-city-place="HOSPITAL"]').waitFor();
      await openDesk('services');await takeService('ration');assert.match(await vital('포만감').textContent(),/^40 /);
      assert.equal(await act('ration').isDisabled(),true);await advance(6000);await takeService('treat');await closeDesk();
      assert.equal(await cash.textContent(),(5500-fight.theft.amount).toLocaleString('ko-KR')+'원');
      checks.push(width+': hospital emergency meal and treatment after respawn');
      await openDesk('board');
      const food=panel.locator('article').filter({hasText:'식재료 배달'}), med=panel.locator('article').filter({hasText:'병원 보급'});
      await boardAction('chooseGoal','DELIVERY');await boardAction('acceptDelivery','FOOD');
      await travelBoard('DOCK',food);await boardAction('pickupDelivery');await travelBoard('RESTAURANT',food);
      await boardAction('finishDelivery');await food.getByText('납품 완료').waitFor();
      await takeService('redeemTicket');
      await boardAction('acceptDelivery','MEDICAL');await travelBoard('SHOP',med);await boardAction('pickupDelivery');
      await travelBoard('HOSPITAL',med);await boardAction('finishDelivery');await panel.getByText('목표 보상 수령 완료').waitFor();
      assert.equal(await cash.textContent(),(7300-fight.theft.amount).toLocaleString('ko-KR')+'원');
      const event=panel.locator('section').filter({has:page.getByRole('heading',{name:/공동 사건/})});
      const eventTravel=event.locator('[data-city-board-go]');
      if(await eventTravel.count())await travelBoard(await eventTravel.getAttribute('data-city-board-go'),event);
      if(await event.locator('[data-city-action="collectEventCargo"]').count()){
        await boardAction('collectEventCargo');await travelBoard(await eventTravel.getAttribute('data-city-board-go'),event);
      }
      await boardAction('helpEvent');await event.getByText(/내 기여 1\/3/).waitFor();assert.ok(await fits());await shot('board');await closeDesk();
      checks.push(width+': both delivery routes, restaurant ticket, shift bonus and shared incident');
      await setLife({hunger:0,wellness:60,at:f.now});await f.p('UPDATE jokgak_city_players_v1 SET health=10,health_at=? WHERE user_id=1',f.now).run();
      await refresh();await condition.filter({hasText:'굶주림'}).waitFor();await advance(60000);await refresh();await vital('체력').filter({hasText:/^5 /}).waitFor();
      await advance(60000);await refresh();await page.locator('.jc-death-screen').getByText('굶주림으로 사망했습니다.').waitFor();
      await shot('starvation');assert.ok(await fits());checks.push(width+': starvation HP falls by five per minute and shows cause of death');
      actor=owner;await page.route('**/admin/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script type="module" src="/admin/jokgak-city-admin-v1.mjs"></script></body>')}));
      await page.goto(origin+'/admin/#jokgak-city',{waitUntil:'domcontentloaded'});await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.body.classList.add('auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});await page.locator('[data-tab="life"]').click();await page.locator('[data-path="cash.startingCash"]').fill('30000');await page.locator('[data-path="cash.theft.percent"]').fill('12');await page.locator('[data-path="cash.theft.maxCash"]').fill('2500');await page.locator('[data-path="cash.theft.enabled"]').uncheck();await page.locator('[data-path="life.meal.price"]').fill('1234');await page.locator('[data-path="life.hungerPerHour"]').fill('18');await page.locator('[data-path="life.supplies.1.wellness"]').fill('30');await page.locator('.city-cms-save button').click();await page.locator('.city-cms-note').filter({hasText:'저장 완료'}).waitFor();await page.locator('[data-reload]').click();await page.locator('.city-cms-note').filter({hasText:'불러왔습니다'}).waitFor();assert.equal(await page.locator('[data-path="cash.startingCash"]').inputValue(),'30000');assert.deepEqual((await readCitySettings(f.env)).policy.cash.theft,{enabled:false,percent:12,maxCash:2500});assert.equal(await page.locator('[data-path="cash.theft.percent"]').inputValue(),'12');assert.equal(await page.locator('[data-path="cash.theft.maxCash"]').inputValue(),'2500');assert.equal(await page.locator('[data-path="cash.theft.enabled"]').isChecked(),false);assert.equal(await page.locator('[data-path="life.meal.price"]').inputValue(),'1234');assert.equal((await readCitySettings(f.env)).policy.life.supplies[1].wellness,30);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,`${width}-cms-life.png`),fullPage:true});checks.push(`${width}: CMS life and shop settings persist and fit screen`);
    }finally{await context.close();for(const fn of cleanup)await fn();}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'life-browser-report.json'),JSON.stringify({checks,errors},null,2)+'\n');console.log(JSON.stringify({out,checks:checks.length,errors}));
}finally{await browser.close();}

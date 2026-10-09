import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.CITY_QA_ORIGIN||'http://127.0.0.1:8918',out=process.env.CITY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'city-cms-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
const owner={id:80,role:'OWNER',nickname:'도시 관리자'};
try{
  for(const width of [1440,390]){
    const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),context=await browser.newContext({viewport:{width,height:1000},isMobile:width<600,hasTouch:width<600});
    let actor=owner;
    try{
      const current=(await readCitySettings(f.env)).policy;current.mode='TEST';await saveCitySettings(f.env,owner,current,f.now);
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{localStorage.setItem('cnine_admin_token','CITY_CMS_ISOLATED');localStorage.setItem('cnine_battle_sound','OFF');});
      await page.route('**/api/**',async route=>{
        const req=route.request(),url=new URL(req.url()),key=url.pathname.slice(5);
        const response=await handleJokgakCity({path:key,env:f.env,deps:{...f.deps,authenticate:async()=>actor,json:(data,status=200)=>Response.json(data,{status})},request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()})})});
        if(!response){await route.fulfill({json:{items:[],cards:[],visible:false,enabled:false}});return;}
        await route.fulfill({status:response.status,body:await response.text(),contentType:'application/json'});
      });
      await page.route('**/admin/',route=>{
        const html=fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script type="module" src="/admin/jokgak-city-admin-v1.mjs"></script></body>');
        return route.fulfill({body:html,contentType:'text/html'});
      });
      await page.goto(origin+'/admin/#jokgak-city',{waitUntil:'domcontentloaded'});
      await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.body.classList.add('auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});
      await page.locator('.city-cms-mode').filter({hasText:'TEST'}).waitFor();
      assert.equal(await page.locator('.city-cms-tabs button').count(),4);assert.equal(await page.locator('.city-cms-distribution input').count(),7);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,`${width}-cms-operation.png`),fullPage:true});checks.push(`${width}: TEST and seven role weights fit screen`);
      await page.locator('[data-user-query]').fill('2');await page.locator('[data-user-search]').click();await page.locator('[data-user-add="2"]').click();
      await page.locator('[data-tab="roles"]').click();await page.locator('[data-role="POLICE"]').click();
      const field=p=>page.locator(`[data-path="${p}"]`);
      await field('roles.2.arrestMs').fill('90');await field('roles.2.arrestMinWanted').fill('3');
      await page.locator('[data-role="NURSE"]').click();await field('roles.3.maxHealth').fill('80');await field('roles.3.healAmount').fill('35');await field('roles.3.startLocation').selectOption('HOSPITAL');await field('roles.3.selfHeal').uncheck();await field('roles.3.attackEnabled').uncheck();
      await page.locator('[data-role="GANG"]').click();await field('roles.5.attackCooldownMs').fill('11');await field('roles.5.defeatDamage').fill('40');await field('roles.5.wantedPerAttack').fill('2');
      await page.locator('[data-tab="rewards"]').click();await field('rewards.enabled').check();await field('rewards.dailyLimit').fill('3');await field('rewards.sameTargetCooldownMs').fill('90');await field('roles.5.rewards.0.coin').fill('120');await page.locator('[data-add-item="0"]').click();await field('roles.5.rewards.0.items.0.quantity').fill('2');
      await page.locator('[data-role="NURSE"]').click();await field('roles.3.rewards.3.coin').fill('50');await page.locator('[data-add-item="3"]').click();
      await page.locator('.city-cms-save button').click();await page.locator('.city-cms-note').filter({hasText:'저장 완료'}).waitFor();
      const saved=(await readCitySettings(f.env)).policy;assert.equal(saved.mode,'TEST');assert.deepEqual(saved.testUserIds,[2]);assert.equal(saved.roles[2].arrestMs,90000);assert.equal(saved.roles[3].healAmount,35);assert.equal(saved.roles[3].maxHealth,80);assert.equal(saved.roles[5].defeatDamage,40);assert.equal(saved.roles[5].rewards[0].items[0].quantity,2);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,`${width}-cms-rewards.png`),fullPage:true});checks.push(`${width}: tester, police, medical, gang and mixed rewards save together`);
      await page.locator('[data-reload]').click();await page.locator('.city-cms-note').filter({hasText:'불러왔습니다'}).waitFor();assert.equal(await field('roles.3.rewards.3.coin').inputValue(),'50');
      await page.locator('[data-tab="roles"]').click();assert.equal(await field('roles.3.healAmount').inputValue(),'35');await page.screenshot({path:path.join(out,`${width}-cms-role.png`),fullPage:true});checks.push(`${width}: role/reward values survive reload`);
      const concurrent=(await readCitySettings(f.env)).policy;concurrent.rules.moveCooldownMs=4000;await saveCitySettings(f.env,owner,concurrent,f.now);
      await field('roles.3.healAmount').fill('36');await page.locator('.city-cms-save button').click();await page.locator('.city-cms-note').filter({hasText:'다른 창'}).waitFor();assert.equal((await readCitySettings(f.env)).policy.roles[3].healAmount,35);checks.push(`${width}: concurrent CMS edit rejects stale save`);
      // Current client with the actual handler and isolated account state.
      const nurse=f.roles.NURSE,civil=f.roles.CITIZEN,playing=(await readCitySettings(f.env)).policy;playing.testUserIds=[...new Set([2,nurse,civil])];await saveCitySettings(f.env,owner,playing,f.now);await f.join(nurse);await f.join(civil);await f.p('UPDATE jokgak_city_players_v1 SET health=30 WHERE user_id=?',civil).run();actor=f.users.get(nurse);
      await page.route('**/__city-cms-client-qa/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#080d18"><main></main><script>function loadUser(){return '+JSON.stringify(actor)+'}</script><script src="/js/jokgak-city-v1.js"></script><script>document.querySelector("main").innerHTML=JokgakCity.view();JokgakCity.bind();</script></body></html>'}));
      await page.goto(origin+'/__city-cms-client-qa/',{waitUntil:'domcontentloaded'});await page.locator('.jc-test-mode').waitFor();await page.locator(`[data-city-person="${civil}"]`).click();assert.equal(await page.locator('[data-city-action="attack"]').isDisabled(),true);assert.match(await page.locator('[data-city-action="heal"]').textContent(),/35/);assert.match(await page.locator('.jc-vitals').textContent(),/80/);
      await page.locator('[data-city-action="heal"]').click();await page.locator('.jc-reward').filter({hasText:'TEST 보상 미리보기'}).waitFor();assert.match(await page.locator('.jc-reward').textContent(),/50/);assert.equal((await f.p('SELECT coin FROM users WHERE id=?',nurse).first()).coin,123456);assert.equal((await f.p('SELECT COUNT(*) n FROM inventory_logs').first()).n,0);await page.screenshot({path:path.join(out,`${width}-city-test-reward.png`),fullPage:true});checks.push(`${width}: city uses custom role settings and TEST shows rewards without paying`);
      actor=f.users.get(79);await page.reload({waitUntil:'domcontentloaded'});await page.locator('.jc-load-error').filter({hasText:'TEST'}).waitFor();assert.equal(await page.locator('.jc-person').count(),0);checks.push(`${width}: non-tester sees TEST restriction instead of residents`);
    }finally{await context.close();for(const fn of cleanup)await fn();}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'cms-browser-report.json'),JSON.stringify({checks,errors},null,2)+'\n');console.log(JSON.stringify({out,checks:checks.length,errors}));
}finally{await browser.close();}

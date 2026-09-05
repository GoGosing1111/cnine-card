// Optional browser QA: PLAYWRIGHT_MODULE may point to the installed Playwright
// entry point. All user APIs are fixtures; this never evolves live cards.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.EVOLUTION_QA_ORIGIN||'http://127.0.0.1:4186';
const names=['경찰복 젬니','여왕시절 미오탱','웃는 류하','한정판 남수댕','도도한 디임','화이트 조은','밤의 히나','빛나는 요닝','순백의 희야','제니스 오리꿍','월광 아린','푸른 여름'];
const types={SSR_TO_MA:{sourceGrade:'SSR',targetGrade:'MA',minBreakthrough:10,coinCost:50000,shardCost:1500,successRate:10,pityAttempts:10},MA_TO_PRESTIGE:{sourceGrade:'MA',targetGrade:'PRESTIGE',minBreakthrough:13,masterStarCost:1,successRate:100,pityAttempts:10},LIMITED_TO_ZENITH:{sourceGrade:'LIMITED',targetGrade:'ZENITH',minBreakthrough:13,masterStarCost:30,coinCost:5000000,successRate:25,pityAttempts:7}};
const dataset=()=>({settings:{enabled:true},masterStars:1304,userResources:{coin:2840051779,cardShards:3200000},types:Object.fromEntries(Object.entries(types).map(([type,rule])=>[type,{...rule,type,eligibleCount:10,candidates:names.map((name,i)=>({id:`${type}-${i}`,title:name,name,grade:rule.sourceGrade,breakthroughLevel:i<10?rule.minBreakthrough:9,quantity:i%4+1,image:`assets/NEWCARD/${i+1}.jpg`,eligible:i<10,blockedReason:`${rule.sourceGrade} +${rule.minBreakthrough} 강화가 필요합니다.`,progress:{failedAttempts:i%4,totalAttempts:i%4,success:false}})),resultPool:names.slice(0,8).map((name,i)=>({id:`result-${i}`,title:name,name,grade:rule.targetGrade,image:`assets/NEWCARD/${i+13}.jpg`}))}]))});
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const styles=[...index.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m=>m[1]).filter(url=>url.startsWith('css/'));
for(const css of ['css/soopketmon-v21-exact-luxury.css','css/soopketmon-v21-renewal-live.css'])if(fs.existsSync(css))styles.push(css);
const html=`<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(url=>`<link rel="stylesheet" href="/${url}">`).join('')}<style>body{margin:0;background:#080e15}#fixture{width:min(1440px,100%);margin:0 auto;padding:20px 24px 100px}.qa-heading{color:#edf4fb;font:750 26px sans-serif;margin:0 0 18px}.qa-heading small{display:block;font-size:10px;letter-spacing:2px;color:#75cde0;margin-bottom:10px}.qa-nav{display:none}@media(max-width:720px){#fixture{padding:14px 8px 130px}.qa-heading{font-size:22px}.qa-nav{display:flex;position:fixed;z-index:999;bottom:0;left:0;right:0;height:70px;align-items:center;justify-content:space-around;background:#101720;border-top:1px solid #3b4857;color:#9daabd;font:12px sans-serif}}</style></head><body><main id="fixture"><h1 class="qa-heading"><small>도감·강화 / LIVE SERVICE</small>카드 진화</h1><div id="fixtureContent"></div></main><div id="modal" class="modal"></div><nav class="qa-nav"><span>로비</span><span>카드</span><span>전투</span><span>성장</span><span>메뉴</span></nav><script>window.summaryBar=()=>'';window.apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,o),d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error),d,{status:r.status});return d;};</script><script src="/js/evolution.js"></script><script>document.getElementById('fixtureContent').innerHTML=evolutionView({serverUserId:7});document.querySelector('.evolution-page').classList.add('pvev2-evolution-live');bindEvolutionView();</script></body></html>`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const width of [1440,390,360]){
    const context=await browser.newContext({viewport:{width,height:width>720?1040:844},deviceScaleFactor:1});
    const page=await context.newPage(),errors=[],requests=[],receipts=new Map();let loseNext=false,data=dataset();
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/__evolution-ui-qa')return route.fulfill({contentType:'text/html',body:html});
      if(url.pathname==='/api/evolution/overview')return route.fulfill({json:data});
      if(url.pathname==='/api/me')return route.fulfill({json:{}});
      if(url.pathname==='/api/evolution/batch'){
        const plan=route.request().postDataJSON();requests.push(plan);let response=receipts.get(plan.requestId);
        if(!response){const rule=data.types[plan.evolutionType],results=plan.cardIds.map((id,i)=>({source:rule.candidates.find(c=>c.id===id),success:i%2===0,reward:i%2===0?rule.resultPool[i%rule.resultPool.length]:null,attempts:[{isPity:false}],progress:{failedAttempts:4,totalAttempts:4}}));response={requestId:plan.requestId,evolutionType:plan.evolutionType,results,attemptCount:results.length,spent:{coin:500000,shards:0,stars:60},bonus:{stars:0,shards:0},pityAttempts:7};receipts.set(plan.requestId,response)}
        if(loseNext){loseNext=false;return route.abort('failed')}
        return route.fulfill({json:response});
      }
      if(url.pathname.startsWith('/api/'))throw new Error(`Unexpected live API ${url.pathname}`);
      return route.continue();
    });
    await page.goto(origin+'/__evolution-ui-qa');await page.locator('.evx-card').first().waitFor();
    assert.equal(await page.locator('.evx-tabs button').count(),3);
    await page.locator('[data-mode="LIMITED_TO_ZENITH"]').click();
    await page.locator('.evx-card').nth(0).click();await page.locator('.evx-card').nth(1).click();
    await page.locator('[data-attempts="5"]:visible').click();
    assert.equal(await page.locator('[data-attempts="5"]:visible').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-attempts="1"]:visible').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('#evxSelectedCount').textContent(),'2');
    assert.match(await page.locator('#evxCosts').textContent(),/50,000,000/);
    assert.equal(await page.locator('#evxStart').isEnabled(),true);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(os.tmpdir(),`evolution-v2035-${width}.png`),fullPage:width>720,animations:'disabled'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow');
    if(width<=720){await page.locator('.evx-card').last().scrollIntoViewIfNeeded();const b=await page.locator('#evxStart').boundingBox();assert.ok(b.y>0&&b.y+b.height<844-65,'mobile batch action stays above bottom navigation')}
    await page.locator('#evxStart').click();assert.equal(await page.locator('#evxConfirmGo').isDisabled(),true);await page.locator('#evxConfirmAck').check();
    if(width===390)loseNext=true;
    await page.locator('#evxConfirmGo').click();
    if(width===390){
      await page.locator('#evxRetryRequest').waitFor();await page.reload();await page.locator('#evxRecover').waitFor();
      assert.equal(await page.locator('#evxStart').isDisabled(),true);await page.locator('#evxRecover').click();
    }
    await page.locator('#evxResultsDone').waitFor();
    await page.locator('.evx-result-art img').first().evaluate(img=>img.decode().catch(()=>{}));
    await page.screenshot({path:path.join(os.tmpdir(),`evolution-v2035-result-${width}.png`)});
    assert.equal(await page.locator('.evx-result-list article').count(),2);
    if(width===390){assert.equal(requests.length,2);assert.equal(requests[0].requestId,requests[1].requestId);assert.equal(receipts.size,1)}
    await page.locator('#evxResultsDone').click();assert.equal(await page.locator('#evxRecover').count(),0);
    await page.locator('#evxSearch').fill('없음');assert.equal(await page.locator('.evx-card').count(),0);
    await page.locator('#evxSearch').fill('');await page.locator('#evxBlocked').check();assert.equal(await page.locator('.is-blocked').count(),2);
    await page.locator('#evxHelp').click();assert.match(await page.locator('.evx-dialog').textContent(),/7번째 도전 확정/);await page.keyboard.press('Escape');assert.equal(await page.locator('#evxDialog').count(),0);
    assert.deepEqual(errors,[]);console.log(`PASS ${width}px: multi-select, budget, confirmation, result, filters, overflow, recovery, keyboard`);
    await context.close();
  }
}finally{await browser.close()}

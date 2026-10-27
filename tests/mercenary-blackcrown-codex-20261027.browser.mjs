import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
const live=process.env.BLACKCROWN_PUBLIC_ORIGIN,origin=live||'http://127.0.0.1:8917',out='docs/qa/blackcrown-codex-skills-20261027',report={ok:false,origin,surfaces:[],errors:[],writes:[]};
const d=mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1,updated_at:'2026-10-27'}),cards=d.cards.filter(c=>c.season==='BLACKCROWN');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const ctx=await browser.newContext({viewport,isMobile:label==='mobile',hasTouch:label==='mobile',serviceWorkers:'block'}),page=await ctx.newPage(),surface={label,checked:[]};report.surfaces.push(surface);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))report.writes.push({method:r.method(),url:r.url()})});
  if(!live)await page.route('**/api/**',route=>route.fulfill({status:route.request().url().endsWith('/mercenary-codex')?200:401,contentType:'application/json',body:JSON.stringify(route.request().url().endsWith('/mercenary-codex')?d:{error:'로그인 후 보유 용병을 확인하세요.'})}));
  await page.goto(origin+'/mercenary-codex/?view=limited#V-950',{waitUntil:'networkidle'});await page.locator('[data-code="V-950"]').waitFor();
  for(const c of cards){
   if(await page.locator('#inspectionSheet').evaluate(el=>el.open))await page.locator('#closeInspection').click();
   await page.locator('[data-code="'+c.code+'"]').click();
   await page.locator('.combat-details').evaluate(el=>el.open=true);
   assert.equal(await page.locator('.skill-list .skill-entry').count(),2);
   assert.deepEqual(await page.locator('.skill-list h3').allTextContents(),c.skills.map(s=>s.name));
   assert.match(await page.locator('.combat-panel').innerText(),/2 SKILLS/);assert.match(await page.locator('.combat-panel').innerText(),/모션 2배속/);assert.match(await page.locator('.combat-panel').innerText(),/서버 10장/);
   assert.equal(await page.locator('[data-equip]').count(),0);
   await page.locator('#sdTab').click();await page.waitForFunction(()=>document.querySelector('#portraitDisplay image')?.getAttribute('href'));
   const sprite=await page.locator('#portraitDisplay image').getAttribute('href');assert.equal(sprite,'/'+c.battleSprite);
   await page.waitForTimeout(100);await page.screenshot({path:out+'/'+(live?'public-':'local-')+label+'-'+c.code+'.png',fullPage:label==='desktop'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>i.getClientRects().length&&i.complete&&!i.naturalWidth).map(i=>i.src));assert.deepEqual(broken,[]);
   await page.locator('.skill-list').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+(live?'public-':'local-')+label+'-'+c.code+'-skills.png'});
   surface.checked.push({code:c.code,skills:2,sprite,canDeploy:false});
  }
  await ctx.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.writes,[]);report.ok=true;
}catch(e){report.failure=e.stack;process.exitCode=1;console.error(e)}finally{await browser.close();await fs.writeFile(out+'/'+(live?'public-browser':'local-browser')+'.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,surfaces:report.surfaces.length,failure:report.failure}));

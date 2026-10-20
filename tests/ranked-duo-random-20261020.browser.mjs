import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const base=process.env.DUO_QA_URL||'http://127.0.0.1:8921',out=path.resolve(process.env.DUO_QA_DIR||'docs/qa/ranked-duo-random-20261020');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1080},hasTouch:width===390,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[],responses=[];
  page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===base)responses.push({url:r.url(),status:r.status()});});
  await page.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  const inspect=async name=>{
   await page.locator('.duo-random').waitFor();await page.evaluate(()=>document.fonts.ready);
   const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,missing:[...document.querySelectorAll('.duo-random img')].filter(img=>!img.complete||!img.naturalWidth).map(img=>img.src),buttons:[...document.querySelectorAll('.duo-random button')].map(b=>({label:b.textContent.trim(),height:b.getBoundingClientRect().height,skin:getComputedStyle(b).borderImageSource,disabled:b.disabled}))}));
   assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify(dimensions));assert.equal(dimensions.missing.length,0,JSON.stringify(dimensions));
   assert.ok(dimensions.buttons.every(b=>b.height>=44&&b.skin.includes('random-20261020/control.webp')),JSON.stringify(dimensions.buttons));
   await page.screenshot({path:path.join(out,name+'-'+width+'.png'),fullPage:true});return dimensions;
  };
  await page.goto(base+'/__duo');await page.getByRole('button',{name:'랜덤 매칭 · 바로 출전'}).waitFor();
  const home=await inspect('home');await page.locator('.rd-guide summary').click();await inspect('guide');
  await page.getByRole('button',{name:'티어·보상',exact:true}).click();await page.locator('.rd-tier-grid').waitFor();await inspect('tiers');
  await page.getByRole('button',{name:'매칭 로비',exact:true}).click();
  await page.route('**/api/ranked-duo/fight',async route=>{await page.waitForTimeout(1200);await route.continue();});
  const before=await page.request.get(base+'/api/ranked-duo/status').then(r=>r.json());
  await page.getByRole('button',{name:'랜덤 매칭 · 바로 출전',exact:true}).click();
  await page.locator('.rd-match').waitFor();await inspect('match');
  await page.locator('#modal.show').waitFor();await page.screenshot({path:path.join(out,'battle-'+width+'.png'),fullPage:false});
  const completed=await page.request.get(base+'/api/ranked-duo/history').then(r=>r.json());assert.ok(completed.history.some(h=>h.status==='COMPLETED'&&h.scoreApplied));
  // The real renderer supports skipping playback; use its visible control.
  const skip=page.getByRole('button',{name:/스킵|건너뛰기|결과 보기/}).first();if(await skip.count()&&await skip.isVisible())await skip.click();
  await page.locator('[data-duo-close]').waitFor({timeout:90000});
  assert.match(await page.locator('.rd-random-result').innerText(),/경기 종료 시 내 점수/);
  await page.screenshot({path:path.join(out,'result-'+width+'.png'),fullPage:false});await page.locator('[data-duo-close]').click();
  const after=await page.request.get(base+'/api/ranked-duo/status').then(r=>r.json());assert.equal(after.energy.current,before.energy.current-1);
  await page.getByRole('button',{name:'개인 랭킹',exact:true}).click();await page.locator('.rd-ranking li').waitFor();assert.equal(await page.locator('.rd-ranking li').count(),1);await inspect('ranking');
  await page.getByRole('button',{name:'전투 기록',exact:true}).click();await page.locator('.rd-history').waitFor();await inspect('history');
  await page.goto(base+'/__duo?scenario=recruit');
  await page.getByRole('button',{name:'시즌 참가하기',exact:true}).click();await page.getByRole('button',{name:'참가 신청 취소',exact:true}).waitFor();await inspect('joined');
  await page.getByRole('button',{name:'참가 신청 취소',exact:true}).click();await page.getByRole('button',{name:'시즌 참가하기',exact:true}).waitFor();
  await page.goto(base+'/__duo?scenario=empty');await inspect('off');assert.ok(await page.getByRole('button',{name:'시즌 재개 준비 중'}).isDisabled());
  await page.goto(base+'/__duo');await page.locator('#qa-cms').click();await page.locator('.duo-admin-random').waitFor();
  const cms=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.querySelector('.duo-admin').innerText,skin:getComputedStyle(document.querySelector('.duo-admin fieldset')).borderImageSource}));assert.ok(cms.scroll<=cms.width+1,JSON.stringify(cms));assert.match(cms.body,/개인별 지급/);assert.match(cms.skin,/random-20261020/);
  await page.screenshot({path:path.join(out,'cms-'+width+'.png'),fullPage:true});
  reports.push({width,home,cms,errors,responses,energyBefore:before.energy.current,energyAfter:after.energy.current});await page.close();
 }
 await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports.map(({width,errors,responses,energyBefore,energyAfter})=>({width,errors,responses,energyBefore,energyAfter})),null,2));
 assert.ok(reports.every(r=>!r.errors.length),JSON.stringify(reports.map(r=>r.errors)));
}finally{await browser.close();}

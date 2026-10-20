import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const base=process.env.DUO_QA_URL||'http://127.0.0.1:8923',out=path.resolve(process.env.DUO_QA_DIR||'docs/qa/ranked-duo-open-pool-20261020');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1080},hasTouch:width===390,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[],httpErrors=[],actions=[];
  page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===base)httpErrors.push({url:r.url(),status:r.status()});});
  page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/ranked-duo/'))actions.push(new URL(r.url()).pathname);});
  await page.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  const inspect=async name=>{
   await page.evaluate(()=>document.fonts.ready);
   const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,missing:[...document.querySelectorAll('.duo-random img,.duo-admin img')].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),buttons:[...document.querySelectorAll('.duo-random button')].map(b=>({label:b.textContent.trim(),height:b.getBoundingClientRect().height,skin:getComputedStyle(b).borderImageSource}))}));
   assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify(dimensions));assert.deepEqual(dimensions.missing,[]);
   assert.ok(dimensions.buttons.every(b=>b.height>=44&&b.skin.includes('random-20261020/control.webp')),JSON.stringify(dimensions));
   await page.screenshot({path:path.join(out,`${name}-${width}.png`),fullPage:true});return dimensions;
  };
  await page.goto(base+'/__duo');await page.getByRole('button',{name:'랜덤 매칭 · 바로 출전',exact:true}).waitFor();
  const before=await page.request.get(base+'/api/ranked-duo/status').then(r=>r.json());
  assert.equal(before.season.entryMode,'RANKED_POOL');assert.equal(before.poolCount,6);
  if(width===1440)assert.equal(before.joined,false);
  assert.equal(await page.locator('[data-duo="join"],[data-duo="cancel"]').count(),0);
  const home=await inspect('home');await page.locator('.rd-guide summary').click();
  assert.match(await page.locator('.rd-guide').innerText(),/참가 신청 없이.*전체 이용자/);
  assert.doesNotMatch(await page.locator('.duo-random').innerText(),/24시간 모집|참가 모집 중/);
  await inspect('guide');
  await page.route('**/api/ranked-duo/fight',async route=>{await page.waitForTimeout(1000);await route.continue();});
  await page.getByRole('button',{name:'랜덤 매칭 · 바로 출전',exact:true}).click();
  await page.locator('.rd-match').waitFor();await inspect('match');
  await page.locator('#modal.show').waitFor();await page.screenshot({path:path.join(out,`battle-${width}.png`)});
  const skip=page.getByRole('button',{name:/스킵|건너뛰기|결과 보기/}).first();if(await skip.count()&&await skip.isVisible())await skip.click();
  await page.locator('[data-duo-close]').waitFor({timeout:90000});
  assert.match(await page.locator('.rd-random-result').innerText(),/경기 종료 시 내 점수/);
  await page.screenshot({path:path.join(out,`result-${width}.png`)});await page.locator('[data-duo-close]').click();
  const after=await page.request.get(base+'/api/ranked-duo/status').then(r=>r.json());
  assert.equal(after.energy.current,before.energy.current-1);assert.equal(after.participants,1);
  assert.deepEqual(actions,['/api/ranked-duo/match','/api/ranked-duo/fight']);
  await page.getByRole('button',{name:'개인 랭킹',exact:true}).click();await page.locator('.rd-ranking li').waitFor();
  assert.equal(await page.locator('.rd-ranking li').count(),1);await inspect('ranking');
  await page.locator('#qa-cms').click();await page.locator('.duo-admin-random').waitFor();
  const cms=await page.locator('.duo-admin').innerText();
  assert.match(cms,/모집 없는 상시 랜덤 듀오/);assert.doesNotMatch(cms,/24시간|모집 시간|참가 모집 마감|자동 모집/);
  assert.equal(await page.locator('[name="recruitHours"],[data-action="recruit"]').count(),0);await inspect('cms');
  reports.push({width,home,joinedBefore:before.joined,poolCount:before.poolCount,energyBefore:before.energy.current,energyAfter:after.energy.current,actions,errors,httpErrors});
  await page.close();
 }
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(reports,null,2)+'\n');
 console.log(JSON.stringify(reports.map(({width,joinedBefore,poolCount,energyBefore,energyAfter,actions,errors,httpErrors})=>({width,joinedBefore,poolCount,energyBefore,energyAfter,actions,errors,httpErrors})),null,2));
 assert.ok(reports.every(r=>!r.errors.length&&!r.httpErrors.length),JSON.stringify(reports));
}finally{await browser.close();}

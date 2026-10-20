import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const base=process.env.DUO_QA_URL||'http://127.0.0.1:8923',out=path.resolve(process.env.DUO_QA_DIR||'docs/qa/ranked-duo-start-20261020');
// The actual previously deployed renderer reproduces an already-open old tab.
const cached=execFileSync('git',['show','974382226:js/ranked-duo-random-v4.mjs'],{encoding:'utf8'});
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of [1440,390])for(const stale of [true,false]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1080},hasTouch:width===390,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];
  page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  if(stale)await page.route('**/js/ranked-duo-random-v4.mjs*',route=>route.fulfill({status:200,contentType:'application/javascript',body:cached}));
  await page.goto(base+'/__duo-login?fast=1');await page.click('#login');
  await page.locator('.rd-control').waitFor();
  const status=await page.request.get(base+'/api/ranked-duo/status').then(r=>r.json());
  assert.equal(status.joined,true);assert.equal(status.hasSeasonRecord,false);assert.equal(status.participants,0);
  assert.equal(await page.locator('[data-duo="join"],[data-duo="cancel"]').count(),0);
  const start=page.locator('.rd-actions [data-duo="match"]');
  assert.equal(await start.isEnabled(),true);
  assert.equal(await start.innerText(),stale?'랜덤 매칭 · 바로 출전':'랭크 듀오 시작');
  await start.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,missing:[...document.querySelectorAll('.duo-random img')].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),buttonHeight:document.querySelector('.rd-actions [data-duo="match"]').getBoundingClientRect().height}));
  assert.ok(size.scroll<=size.width+1,JSON.stringify(size));assert.deepEqual(size.missing,[]);assert.ok(size.buttonHeight>=44);
  await page.screenshot({path:path.join(out,`start-${stale?'cached':'current'}-${width}.png`)});
  reports.push({width,stale,joined:status.joined,hasSeasonRecord:status.hasSeasonRecord,label:await start.innerText(),size,errors});
  assert.deepEqual(errors,[]);await page.close();
 }
 for(const [width,stale]of [[1440,false],[390,true]]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1080},hasTouch:width===390,serviceWorkers:'block',reducedMotion:'reduce'}),actions=[],errors=[];
  page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/ranked-duo/'))actions.push(new URL(r.url()).pathname);});
  if(stale)await page.route('**/js/ranked-duo-random-v4.mjs*',route=>route.fulfill({status:200,contentType:'application/javascript',body:cached}));
  await page.goto(base+'/__duo-login?fast=1');await page.click('#login');await page.locator('.rd-control').waitFor();
  const before=await page.request.get(base+'/api/ranked-duo/status').then(r=>r.json());
  await page.locator('.rd-actions [data-duo="match"]').click();
  await page.locator('#modal.show').waitFor();
  await page.screenshot({path:path.join(out,`battle-${width}.png`)});
  const skip=page.getByRole('button',{name:/스킵|건너뛰기|결과 보기/}).first();if(await skip.count()&&await skip.isVisible())await skip.click();
  await page.locator('[data-duo-close]').waitFor({timeout:90000});
  await page.screenshot({path:path.join(out,`result-${width}.png`)});
  await page.locator('[data-duo-close]').click();
  const after=await page.request.get(base+'/api/ranked-duo/status').then(r=>r.json());
  assert.deepEqual(actions,['/api/ranked-duo/match','/api/ranked-duo/fight']);assert.equal(after.energy.current,before.energy.current-1);
  assert.equal(after.hasSeasonRecord,true);assert.equal(after.participants,1);assert.deepEqual(errors,[]);
  reports.push({width,stale,actions,energyBefore:before.energy.current,energyAfter:after.energy.current,errors});await page.close();
 }
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(reports,null,2)+'\n');
 console.log(JSON.stringify(reports,null,2));
}finally{await browser.close();}

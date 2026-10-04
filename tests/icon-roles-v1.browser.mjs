import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ICON_ROLES} from '../shared/icon-roles-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.ICON_QA_ORIGIN||'http://127.0.0.1:8977',out=process.env.ICON_QA_OUT;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
  await page.goto(origin+'/__qa/cms');await page.locator('[data-ir-field="damagePercent"]').waitFor();
  await page.locator('[data-ir-field="damagePercent"]').fill('185');await page.locator('[data-ir-save]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ir-status]')?.textContent.includes('저장 완료'));
  await page.reload();await page.locator('[data-ir-field="damagePercent"]').waitFor();assert.equal(await page.locator('[data-ir-field="damagePercent"]').inputValue(),'185');
  await page.locator('.ic-role-editor').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,width+'-cms.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.goto(origin+'/?screen=home');await page.waitForFunction(()=>window.loadUser?.()?.serverUserId===7&&window.SoopketmonV21RuntimeRouter);
  await page.evaluate(()=>window.SoopketmonV21RuntimeRouter.navigate('iconfusion'));await page.waitForFunction(()=>document.querySelector('.if-availability')?.textContent.includes('각 1장 필요'));
  await page.evaluate(()=>document.querySelector('.if-role-slot').scrollIntoView({block:'center'}));await page.screenshot({path:path.join(out,width+'-fusion-role.png')});
  await page.evaluate(()=>window.IconRoles.open({id:'CN-1C000001',grade:'ICON',title:'디임',image:'assets/cards/ICON/diim.jpg'}));await page.locator('.ir-modal-profile .ir-timing').filter({hasText:'첫 2행동'}).waitFor();
  await page.screenshot({path:path.join(out,width+'-detail.png')});await page.locator('.ir-close').click();
  assert.deepEqual(errors,[]);reports.push({width,cmsSaveReload:true,mainFusionProfile:true,cardDetail:true,errors});await page.close();
 }
 for(const [width,mode] of [[1440,'PVP'],[390,'PVE']]){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  for(const def of ICON_ROLES){
   await page.goto(origin+'/preview/icon-roles-v1/?character='+def.code);await page.locator('#review-mode').selectOption(mode);
   await page.locator('#review-play').click();await page.locator('#role-battle canvas').waitFor({timeout:60000});
   await page.waitForFunction(role=>window.ProjectVPixiBattle?.diagnostics()?.iconRoles?.metrics?.roles?.includes(role),def.role,{timeout:90000});
   await page.screenshot({path:path.join(out,width+'-'+def.role.toLowerCase()+'.png')});
   await page.waitForFunction(()=>window.__iconReviewComplete===true,null,{timeout:120000});
   const d=await page.evaluate(()=>window.ProjectVPixiBattle.diagnostics().iconRoles);
   assert.equal(d.metrics.serverRows,d.metrics.appliedRows);assert.ok(d.metrics.roles.includes(def.role));assert.deepEqual(errors,[]);
   await page.locator('.ir-review-return').click();assert.equal(await page.locator('#role-battle canvas').count(),0);
   reports.push({width,mode,role:def.role,complete:true,returned:true,diagnostics:d,errors:[...errors]});console.log(JSON.stringify(reports.at(-1)));
  }await page.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log('ICON role UI and authoritative playback verified.');
}finally{await browser.close();}

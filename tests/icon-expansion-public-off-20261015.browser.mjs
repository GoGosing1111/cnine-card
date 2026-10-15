import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.ICON_QA_ORIGIN||'http://127.0.0.1:8979';assert.equal(new URL(origin).hostname,'127.0.0.1');
const out=process.env.ICON_QA_OUT||'docs/qa/icon-expansion-selector-lock-20261015';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),report=[];
try{for(const width of [1440,390]){
 await fetch(origin+'/__qa/reset',{method:'POST'});
 const context=await browser.newContext({viewport:{width,height:1100},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
 await page.goto(origin+'/?screen=home');await page.waitForFunction(()=>window.loadUser?.()?.serverUserId===7&&window.SoopketmonV21RuntimeRouter);
 await page.evaluate(()=>window.SoopketmonV21RuntimeRouter.navigate('iconfusion'));await page.locator('[data-target="ICON-NAMSUDAENG"]').waitFor();
 await page.waitForFunction(()=>document.querySelector('.if-availability')?.textContent.includes('각 1장 필요'));
 assert.equal(await page.locator('.if-target-list [data-target]').count(),12);assert.equal(await page.locator('.if-upcoming,[data-upcoming-icon]').count(),0);
 const existingCode=await page.locator('.if-target-list [data-target]').first().getAttribute('data-target');
 assert.match(await page.locator('.if-checkout').innerText(),/5천억/);assert.match(await page.locator('.if-checkout').innerText(),/500만/);
 for(const [grade,id] of [['SUPERSTAR','CN-SUPER'],['FUR','CN-FUR']]){await page.locator('[data-pick="'+grade+'"]').click();await page.locator('[data-material="'+id+'"]').click();}
 await page.locator('.if-ack input').check();assert.equal(await page.locator('.if-submit').isEnabled(),true);
 const before=await fetch(origin+'/__qa/state').then(r=>r.json());
 for(const [code,name,skill,photo] of [['ICON-NAMSUDAENG','남수댕','왕관 찬탈','namsudaeng-photo-original.png'],['ICON-DIIM-REDCAP','디임','자율 병기','diim-photo-original.png'],['ICON-OH-JOEUN-WHITE','오조은','선불 출격','joeun-portrait.webp'],['ICON-NAMUNEUL-BONGSOON-20261016','나무늘봉순','귀환 서약','bongsoon-portrait.webp']]){
  const choice=page.locator('.if-target-list [data-target="'+code+'"]');assert.equal(await choice.isEnabled(),true);assert.equal(await choice.locator('i').isVisible(),true);assert.match(await choice.innerText(),/제작 잠금/);
  await choice.click();assert.equal(await page.locator('.if-stage-caption h2').innerText(),name);assert.ok((await page.locator('.if-hero-card .icon-live-art').getAttribute('src')).endsWith(photo));
  assert.equal(await page.locator('.if-cost-row strong').first().innerText(),'1조');assert.match(await page.locator('.if-cost-row strong').last().innerText(),/500만/);assert.equal(await page.locator('.if-odds b').innerText(),'10%');
  assert.equal(await page.locator('.if-submit').isDisabled(),true);assert.match(await page.locator('.if-submit').innerText(),/제작 잠금/);assert.equal(await page.locator('.if-ack input').isDisabled(),true);
  assert.match(await page.locator('.if-role-slot').innerText(),new RegExp(skill));assert.equal(await page.locator('.if-role-slot a').count(),1);
  // Even a synthetic click with confirmation/materials populated cannot POST.
  await page.locator('.if-ack input').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));});await page.locator('.if-submit').dispatchEvent('click');
  assert.equal(await page.locator('.if-submit').isDisabled(),true);assert.deepEqual(await fetch(origin+'/__qa/state').then(r=>r.json()),before);
  await page.locator('.if-hero-card').evaluate(async el=>Promise.all([...el.querySelectorAll('img')].map(img=>img.decode())));
 }
 assert.equal(await page.locator('#iconFusionRoot').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
 await page.locator('.if-target-list').evaluate(async el=>Promise.all([...el.querySelectorAll('img')].map(img=>img.decode())));
 await page.locator(width<700?'.if-targets':'.if-workspace').screenshot({path:out+'/'+width+'-selector-lock.png'});
 if(width<700)await page.locator('.if-checkout').screenshot({path:out+'/'+width+'-checkout-lock.png'});
 await page.locator('[data-target="'+existingCode+'"]').click();assert.match(await page.locator('.if-checkout').innerText(),/5천억/);await page.locator('.if-ack input').check();assert.equal(await page.locator('.if-submit').isEnabled(),true);
 await fetch(origin+'/__qa/control',{method:'POST',body:JSON.stringify({guarantee:true})});await page.reload();await page.waitForFunction(()=>window.loadUser?.()?.serverUserId===7&&window.SoopketmonV21RuntimeRouter);await page.evaluate(()=>window.SoopketmonV21RuntimeRouter.navigate('iconfusion'));
 await page.waitForFunction(()=>document.querySelector('.if-odds b')?.textContent==='100%');assert.match(await page.locator('.if-odds small').innerText(),/다음 1회 확정/);
 for(const code of ['ICON-NAMSUDAENG','ICON-DIIM-REDCAP','ICON-OH-JOEUN-WHITE','ICON-NAMUNEUL-BONGSOON-20261016']){await page.locator('[data-target="'+code+'"]').click();assert.equal(await page.locator('.if-odds b').innerText(),'10%');assert.equal(await page.locator('.if-submit').isDisabled(),true);}
 assert.deepEqual(await fetch(origin+'/__qa/state').then(r=>r.json()),before);assert.deepEqual(errors,[]);
 report.push({width,selectorChoices:await page.locator('.if-target-list [data-target]').count(),existingEnabled:8,selectableLocked:await page.locator('.if-target-list .is-craft-locked').count(),separateUpcomingSection:false,coin:'1조',masterStars:'500만',successRate:'10%',guaranteeOnlyExisting:true,walletAndMaterialsUnchanged:true,craftPosts:0,errors});await context.close();
}}finally{await browser.close();}
fs.writeFileSync(out+'/browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

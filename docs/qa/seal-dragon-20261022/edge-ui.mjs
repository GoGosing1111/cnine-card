import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'}),out='docs/qa/seal-dragon-20261022',url='http://127.0.0.1:8916/preview/seal-battle-rework-20261021/';
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.selectOption('#scenario','last-seal');await page.locator('#sealTabPURIFY').click();
 await page.locator('[data-seal-role="PURIFY"]').click();await page.locator('[data-seal-confirm]').click();await page.locator('.seal-battle-return').waitFor({timeout:60000});
 assert.match(await page.locator('#battleMessage').innerText(),/용 보스가 깨어났습니다/);
 await page.locator('.seal-battle-return').click();await page.locator('.seal-dragon-reveal').waitFor();
 await page.screenshot({path:out+'/mobile-unseal.png'});await page.locator('[data-seal-confirm]').click();
 assert(await page.locator('[data-seal-role="BOSS"]').isEnabled());
 await page.locator('[data-seal-role="BOSS"]').click();await page.locator('[data-seal-confirm]').click();
 await page.waitForFunction(()=>window.ProjectVPixiBattle?.diagnostics()?.characterStates?.some(c=>c.sealDragon?.casting),{},{timeout:60000});
 await page.waitForTimeout(210);await page.screenshot({path:out+'/mobile-breath.png'});
 await page.locator('.seal-battle-return').waitFor({timeout:60000});await page.locator('.seal-battle-return').click();
 await page.setViewportSize({width:320,height:740});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/mobile-320.png',fullPage:true});
 const fail=await context.newPage();await fail.route('**/dragon-20261022/motion.webp',r=>r.abort());await fail.goto(url);
 await fail.locator('[data-seal-role="BOSS"]').click();await fail.locator('[data-seal-confirm]').click();await fail.locator('.seal-v3-error').waitFor({timeout:60000});
 assert.equal(await fail.evaluate(()=>window.sealPreviewCalls.filter(c=>c.path.endsWith('participate')).length),0);
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/edge-check.json',JSON.stringify({passed:true,errors,checks:['last seal → reveal → boss','reduced motion','painted breath frames','320px overflow','asset failure before participation POST']},null,2));
 console.log('Seal transition, breath, reduced motion, 320px and preload failure passed.');await context.close();
}finally{await browser.close();}

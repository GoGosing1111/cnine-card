import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const out='docs/qa/seal-orbs-20261022',url='http://127.0.0.1:8916/preview/seal-battle-rework-20261021/';
const browser=await chromium.launch({headless:true,channel:'chrome'}),report=[];
try{
  for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'});
    await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
    const page=await context.newPage(),errors=[],failures=[],resources=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.url().includes('/orbs-20261022/')){resources.push(r.url());if(r.status()>=400)failures.push(r.status());}});
    await page.goto(url);await page.locator('#sealTabATTACK').waitFor();
    for(const role of ['ATTACK','GUARD','PURIFY']){
      await page.locator('#sealTab'+role).click();
      await page.locator('.seal-orb-portrait').evaluate(img=>img.decode());
      assert((await page.locator('.seal-orb-portrait').getAttribute('src')).endsWith(role.toLowerCase()+'.webp'));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`${out}/${name}-${role.toLowerCase()}-selection.png`,fullPage:true});
      await page.locator('[data-seal-role="'+role+'"]').click();await page.locator('[data-seal-confirm]').click();
      await page.locator('.battle-v3-live-shell.is-v3-ready canvas').waitFor({timeout:60000});
      await page.waitForTimeout(450);
      await page.screenshot({path:`${out}/${name}-${role.toLowerCase()}-battle.png`});
      await page.locator('.seal-battle-return').waitFor({timeout:60000});
      await page.locator('.seal-battle-return').click();
      assert.equal(await page.evaluate(()=>window.sealPreviewCalls.filter(c=>c.path.endsWith('participate')).at(-1).body.role),role);
    }
    await page.setViewportSize({width:320,height:740});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#sealTabATTACK').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#sealTabGUARD').getAttribute('aria-selected'),'true');
    await page.screenshot({path:`${out}/${name}-320.png`,fullPage:true});
    await page.goto(url+'admin.html');await page.locator('#sealDragonHp').waitFor();
    await page.locator('.seal-admin-role-settings img').first().evaluate(img=>img.decode());
    assert.equal(await page.locator('.seal-admin-role-settings img[src*="orbs-20261022"]').count(),3);
    assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
    report.push({name,roles:['ATTACK','GUARD','PURIFY'],resources:[...new Set(resources)],errors,failures});
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();
  await page.route('**/orbs-20261022/attack.*',r=>r.abort());
  await page.goto(url);await page.locator('[data-seal-role="ATTACK"]').click();await page.locator('[data-seal-confirm]').click();
  await page.locator('.seal-v3-error').waitFor({timeout:60000});
  assert.equal(await page.evaluate(()=>window.sealPreviewCalls.filter(c=>c.path.endsWith('participate')).length),0);
  await page.screenshot({path:out+'/mobile-load-failure.png'});await context.close();
  await fs.writeFile(out+'/browser-check.json',JSON.stringify({passed:true,report,preloadFailureNoPost:true,smallViewport:320,keyboardSelection:true},null,2)+'\n');
  console.log('Desktop/mobile: all three actual V3 orb battles, CMS images, 320px, keyboard and preload failure passed.');
}catch(error){await fs.writeFile(out+'/browser-failure.json',JSON.stringify({error:error.stack,report},null,2));throw error;}finally{await browser.close();}

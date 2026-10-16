import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {monsterDefenseFixture} from './helpers/monster-defense-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await monsterDefenseFixture(),out=path.resolve(process.env.DEFENSE_QA_OUTPUT||'../monster-defense-loadout-qa');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const contexts=[],errors=[],failed=[],checks=[];
async function open(user,width,height){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block',reducedMotion:'reduce'});contexts.push(context);
 await context.addInitScript(id=>{localStorage.setItem('cnine_card_api_token','local-qa-'+id);localStorage.setItem('cnine_battle_sound','OFF');},user);
 await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failed.push({status:r.status(),path:new URL(r.url()).pathname});});
 await page.goto(h.origin+'/defense/');await page.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().roster.mercenaries>0);return page;
}
const snap=async(page,name)=>{await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.getBoundingClientRect().height>0).map(i=>{i.loading='eager';return i.decode().catch(()=>{});}));});await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});};
const fit=async page=>assert.ok(await page.evaluate(()=>{const d=document.querySelector('.defense-formation');return document.documentElement.scrollWidth<=innerWidth+1&&(!d.open||d.scrollWidth<=d.clientWidth+1);}), 'screen fits horizontally');
const choose=async(page,mercenaries,card)=>{
 await page.locator('#loadout-0').click();await page.locator('[data-search]:enabled').waitFor();
 for(const code of mercenaries)await page.locator(`[data-choice="${code}"]`).click();
 await page.locator('[data-kind="CARD"]').click();await page.locator(`[data-choice="${card}"]`).click();
};
try{
 const a=await open(1,1440,1000);assert.equal(await a.locator('#create-room').isDisabled(),true);
 await choose(a,['V-049','V-051'],'CARD:CN-0505936A0CBB4E59');
 await a.locator('[data-kind="MERCENARY"]').click();await a.locator('[data-choice="V-010"]').click();assert.match(await a.locator('[data-status]').textContent(),/2명까지/);assert.equal(await a.locator('[data-merc-count]').textContent(),'2/2');
 await a.locator('[data-search]').fill('크라이');assert.equal(await a.locator('[data-choice]').count(),1);await a.locator('[data-search]').fill('');
 await a.locator('[data-grade]').selectOption('SS');assert.ok(await a.locator('[data-choice]').count()>0);await a.locator('[data-grade]').selectOption('');
 await snap(a,'01-picker-desktop');await fit(a);await a.locator('[data-apply]').click();await a.locator('.defense-formation').waitFor({state:'hidden'});
 assert.match(await a.locator('#loadout-0').textContent(),/크라이베른/);assert.match(await a.locator('#loadout-2').textContent(),/구수댕/);await snap(a,'02-selected-lobby-desktop');
 await a.locator('[data-capacity="2"]').click();await a.locator('#create-room').click();await a.locator('#waiting-room').waitFor({state:'visible'});const roomId=await a.evaluate(()=>CoopDefenseReview.diagnostics().roomId);
 const b=await open(2,390,844);await choose(b,['V-010','V-009'],'CARD:CN-02D9DC1E8A8A4209');await snap(b,'03-picker-mobile');await fit(b);await b.locator('[data-apply]').tap();await b.locator('.defense-formation').waitFor({state:'hidden'});
 await b.locator('#find-rooms').tap();await b.locator(`[data-room-join="${roomId}"]`).tap();await b.locator('#waiting-room').waitFor({state:'visible'});
 await a.locator('#ready').click();await a.waitForFunction(()=>document.querySelector('#ready').getAttribute('aria-pressed')==='true');
 await a.locator('#edit-formation').click();await a.locator('[data-search]:enabled').waitFor();await a.locator('[data-choice="V-049"]').click();await a.locator('[data-formation-cancel]').click();assert.equal(await a.locator('#ready').getAttribute('aria-pressed'),'true');
 await a.locator('#edit-formation').click();await a.locator('[data-search]:enabled').waitFor();await a.locator('[data-choice="V-049"]').click();await a.locator('[data-choice="V-046"]').focus();await a.keyboard.press('Space');await a.locator('[data-apply]').click();await a.waitForFunction(()=>document.querySelector('#ready').getAttribute('aria-pressed')==='false');
 let s=await a.evaluate(()=>CoopDefenseReview.snapshot());assert.deepEqual(s.players[0].loadout.mercenaries,['V-051','V-046']);assert.deepEqual(s.players[1].loadout.mercenaries,['V-010','V-009']);
 await a.reload();await a.locator('#waiting-room').waitFor({state:'visible'});s=await a.evaluate(()=>CoopDefenseReview.snapshot());assert.equal(s.players[0].roster[1].name,'라그니엘');
 await snap(a,'04-waiting-desktop');await snap(b,'05-waiting-mobile');await fit(b);
 for(const p of [a,b])await p.locator('#ready').click();await a.waitForFunction(()=>!document.getElementById('start').disabled);await a.locator('#start').click();
 for(const p of [a,b]){await p.waitForFunction(()=>CoopDefenseReview.diagnostics().engine?.rendererCount===1,{},{timeout:60000});await p.locator('#loading').waitFor({state:'hidden'});}
 s=await a.evaluate(()=>CoopDefenseReview.snapshot());assert.equal(s.units.length,6);assert.deepEqual(s.units.filter(u=>u.ownerId==='1').map(u=>u.code),['V-051','V-046','CARD:CN-0505936A0CBB4E59']);
 await snap(a,'06-owned-battle-desktop');await snap(b,'07-owned-battle-mobile');checks.push('PC/mobile owned portraits, search/grade, 2+1 limit, click/touch/Space, apply/cancel, waiting edit clears readiness, other squad unchanged, reload and six actual combat actors');
 const narrow=await open(3,320,740);await narrow.locator('#loadout-0').click();await narrow.locator('[data-search]:enabled').waitFor();await snap(narrow,'08-picker-320');await fit(narrow);await narrow.keyboard.press('Escape');assert.equal(await narrow.locator('.defense-formation').isVisible(),false);checks.push('320px layout and Escape close');
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({ok:true,checks,errors,failed,roomId,units:s.units.map(u=>({id:u.id,code:u.code,name:u.name,role:u.role}))},null,2));console.log(JSON.stringify({ok:true,checks,out}));
}catch(error){
 for(const [i,c]of contexts.entries())for(const p of c.pages()){await p.screenshot({path:path.join(out,'failure-'+i+'.png'),fullPage:true});console.log(JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.defense-formation,.formation-tools,.formation-body,.formation-inventory,.formation-portrait,.formation-art')].slice(0,8).map(e=>({class:e.className,rect:e.getBoundingClientRect().toJSON(),style:{position:getComputedStyle(e).position,display:getComputedStyle(e).display,height:getComputedStyle(e).height,width:getComputedStyle(e).width}})))));}
 throw error;
}finally{for(const c of contexts)await c.close();await browser.close();await h.dispose();}

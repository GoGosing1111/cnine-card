import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import('file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),out=new URL('./',import.meta.url);
async function check(width){
 const mobile=width<700,page=await browser.newPage({viewport:{width,height:mobile?844:960},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);
 const profile='clock-auto-'+width+'-'+Date.now();
 await page.goto('http://127.0.0.1:8941/docs/qa/tower-clock-auto-next-20261022/index.html?pve=tower&profile='+profile);
 const fight=page.locator('[data-abyss-action="fight"]');await fight.waitFor();
 const auto=page.locator('#pveTowerView [data-abyss-action="auto-next"]');assert.equal(await auto.getAttribute('aria-pressed'),'false');await auto.click();assert.equal(await auto.getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>{QA.clocks=[];const update=TowerAbyssUI.updateBattle;TowerAbyssUI.updateBattle=(stage,event,data)=>{update(stage,event,data);QA.clocks.push({floor:data.floorNo,type:event.type,remaining:event.remainingCombatMs,progress:event.guardianProgress,shown:stage.querySelector('[data-abyss-clock]')?.textContent});};});
 await page.screenshot({path:fileURLToPath(new URL(width+'-entry.png',out)),fullPage:true});
 await fight.locator('strong').click();await page.locator('[data-continuous-pause]:enabled').waitFor();
 await page.waitForFunction(()=>QA.clocks.some(e=>e.remaining<180000));
 console.log(width+': official clock is decreasing');
 const pause=page.locator('[data-continuous-pause]');await pause.click();await page.waitForTimeout(1800);
 const frozen=await page.locator('[data-abyss-clock]').innerText(),events=await page.evaluate(()=>QA.clocks.length);
 await page.waitForTimeout(1400);assert.equal(await page.locator('[data-abyss-clock]').innerText(),frozen);assert.equal(await page.evaluate(()=>QA.clocks.length),events);
 const layout=await page.evaluate(()=>{const b=document.querySelector('.abyss-battle-auto button').getBoundingClientRect(),hud=document.querySelector('.abyss-combat-hud').getBoundingClientRect();return {button:{x:b.x,y:b.y,width:b.width,height:b.height},hud:{x:hud.x,y:hud.y,right:hud.right,bottom:hud.bottom},overflow:document.documentElement.scrollWidth>innerWidth};});
 assert.ok(layout.button.height>=44);console.log(width+': layout '+JSON.stringify(layout));assert.ok(layout.button.x>=layout.hud.right||layout.button.x+layout.button.width<=layout.hud.x||layout.button.y>=layout.hud.bottom-1||layout.button.y+layout.button.height<=layout.hud.y);assert.equal(layout.overflow,false);
 await page.screenshot({path:fileURLToPath(new URL(width+'-paused.png',out))});await pause.click();
 await page.locator('.is-abyss-result [data-abyss-auto-status]').waitFor({state:'visible',timeout:240000});
 const countdown=await page.locator('[data-abyss-auto-status]').innerText();assert.match(countdown,/초 후 다음 층/);
 await page.screenshot({path:fileURLToPath(new URL(width+'-result.png',out))});console.log(width+': full first floor settled, countdown visible');
 await page.waitForFunction(()=>QA.calls.filter(r=>r.path==='tower/start'&&r.status===200).length===2,{},{timeout:25000});
 await page.locator('[data-continuous-pause]:enabled').waitFor();await page.locator('.abyss-battle-auto [data-abyss-action="auto-next"]').click();assert.equal(await page.locator('.abyss-battle-auto button').getAttribute('aria-pressed'),'false');
 await page.locator('[data-continuous-pause]').click();await page.waitForTimeout(1800);await page.screenshot({path:fileURLToPath(new URL(width+'-floor2.png',out))});
 const state=await page.evaluate(async profile=>({calls:QA.calls,clocks:QA.clocks,audit:await(await fetch('/qa-api/'+profile+'/audit')).json(),pending:JSON.parse(sessionStorage.getItem('cnine:tower:battle:v2094:7')),sound:localStorage.getItem('cnine_battle_sound')}),profile);
 const starts=state.calls.filter(x=>x.path==='tower/start');assert.deepEqual(starts.map(x=>JSON.parse(x.body).floorNo),[1,2]);assert.equal(new Set(starts.map(x=>JSON.parse(x.body).requestId)).size,2);
 const first=state.clocks.filter(x=>x.floor===1);assert.equal(first.at(-1).progress,100);assert.ok(new Set(first.map(x=>x.shown)).size>3);for(let i=1;i<first.length;i++)assert.ok(first[i].remaining<=first[i-1].remaining);
 assert.equal(state.audit.grants,1);assert.equal(state.audit.progress.highest_floor,1);assert.equal(state.audit.progress.current_floor,2);assert.equal(state.pending.floorNo,2);assert.equal(state.sound,'OFF');assert.deepEqual(errors,[]);
 console.log(width+': automatic 1 -> 2, exactly one reward; off and pause work');await page.close();
 return {width,source:'Real main resource loader, Tower controller/API and shared V3 engine; isolated SQLite; reduced-motion playback without skipping',firstClock:first[0].shown,lastClock:first.at(-1).shown,clockUpdates:first.length,distinctClockValues:new Set(first.map(x=>x.shown)).size,pauseFrozen:frozen,countdown,layout,starts:starts.map(x=>({floor:JSON.parse(x.body).floorNo,status:x.status})),audit:state.audit,sound:state.sound,errors};
}
try{const rows=await Promise.all([check(1440),check(390)]);await fs.writeFile(new URL('browser-verification.json',out),JSON.stringify({checkedAt:new Date().toISOString(),rows},null,2)+'\n');}finally{await browser.close();}

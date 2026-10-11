import assert from 'node:assert/strict';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createMadaraPreviewServer} from '../preview/madara-raid-v1/server.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const out=path.resolve('preview/madara-raid-v1/qa-v2');await mkdir(out,{recursive:true});
const server=createMadaraPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,url=base+'/preview/madara-raid-v1/';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--mute-audio']});
const errors=[],screens=[],motion=[],contexts=[];
async function page(viewport={width:1440,height:1100},record=false,reducedMotion='no-preference'){
 const context=await browser.newContext({viewport,reducedMotion,...(record?{recordVideo:{dir:path.join(out,'recordings'),size:viewport}}:{})});contexts.push(context);
 await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
 await context.route('**/*',r=>r.request().url().startsWith(base)||r.request().url().startsWith('data:')?r.continue():r.abort());
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.stack));await p.goto(url);await p.locator('#createButton:not([disabled])').waitFor();return p;
}
const capture=async(p,name)=>{await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});screens.push(name+'.png');};
const diagnostic=p=>p.evaluate(()=>window.MadaraPreview.diagnostics());
const sceneReady=p=>p.waitForFunction(()=>{const d=window.MadaraPreview.diagnostics();return d.ready&&!d.mounting;},{},{timeout:90000});
try{
 if(!process.env.MADARA_MOTION_ONLY){
 const host=await page(),guest=await page(),third=await page({width:390,height:844});
 await host.locator('#playerName').fill('달빛 공대장');await host.locator('#createButton').click();await capture(host,'entry-confirm');
 await host.locator('#confirmEntry').click();await host.locator('#assembly').waitFor();assert.equal((await diagnostic(host)).account.tickets,2);
 const code=(await diagnostic(host)).state.id;await host.reload();await host.locator('#assembly').waitFor();assert.equal((await diagnostic(host)).account.tickets,2);
 await guest.locator('#playerName').fill('정벌 대원');await guest.locator('#playerRole').selectOption('ASSAULT');await guest.locator('#refreshRooms').click();await capture(guest,'recruiting-list');
 await guest.locator(`[data-join="${code}"]`).click();await guest.locator('#assembly').waitFor();assert.equal((await diagnostic(guest)).account.tickets,3);
 await third.locator('#playerName').fill('구출 대원');await third.locator('#playerRole').selectOption('RESCUE');await third.locator('#joinCode').fill(code);await third.locator('#joinButton').click();await third.locator('#assembly').waitFor();
 await host.waitForFunction(()=>window.MadaraPreview.diagnostics().state.members.length===3);await capture(host,'party-roster');await capture(third,'mobile-roster');
 await host.locator('[data-kick]').first().click();await capture(host,'kick-confirm');await host.locator('#confirmKick').click();await guest.locator('#createForm').waitFor();
 assert.equal((await diagnostic(guest)).account.tickets,3);await guest.reload();await guest.locator('#createButton:not([disabled])').waitFor();await guest.locator('#refreshRooms').click();
 assert.equal(await guest.locator(`[data-join="${code}"]`).isDisabled(),true);await capture(guest,'kicked-list');
 await host.locator('#lobbyLeave').click();await host.locator('#confirmLeave').click();await host.locator('#createForm').waitFor();await third.waitForFunction(()=>window.MadaraPreview.diagnostics().state.me.isHost);assert.equal((await diagnostic(third)).account.tickets,3);
 }
 const cinema=await page({width:1440,height:1100},true);const video=cinema.video();await cinema.locator('#showcaseButton').click();await sceneReady(cinema);
 for(const key of ['ILLUSION','CLONES','FIRE','METEOR','FINAL']){
   if(key!=='ILLUSION'){await cinema.locator(`[data-scene="${key}"]`).click();await sceneReady(cinema);}
   await cinema.waitForTimeout(3800);let d=await diagnostic(cinema);assert.equal(d.canvasCount,1);assert.equal(d.art.effectFrames,60);assert.equal(d.presentation.fxVisible,false,'each effect dissipates');
   await cinema.locator('#sceneSeek').fill('1.75');d=await diagnostic(cinema);assert.equal(d.presentation.paused,true);assert.equal(d.presentation.cue,key);assert.ok(d.presentation.contact.groundError<.0001);
   assert.equal(d.presentation.actorActive,true,'authored motion must target the visible V3 boss, never a reserve enemy slot');assert.ok(d.presentation.contact.effectTop>=23);
   if(key!=='FINAL'){assert.equal(d.presentation.originalVisible,false);assert.equal(d.presentation.bodyVisible,true);}
   await capture(cinema,'scene-'+key.toLowerCase());motion.push({key,...d.presentation});
 }
 await cinema.locator('[data-scene="FIRE"]').click();await sceneReady(cinema);await cinema.locator('#sceneSpeed').selectOption('0.25');await cinema.locator('#sceneReplay').click();await sceneReady(cinema);
 await cinema.waitForTimeout(450);await cinema.locator('#scenePause').click();const paused=(await diagnostic(cinema)).presentation.time;await cinema.waitForTimeout(220);assert.equal((await diagnostic(cinema)).presentation.time,paused);
 await cinema.locator('#sceneSeek').fill('1.05');await cinema.locator('#sceneEffects').uncheck();assert.equal((await diagnostic(cinema)).presentation.fxVisible,false);await capture(cinema,'body-without-effects');
 const poses=[];for(const at of ['0.2','0.6','1.1','2.1']){await cinema.locator('#sceneSeek').fill(at);poses.push((await diagnostic(cinema)).presentation.pose);}assert.equal(new Set(poses).size,4);
 await cinema.locator('#sceneEffects').check();await cinema.locator('#sceneSpeed').selectOption('2');await cinema.locator('#sceneReplay').click();await sceneReady(cinema);await cinema.waitForTimeout(2000);assert.equal((await diagnostic(cinema)).presentation.fxVisible,false);
 await cinema.locator('#leaveButton').click();assert.equal((await diagnostic(cinema)).account.tickets,3);assert.equal((await diagnostic(cinema)).madaraEffects,0);assert.equal(await cinema.locator('.mr-cue-banner').count(),0);
 const mobile=await page({width:390,height:844});await capture(mobile,'mobile-lobby');await mobile.locator('#showcaseButton').click();await sceneReady(mobile);await mobile.locator('[data-scene="FINAL"]').click();await sceneReady(mobile);await mobile.locator('#sceneSeek').fill('1.75');await capture(mobile,'mobile-awakening');
 const dimensions=await mobile.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('#showcaseControls button')].map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height}))}));
 assert.ok(dimensions.scroll<=dimensions.width);assert.ok(dimensions.buttons.every(b=>b.w>=44&&b.h>=44));
 await mobile.locator('#leaveButton').click();await mobile.locator('#showcaseButton').click();await sceneReady(mobile);assert.equal((await diagnostic(mobile)).canvasCount,1);await mobile.close();
 const reduced=await page({width:390,height:844},false,'reduce');await reduced.locator('#showcaseButton').click();await sceneReady(reduced);await reduced.locator('#sceneSeek').fill('1.75');await capture(reduced,'mobile-reduced-motion');
 await cinema.context().close();await rename(await video.path(),path.join(out,'madara-presentation-v2.webm'));
 assert.deepEqual(errors,[]);
 const result={passed:true,scope:'LOCAL_REVIEW_ONLY',productionTouched:false,muted:true,partyFlow:['entry confirmation','host-only debit','refresh balance','listing refresh','free join','host-only kick','rejoin block','free host migration'],motion,poses,dimensions,errors,screens,video:'madara-presentation-v2.webm',review:'Technical and visual inspection complete; user visual approval pending.'};
 result.executionScope=process.env.MADARA_MOTION_ONLY?'MOTION_ONLY_AFTER_FRAMING_FIX':'LOBBY_AND_PRESENTATION';
 if(process.env.MADARA_MOTION_ONLY)result.partyFlowEvidence='Full three-profile lobby run passed before presentation-only framing fix; entry/roster/kick screenshots retained.';
 await writeFile(path.join(out,'lobby-presentation-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,screens:screens.length,scenes:motion.length,errors,video:result.video}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

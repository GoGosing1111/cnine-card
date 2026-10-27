import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startClassicQa} from './qa-classic-colosseum-server.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output='C:/Users/User/Downloads/upload/cnine-card/output/classic-colosseum-20261027/room-v2';await fs.mkdir(output,{recursive:true});
const qa=await startClassicQa(0),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(qa.origin+'/__login?user=1');const panel=page.locator('.classic-match-v2');await panel.waitFor();await panel.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  assert.equal(await panel.locator('.classic-deck-back').count(),10);assert.equal(await panel.locator('.classic-player-crest').count(),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await panel.screenshot({path:path.join(output,'empty-'+width+'.png')});await panel.locator('[data-tab="admin"]').click();await page.locator('.classic-operation-panel').waitFor();
  await qa.f.setup();await page.goto(qa.origin+'/__login?user=2');await panel.waitFor();await panel.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  assert.equal(await panel.locator('.classic-seat.is-occupied').count(),2);await panel.screenshot({path:path.join(output,'players-'+width+'.png')});
  await panel.locator('[data-classic="edit"]').click();await page.locator('.classic-rental').waitFor();assert.equal(await page.locator('.classic-colosseum [data-category="equipment"]').count(),0);assert.deepEqual(errors,[]);reports.push({width,empty:true,namedPlayers:true,nativeNavigation:true,errors});
  const room=qa.f.room(qa.f.user(2).roomId);await qa.f.call('admin/classic-colosseum/cancel',{method:'POST',body:{matchId:room.id,revision:room.revision}});await context.close();
 }
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({ok:true,output,reports}));
}finally{await browser.close();await qa.close();}

import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const input=process.env.TOWER_APPROVED_RECORD;if(!input)throw Error('Explicitly approved local battle record path required');
const saved=JSON.parse(await fs.readFile(input,'utf8')),out=new URL('./',import.meta.url);
const {chromium}=await import('file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
async function check(width){
 const mobile=width<700,page=await browser.newPage({viewport:{width,height:mobile?844:960},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const replay={...saved,accountNickname:'격리 재생 계정',playerName:'격리 재생 계정',requestId:'qa-approved-replay-'+width,settlement:{protocol:'TOWER_ABYSS_20261022',status:'PENDING',requiredMs:0,notBefore:0,remainingMs:0}};
 // Render the authorized stored timeline locally. No production API is called.
 await page.route('**/qa-api/*/tower/start',route=>route.fulfill({json:replay}));
 await page.route('**/qa-api/*/tower/finish',route=>route.fulfill({json:{...replay,reward:0,settlement:{...replay.settlement,status:'COMPLETED'}}}));
 await page.goto('http://127.0.0.1:8943/docs/qa/tower-enemy-instance-20261022/index.html?pve=tower&profile=replay-'+width+'-'+Date.now());
 await page.locator('[data-abyss-action="fight"]:enabled').waitFor();
 await page.evaluate(async()=>{
  await ensureFeatureResources('battleV2');QA.cleanup=[];QA.clocks=[];
  const api=ProjectVPixiBattle,original=api.mountForBattle;api.mountForBattle=async(...args)=>{const engine=await original(...args),play=engine.playEvents;engine.playEvents=async function(events,options){for(const e of events)if(e.type==='ICON_STATUS'&&e.status==='EXPIRED'&&this.retiredIds.has(e.targetId))QA.cleanup.push({seq:e.seq,status:e.status,targetRetired:true});return play.call(this,events,options);};return engine;};
  const update=TowerAbyssUI.updateBattle;TowerAbyssUI.updateBattle=(stage,event,data)=>{update(stage,event,data);QA.clocks.push({seq:event.seq,remaining:event.remainingCombatMs,shown:stage.querySelector('[data-abyss-clock]')?.textContent});};
 });
 await page.locator('[data-abyss-action="fight"] strong').click();await page.waitForFunction(()=>QA.cleanup.length>=2,null,{timeout:180000});
 await page.screenshot({path:fileURLToPath(new URL(width+'-expiry-passed.png',out))});
 await page.locator('.is-abyss-result').waitFor({timeout:180000});await page.screenshot({path:fileURLToPath(new URL(width+'-replay-result.png',out))});
 const state=await page.evaluate(()=>({cleanup:QA.cleanup,clocks:QA.clocks,calls:QA.calls.map(c=>({path:c.path,status:c.status})),errors:QA.errors,diag:ProjectVPixiBattle.diagnostics().scrapyard}));
 assert.equal(state.cleanup.length,2);assert.equal(state.diag.defeated,28);assert.equal(state.diag.active.length,0);assert.equal(state.clocks.length,saved.battleV2.result.timeline.length);
 assert.equal(state.clocks.at(-1).remaining,180000-saved.elapsedCombatMs);assert.equal(state.calls.filter(c=>c.path==='tower/finish'&&c.status===200).length,1);assert.deepEqual(errors,[]);assert.deepEqual(state.errors,[]);
 const result={width,retiredStatusCleanup:state.cleanup,events:state.clocks.length,firstClock:state.clocks[0].shown,lastClock:state.clocks.at(-1).shown,defeated:state.diag.defeated,errors,productionWrites:0,settlement:'LOCAL MOCK ONLY'};
 console.log(JSON.stringify(result));await page.close();return result;
}
try{const rows=await Promise.all([check(1440),check(390)]);await fs.writeFile(new URL('approved-replay-verification.json',out),JSON.stringify({checkedAt:new Date().toISOString(),source:'Explicitly approved stored timeline, identity labels replaced, local-only replay; raw record excluded from repository',rows},null,2)+'\n');}finally{await browser.close();}

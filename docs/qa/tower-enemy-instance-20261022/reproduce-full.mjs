
import fs from 'node:fs/promises';
const {chromium}=await import('file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try { await Promise.all(['chips','normal'].map(async kind=>{
const page=await browser.newPage({viewport:{width:1440,height:960},serviceWorkers:'block',reducedMotion:'no-preference'});page.on('pageerror',e=>console.log('PAGEERROR',e.message));
await page.goto('http://127.0.0.1:8943/docs/qa/tower-enemy-instance-20261022/index.html?pve=tower&profile='+kind+'-'+Date.now());
await page.locator('[data-abyss-action="fight"]').waitFor();
await page.evaluate(async()=>{await ensureFeatureResources('battleV2');const api=ProjectVPixiBattle,original=api.mountForBattle;QA.trace=[];QA.failed=[];api.mountForBattle=async(...args)=>{const engine=await original(...args);QA.engine=engine;if(!engine.qaWrapped){engine.qaWrapped=true;const play=engine.playEvents;engine.playEvents=async function(events,opts){try {QA.trace.push(...events.map(e=>({type:e.type,actor:e.actorId,target:e.targetId,seq:e.seq,group:e.combatGroup,at:e.combatAtMs,internal:opts?.timedInternal})));return await play.call(this,events,opts);}catch(e){QA.failed.push({error:e.message,events,retired:[...this.retiredIds||[]],state:this.scrapyardState?.()});throw e;}};}return engine;};});
await page.locator('[data-abyss-action="auto-next"]').click();
await page.locator('[data-abyss-action="fight"] strong').click();
const timer=setInterval(()=>page.evaluate(()=>({events:QA.trace.length,last:QA.trace.at(-1),failed:QA.failed.length,text:document.querySelector('#modal')?.innerText?.slice(-240)})).then(r=>console.log(kind,JSON.stringify(r))).catch(()=>{}),10000);
try{await page.waitForFunction(()=>QA.failed.length||QA.calls.filter(c=>c.path==='tower/finish'&&c.status===200).length>=2,null,{timeout:480000});}finally{clearInterval(timer);}
const result=await page.evaluate(()=>({failed:QA.failed,trace:QA.trace,calls:QA.calls,errors:QA.errors,diag:ProjectVPixiBattle.diagnostics()}));
await fs.writeFile(new URL(kind+'-full-speed-before.json',import.meta.url),JSON.stringify(result,null,2));console.log(kind,JSON.stringify({failure:result.failed.slice(0,1),errors:result.errors}));await page.close();
}));}finally{await browser.close();}

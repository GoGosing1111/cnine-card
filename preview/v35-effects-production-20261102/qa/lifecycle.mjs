import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}});await page.goto('http://127.0.0.1:18766/?case=mixed');await page.waitForFunction(()=>v35Review.ready);
 const result=await page.evaluate(async()=>{const api=v35Review,e=api.engine,a=api.spine.actor,fx=api.effects,wait=ms=>new Promise(r=>setTimeout(r,ms)),count=()=>e.effectLayer.children.filter(s=>s.label?.startsWith('V35_BAKED')).length;
  const checks={},evidence={};let hits=api.impacts.length;
  fx.setEnabled(false);await api.attack(1);checks.disabledStillOneImpact=api.impacts.length-hits===1&&count()===0;
  fx.setEnabled(true);api.pending=api.attack(1);const entry=e.pendingTails.get(a);entry.instance.pause();for(const time of [.25,.34,.43])entry.instance.time(time,false);
  const paused=fx.session.audit();await wait(160);const still=fx.session.audit();checks.pauseStopsEveryLayer=JSON.stringify(paused)===JSON.stringify(still);evidence.paused=paused;
  fx.setEnabled(false);checks.offWhilePaused=fx.session.audit().active===0;fx.setEnabled(true);checks.onWhilePaused=fx.session.audit().active===4;
  e.cancelTimelines();await api.pending;checks.cancelAfterHitRemovesAll=count()===0&&!fx.session;
  hits=api.impacts.length;api.pending=api.attack(1);await wait(35);e.cancelTimelines();await api.pending;checks.cancelBeforeHitNoDamage=api.impacts.length===hits&&count()===0;
  api.pending=api.attack(1);await wait(310);await e.setVisible(false);await api.pending;checks.hideCleansAll=count()===0&&!fx.session;await e.setVisible(true);
  api.pending=api.attack(1);const dying=e.pendingTails.get(a).instance;dying.pause();for(const time of [.25,.34,.43])dying.time(time,false);a.hp=0;a.setState('DEAD');checks.deathCleansAll=count()===0&&!fx.session;e.cancelTimelines();await api.pending;a.hp=100;a.setState('IDLE');
  hits=api.impacts.length;for(let i=0;i<4;i++)await api.attack(1);checks.repeatedOneImpactEach=api.impacts.length-hits===4;checks.noRemainingSprites=count()===0&&!fx.session;
  checks.oneCanvas=document.querySelectorAll('canvas').length===1;checks.noErrors=api.errors.length===0;
  evidence.completed=fx.completed;evidence.errors=api.errors;evidence.decodedTextureBytes=fx.assets.manifest.decodedBytes;
  return {checks,evidence,fixtureOnly:true};});
 await fs.writeFile(dir+'lifecycle.json',JSON.stringify(result,null,2));console.log(result);if(Object.values(result.checks).some(v=>!v))process.exitCode=1;
}finally{await browser.close();}

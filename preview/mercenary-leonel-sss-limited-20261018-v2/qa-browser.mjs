import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {MODES,PLAYBACK_RATES,sample} from './motion.mjs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=fileURLToPath(new URL('qa/',import.meta.url));
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',import.meta.url),'utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const preliminary=process.argv.includes('--preliminary');
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],failures=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push({status:r.status(),url:r.url()});});
  await page.goto('http://127.0.0.1:8985/preview/mercenary-leonel-sss-limited-20261018-v2/',{waitUntil:'networkidle',timeout:60000});
  await page.waitForFunction(()=>window.LeonelPreview||document.getElementById('status').textContent.startsWith('준비 실패'),null,{timeout:60000});
  if(!await page.evaluate(()=>!!window.LeonelPreview))throw Error(await page.locator('#status').textContent());
  await page.evaluate(()=>document.getElementById('qa-run').click());
  await page.waitForFunction(()=>document.getElementById('qa-result').textContent.length>5&&!document.getElementById('qa-run').disabled,null,{timeout:15000});
  const report=JSON.parse(await page.locator('#qa-result').textContent());
  report.browserErrors=errors;report.failedResponses=failures;report.assetVersion=manifest.version;
  report.runtimeBundle=JSON.parse(await fs.readFile(new URL('build-report.json',import.meta.url),'utf8')).bundleSha256;
  const moments=[['idle',0,true],['attack',MODES.attack.contacts[0],false],['skill',MODES.skill.contacts[1],false],['ultimate',MODES.ultimate.physicalContacts[0],false],['ultimate',.6,true],['ultimate',2.65,true]];
  for(let i=0;i<moments.length;i++){
   const [mode,at,effects]=moments[i];await page.evaluate(({mode,at,effects})=>{const f=window.LeonelPreview.fx;f.setEffects(effects);f.setAura(effects);f.setMode(mode);f.seek(at);},{mode,at,effects});
   await page.waitForTimeout(80);await page.locator('.battle-viewport').screenshot({path:dir+name+'-'+mode+'-'+at+(effects?'':'-fx-off')+'.png'});
  }
  report.timeline=Object.fromEntries(['attack','skill','ultimate'].map(m=>[m,{motionRate:MODES[m].rate,physicalContacts:MODES[m].physicalContacts,duration:MODES[m].duration}]));
  report.speedContracts={...PLAYBACK_RATES,slashDuration:sample('attack',.21).effects.find(x=>x.key==='slash').duration,ultimateDuration:sample('ultimate',2.65).effects.find(x=>x.key==='ultimate').duration};
  assert.equal(report.speedContracts.attackMotion,2);assert.equal(report.speedContracts.skillEffect,1);assert.equal(report.speedContracts.slashDuration,.48);assert.equal(report.speedContracts.ultimateDuration,1.45);
  if(name==='desktop'&&!preliminary){
   await page.evaluate(()=>document.getElementById('record').click());
   await page.waitForFunction(()=>document.getElementById('record-status').textContent.includes('완료'),null,{timeout:30000});
   const dl=page.waitForEvent('download');await page.evaluate(()=>document.getElementById('record-download').click());const download=await dl;await download.saveAs(fileURLToPath(new URL('review-v2.webm',import.meta.url)));
  }else{
   await page.evaluate(()=>{const f=window.LeonelPreview.fx;f.setEffects(true);f.setAura(true);f.setSpeed(1);f.setMode('ultimate');f.play();});
   await page.waitForTimeout(4600);
  }
  report.completedPlayback=await page.evaluate(()=>window.LeonelPreview.diagnostics());
  report.cleanup=await page.evaluate(()=>{const r=window.LeonelPreview;r.dispose();return{disposed:r.fx.disposed,registeredTimelines:r.engine.simpleTimelines.size,frontDestroyed:r.fx.front.destroyed,backDestroyed:r.fx.back.destroyed,cinemaDestroyed:r.fx.screenLayer.destroyed};});
  report.passed=report.passed&&!errors.length&&!failures.length&&report.cleanup.disposed&&report.cleanup.cinemaDestroyed;
  await fs.writeFile(dir+name+(preliminary?'-preliminary':'-runtime')+'.json',JSON.stringify(report,null,2)+'\n');results.push({name,passed:report.passed,errors:[...report.errors,...errors],failures,contacts:report.snapshots.map(s=>({mode:s.mode,at:s.time,blade:s.bladeContact,ground:s.groundError})),cleanup:report.cleanup});
  await page.close();
 }
}finally{await browser.close();}
console.log(JSON.stringify(results,null,2));if(results.some(r=>!r.passed))process.exitCode=1;

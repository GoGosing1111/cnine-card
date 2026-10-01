import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('./qa/v12/',import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.CrimsonKnightPreview?.diagnostics().ready);
  await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});await page.selectOption('#mode','guard');await page.locator('.battle-viewport').scrollIntoViewIfNeeded();
  const clearance=await page.evaluate(()=>{const f=window.CrimsonKnightPreview.fx,points=[];for(let t=.5;t<2.2;t+=.03){f.seek(t);const b=f.weaponSegment();points.push({t,tip:b.tip,grip:b.grip});}return {width:f.engine.scene.width,height:f.engine.scene.height,points};});
  if(clearance.points.some(p=>p.tip.y<8||p.tip.x<8||p.tip.x>clearance.width-8))errors.push('raised blade clips battle area');
  const frames=[];for(const t of [1.62,1.98,2.50,3.16]){
   await page.evaluate(async t=>{window.CrimsonKnightPreview.fx.seek(t);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},t);
   frames.push(await page.evaluate(()=>{const p=window.CrimsonKnightPreview;return {...p.diagnostics(),guardPlacement:p.fx.guardPlacement()};}));
   await page.locator('.battle-viewport').screenshot({path:root+name+'-guard-'+t+'.png'});
  }
  for(const f of frames){const ward=f.activeFrames.find(e=>e.key==='guard'),g=f.guardPlacement;if(!ward||Math.abs(ward.anchor.y-g.point.y)>.01||Math.abs((g.foot.y-g.point.y)/g.bodyHeight-.54)>.001)errors.push('ward not attached to torso');}
  await page.click('#cancel');const cancelled=await page.evaluate(()=>window.CrimsonKnightPreview.diagnostics());if(cancelled.visibleSprites||cancelled.registeredTimelines)errors.push('guard cancellation');
  await page.evaluate(()=>window.CrimsonKnightPreview.dispose());report.push({name,errors,clearance,frames,cancelled});await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(root+'guard-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.map(r=>({name:r.name,errors:r.errors,minRaisedTipY:Math.min(...r.clearance.points.map(p=>p.tip.y)),wardCenter:r.frames[1].guardPlacement.point})),null,2));if(report.some(r=>r.errors.length))process.exitCode=1;

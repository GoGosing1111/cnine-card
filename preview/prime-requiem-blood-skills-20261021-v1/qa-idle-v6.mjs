import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.dirname(fileURLToPath(import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const url='http://127.0.0.1:8864/preview/prime-requiem-blood-skills-20261021-v1/?v=idle-moon-6#battle';
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[],problems=[];
try{
  for(const [surface,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    const page=await browser.newPage({viewport}),errors=[],failed=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
    try{
      await page.goto(url,{waitUntil:'networkidle'});
      await page.waitForFunction(()=>window.PrimePreview,null,{timeout:60000});
      await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
      const initial=await page.evaluate(()=>{
        const p=window.PrimePreview;return {...p.diagnostics(),bodyAlpha:p.actor.fullBodySprite.alpha,bodyFilters:p.actor.fullBodySprite.filters?.length||0};
      });
      const loop=await page.evaluate(()=>{
        const p=window.PrimePreview;p.fx.pause();const samples=[];
        for(let t=0;t<6.4;t+=.1){p.fx.render(0,t);samples.push(p.diagnostics().idleAura);}
        const endpoints=[0,6.4].map(t=>{p.fx.render(0,t);return p.engine.app.renderer.extract.canvas({target:p.fx.idleAura.layer,resolution:1}).toDataURL();});
        return {samples,endpoints};
      });
      const loopHashes=loop.endpoints.map(s=>hash(Buffer.from(s.split(',')[1],'base64')));
      const moonFrames=[...new Set(loop.samples.map(s=>s.moonFrame))],flameFrames=[...new Set(loop.samples.map(s=>s.flameFrame))];
      for(const [label,time]of [['rest',0],['open',3.2]]){
        await page.evaluate(t=>window.PrimePreview.fx.render(0,t),time);
        await page.locator('.battle-shell').screenshot({path:path.join(root,'qa',`${surface}-idle-${label}-v6.png`)});
      }
      await page.locator('#idle-view').click();
      const running=await page.evaluate(async()=>{
        const p=window.PrimePreview,a=p.fx.clock.time;await new Promise(r=>setTimeout(r,330));
        const b=p.fx.clock.time;p.fx.pause();const paused=p.fx.clock.time;
        await new Promise(r=>setTimeout(r,110));return {advances:b>a,pauses:paused===p.fx.clock.time};
      });
      const attack=await page.evaluate(()=>{
        const p=window.PrimePreview;p.fx.seek(.6);const d=p.diagnostics();p.fx.cancel();return d;
      });
      await page.locator('#idle-view').click();
      await page.locator('#play').click();
      await page.waitForFunction(()=>window.PrimePreview.fx.mode==='ambient',null,{timeout:7000});
      const returnsToIdle=await page.evaluate(()=>window.PrimePreview.diagnostics());
      if(surface==='desktop'){
        await page.locator('#sequence').click();
        await page.waitForFunction(()=>{const p=window.PrimePreview;return !p.diagnostics().sequence&&p.fx.plan.id==='blood-execution'&&p.fx.mode==='ambient';},null,{timeout:15000});
      }
      await page.locator('#showcase-sequence').click();
      await page.waitForFunction(()=>{const p=window.PrimePreview;return !p.diagnostics().sequence&&p.fx.plan.id==='blood-moonfall'&&p.fx.mode==='ambient';},null,{timeout:12000});
      const sequenceReturn=await page.evaluate(()=>window.PrimePreview.diagnostics());
      await page.locator('#cancel').click();await page.locator('#idle-view').click();
      await page.screenshot({path:path.join(root,'qa',`${surface}-idle-controls-v6.png`),fullPage:true});
      const layout=await page.evaluate(()=>{
        const r=document.getElementById('idle-view').getBoundingClientRect();
        return {scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth,
          idleButton:{width:r.width,height:r.height,pressed:document.getElementById('idle-view').getAttribute('aria-pressed')},
          canvasCount:document.querySelector('iframe').contentDocument.querySelectorAll('canvas').length};
      });
      const cleanup=await page.evaluate(()=>{
        const p=window.PrimePreview;p.dispose();return {destroyed:p.fx.destroyed,idleLayerDestroyed:p.fx.idleAura.layer.destroyed,
          ownTimeline:!!p.fx.timeline,moonFilterDisposed:p.fx.idleAura.moon.filter.resources===null};
      });
      const row={surface,initial,moonFrames,flameFrames,loopHashes,running,attack:{idleVisible:attack.idleAura.visible,bloodVisible:attack.bloodAuraVisible},
        returnsToIdle,sequenceReturn,layout,cleanup,errors,failed};results.push(row);
      if(initial.pose!==0||initial.mode!=='ambient'||!initial.idleAura.visible||initial.bloodAuraVisible||initial.bodyAlpha!==1||initial.bodyFilters||
        moonFrames.length!==8||flameFrames.length!==16||loopHashes[0]!==loopHashes[1]||!running.advances||!running.pauses||
        attack.idleAura.visible||!attack.bloodAuraVisible||returnsToIdle.pose!==0||sequenceReturn.pose!==0||sequenceReturn.registeredTimelines!==1||
        layout.scroll>layout.width||layout.idleButton.height<44||layout.idleButton.pressed!=='true'||layout.canvasCount!==1||
        !cleanup.destroyed||!cleanup.idleLayerDestroyed||cleanup.ownTimeline||errors.length||failed.length)problems.push(row);
    }catch(error){problems.push({surface,error:error.stack,errors,failed});}
    await page.close();
  }
  const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await reduced.goto(url,{waitUntil:'networkidle'});await reduced.waitForFunction(()=>window.PrimePreview);
  const states=await reduced.evaluate(()=>{
    const p=window.PrimePreview;p.fx.pause();return [0,1.2,3.2,6.3].map(t=>{p.fx.render(0,t);return p.diagnostics().idleAura;});
  });
  if(states.some(s=>!s.reducedMotion||s.moonFrame!==0||s.flameFrame!==0||s.pulse!==0))problems.push({reducedMotion:states});
  results.push({surface:'reduced-motion',states});await reduced.close();
}finally{await browser.close();}
const report={status:problems.length?'FAIL':'PASS_SCOPED_IDLE_AURA_CHECK',userVisualApproval:false,
  bundleSha256:hash(await fs.readFile(path.join(root,'battle-preview.bundle.js'))),results,problems};
await fs.writeFile(path.join(root,'qa/idle-aura-v6.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,results:results.map(r=>({surface:r.surface,moonFrames:r.moonFrames,flameFrames:r.flameFrames,running:r.running,cleanup:r.cleanup})),problems}));
if(problems.length)process.exitCode=1;

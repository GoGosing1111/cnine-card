import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {SKILLS} from './source/SkillPlan.mjs';
import {MOTION_SHA256,READY_POSE} from './source/MotionAtlas.mjs';
import sharp from 'sharp';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.dirname(fileURLToPath(import.meta.url)),port=process.env.PRIME_PREVIEW_PORT||'8864';
const artOnly=process.argv.includes('--art-only');
const skipPoseArt=process.argv.includes('--skip-pose-art');
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
  for(const [surface,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],failed=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
    try{
      await page.goto(`http://127.0.0.1:${port}/preview/prime-requiem-blood-skills-20261021-v1/?qa=1`,{waitUntil:'networkidle',timeout:60000});
      await page.waitForFunction(()=>window.PrimePreview||document.getElementById('health')?.textContent.includes('실패'),null,{timeout:60000});
      if(!await page.evaluate(()=>!!window.PrimePreview))throw Error(await page.locator('#health').textContent());
      const initial=await page.evaluate(()=>window.PrimePreview.diagnostics());
      if(surface==='desktop'&&!skipPoseArt){
        const poses=[];
        for(let i=0;i<8;i++){
          const data=await page.evaluate(i=>{
            const p=window.PrimePreview;p.fx.pause();p.fx.pose(i);
            const container=new p.actor.view.constructor();
            const sprite=new p.actor.fullBodySprite.constructor();container.addChild(sprite);p.fx.applyBody(sprite,i);
            const image=p.engine.app.renderer.extract.canvas({target:container,resolution:2}).toDataURL('image/png');
            container.destroy({children:true,texture:false,context:false});return image;
          },i);
          const bytes=Buffer.from(data.split(',')[1],'base64');
          await fs.writeFile(path.join(root,'qa',`v2-pose-${i}.png`),bytes);
          poses.push({input:await sharp(bytes).resize(320,400,{fit:'contain',background:'#11121a'}).png().toBuffer(),left:(i%4)*320,top:Math.floor(i/4)*400});
        }
        await sharp({create:{width:1280,height:800,channels:4,background:'#11121a'}}).composite(poses).png().toFile(path.join(root,'qa/v2-eight-poses-review.png'));
        await page.evaluate(()=>window.PrimePreview.select('blood-dash'));
        if(artOnly){await page.evaluate(()=>window.PrimePreview.dispose());await page.close();break;}
      }
      await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
      await page.screenshot({path:path.join(root,'qa',surface+'-page.png'),fullPage:true});
      await page.evaluate(()=>{const p=window.PrimePreview;p.fx.pause();p.fx.render(0,.8);});
      await page.locator('.battle-shell').screenshot({path:path.join(root,'qa',surface+'-standing-aura-v3.png')});
      const skills=[];
      for(const skill of SKILLS){
        await page.locator(`[data-skill="${skill.id}"]`).click();
        const states=await page.evaluate(s=>{
          const p=window.PrimePreview;const rows=[];
          for(const t of [0,...s.phases.slice(1),...s.contacts,...(s.showcase?Array.from({length:Math.ceil(s.duration/.08)},(_,i)=>Number((i*.08).toFixed(2))):[]),s.duration]){
            p.fx.seek(Math.min(t,s.duration));rows.push(p.diagnostics());
          }
          return rows;
        },skill);
        const peak=skill.kind==='tiger'?1.04:skill.contacts.at(-1)+.035;
        await page.evaluate(({id,peak})=>{window.PrimePreview.select(id);window.PrimePreview.fx.seek(peak);}, {id:skill.id,peak});
        await page.waitForTimeout(100);
        await page.locator('.battle-shell').screenshot({path:path.join(root,'qa',surface+'-'+skill.id+'-impact.png')});
        if(skill.showcase){
          for(const [label,time]of skill.kind==='cataclysm'?[['charge',1.12],['eruption',2.38]]:[['combo',1.5],['crescent',3.78]]){
            await page.evaluate(t=>window.PrimePreview.fx.seek(t),time);await page.waitForTimeout(70);
            await page.locator('.battle-shell').screenshot({path:path.join(root,'qa',surface+'-'+skill.id+'-'+label+'-v3.png')});
          }
        }
        if(skill.kind==='tiger'){
          await page.evaluate(()=>window.PrimePreview.fx.seek(.11));
          await page.waitForTimeout(80);
          await page.locator('.battle-shell').screenshot({path:path.join(root,'qa',surface+'-blood-tiger-head-start-v2.png')});
        }
        skills.push({id:skill.id,states});
      }
      const controls=await page.evaluate(async()=>{
        const p=window.PrimePreview,speeds=[];p.select('blood-dash');
        for(const speed of [.4,1,2]){
          p.fx.seek(0);p.fx.setSpeed(speed);p.fx.play();await new Promise(r=>setTimeout(r,350));p.fx.pause();const t=p.fx.time;await new Promise(r=>setTimeout(r,110));
          speeds.push({speed,elapsed:t,pauseStable:t===p.fx.time});
        }
        p.fx.seek(.64);const a=p.diagnostics();p.fx.seek(.1);p.fx.seek(.64);const b=p.diagnostics();p.fx.cancel();
        return{speeds,reverseSeekStable:a.pose===b.pose&&a.effectFrame===b.effectFrame&&a.contactDistance===b.contactDistance,cancelled:p.diagnostics()};
      });
      const layout=await page.evaluate(()=>{
        const frame=document.querySelector('iframe'),fd=frame.contentDocument;
        return{client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,canvasCount:fd.querySelectorAll('canvas').length,
          dock:!!fd.querySelector('.battle-v3-dock'),skillButtons:Array.from(document.querySelectorAll('[data-skill]')).map(b=>{const r=b.getBoundingClientRect();return{w:r.width,h:r.height,left:r.left,right:r.right};})};
      });
      const cleanup=await page.evaluate(()=>{const p=window.PrimePreview;p.dispose();return {destroyed:p.fx.destroyed,ownTimeline:!!p.fx.timeline,layerDestroyed:p.fx.layer.destroyed};});
      results.push({surface,initial,errors,failed,skills,controls,layout,cleanup});
    }catch(e){
      await page.screenshot({path:path.join(root,'qa',surface+'-error.png'),fullPage:true}).catch(()=>{});
      results.push({surface,error:e.message,errors,failed});
    }
    await page.close();
  }
}finally{await browser.close();}
if(artOnly){if(results.some(r=>r.error))throw Error(JSON.stringify(results));console.log('Exported eight source-pose previews.');process.exit(0);}
const problems=[];
for(const r of results){
  if(r.error||r.errors.length||r.failed.length){problems.push({surface:r.surface,error:r.error,errors:r.errors,failed:r.failed});continue;}
  if(r.layout.scroll>r.layout.client||r.layout.canvasCount!==1||!r.layout.dock)problems.push({surface:r.surface,layout:r.layout});
  if(r.initial.speed!==2||r.initial.pose!==READY_POSE||!r.initial.auraVisible||r.initial.rendererResolution!==2||r.initial.neonLayers!==2||r.initial.neonInnerAlpha<.99||r.initial.auraFrontAlpha!==0||r.initial.bloodAuraVisible||r.initial.auraAsset!=='fx-idle-shattered-moon-v7')problems.push({surface:r.surface,initial:r.initial});
  for(const skill of r.skills)for(const s of skill.states){
    if(s.regularAllies!==5||s.mercenaryInRegularArray||s.scaleX!==s.scaleY||Math.abs(s.scaleX-s.expectedScale)>1e-7||s.activeSheet!=='motion-user-eight-v2'||s.motionSourceSha256!==MOTION_SHA256)problems.push({surface:r.surface,state:s});
    const plan=SKILLS.find(p=>p.id===skill.id);
    const contact=plan.hits.find(h=>h.time===s.time);
    if(plan.kind!=='tiger'&&contact&&contact.contactMode!=='effect'&&s.contactDistance>2)problems.push({surface:r.surface,contact:s});
    if(s.visibleEffects>48)problems.push({surface:r.surface,poolOverflow:s});
    if(s.effectFrames.some(f=>/tiger-loop|tiger-run|blood-core|fx-requiem/.test(f.key)))problems.push({surface:r.surface,rejectedEffect:s});
  }
  for(const skill of r.skills.filter(s=>SKILLS.find(p=>p.id===s.id).showcase)){
    const plan=SKILLS.find(p=>p.id===skill.id),frames=new Set(skill.states.flatMap(s=>s.effectFrames.filter(f=>f.key===plan.effect).map(f=>f.frame)));
    if(frames.size<12)problems.push({surface:r.surface,skill:skill.id,insufficientPrimaryAnimationFrames:[...frames]});
  }
  if(r.controls.speeds.some(s=>!s.pauseStable||s.elapsed<=0)||!r.controls.reverseSeekStable||r.controls.cancelled.visibleEffects||r.controls.cancelled.registeredTimelines||!r.cleanup.destroyed||r.cleanup.ownTimeline||!r.cleanup.layerDestroyed)problems.push({surface:r.surface,controls:r.controls,cleanup:r.cleanup});
}
await fs.writeFile(path.join(root,'qa/browser-report.json'),JSON.stringify({status:problems.length?'FAIL':'PASS_SCOPED_RUNTIME_CHECKS',userVisualApproval:false,results,problems},null,2)+'\n');
console.log(JSON.stringify({status:problems.length?'FAIL':'PASS_SCOPED_RUNTIME_CHECKS',problems,results:results.map(r=>({surface:r.surface,error:r.error,errors:r.errors,failed:r.failed,layout:r.layout,controls:r.controls,cleanup:r.cleanup}))}));
if(problems.length)process.exitCode=1;

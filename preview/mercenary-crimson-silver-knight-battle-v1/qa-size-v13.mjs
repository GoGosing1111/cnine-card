import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=fileURLToPath(new URL('./qa/v13/',import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto('http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/?v=13',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.CrimsonKnightPreview?.diagnostics().ready);
  await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});await page.selectOption('#mode','overhead');await page.check('#motion-only');await page.locator('.battle-viewport').scrollIntoViewIfNeeded();
  const poses=await page.evaluate(()=>{
   const p=window.CrimsonKnightPreview,f=p.fx,records=[];f.seek(1.62);
   for(const key of p.manifest.activeMotionKeys)for(const [index,frame] of p.manifest.motion[key].frames.entries()){
    f.applyPose({key,frame:index});const s=p.merc.fullBodySprite;
    const foot=p.engine.effectLayer.toLocal(p.merc.view.toGlobal({x:0,y:0}));
    records.push({key,index,bodyHeight:f.bodyHeight,renderedBodyReference:frame.bodyPixels*s.scale.y,uniformScale:Math.abs(s.scale.x-s.scale.y)<1e-9,foot,textureMatches:s.texture===f.assets.motion[key][index],atlas:p.manifest.motion[key].atlas});
   }
   f.seek(0);return records;
  });
  if(poses.length!==27||poses.some(p=>!p.uniformScale||!p.textureMatches||Math.abs(p.renderedBodyReference-p.bodyHeight)>.001))errors.push('frame size or texture mismatch');
  const clear=await page.evaluate(()=>{
   const f=window.CrimsonKnightPreview.fx,rows=[];
   for(let t=.5;t<3.15;t+=.025){f.seek(t);const b=f.weaponSegment();rows.push({time:t,key:f.sample.pose.key,index:f.sample.pose.frame,...b});}
   return {width:f.engine.scene.width,height:f.engine.scene.height,rows};
  });
  const lengths=clear.rows.map(r=>Math.hypot(r.tip.x-r.grip.x,r.tip.y-r.grip.y));
  if(Math.max(...lengths)-Math.min(...lengths)>.01)errors.push('weapon length changes between poses');
  if(clear.rows.some(r=>r.tip.y<8||r.tip.x<8||r.tip.x>clear.width-8))errors.push('blade clips stage');
  for(const [label,t] of [['idle',0],['grip',.9],['lift',1.45],['strike',1.98],['return',2.84],['settled',3.16]]){
   await page.evaluate(async t=>{window.CrimsonKnightPreview.fx.seek(t);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},t);await page.locator('.battle-viewport').screenshot({path:out+name+'-bare-'+label+'.png'});
  }
  await page.uncheck('#motion-only');const contacts=[];
  for(const mode of ['attack','skill','overhead','execution','guard','ultimate']){
   await page.selectOption('#mode',mode);await page.evaluate(async()=>{window.CrimsonKnightPreview.fx.seek(1.98);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   const state=await page.evaluate(()=>{const p=window.CrimsonKnightPreview;return {...p.diagnostics(),guardPlacement:p.fx.guardPlacement()};});contacts.push({mode,...state});
   if(state.pose.key!=='twohandStrike'||state.pose.frame!==1||!state.aura.textureMatchesPose)errors.push('adopted corrected pose/effect mismatch '+mode);
   if(mode==='guard'){const g=state.guardPlacement,ward=state.activeFrames.find(e=>e.key==='guard');if(!ward||Math.abs(ward.anchor.y-g.point.y)>.01||Math.abs((g.foot.y-g.point.y)/g.bodyHeight-.54)>.001)errors.push('ward torso anchor');}
   if(['guard','ultimate'].includes(mode))await page.locator('.battle-viewport').screenshot({path:out+name+'-'+mode+'.png'});
  }
  const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));if(overflow.scroll>overflow.client)errors.push('page overflow');
  await page.evaluate(()=>window.CrimsonKnightPreview.dispose());report.push({name,version:13,errors,poses,clearance:clear,weaponLengthRange:[Math.min(...lengths),Math.max(...lengths)],contacts,overflow});await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(out+'browser-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.map(r=>({name:r.name,errors:r.errors,frames:r.poses.length,weaponLengthRange:r.weaponLengthRange,minTipY:Math.min(...r.clearance.rows.map(p=>p.tip.y))})),null,2));if(report.some(r=>r.errors.length))process.exitCode=1;

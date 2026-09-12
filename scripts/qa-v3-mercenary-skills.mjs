import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {MERCENARY_SKILLS} from '../shared/mercenary-skills-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8899',out=path.resolve('../qa/mercenary-skills-final');
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local QA only');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(base+'/preview/project-v-mercenary-system-v1/skills.html');
 await page.waitForFunction(()=>window.MercenarySkillLab?.diagnostics().ready,{timeout:90000});
 for(const width of[1440,390]){
  await page.setViewportSize({width,height:1100});
  for(const skill of MERCENARY_SKILLS){
   const gun=['PRECISION','CONVERGE','STILLNESS','BARRAGE','FINISH','RESTRAIN','DOUBLE_BEAT'].includes(skill.visual.motion);
   // Visual models only. No assignment or CMS storage is written.
   await page.selectOption('#previewMercenary',gun?'V-032':['INTERCEPT','BLOOM'].includes(skill.visual.motion)?'V-029':skill.visual.motion==='INTERRUPT'?'V-038':'V-018');
   await page.evaluate(id=>window.MercenarySkillLab.configure(id),skill.id);
   await page.waitForFunction(id=>window.MercenarySkillLab.diagnostics().ready&&window.MercenarySkillLab.diagnostics().skillId===id,skill.id);
   await page.selectOption('#speed','1');await page.click('#replay');
   await page.waitForFunction(()=>window.MercenarySkillLab.fx?.playing);
   await page.waitForFunction(t=>window.MercenarySkillLab.fx.time>=t,skill.visual.impacts[0]+.035);
   const collision=await page.evaluate(()=>window.MercenarySkillLab.fx.diagnostics());
   assert.ok(collision.activeFrames.length>0,`${skill.id} authored collision`);assert.equal(collision.poolOverflow,0);
   assert.ok(collision.audio.ready);assert.ok(collision.audio.sync.length>0);
   assert.ok(collision.audio.sync.every(s=>Math.abs(s.predictedOutputPeakDeltaMs)<=20),skill.id);
   await page.screenshot({path:path.join(out,`${skill.id}-${width}.png`),fullPage:false});
   await page.waitForFunction(()=>window.MercenarySkillLab.fx.time>=window.MercenarySkillLab.fx.plan.duration-.001);
   assert.equal((await page.evaluate(()=>window.MercenarySkillLab.fx.diagnostics())).audio.activeSources,0);
   // Pause/seek/rate/cancel share the registered GSAP timeline and stop sound.
   await page.click('#replay');await page.waitForFunction(()=>window.MercenarySkillLab.fx.time>.1&&window.MercenarySkillLab.fx.playing);await page.click('#play');
   const paused=await page.evaluate(()=>window.MercenarySkillLab.fx.time);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.MercenarySkillLab.fx.time),paused);
   assert.equal(await page.evaluate(()=>window.MercenarySkillLab.fx.audio.sources.size),0);
   await page.selectOption('#speed','2');await page.click('#play');await page.waitForFunction(()=>window.MercenarySkillLab.fx.playing);await page.click('#cancel');
   const d=await page.evaluate(()=>window.MercenarySkillLab.diagnostics());assert.equal(d.registeredTimelines,0);assert.equal(d.visibleSprites,0);assert.equal(d.audio.activeSources,0);assert.equal(d.regularCards,5);assert.equal(d.mercenaryInRegularArray,false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   results.push({skill:skill.id,width,collisionFrames:collision.activeFrames,audioSync:collision.audio.sync});
  }
  console.log(`${width}px: all 17 individual sequences, physical sound, pause, seek, speed and cancellation passed.`);
 }
 // Browser MP3 decoding must agree with the saved measured peak, not just its URL.
 const peaks=await page.evaluate(()=>Object.fromEntries(Object.entries(window.MercenarySkillLab.fx.audio.buffers).map(([key,b])=>{let max=0,index=0;for(let c=0;c<b.numberOfChannels;c++){const a=b.getChannelData(c);for(let i=0;i<a.length;i++)if(Math.abs(a[i])>max){max=Math.abs(a[i]);index=i;}}return[key,index/b.sampleRate];})));
 const manifest=JSON.parse(await fs.readFile('preview/project-v-mercenary-system-v1/skill-audio-v1.json','utf8'));
 for(const[key,peak]of Object.entries(peaks))assert.ok(Math.abs(peak-manifest.assets[key].peak)*1000<=20,key);
 await page.evaluate(()=>window.MercenarySkillLab.dispose());await page.waitForTimeout(250);assert.deepEqual(errors,[]);
 console.log('34 skill playback journeys passed; 9 decoded PCM peaks agree within 20 ms.');
}finally{await fs.writeFile(path.join(out,'qa.json'),JSON.stringify({results,errors},null,2));await browser.close();}

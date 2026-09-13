import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {MERCENARY_SKILLS} from '../shared/mercenary-skills-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8791';
if(!/^(127\.0\.0\.1|(?:[a-z0-9-]+\.)?cnine-card\.pages\.dev)$/.test(new URL(base).hostname))throw Error('Unexpected QA host');
const out=path.resolve(process.env.QA_OUTPUT_DIR||'../qa/mercenary-s-ss-20260913/browser');
const plan=JSON.parse(await fs.readFile('preview/project-v-mercenary-system-v1/skill-s-ss-plan-v3.json','utf8'));
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[],results=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(base+'/preview/project-v-mercenary-system-v1/skills.html?skill=MS-001&mercenary=V-001');
 await page.waitForFunction(()=>window.MercenarySkillLab?.diagnostics().ready,null,{timeout:90000});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1100});
  for(const row of plan.targets.filter(r=>!process.env.QA_SKIP_CODES?.split(',').includes(r.code)&&(!process.env.QA_ONLY_CODES||process.env.QA_ONLY_CODES.split(',').includes(r.code)))){
   const skill=MERCENARY_SKILLS.find(s=>s.id===row.skillId);
   await page.selectOption('#reviewPair',row.code);
   await page.waitForFunction(row=>{const d=window.MercenarySkillLab.diagnostics();return d.ready&&d.skillId===row.skillId&&d.previewMercenaryCode===row.code;},row);
   await page.selectOption('#speed','1');await page.click('#replay');
   await page.waitForFunction(t=>window.MercenarySkillLab.fx.time>=t,skill.visual.impacts[0]+.035);
   const collision=await page.evaluate(()=>window.MercenarySkillLab.fx.diagnostics());
   assert.ok(collision.activeFrames.length>0,`${row.code} contact frames`);assert.equal(collision.poolOverflow,0);
   assert.ok(collision.audio?.ready,`${row.code} recorded audio`);
   assert.ok(collision.audio.sync.every(s=>Math.abs(s.predictedOutputPeakDeltaMs)<=20));
   await page.waitForFunction(()=>window.MercenarySkillLab.fx.time>=window.MercenarySkillLab.fx.plan.duration-.001);
   assert.equal(await page.evaluate(()=>window.MercenarySkillLab.fx.diagnostics().audio.activeSources),0);
   // Full normal and half-speed passes, then independent pause/seek/cancel.
   await page.selectOption('#speed','0.5');await page.click('#replay');
   await page.waitForFunction(()=>window.MercenarySkillLab.fx.time>=window.MercenarySkillLab.fx.plan.duration-.001,null,{timeout:15000});
   const frame=page.locator('#battleFrame');await frame.scrollIntoViewIfNeeded();
   for(const [phase,at] of [['prepare',Math.max(.1,skill.visual.impacts[0]-.2)],['contact',skill.visual.impacts[0]+.065],['last',skill.visual.impacts.at(-1)+.12]]){
    await page.evaluate(async at=>{const l=window.MercenarySkillLab;l.fx.seek(at);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));l.engine.app.render();},at);
    await frame.screenshot({path:path.join(out,`${row.code}-${width}-${phase}.png`)});
   }
   await page.click('#replay');await page.waitForFunction(()=>window.MercenarySkillLab.fx.time>.1);await page.click('#play');
   const paused=await page.evaluate(()=>window.MercenarySkillLab.fx.time);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.MercenarySkillLab.fx.time),paused);
   await page.selectOption('#speed','2');await page.click('#play');await page.waitForFunction(()=>window.MercenarySkillLab.fx.playing);await page.click('#cancel');
   const d=await page.evaluate(()=>window.MercenarySkillLab.diagnostics());
   assert.equal(d.registeredTimelines,0);assert.equal(d.visibleSprites,0);assert.equal(d.audio.activeSources,0);assert.equal(d.regularCards,5);assert.equal(d.mercenaryInRegularArray,false);assert.equal(d.mercenaryDisplacement,0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   results.push({code:row.code,rank:row.rank,skill:skill.id,width,normalPlayback:true,halfSpeedPlayback:true,pauseSeekCancel:true,sourceArt:d.sourceArt,battleSprite:d.battleSprite,collisionFrames:collision.activeFrames,audioSync:collision.audio.sync});
   console.log(`${width}px ${row.code} ${skill.name}: frames, sound, playback and cleanup passed`);
  }
  await page.screenshot({path:path.join(out,`page-${width}.png`),fullPage:true});
 }
 await page.evaluate(()=>window.MercenarySkillLab.dispose());await page.waitForTimeout(150);assert.deepEqual(errors,[]);
}finally{await fs.writeFile(path.join(out,'qa.json'),JSON.stringify({base,results,errors},null,2));await browser.close();}

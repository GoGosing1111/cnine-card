import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {SKILLS} from './source/SkillPlan.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.dirname(fileURLToPath(import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true});
const showcase=process.argv.includes('--showcase'),selected=SKILLS.filter(s=>Boolean(s.showcase)===showcase);
const output=showcase?'prime-requiem-showcase-v3.webm':'prime-requiem-five-skills.webm';
const context=await browser.newContext({viewport:{width:1360,height:820},recordVideo:{dir:path.join(root,'qa/recordings'),size:{width:1360,height:820}}});
const page=await context.newPage();
try{
  await page.goto('http://127.0.0.1:8864/preview/prime-requiem-blood-skills-20261021-v1/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.PrimePreview?.diagnostics().ready,null,{timeout:60000});
  await page.addStyleTag({content:'html{scroll-behavior:auto!important}main{padding:0!important;max-width:none!important}.identity,.section-heading,.skills,.showcases,.current-skill,.playback,.health,.archive{display:none!important}.battle-shell{border:0!important;padding:0!important}.battle-viewport{height:100vh!important}'});
  await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(350);
  await page.evaluate(id=>window.PrimePreview.select(id),selected[0].id);
  await page.waitForTimeout(1600);
  for(const skill of selected){
    await page.evaluate(id=>{const p=window.PrimePreview;p.fx.setSpeed(2);p.select(id,true);},skill.id);
    await page.waitForFunction(()=>window.PrimePreview.fx.mode==='ambient',null,{timeout:15000});
    await page.waitForTimeout(400);
  }
  await page.evaluate(id=>window.PrimePreview.select(id),selected[0].id);
  await page.waitForTimeout(800);
}finally{
  const video=page.video();await context.close();
  await video.saveAs(path.join(root,output));await browser.close();
}
console.log('Saved actual V3 playback: '+output);

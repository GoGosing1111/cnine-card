import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const out=await fs.mkdtemp(path.join(os.tmpdir(),'mercenary-codex-qa-'));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep))throw Error('Outside root');
    const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser;const errors=[],missing=[],results=[];
const files=[
  'preview/project-v-mercenary-system-v1/skill-rehearsal.mjs',
  'preview/project-v-mercenary-system-v1/source/AreaSkillRehearsalFX.js',
  'preview/project-v-mercenary-system-v1/source/skills-lab.src.js',
  'preview/project-v-mercenary-system-v1/skills.bundle.js',
  'preview/project-v-mercenary-system-v1/skills-battle.html',
  'tests/mercenary-codex-area.browser.mjs'
];
const sha256=value=>createHash('sha256').update(value).digest('hex');
const sourceHashes=await Promise.all(files.map(async file=>({file,sha256:sha256((await fs.readFile(path.join(root,file),'utf8')).replace(/\r\n/g,'\n'))})));
try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
  for(const [device,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
    await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage();page.on('pageerror',e=>errors.push({device,message:e.message}));
    page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===origin)missing.push(r.url());});
    await page.goto(origin+'/preview/project-v-mercenary-system-v1/skills.html?skill=MS-056');
    const ready=async(id='MS-056')=>page.waitForFunction(id=>{const d=JSON.parse(document.querySelector('#health')?.dataset.diagnostics||'{}');return d.ready&&d.skillId===id;},id,{timeout:60000});
    await ready();const frame=page.frames().find(f=>f.url().includes('skills-battle'));
    const state=()=>frame.evaluate(()=>{const lab=window.MercenarySkillLab,fx=lab.fx;return {diagnostics:lab.diagnostics(),targets:fx.plan.targets,events:fx.plan.events.filter(e=>e.at<=fx.time),preservedModel:fx.effect?fx.effect.merc.fullBodySprite.texture===fx.effect.idle.texture:true,timelines:lab.engine.simpleTimelines.size};});
    const seek=async value=>{await page.locator('#scrub').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},value);};
    const check=await state();assert.equal(check.diagnostics.skillId,'MS-056');assert.equal(check.diagnostics.previewMercenaryCode,'V-001');
    assert.equal(check.diagnostics.regularCards,5);assert.equal(check.diagnostics.mercenaries,1);assert.equal(check.diagnostics.canvasCount,1);assert.equal(check.diagnostics.layerCount,1);
    assert.equal(check.targets.length,5);assert.equal(await page.locator('#count').textContent(),'36 / 36종');assert.match(await page.locator('#sound').textContent(),/OFF/);
    await seek(1.5);assert.equal((await state()).events.filter(e=>e.kind==='HIT').length,0);
    await page.locator('#impact').click();const impact=await state();
    assert.equal(impact.events.filter(e=>e.kind==='HIT').length,5);assert.ok(impact.diagnostics.visibleSprites>0);assert.ok(impact.diagnostics.activeFrames.some(f=>f.key==='arrowRainArea'));
    assert.equal(impact.preservedModel,true,'Selecting an independent skill must preserve the selected mercenary');
    assert.equal(impact.diagnostics.damageAuthority,'OFFLINE_RESOLVED_FIXTURE');assert.equal(impact.diagnostics.totalAuthoredFrames,16);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.locator('#battleFrame').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,device+'-impact.png')});
    await page.locator('#battleFrame').screenshot({path:path.join(out,device+'-canvas.png')});
    await page.locator('#speed').selectOption('2');await seek(0);await page.locator('#play').click();
    await frame.waitForFunction(()=>window.MercenarySkillLab.fx.time>.2);
    await page.locator('#play').click();const paused=await state();assert.equal(paused.diagnostics.playing,false);assert.equal(paused.diagnostics.speed,2);
    await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal((await state()).diagnostics.time,paused.diagnostics.time);
    await page.locator('#cancel').click();const cancelled=await state();assert.equal(cancelled.diagnostics.visibleSprites,0);assert.equal(cancelled.timelines,0);
    for(const [scenario,targetCount,hitCount] of [['counter',5,0],['boss',1,1],['normal',5,5]]){
      await page.locator('#scenario').selectOption(scenario);await ready();await page.locator('#impact').click();const s=await state();
      assert.equal(s.targets.length,targetCount);assert.equal(s.events.filter(e=>e.kind==='HIT').length,hitCount);
      assert.equal(s.diagnostics.visibleSprites>0,hitCount>0);assert.equal(s.diagnostics.layerCount,1);
      results.push({device,scenario,targetCount,hitCount,visibleSprites:s.diagnostics.visibleSprites});
    }
    await page.locator('[data-skill="MS-003"]').click();await ready('MS-003');await page.locator('#impact').click();assert.ok((await state()).diagnostics.visibleSprites>0);
    await page.locator('[data-skill="MS-056"]').click();await ready();await page.locator('#impact').click();assert.equal((await state()).diagnostics.layerCount,1);
    await page.setViewportSize({width:width-20,height});await ready();assert.ok((await state()).diagnostics.visibleSprites>0);
    await page.locator('#replay').click();await frame.waitForFunction(()=>window.MercenarySkillLab.fx.time>=3.4,{},{timeout:10000});
    const done=await state();assert.equal(done.diagnostics.playing,false);assert.equal(done.diagnostics.visibleSprites,0);assert.equal(done.timelines,0);
    await page.reload();await ready();await page.locator('#impact').click();
    const reentered=await page.frames().find(f=>f.url().includes('skills-battle')).evaluate(()=>window.MercenarySkillLab.diagnostics());
    assert.equal(reentered.layerCount,1);assert.equal(reentered.canvasCount,1);assert.ok(reentered.visibleSprites>0);
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  for(const row of sourceHashes)assert.equal(sha256((await fs.readFile(path.join(root,row.file),'utf8')).replace(/\r\n/g,'\n')),row.sha256,'QA inputs changed during execution');
  const proof={command:'node tests/mercenary-codex-area.browser.mjs',exitCode:0,sources:sourceHashes,results,errors,missing,checks:['PC/mobile real preview bundle','five enemies / single boss / counter','single contact at 1.62s','preserved independent mercenary','seek/pause/speed/cancel/end','generic/area switch','resize/reentry','sound OFF']};
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(proof,null,2)+'\n');
  console.log('PASS: mercenary codex area preview PC/mobile. Evidence:',path.join(out,'report.json'));
}catch(error){console.error('Browser diagnostics:',{out,errors,missing});throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

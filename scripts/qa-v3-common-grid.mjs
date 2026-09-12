import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE_URL || 'playwright');
const output = path.resolve(process.env.QA_OUTPUT_DIR || 'output/v3-common-grid-20260911'); await fs.mkdir(output,{recursive:true});
const browser = await chromium.launch({headless:true,...(process.env.QA_CHROMIUM ? {executablePath:process.env.QA_CHROMIUM} : {}),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const results=[],errors=[],requests=[];
const base=process.env.QA_BASE_URL || 'http://127.0.0.1:8791';
const save=()=>fs.writeFile(path.join(output,'qa.json'),JSON.stringify({results,errors,requests},null,2));
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const uniform = formation => {
  assert.equal(formation.layoutVersion, 'UNIFORM_LATTICE_V2');
  const scale = formation.viewportFit ? .65 : .5;
  for (const actor of formation.actors) assert.ok(Math.abs(actor.scale - scale) < .00001, 'slot/faction changes actor scale');
  if (formation.support) assert.ok(Math.abs(formation.support.scale - scale) < .00001, 'support scale differs');
};
try {
  for (const width of [390,1366]) {
    if (process.env.QA_LABS_ONLY === '1' || process.env.QA_CORE_ONLY === '1') continue;
    if (process.env.QA_WIDTH && width!==Number(process.env.QA_WIDTH)) continue;
    const page=await browser.newPage({viewport:{width,height:960}});
    page.on('pageerror',e=>errors.push({width,message:e.message}));
    page.on('response',r=>{if(r.status()>=400)requests.push({status:r.status(),url:r.url()});});
    await page.goto(`${base}/preview/v3-common-grid-v1/`);
    await page.waitForFunction(()=>V3GridContents.diagnostics().ready,null,{timeout:60000});
    for (const mode of ['HUNT','TOWER','RAID','SEAL','ESCORT','APOCALYPSE','PVP','SIEGE','TERRITORY','CLAN']) {
      await page.evaluate(code=>V3GridContents.select(code),mode); await settle(page);
      const d=await page.evaluate(()=>V3GridContents.diagnostics());
      const pve=!['PVP','SIEGE','TERRITORY','CLAN'].includes(mode);
      assert.equal(d.ready,true,mode); assert.equal(d.canvasCount,1); assert.equal(d.cards,pve?5:10);
      assert.equal(d.formation.version,'OCCUPIED_GRID_V1'); assert.equal(d.formation.mode,'wide');
      uniform(d.formation);
      assert.equal(Boolean(d.formation.support),pve,`${mode} suit gate`);
      assert.equal(Boolean(d.formation.objective),mode==='ESCORT');
      assert.equal(d.formation.tiles.length,pve?(mode==='ESCORT'?8:7):10,`${mode} occupied cells`);
      const rects=[...d.geometry.actors.flatMap(a=>[a.body,a.hud]),...(d.geometry.support?[d.geometry.support.all]:[]),...(d.geometry.objective?[d.geometry.objective]:[])];
      if(d.geometry.fit)for(const r of rects){
        assert.ok(r.x>=-1&&r.x+r.width<=d.geometry.width+1,`${mode} horizontally clipped: ${JSON.stringify(r)}`);
        assert.ok(r.y>=d.geometry.fit.available.top-1&&r.y+r.height<=d.geometry.fit.available.top+d.geometry.fit.available.height+1,`${mode} header/dock collision: ${JSON.stringify(r)}`);
      }
      await page.screenshot({path:path.join(output,`${mode.toLowerCase()}-${width}.png`),fullPage:true});
      results.push({width,mode,tiles:d.formation.tiles.length,grid:d.formation,geometry:d.geometry});await save();
      console.log(`${mode} ${width}px: occupied grid, five-card dock and PVE suit gate passed.`);
    }
    await page.close();
  }
  for(const [route,global] of [['idle-v3-v1','IdlePreview'],['scrapyard-v3-v1','ScrapyardPreview'],['cow-room-v3-v1','CowRoomV3']]) {
    if (process.env.QA_LABS_ONLY === '1' || process.env.QA_CORE_ONLY === '1') continue;
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror',e=>errors.push({route,message:e.message}));
    await page.goto(`${base}/preview/${route}/`);
    await page.waitForFunction(name=>window[name]?.diagnostics().ready,global,{timeout:60000});await settle(page);
    const d=await page.evaluate(name=>window[name].diagnostics(),global);
    const formation=d.bridge?.engine?.formation;
    assert.equal(formation?.version,'OCCUPIED_GRID_V1',route);
    uniform(formation);
    assert.equal(formation.tiles.length,route==='idle-v3-v1'?7:9,route);
    await page.screenshot({path:path.join(output,`${route}-390.png`),fullPage:true});
    results.push({route,formation});await save();await page.close();
    console.log(`${route}: common formation present.`);
  }
  for (const [route, name, count] of [['battle-suit-skill-chip-v1/','SkillChipLab',7], ['project-v-mercenary-system-v1/skills.html','MercenarySkillLab',11], ['boss-resources-v2048/','BossResourceLab',6]]) {
    if (process.env.QA_CORE_ONLY === '1') continue;
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror',e=>errors.push({route,message:e.message}));
    page.on('response',r=>{if(r.status()>=400)requests.push({status:r.status(),url:r.url()});});
    await page.goto(`${base}/preview/${route}`);
    await page.waitForFunction(name=>window[name]?.diagnostics().ready,name,{timeout:60000});await settle(page);
    const initial=await page.evaluate(name=>window[name].engine.gridDiagnostics(),name);
    assert.equal(initial.version,'OCCUPIED_GRID_V1');assert.equal(initial.tiles.length,count,route);
    for(const width of [390,1366,390]) {
      await page.setViewportSize({width,height:960});await settle(page);
      const d=await page.evaluate(name=>({formation:window[name].engine.gridDiagnostics(),geometry:window[name].engine.viewportGeometry()}),name);
      assert.equal(d.formation.tiles.length,count);
      uniform(d.formation);
      assert.equal(await page.evaluate(()=>{
        const frame=document.querySelector('iframe'),parent=frame.parentElement;
        return parent.tagName==='BODY'||frame.getBoundingClientRect().bottom<=parent.getBoundingClientRect().bottom+1;
      }),true,`${name}: editor section must contain its frame`);
      await page.screenshot({path:path.join(output,`${name}-${width}.png`),fullPage:true});
      results.push({route,width,...d});await save();
    }
    if(name==='BossResourceLab') {
      await page.evaluate(()=>BossResourceLab.play());
      await page.evaluate(()=>BossResourceLab.select());
    } else {
      await page.evaluate(name=>window[name].fx.play(),name);
      await page.waitForFunction(name=>window[name].fx.time>.2,name,{timeout:10000});
      const end=await page.evaluate(name=>{
        const lab=window[name],duration=lab.fx.plan?.duration||lab.fx.sequence.duration;
        lab.fx.pause();lab.fx.seek(duration);
        const state=lab.diagnostics();lab.fx.seek(0);return state;
      },name);
      if(name==='MercenarySkillLab') {
        assert.equal(end.mercenaryInRegularArray,false);assert.ok(end.mercenaryDisplacement<.01);
      }
    }
    await settle(page);
    assert.equal(await page.evaluate(name=>window[name].engine.gridDiagnostics().tiles.length,name),count);
    console.log(`${name}: shared grid, resize, playback and return passed.`);
    await page.close();
  }
  if (process.env.QA_LABS_ONLY !== '1') {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror',e=>errors.push({route:'core-protocol-raid-v1',message:e.message}));
    page.on('response',r=>{if(r.status()>=400)requests.push({status:r.status(),url:r.url()});});
    await page.goto(`${base}/preview/core-protocol-raid-v1/`);
    await page.locator('[data-core-action="open"]').click();
    await page.locator('[data-core-action="start"]').click();
    await page.locator('[data-core-action="battle"]').click();
    await page.waitForFunction(()=>ProjectVPixiBattle.diagnostics().formation?.tiles.length===6,null,{timeout:60000});
    const d=await page.evaluate(()=>ProjectVPixiBattle.diagnostics());
    assert.equal(d.formation.version,'OCCUPIED_GRID_V1');
    uniform(d.formation);
    assert.equal(await page.locator('canvas').count(),1);assert.equal(await page.locator('[data-v3-roster-card]').count(),5);
    await page.screenshot({path:path.join(output,'core-protocol-raid-390.png')});
    results.push({route:'core-protocol-raid-v1',width:390,formation:d.formation});await save();
    await page.close();console.log('Core raid: existing entry uses the common formation.');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await save();
  console.log(`Passed ${results.length} content/viewport checks.`);
} finally {await save();await browser.close();}

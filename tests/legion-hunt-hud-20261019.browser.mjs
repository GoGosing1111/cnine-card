// Shipped HTML + Pixi bundle, with all account APIs confined to the local fixture.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {LEGION_REGIONS} from '../shared/legion-regions-v1.mjs';
const fixture=process.env.LEGION_HUD_QA_BASE||'http://127.0.0.1:8971';
assert.equal(new URL(fixture).hostname,'127.0.0.1');
const base=process.env.LEGION_HUD_QA_ASSETS||fixture,out=process.env.LEGION_HUD_QA_OUTPUT;
assert(out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),report=[];
try {
 for(const width of [1440,390])for(const region of LEGION_REGIONS.filter(r=>!process.env.LEGION_HUD_QA_REGIONS||process.env.LEGION_HUD_QA_REGIONS.split(',').includes(r.id))) {
  const page=await browser.newPage({viewport:{width,height:width===390?844:960},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(!url.pathname.startsWith('/api/legion-hunt/'))return route.abort();
    await route.fulfill({response:await route.fetch({url:fixture+url.pathname+url.search})});
  });
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto(base+'/pve/legion-hunt/',{waitUntil:'networkidle'});
  await page.evaluate(id=>{
    const api=ProjectVPixiBattle;
    for(const key of ['mountForBattle','resetSession']){const old=api[key];api[key]=async(...args)=>window.qaEngine=await old(...args);}
    window.postMessage({type:'legion-hunt-enter',difficulty:'normal',regionId:id},location.origin);
  },region.id);
  await page.waitForFunction(()=>window.HuntPreviewV2?.diagnostics().playing,null,{timeout:60000});
  await page.waitForTimeout(1000);await page.evaluate(()=>qaEngine.setHuntPaused(true));
  const initial=await page.evaluate(()=>qaEngine.enemies.map(a=>({frame:a.hud.frame.visible,name:a.hud.fullName,expected:qaEngine.instances.get(a.id).displayName,showName:a.hud.showName,compact:a.hud.compact,scale:a.hud.scale.x})));
  assert.equal(initial.length,12);
  for(const a of initial){assert(a.frame);assert.equal(a.name,a.expected);assert.equal(a.showName,false);assert.equal(a.compact,width===390);assert.equal(a.scale,initial[0].scale);}
  await page.screenshot({path:path.join(out,`${width}-${region.id}-normal.png`)});
  const checks=await page.evaluate(async region=>{
    const e=qaEngine;e.app.stop();
    const template=[...e.instances.values()].find(r=>!r.boss);
    const variants=[...region.monsters.map(m=>({...m,elite:false})),...region.monsters.map(m=>({...m,name:'정예 '+m.name,elite:true})),{...region.boss,boss:true}];
    const rows=[];
    for(const [i,m] of variants.entries()) {
      e.spriteTextures.set(m.sprite,await ProjectVPixiBattle.fxRuntime.Assets.load(m.sprite));
      const row={...template,id:'B:ENCOUNTER:HUD_QA:'+i,slot:m.boss?1:11,name:m.name,displayName:m.name,battleSprite:m.sprite,battleHeight:m.height,boss:!!m.boss,elite:!!m.elite};
      e.instances.set(row.id,row);const a=e.bindMonster(row);a.animationAdapter.kill();
      a.setHp(25);a.setShield(25,100);e.sortCombatDepth();
      const frame=a.hud.frame.getBounds(),head=a.root.toGlobal({x:0,y:-a.fullBodyHeight*.98});
      rows.push({name:a.hud.fullName,expected:m.name,frame:a.hud.frame.visible,showName:a.hud.showName,expectedShow:!!(m.boss||m.elite),hpRatio:a.hud.hpFill.width/a.hud.gauge.width,shieldRatio:a.hud.shieldFill.width/a.hud.gauge.width,headGap:head.y-frame.maxY,centerError:Math.abs((frame.minX+frame.maxX)/2-head.x),scale:a.hud.scale.x,rotation:a.view.rotation});
    }
    // Show the actual boss name/tab in isolation for visual inspection.
    for(const [i,a] of e.enemies.entries())a.root.visible=i===1;
    e.effectLayer.visible=false;e.uiLayer.visible=false;
    e.app.renderer.render(e.app.stage);
    return rows;
  },region);
  for(const c of checks){assert.equal(c.name,c.expected);assert(c.frame);assert.equal(c.showName,c.expectedShow);assert.equal(c.hpRatio,.25);assert.equal(c.shieldRatio,.25);assert(c.headGap>0);assert(c.centerError<.1);assert.equal(c.rotation,0);}
  await page.waitForTimeout(600);await page.evaluate(()=>qaEngine.app.renderer.render(qaEngine.app.stage));
  await page.screenshot({path:path.join(out,`${width}-${region.id}-boss.png`)});
  await page.setViewportSize({width:width===390?1440:390,height:width===390?960:844});
  await page.waitForTimeout(250);
  const resized=await page.evaluate(()=>{
    qaEngine.sortCombatDepth();
    return qaEngine.enemies.map(a=>({name:a.hud.fullName,expected:qaEngine.instances.get(a.id).displayName,frame:a.hud.frame.visible,compact:a.hud.compact,mobile:qaEngine.mobile,scale:a.hud.scale.x,expectedScale:a.huntHudScale}));
  });
  for(const a of resized){assert.equal(a.name,a.expected);assert(a.frame);assert.equal(a.compact,a.mobile);assert.equal(a.scale,a.expectedScale);}
  assert.deepEqual(errors,[]);
  report.push({width,region:region.id,initial,checks,resized,errors});console.log(`${width} ${region.id}: 12 slots + 7 monster variants + resize passed`);
  await page.close();
 }
} finally {
 await browser.close();fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n');
}

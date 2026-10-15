import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {iconTechniquePreviewServer} from '../../scripts/serve-icon-technique-preview-20261015.mjs';
const dir=new URL('qa/',import.meta.url),base='/preview/icon-diim-redcap-battle-20261015-v1/';
const server=iconTechniquePreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright'),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const errors=[],reports=[];let release;
const ready=page=>page.waitForFunction(()=>JSON.parse(document.querySelector('#health')?.dataset.diagnostics||'{}').ready===true,null,{timeout:90000});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000},serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+base);await ready(page);
  const frame=page.frames().find(f=>f.url().includes('/battle.html'));
  const positions=()=>frame.evaluate(()=>__diimEngine.characters.filter(a=>a.battleActive&&!a.iconWeapon).map(a=>({id:a.id,x:a.root.x,y:a.root.y,slot:a.iconTechniqueDisplaySlot,hp:a.hp,scale:a.root.scale.x})));
  const expected=await page.evaluate(async path=>{const p=await(await fetch(path+'independent.json')).json();return Object.values(p.battleV2.teams).flatMap(t=>t.cards).map(c=>({id:c.id,hp:c.hp/c.maxHp*100}));},base);
  const initial=await positions();for(const row of initial)assert.ok(Math.abs(row.hp-expected.find(c=>c.id===row.id).hp)<.00001,'initial server HP');
  for(const next of [0,2,0,2]){await frame.evaluate(n=>{DiimPreview.seek(n);__diimEngine.resize();},next);assert.deepEqual(await positions(),initial,'seek and resize preserve server slots and initial HP');}
  await page.screenshot({path:new URL(width+'-overview.png',dir).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await page.locator('.rehearsal').scrollIntoViewIfNeeded();await page.screenshot({path:new URL(width+'-summon.png',dir).pathname.replace(/^\/(\w:)/,'$1')});
  const bounds=await frame.evaluate(()=>{const u=[...__diimEngine.iconTechniqueWeapons.values()][0],body=u.fullBodySprite.getBounds(),hud=u.hud.getBounds();return {height:body.height,width:body.width,bodyTop:body.y,hudBottom:hud.y+hud.height};});
  assert.ok(bounds.height>35,'visible independent raster weapon size');
  await page.locator('#fx-toggle').click();await frame.evaluate(()=>DiimPreview.showFrame(11));
  assert.equal(await frame.evaluate(()=>__diimEngine.effectLayer.children.find(x=>x.label==='ICON_PREVIEW_EFFECT')?.visible),false,'FX OFF survives raw frame creation');
  await page.screenshot({path:new URL(width+'-fx-off.png',dir).pathname.replace(/^\/(\w:)/,'$1')});
  await page.locator('#fx-toggle').click();await frame.evaluate(()=>DiimPreview.seek(0));await page.locator('#play').click();
  await frame.waitForFunction(()=>DiimPreview.diagnostics().index>=2,null,{timeout:30000});
  await frame.evaluate(()=>DiimPreview.showFrame(11));assert.equal(await frame.evaluate(()=>DiimPreview.diagnostics().manualFx!==null),true);
  await page.locator('#play').click();assert.equal(await frame.evaluate(()=>DiimPreview.diagnostics().manualFx),null,'resume destroys raw frame playback');
  await frame.waitForFunction(()=>DiimPreview.diagnostics().index>=4,null,{timeout:30000});await frame.evaluate(()=>DiimPreview.pause(true));
  const status=await frame.evaluate(()=>__diimEngine.uiLayer.status.text);assert.doesNotMatch(status,/CRIMSON BLADE|AQUA GUARD|LIGHTNING VELOCITY|VERDANT RESTORE/);
  await frame.evaluate(()=>DiimPreview.seek(2));await page.screenshot({path:new URL(width+'-final-summon.png',dir).pathname.replace(/^\/(\w:)/,'$1')});
  reports.push({width,initial,repeatSeekAndResizeStable:true,initialServerHp:true,rawFrameHonorsFxOff:true,resumeClearsRawFrame:true,status,bounds});
  await frame.evaluate(()=>DiimPreview.dispose());assert.equal(await frame.locator('canvas').count(),0);await page.close();console.log('PASS controls/slots/HP '+width);
 }
 const page=await browser.newPage({viewport:{width:390,height:1000},serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));let loaded;const received=new Promise(r=>loaded=r),blocked=new Promise(r=>release=r);
 await page.route('**/assets/fx/atlas.webp',async route=>{loaded();await blocked;await route.continue();});await page.goto(origin+base);await received;const frame=page.frames().find(f=>f.url().includes('/battle.html'));await frame.evaluate(()=>DiimPreview.dispose());release();await page.waitForTimeout(1200);assert.equal(await frame.locator('canvas').count(),0);assert.equal(await frame.evaluate(()=>DiimPreview.diagnostics().ready),false);assert.equal(await page.locator('#play').isDisabled(),true);await page.close();
 const back=await browser.newPage({viewport:{width:390,height:1000},serviceWorkers:'block'});back.on('pageerror',e=>errors.push(e.message));await back.goto(origin+base);await ready(back);await back.goto(origin+'/preview/icon-techniques-20261015/');await back.goBack();await ready(back);const returned=back.frames().find(f=>f.url().includes('/battle.html'));assert.equal(await returned.locator('canvas').count(),1);await back.close();
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('lifecycle.json',dir),JSON.stringify({reports,pendingAtlasDispose:true,noLateCanvasOrFx:true,controlsStayDisabled:true,actualHistoryBackRestoresOneCanvas:true,errors},null,2)+'\n');console.log('PASS pending dispose + history back');
}finally{release?.();await browser.close();await new Promise(r=>server.close(r));}

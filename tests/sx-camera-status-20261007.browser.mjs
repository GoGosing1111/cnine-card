// Main app styles/loader + shipped renderer; synthetic local battle receipts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.SX_QA_BASE||'http://127.0.0.1:8983',out=process.env.SX_QA_OUT;
assert.equal(new URL(base).hostname,'127.0.0.1');assert.ok(out);fs.mkdirSync(out,{recursive:true});
const controller=fs.readFileSync(new URL('../preview/sx-live-v1/review.js',import.meta.url),'utf8').replace("fetch('fixtures.json')","fetch('/preview/sx-live-v1/fixtures.json')");
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const [name,viewport] of [['desktop',{width:1788,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,isMobile:name==='mobile',hasTouch:name==='mobile',serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
  await page.goto(base+'/?screen=battle');
  await page.locator('#battleStart, #pveV2GoHunt').first().waitFor({timeout:30000});
  await page.evaluate(()=>ensureFeatureResources('battleV2'));
  await page.addScriptTag({content:controller});
  await page.waitForFunction(()=>window.SXLiveReview,null,{timeout:30000});
  const snapshot=()=>page.evaluate(()=>{
   const e=SXLiveReview.engine,transform=n=>({x:n.x,y:n.y,scaleX:n.scale.x,scaleY:n.scale.y,pivotX:n.pivot.x,pivotY:n.pivot.y,rotation:n.rotation,skewX:n.skew.x,skewY:n.skew.y});
   const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
   const fx=e.accountBattleUnit?.swordAnimation?.fx,giant=fx?.giantSword;
   const screen=n=>{const a=n.toGlobal({x:0,y:0}),b=n.toGlobal({x:1,y:1});return {x:a.x,y:a.y,scaleX:b.x-a.x,scaleY:b.y-a.y}};
   const dom=document.getElementById('pvBattleStatus'),s=getComputedStyle(dom);
   return {stage:transform(e.stage),base:e.camera.base,rootScale:e.root.scale.x,actorHeight:e.allies[0].view.getBounds().height,layers:e.parallaxLayers.map(({layer})=>transform(layer)),canvasStatusVisible:e.uiLayer.status.visible||e.uiLayer.statusPanel.visible,
    background:e.parallaxLayers.map(({layer})=>screen(layer)),giant:giant?.visible?{x:giant.getBounds().x,y:giant.getBounds().y,width:giant.getBounds().width,height:giant.getBounds().height}:null,
    status:rect(dom),statusText:dom.textContent,statusDisplay:s.display,statusVisibility:s.visibility,dock:rect(document.querySelector('[data-v3-dock]')),diagnostics:SXLiveReview.diagnostics()};
  });
  const stable=(s,framed=false)=>{
   if(!framed)assert.deepEqual(s.stage,{x:s.base.x,y:s.base.y,scaleX:1,scaleY:1,pivotX:s.base.pivotX,pivotY:s.base.pivotY,rotation:0,skewX:0,skewY:0},name+' battlefield framing');
   else {assert.ok(s.stage.scaleX>0&&s.stage.scaleX<1);assert.equal(s.stage.scaleX,s.stage.scaleY);assert.equal(s.stage.rotation,0);assert.equal(s.stage.skewX,0);assert.equal(s.stage.skewY,0);}
   for(const layer of s.layers)assert.deepEqual(layer,{x:0,y:0,scaleX:1,scaleY:1,pivotX:0,pivotY:0,rotation:0,skewX:0,skewY:0},name+' backdrop transform');
   assert.equal(s.canvasStatusVisible,false,'duplicate canvas notice removed');
   assert.ok(s.actorHeight>(framed?12:25),name+' combat actors remain readable');
   assert.notEqual(s.statusDisplay,'none');assert.equal(s.statusVisibility,'visible');
   assert.ok(s.status.y>=0&&s.status.y+s.status.height<=s.dock.y-6,'notice above cards');
   assert.ok(s.status.x>=0&&s.status.x+s.status.width<=viewport.width,'notice inside viewport');
  };
  const before=await snapshot();stable(before);
  const aura=await page.evaluate(()=>{
   const sword=SXLiveReview.engine.accountBattleUnit.swordAnimation,fx=sword.fx,checks=[];
   sword.stopAmbient();
   for(const [mode,end]of [['idle',4.8],['dash',1.75],['attack',1.6],['skill',3.9]])for(const t of [0,.15,.6,end]){
    fx.mode=mode;fx.clock.time=t;fx.render(t);checks.push({mode,t,visible:fx.bladeAura.visible,aboveBody:fx.bladeAura.zIndex>sword.unit.bodySprite.zIndex,error:fx.bladeAuraError});
   }
   sword.restore();return checks;
  });for(const a of aura){assert.equal(a.visible,true,JSON.stringify(a));assert.equal(a.aboveBody,true);assert.ok(a.error<.01,JSON.stringify(a));}
  const phases=[];
  for(const holdAt of [1.3,2.38]){
   await page.evaluate(t=>SXLiveReview.skill({holdAt:t}),holdAt);
   const s=await snapshot();stable(s,true);phases.push({holdAt,...s});
   const safe=s.diagnostics.sword.camera.safeFrame;assert.ok(s.giant,'summoned sword visible');
   assert.ok(s.giant.x>=safe.left-1&&s.giant.y>=safe.top-1&&s.giant.x+s.giant.width<=safe.right+1&&s.giant.y+s.giant.height<=safe.bottom+1,name+' entire sword inside safe frame '+JSON.stringify({giant:s.giant,safe}));
   for(let i=0;i<s.background.length;i++)for(const key of Object.keys(s.background[i]))assert.ok(Math.abs(s.background[i][key]-before.background[i][key])<.0001,'background remains aligned');
   assert.equal(s.diagnostics.sword.bladeAuraVisible,true);
   await page.screenshot({path:path.join(out,name+'-'+holdAt+'.png')});
  }
  // Apocalypse interactive input pauses this same combat clock. Verify a held
  // cast keeps its geometry, then resumes and applies every server hit once.
  await page.evaluate(()=>SXLiveReview.pause(true));
  const held=await snapshot();stable(held,true);
  await page.evaluate(async()=>{const r=SXLiveReview;r.pause(false);r.engine.paceScale=2;r.engine.skillChipPlayback.timeline.play();await r.done;r.engine.paceScale=1});
  const complete=await snapshot();stable(complete);
  assert.equal(complete.diagnostics.sword.bladeAuraVisible,true,'blue blade persists after ultimate');
  assert.equal(complete.diagnostics.skillHits,complete.diagnostics.expectedHits);
  assert.equal(complete.diagnostics.skillDamage,complete.diagnostics.expectedDamage);
  assert.equal(complete.diagnostics.error,null);
  await page.evaluate(async()=>{await SXLiveReview.skill({holdAt:1.64});SXLiveReview.stop()});
  const cancelled=await snapshot();stable(cancelled);
  assert.equal(cancelled.diagnostics.sword.bladeAuraVisible,true,'blue blade stays attached when cast effects stop');
  await page.evaluate(()=>SXLiveReview.engine.updateStatus('창천멸진 · 전열과 후열 전체에 충격파 적중 · 긴 전투 메시지도 카드 위에서 확인합니다.'));
  const longMessage=await snapshot();stable(longMessage);
  await page.screenshot({path:path.join(out,name+'-status.png')});
  const cameraOwnership=await page.evaluate(()=>{
   const e=SXLiveReview.engine,sword=e.accountBattleUnit.swordAnimation;
   e.camera.focusAt({x:720,y:360},1.1);sword.restore();
   const kept=e.stage.scale.x===1.1&&e.stage.pivot.x===720&&e.stage.pivot.y===360;
   e.camera.reset(true);return kept;
  });assert.equal(cameraOwnership,true,'SX cleanup does not cancel another actor camera');
  // Same HUD on the PVP route, where the PVE-only support actor stays disabled.
  const pvp=await page.evaluate(async()=>{
   const r=SXLiveReview,p=structuredClone(r.fixtures.single);p.mode=p.battleV2.mode='PVP';
   await r.engine.configureAccountBattleUnit(p);document.querySelector('.battle-v3-live-shell').dataset.v3Field='PVP';
   r.engine.updateStatus('랭크전 · 전투 진행 중');
   return {active:r.engine.accountBattleUnitEnabled,sword:!!r.engine.accountBattleUnit?.swordAnimation};
  });assert.equal(pvp.active,false);assert.equal(pvp.sword,false);stable(await snapshot());
  assert.deepEqual(errors,[]);reports.push({name,before,aura,phases,held,complete,cancelled,longMessage,cameraOwnership,pvp,errors});
  console.log(JSON.stringify({name,phases:phases.length,hits:complete.diagnostics.skillHits,damage:complete.diagnostics.skillDamage,noticeAboveCards:true,pvp}));await page.close();
 }
}finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2)+'\n')}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8916',out=path.resolve('../qa/sniper-orikkung-20260926');
if(new URL(base).hostname!=='127.0.0.1')throw Error('Isolated local account QA only');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const results=[],errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await context.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_admin_token','local-account-7');});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  await page.goto(base+'/mercenary-codex/?view=all&q=저격 오리꿍#V-050');
  await page.locator('#cardGrid [data-code="V-050"]').waitFor({timeout:30000});
  assert.match(await page.locator('#inspection').textContent(),/에메랄드 대물저격/);
  assert.match(await page.locator('#inspection').textContent(),/720/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.locator('#sdTab').click();await page.locator('#portraitDisplay img').evaluate(img=>img.decode());
  assert.match(await page.locator('#portraitDisplay img').getAttribute('src'),/mercenary-v050-sniper-orikkung-sd-v1\.png/);
  await page.screenshot({path:path.join(out,'codex-'+width+'.png'),fullPage:true});results.push('Codex art/SD/SS/720% and no overflow '+width);
  await page.goto(base+'/preview/mercenary-sniper-orikkung-v1/');
  await page.waitForFunction(()=>!!window.SniperOrikkungPreview,{timeout:60000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.screenshot({path:path.join(out,'preview-'+width+'.png'),fullPage:true});
  const poses=await page.evaluate(()=>[.1,.3,.56,.9,1.26,1.6].map(t=>{SniperOrikkungPreview.fx.seek(t);return SniperOrikkungPreview.diagnostics().poseFrame;}));
  assert.deepEqual(poses,[0,1,2,3,4,5]);
  await page.locator('.battle-viewport').scrollIntoViewIfNeeded();
  await page.frameLocator('iframe').locator('[data-v3-roster-art]').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  await page.evaluate(()=>SniperOrikkungPreview.fx.seek(.6));
  await page.screenshot({path:path.join(out,'impact-'+width+'.png')});
  const d=await page.evaluate(()=>{const f=SniperOrikkungPreview.fx;f.setSpeed(2);f.play();f.pause();const d=f.diagnostics();f.cancel();return {d,after:f.diagnostics()};});
  assert.equal(d.d.speed,2);assert.equal(d.d.playing,false);assert.equal(d.after.visibleSprites,0);assert.equal(d.after.registeredTimelines,0);
  results.push('Six native poses, 16 impact frames, seek/pause/speed/cancel '+width);
 }
 await page.setViewportSize({width:1440,height:1000});
 for(const [mode,endpoint]of [['PVE','battle/fight'],['PVP','pvp/fight']]){
  await page.goto(base+'/__qa/login');
  await page.evaluate(()=>{document.body.innerHTML='<div id="runtime-modal"></div>';document.body.style='margin:0;background:#101820';});
  for(const file of ['style','card','card-unique-battle-fx-v1174','battle-v3-live','zenith-v1','superstar-v1','faker-card-v1','no-light-beams-v1789','breakthrough-tier-v1802'])await page.addStyleTag({url:base+'/css/'+file+'.css'});
  for(const file of ['js/project-v-battle-art-adapter-v1.js','js/project-v-tier-battle-art-adapter-v1.js','js/project-v-monster-battle-art-adapter-v1.js','js/project-v-unassigned-battle-fallback-v1.js','preview/project-v-v3/project-v-pixi-battle.bundle.js','js/battle-v3-live.js'])await page.addScriptTag({url:base+'/'+file});
  const result=await page.evaluate(async({mode,endpoint})=>{
   const r=await fetch('/api/'+endpoint,{method:'POST',headers:{authorization:'Bearer local-account-7','content-type':'application/json'},body:JSON.stringify({monsterId:1,requestId:crypto.randomUUID()})});
   if(!r.ok)throw Error(await r.text());const data=await r.json();window.qaData=data;
   window.cnineCardCatalog=()=>[...(data.cards||data.attackerDeck||[]),...(data.defenderDeck||[])];
   const api=ProjectVPixiBattle,old=api.mountForBattle;api.mountForBattle=async(...args)=>{window.qaEngine=await old(...args);return qaEngine};
   const modal=document.getElementById('runtime-modal'),prepared=ProjectVBattleV3Live.prepareLoading({modal,mode,playerName:'저격 오리꿍',opponentName:'로컬 검수'});
   window.qaRenderer=await ProjectVBattleV3Live.createRenderer({...prepared,modal,data,mode});api.mountForBattle=old;
   await qaEngine.deployCards({instant:true,force:true});await qaEngine.setVisible(true);
   prepared.stage.classList.add('is-v3-ready');prepared.stage.querySelectorAll('.battle-v3-loading').forEach(e=>e.remove());
   const event=data.battleV2.result.timeline.find(e=>e.skillId==='MS-050'&&e.type==='MERCENARY_HIT');
   if(!event)throw Error(mode+' missing real skill event');
   const actor=qaEngine.combatantById(event.actorId),target=qaEngine.combatantById(event.targetId);
   const before=target.hp;await qaEngine.playMercenaryEvent(event);
   const expected=qaEngine.eventHpPercent(target,event.targetHpAfter);
   return {mode,cards:data.battleV2.teams.A.cards.length,mercenaries:qaEngine.mercenaries.length,code:actor.cardId,before,after:target.hp,expected,playback:qaEngine.lastMercenaryPlayback,canvas:document.querySelectorAll('canvas').length};
  },{mode,endpoint});
  assert.equal(result.cards,5);assert.equal(result.code,'V-050');assert.equal(result.canvas,1);assert.equal(result.playback.skillId,'MS-050');assert.ok(Math.abs(result.after-result.expected)<.001);
  assert.equal(result.mercenaries,mode==='PVE'?1:2);
  await page.screenshot({path:path.join(out,'live-'+mode+'.png')});
  results.push(result);
  await page.evaluate(async()=>{qaEngine.audio?.setEnabled?.(false);const a=qaEngine.mercenaries[0],t=qaEngine.enemies.find(e=>e.hp>0)||qaEngine.enemies[0];if(t){t.hp=100;t.root.visible=true;await qaEngine.normalAttack(0,{attacker:a,target:t,damage:1,targetHp:99});}qaRenderer.destroy();ProjectVPixiBattle.destroy();});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'qa.json'),JSON.stringify({ok:true,results,errors},null,2));console.log(JSON.stringify({ok:true,results,errors}));
}finally{await fs.writeFile(path.join(out,'qa-progress.json'),JSON.stringify({results,errors},null,2));await browser.close();}

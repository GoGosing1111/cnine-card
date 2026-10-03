import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import inputs from './fixtures/cooperative-mixed-speed-20261004.json' with {type:'json'};
import {candidate} from '../scripts/measure-berkan-balance.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await cooperativeMiniflare(),out=path.join(h.temp,'mercenary-motion');
await fs.mkdir(out,{recursive:true});console.log('UI evidence:',out);
const squads=inputs.map(s=>({...structuredClone(s),mercenary:candidate(s.mercenaryCode)}));
const built=createCooperativeBattle({squads,difficulty:'HARD',seed:3375805316});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const pages=[],errors=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,isMobile:viewport.width<700,hasTouch:viewport.width<700,serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
  const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push({width:viewport.width,error:e.message}));
  await page.goto(h.origin+'/pve-v3/battle.html?content=idle-dungeon');await page.waitForFunction(()=>window.PveV3BattleBridge);
  await page.evaluate(async built=>{
   const css=document.createElement('link');css.rel='stylesheet';css.href='/raid/cooperative/style.css';document.head.append(css);
   const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;width:100%;height:100%';document.body.append(host);
   const {mountCoopBattle}=await import('/raid/cooperative/battle.mjs');
   window.qaController=await mountCoopBattle(host,built.payload);
   window.qaEngine=await ProjectVPixiBattle.mount();
   window.qaBuilt=built;window.qaFrames={};window.qaActions=[];
   const play=ProjectVPixiBattle.playEvents;
   ProjectVPixiBattle.playEvents=async(events,options)=>{qaActions.push(...events.filter(e=>e.actorId?.includes('MERCENARY')).map(e=>({id:e.actorId,type:e.type,at:e.combatAtMs})));return play(events,options);};
   for(const a of qaEngine.mercenaries)qaFrames[a.id]=[];
  },built);
 }
 for(const page of pages)await page.evaluate(()=>{
  window.qaStarts=Date.now()+500;
  qaController.update({serverNow:Date.now(),state:{status:'ACTIVE',startsAt:qaStarts,fighters:qaBuilt.states[0]},payload:qaBuilt.payload});
  window.qaTimer=setInterval(()=>{
   const elapsed=Date.now()-qaStarts;const frame=qaBuilt.states.findLast(s=>s.atMs<=elapsed)||qaBuilt.states[0];
   qaController.update({serverNow:Date.now(),state:{status:'ACTIVE',startsAt:qaStarts,fighters:frame}});
   for(const a of qaEngine.mercenaries){const s=a.fullBodySprite;qaFrames[a.id].push([Math.round(a.root.x),Math.round(a.root.y),s.texture.source.uid,s.texture.frame.x,s.texture.frame.y]);}
  },80);
 });
 await Promise.all(pages.map(p=>p.waitForFunction(()=>qaActions.some(a=>a.id==='A:OWNER:3:MERCENARY:V-049'),{},{timeout:20000})));
 for(const page of pages)await page.screenshot({path:path.join(out,page.viewportSize().width+'-opening-motion.png')});
 await Promise.all(pages.map(p=>p.waitForFunction(()=>Date.now()-qaStarts>20000)));
 const reports=[];
 for(const page of pages){
  const report=await page.evaluate(()=>{
   const movements=Object.fromEntries(Object.entries(qaFrames).map(([id,frames])=>[id,new Set(frames.map(f=>JSON.stringify(f))).size]));
   const cryvern=qaEngine.mercenaries.find(a=>a.cardId==='V-049'),fx=qaEngine.cryvernStates.get(cryvern).fx;
   return {runtime:ProjectVPixiBattle.runtimeVersion,movements,actions:qaActions,actorCount:qaEngine.characters.filter(c=>c.team==='ALLY').length,auraTextureMatches:fx.outer.texture===cryvern.fullBodySprite.texture};
  });
  assert.equal(report.runtime,'20261004-coop-cryvern-fix-v1');assert.equal(report.actorCount,9);
  for(const code of ['V-055','V-049']){const id=Object.keys(report.movements).find(id=>id.endsWith(code));assert.ok(report.movements[id]>3,code+' must visibly animate');assert.ok(report.actions.some(e=>e.id===id));}
  assert.equal(report.auraTextureMatches,true);
  await page.evaluate(()=>{clearInterval(qaTimer);qaController.destroy();});
  // Isolate the authored Cryvern pose after repeated effects for a clear edge check.
  await page.goto(h.origin+'/preview/mercenary-ice-crystal-dual-sword-v1/combat.html');
  await page.waitForFunction(()=>window.CryvernCombatQA?.engine,{},{timeout:60000});
  await page.evaluate(async()=>{const q=CryvernCombatQA,e=q.engine,a=e.mercenaries.find(a=>a.cardId==='V-049'),fx=e.cryvernStates.get(a).fx;window.qaCryvern=a;for(const mode of ['guard','attack','cross','cyclone','ultimate']){const plans=await import('/preview/mercenary-ice-crystal-dual-sword-v1/skill.mjs');fx.plan=plans.makePlan({mode});for(const time of [.4,.8,1.4,2.62,4]){fx.render(time);e.app.render();}}fx.cancel();e.app.render();});
  await page.screenshot({path:path.join(out,page.viewportSize().width+'-cryvern-after-effects.png')});
  const clip=await page.evaluate(()=>{const r=qaCryvern.root.getBounds();return {x:Math.max(0,Math.floor(r.x-18)),y:Math.max(0,Math.floor(r.y-18)),width:Math.max(1,Math.min(innerWidth-Math.max(0,Math.floor(r.x-18)),Math.ceil(r.width+36))),height:Math.max(1,Math.min(innerHeight-Math.max(0,Math.floor(r.y-18)),Math.ceil(r.height+55)))};});
  await page.screenshot({path:path.join(out,page.viewportSize().width+'-cryvern-detail.png'),clip});
  reports.push({width:page.viewportSize().width,...report});
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({errors,reports},null,2));assert.deepEqual(errors,[]);console.log('PASS: PC/mobile cooperative mercenaries visibly attack; Cryvern returns cleanly after authored effects.');
}catch(e){for(const page of pages)await page.screenshot({path:path.join(out,'failure-'+page.viewportSize().width+'.png')}).catch(()=>{});console.error(errors);throw e;}
finally{await browser.close();await h.dispose();}


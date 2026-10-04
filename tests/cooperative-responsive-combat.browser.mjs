import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import inputs from './fixtures/cooperative-mixed-speed-20261004.json' with {type:'json'};
import {candidate} from '../scripts/measure-berkan-balance.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await cooperativeMiniflare(),out=path.join(h.temp,'responsive-combat');
await fs.mkdir(out,{recursive:true});console.log('UI evidence:',out);
const squads=inputs.map(s=>({...structuredClone(s),mercenary:candidate(s.mercenaryCode)}));
const built=createCooperativeBattle({squads,difficulty:'HARD',seed:3375805316});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const reports=[],errors=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,isMobile:viewport.width<700,hasTouch:viewport.width<700,serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(h.origin+'/pve-v3/battle.html?content=idle-dungeon');await page.waitForFunction(()=>window.PveV3BattleBridge);
  await page.evaluate(async built=>{
   const css=document.createElement('link');css.rel='stylesheet';css.href='/raid/cooperative/style.css';document.head.append(css);
   const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;width:100%;height:100%';document.body.append(host);
   const {mountCoopBattle}=await import('/raid/cooperative/battle.mjs');
   window.qaController=await mountCoopBattle(host,built.payload);window.qaEngine=await ProjectVPixiBattle.mount();
   window.qaBuilt=built;window.qaSizes={};window.qaInterrupts=[];window.qaActions=[];
   const play=ProjectVPixiBattle.playEvents;
   ProjectVPixiBattle.playEvents=async(events,options)=>{qaActions.push({at:Date.now()-qaStarts,planned:events[0]?.combatAtMs,actor:events.find(e=>e.actorId)?.actorId});return play(events,options);};
   const settle=qaEngine.settlePendingTails.bind(qaEngine);
   qaEngine.settlePendingTails=actors=>{
    for(const a of actors.slice(0,1)){const entry=qaEngine.pendingTails.get(a);if(entry)qaInterrupts.push({id:a.id,time:entry.instance.time(),duration:entry.instance.duration()});}
    return settle(actors);
   };
   window.qaStarts=Date.now()+300;
   qaController.update({serverNow:Date.now(),state:{status:'ACTIVE',startsAt:qaStarts,fighters:built.states[0]},payload:built.payload});
   window.qaTimer=setInterval(()=>{
    const elapsed=Date.now()-qaStarts,frame=built.states.findLast(s=>s.atMs<=elapsed)||built.states[0];
    qaController.update({serverNow:Date.now(),state:{status:'ACTIVE',startsAt:qaStarts,fighters:frame}});
    for(const a of qaEngine.mercenaries){const s=a.fullBodySprite,fx=qaEngine.cryvernStates?.get(a)?.fx||qaEngine.berkanStates?.get(a)?.fx;
     (qaSizes[a.id]||=[]).push({at:elapsed,width:s.width,height:s.height,viewScale:a.view.scale.x,rootScale:a.root.scale.x,restScale:a.restScale,idle:s.texture===fx?.idle.texture,neutralScale:a.neutralAvatarPose.mainSprite.scaleX,fxIdle:fx?.idle.width,textureWidth:s.texture.width});
    }
   },50);
  },built);
  await page.waitForTimeout(12000);
  await page.screenshot({path:path.join(out,viewport.width+'-opening.png')});
  await page.waitForTimeout(19000);
  await page.screenshot({path:path.join(out,viewport.width+'-combat.png')});
  const report=await page.evaluate(()=>{clearInterval(qaTimer);const data={runtime:ProjectVPixiBattle.runtimeVersion,sizes:qaSizes,interrupts:qaInterrupts,actions:qaActions,pendingActions:qaController.diagnostics().pendingActions};qaController.destroy();return data;});
  reports.push({width:viewport.width,...report});
  console.log(JSON.stringify({width:viewport.width,sizes:Object.fromEntries(Object.entries(report.sizes).map(([id,rows])=>[id,{first:rows[0],last:rows.at(-1),maxWidth:Math.max(...rows.map(r=>r.width)),maxView:Math.max(...rows.map(r=>r.viewScale)),maxRoot:Math.max(...rows.map(r=>r.rootScale)),idleWidths:[...new Set(rows.filter(r=>r.idle).map(r=>Math.round(r.width)))]}])),earlyInterrupts:report.interrupts.filter(r=>r.time<.15).slice(0,12)}));
  console.log('Queue:',JSON.stringify({pending:report.pendingActions,maxDelay:Math.max(...report.actions.map(a=>a.at-a.planned)),slow:report.actions.filter(a=>a.at-a.planned>1500).slice(0,8)}));
  assert.equal(report.runtime,'20261005-coop-readable-v4');
  assert.ok(report.pendingActions<=4,'actor queues must not accumulate');
  assert.ok(report.actions.every(a=>a.at-a.planned<1600),'actions must remain close to shared server clock');
  for(const actor of [...built.payload.battleV2.teams.A.cards,...built.payload.battleV2.teams.A.mercenaries])assert.ok(report.actions.some(a=>a.actor===actor.id&&a.at<20000),'every card and mercenary must participate: '+actor.id);
  assert.equal(report.interrupts.filter(r=>r.id.includes('MERCENARY')&&r.time<.15).length,0,'another actor cannot cancel a mercenary windup');
  for(const rows of Object.values(report.sizes))for(const row of rows){assert.equal(row.viewScale,1);assert.equal(row.rootScale,row.restScale);}
  const cryvern=report.sizes['A:OWNER:3:MERCENARY:V-049'];
  for(const row of cryvern.filter(r=>r.idle&&r.at>500))assert.ok(Math.abs(row.width-380)<.01&&Math.abs(row.height-380)<.01,'idle SD dimensions cannot drift or stretch');
  await context.close();
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({reports,errors},null,2));assert.deepEqual(errors,[]);
}finally{await browser.close();await h.dispose();}

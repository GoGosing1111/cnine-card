import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import inputs from './fixtures/cooperative-mixed-speed-20261004.json' with {type:'json'};
import art from '../assets/ui/project-v/characters/fur/manifest-v2.json' with {type:'json'};
import {candidate} from '../scripts/measure-berkan-balance.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await cooperativeMiniflare(),out=path.join(h.temp,'card-visibility');
await fs.mkdir(out,{recursive:true});console.log('UI evidence:',out);
const cards=[inputs[0].cards[1],inputs[2].cards[0]].map(c=>({...structuredClone(c),image:art.characters.find(a=>a.cardId===c.id).sourceArt,breakthrough_level:15}));
const squads=inputs.map(s=>({...structuredClone(s),cards:structuredClone(cards),mercenary:candidate(s.mercenaryCode)}));
const built=createCooperativeBattle({squads,difficulty:'HARD',seed:3375805316});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const reports=[],errors=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,isMobile:viewport.width<700,hasTouch:viewport.width<700,serviceWorkers:'block'});
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(h.origin+'/pve-v3/battle.html?content=idle-dungeon');await page.waitForFunction(()=>window.PveV3BattleBridge);
  await page.evaluate(async built=>{
   const css=document.createElement('link');css.rel='stylesheet';css.href='/raid/cooperative/style.css';document.head.append(css);
   const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;width:100%;height:100%';document.body.append(host);
   const {mountCoopBattle}=await import('/raid/cooperative/battle.mjs');
   window.qaController=await mountCoopBattle(host,built.payload);window.qaEngine=await ProjectVPixiBattle.mount();
   window.qaBuilt=built;window.qaStarts=Date.now()+300;window.qaHidden=[];window.qaActions=[];window.qaFrames=[];
   const play=ProjectVPixiBattle.playEvents;
   ProjectVPixiBattle.playEvents=async(events,options)=>{qaActions.push({at:Date.now()-qaStarts,planned:events[0]?.combatAtMs,actor:events.find(e=>e.actorId)?.actorId});return play(events,options);};
   qaController.update({serverNow:Date.now(),state:{status:'ACTIVE',startsAt:qaStarts,fighters:built.states[0]},payload:built.payload});
   window.qaTimer=setInterval(()=>{
    const elapsed=Date.now()-qaStarts,frame=built.states.findLast(s=>s.atMs<=elapsed)||built.states[0];
    qaController.update({serverNow:Date.now(),state:{status:'ACTIVE',startsAt:qaStarts,fighters:frame}});
    const rows=qaEngine.allies.map(a=>({id:a.id,hp:a.hp,state:a.state,visible:a.root.visible,renderable:a.root.renderable,alpha:a.root.alpha,bodyVisible:a.fullBodySprite.visible,bodyAlpha:a.fullBodySprite.worldAlpha,viewAlpha:a.view.alpha,width:a.fullBodySprite.width,height:a.fullBodySprite.height,x:a.root.x,y:a.root.y}));
    if(elapsed>800)for(const row of rows)if(row.hp>0&&(!row.visible||!row.renderable||!row.bodyVisible||row.bodyAlpha<.05||row.width<1||row.height<1))qaHidden.push({at:elapsed,...row});
    if(qaFrames.length===0||elapsed-qaFrames.at(-1).at>2000)qaFrames.push({at:elapsed,pace:qaEngine.paceScale,rows});
   },250);
  },built);
  // Model a stale hidden body on two other squad members. A shared fighter
  // update must repair only their presentation, without resetting movement.
  await page.waitForTimeout(2000);
  await page.evaluate(()=>{for(const a of [qaEngine.allies[2],qaEngine.allies[5]]){a.root.visible=false;a.root.renderable=false;a.view.alpha=0;a.fullBodySprite.visible=false;}});
  await page.waitForTimeout(3000);await page.screenshot({path:path.join(out,viewport.width+'-opening.png')});
  await page.waitForTimeout(22000);await page.screenshot({path:path.join(out,viewport.width+'-combat.png')});
  const report=await page.evaluate(()=>{clearInterval(qaTimer);const report={width:innerWidth,hidden:qaHidden,frames:qaFrames,actions:qaActions,pace:qaEngine.paceScale,pending:qaController.diagnostics().pendingActions,roster:[...document.querySelectorAll('[data-v3-roster-art]')].map(img=>({src:img.src,loaded:img.complete&&img.naturalWidth>0}))};qaController.destroy();return report;});
  reports.push(report);console.log(JSON.stringify({...report,actions:report.actions.length,frames:undefined,hidden:report.hidden.slice(0,12)}));
  await context.close();
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({reports,errors},null,2));
 assert.deepEqual(errors,[]);
 for(const report of reports){assert.deepEqual(report.hidden,[],'living teammate bodies remain visible');assert.equal(report.roster.length,6);assert.ok(report.roster.every(r=>r.loaded&&!r.src.includes('cninelogo')));assert.equal(report.pace,1);assert.ok(report.pending<5);}
}finally{await browser.close();await h.dispose();}

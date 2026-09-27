import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=new URL('../',import.meta.url),payload=JSON.parse(fs.readFileSync(new URL('fixtures/v3-completion-payload-20260928.json',import.meta.url)));
const read=file=>process.env.V3_COMPLETION_BASELINE?execFileSync('git',['show',`${process.env.V3_COMPLETION_BASELINE}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:15e6}):fs.readFileSync(new URL(file,root),'utf8');
const browser=await chromium.launch({channel:'chrome',headless:true});
after(()=>browser.close());

for(const [mode,viewport] of [['PVE',{width:1440,height:1000}],['PVP',{width:390,height:844}]]){
 test(`${mode}: real result renderer idles, stays stopped across visibility changes and resumes on the next battle`,async t=>{
  const page=await browser.newPage({viewport,serviceWorkers:'block'}),errors=[];
  t.after(()=>page.close());page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');window.qaHidden=false;Object.defineProperty(document,'hidden',{get:()=>qaHidden});});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='http://battle.test'||url.pathname.startsWith('/api/'))return route.abort();
   if(url.pathname==='/preview/project-v-v3/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/card.css"><link rel="stylesheet" href="/css/battle-v2-live.css"><link rel="stylesheet" href="/css/battle-v3-live.css"><style>body{margin:0;background:#080c17;color:white}</style><div id="modal"></div></html>'});
   const file=new URL('.'+url.pathname,root);
   return file.href.startsWith(root.href)&&fs.existsSync(file)?route.fulfill({path:fileURLToPath(file)}):route.abort();
  });
  await page.goto('http://battle.test/preview/project-v-v3/');
  for(const file of ['js/project-v-battle-art-adapter-v1.js','js/project-v-tier-battle-art-adapter-v1.js','js/project-v-monster-battle-art-adapter-v1.js'])await page.addScriptTag({content:read(file)});
  await page.addScriptTag({content:read('preview/project-v-v3/project-v-pixi-battle.bundle.js')});
  await page.addScriptTag({content:read('js/battle-v3-live.js')});
  const result=await page.evaluate(async({mode,payload})=>{
   const api=ProjectVPixiBattle;
   for(const key of ['mountForBattle','resetSession']){const original=api[key];api[key]=async(...args)=>window.qaEngine=await original(...args);}
   const modal=document.getElementById('modal');
   if(mode==='PVP'){
    delete payload.monster;payload.battleV2.teams.B={...payload.battleV2.teams.A,cards:payload.battleV2.teams.A.cards.map(c=>({...c,id:c.id.replace(/^A:/,'B:'),side:'B'}))};
    payload.battleV2.result.timeline[0].targetId=payload.battleV2.teams.B.cards[0].id;
    payload.battleV2.result.final.B=payload.battleV2.teams.B.cards.map(c=>({id:c.id,hp:0,maxHp:c.maxHp}));
   }
   payload.mode=mode;payload.battlefieldMode=mode;
   const create=async()=>{
    const view=ProjectVBattleV3Live.prepareLoading({modal,mode,playerName:'검수 참가자',opponentName:'상대 진영'});
    return {view,renderer:await ProjectVBattleV3Live.createRenderer({...view,modal,mode,data:payload})};
   };
   const {renderer,view}=await create(),engine=qaEngine;
   let renders=0;const draw=engine.app.renderer.render.bind(engine.app.renderer);engine.app.renderer.render=(...args)=>{renders++;return draw(...args);};
   const sample=async()=>{const start=renders;await new Promise(r=>setTimeout(r,300));return {frames:renders-start,ticking:engine.app.ticker.started,actorLoops:engine.characters.filter(c=>c.animationController?.timeline?.isActive()).length};};
   const active=await sample();
   await renderer.play();
   view.msg.innerHTML=ProjectVBattleV3Live.resultHtml({mode,win:true,data:{...payload,result:'WIN',reward:100}});renderer.showResult();
   await new Promise(r=>setTimeout(r,100));
   const complete=await sample();
   qaHidden=true;document.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,0));
   qaHidden=false;document.dispatchEvent(new Event('visibilitychange'));
   const restored=await sample(),canvas=engine.app.canvas;
   const finalHp=engine.allies.filter(c=>c.battleActive!==false).map(c=>c.hp);
   window.qaNext=async()=>{
    renderer.destroy();const next=await create();
    const restarted=await sample(),sameEngine=qaEngine===engine,sameCanvas=qaEngine.app.canvas===canvas;
    // An immediate result/skip must stop even without play() completing.
    next.renderer.showResult();await new Promise(r=>setTimeout(r,100));const skipped=await sample();
    next.renderer.destroy();await new Promise(r=>setTimeout(r,100));const closed=await sample();
    return {restarted,sameEngine,sameCanvas,skipped,closed};
   };
   return {active,complete,restored,finalHp,resultVisible:view.stage.classList.contains('is-result-visible'),canvasVisible:canvas.isConnected&&canvas.getBoundingClientRect().width>0};
  },{mode,payload:structuredClone(payload)});
  t.diagnostic(JSON.stringify({mode,...result}));
  if(process.env.V3_COMPLETION_OUTPUT){fs.mkdirSync(process.env.V3_COMPLETION_OUTPUT,{recursive:true});await page.screenshot({path:`${process.env.V3_COMPLETION_OUTPUT}/${mode}-result.png`});fs.writeFileSync(`${process.env.V3_COMPLETION_OUTPUT}/${mode}-result.json`,JSON.stringify(result,null,2));}
  assert.ok(result.active.frames>0&&result.active.ticking);
  assert.deepEqual(result.complete,{frames:0,ticking:false,actorLoops:0});
  assert.deepEqual(result.restored,{frames:0,ticking:false,actorLoops:0});
  assert.ok(result.resultVisible&&result.canvasVisible);assert.ok(result.finalHp.every(hp=>hp===100));
  const next=await page.evaluate(()=>qaNext());t.diagnostic(JSON.stringify({mode,...next}));
  assert.ok(next.restarted.frames>0&&next.restarted.ticking&&next.restarted.actorLoops>0);assert.ok(next.sameEngine&&next.sameCanvas);
  for(const state of [next.skipped,next.closed])assert.deepEqual(state,{frames:0,ticking:false,actorLoops:0});
  assert.deepEqual(errors,[]);
 });
}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROLES } from '../../shared/mercenary-advancement-v1.mjs';
import { createPveBattleV2 } from '../../functions/_battle_v2_preview.js';
import { limitedDeploymentSnapshot } from '../../shared/mercenary-limited-deployment-v1.mjs';
import { operatingMercenaries, tierCards } from './mercenary-operating-roster-v2144.mjs';

const css=['style','card','battle-v3-live','zenith-v1','superstar-v1','faker-card-v1','breakthrough-tier-v1802'];
const scripts=['/js/project-v-battle-art-adapter-v1.js','/js/project-v-tier-battle-art-adapter-v1.js','/js/project-v-monster-battle-art-adapter-v1.js',
  '/js/project-v-unassigned-battle-fallback-v1.js','/preview/project-v-v3/project-v-pixi-battle.bundle.js','/js/battle-v3-live.js'];
export const stageMarkup=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  ${css.map(s=>'<link rel="stylesheet" href="/css/'+s+'.css">').join('')}
  <style>body{margin:0;background:#07101b}#modal{height:100dvh}</style>${scripts.map(s=>'<script defer src="'+s+'"></script>').join('')}<body><div id="modal"></div></body></html>`;
export async function checkPlayback({page,origin,root,out,mobile}){
  const payload=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/v3-completion-payload-20260928.json')));
  const mercenary={...limitedDeploymentSnapshot('V-996'),combat:operatingMercenaries[0].combat,advancementId:'barrier'};
  const result=createPveBattleV2({cards:tierCards(90000),mercenary,monster:{id:'TRAIN',name:'검수',hp:2400000,power:320000},seed:27113});
  const opening=result.result.timeline.find(e=>e.type==='MERCENARY_ADVANCEMENT'&&e.roleId==='barrier');
  assert.ok(opening);
  payload.battleV2.teams.A.mercenaries=result.teams.A.mercenaries;
  payload.battleV2.teams.A.supports=[];payload.battleV2.teams.B.supports=[];payload.battleV2.result={timeline:[],winner:null};
  payload.v3RenderContext={accountBattleUnitPve:false};
  await page.goto(origin+'/battle-advancement-qa/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.ProjectVBattleV3Live&&window.ProjectVPixiBattle);
  const mountMs=await page.evaluate(async payload=>{
    const start=performance.now(),modal=document.querySelector('#modal'),live=window.ProjectVBattleV3Live;
    const view=live.prepareLoading({modal,mode:'HUNT',playerName:'전직 검수',opponentName:'검수 상대'});
    const mount=ProjectVPixiBattle.mountForBattle;
    ProjectVPixiBattle.mountForBattle=async(...args)=>(window.qaEngine=await mount(...args));
    try{window.qaRenderer=await live.createRenderer({...view,modal,data:payload,mode:'HUNT',playerName:'전직 검수',opponentName:'검수 상대'});}
    finally{ProjectVPixiBattle.mountForBattle=mount;}
    await qaEngine.deployCards({instant:true,force:true});
    window.qaSprites=[];const layer=qaEngine.effectLayer,add=layer.addChild.bind(layer);
    layer.addChild=(...sprites)=>{for(const sprite of sprites)if(sprite.label?.startsWith('MERCENARY_ADVANCEMENT'))qaSprites.push({label:sprite.label,t:performance.now()});return add(...sprites);};
    return Math.round(performance.now()-start);
  },payload);
  const info=await page.evaluate(async({opening,roles})=>{
    const e=window.qaEngine, actor=opening.actorId,target=e.enemies[0].id, ally=e.allies[0].id;
    let seq=opening.revision+1;
    function send(id,extra={}){return e.playEvents([{type:'MERCENARY_ADVANCEMENT',actorId:actor,targetId:target,roleId:id,revision:++seq,...extra}]);}
    async function frame(){await new Promise(resolve=>requestAnimationFrame(resolve));}
    async function waitFor(f){const start=performance.now();while(!f()){if(performance.now()-start>8000)throw Error('전투 이펙트 시간 초과 '+JSON.stringify(qaSprites.slice(-2)));await frame();}}
    const stats=async effect=>{
      const dt=[],start=performance.now();let prev=start;
      if(effect)await send('barrier');
      while(performance.now()-start<800){await frame();const t=performance.now();dt.push(t-prev);prev=t;}
      dt.sort((a,b)=>a-b);return {n:dt.length,p95Ms:+dt[Math.floor(dt.length*.95)].toFixed(1),over50:dt.filter(t=>t>50).length,maxMs:+dt.at(-1).toFixed(1)};
    };
    const initialResources=performance.getEntriesByType('resource').filter(r=>r.name.includes('/mercenary-advancement-v1/')).length;
    const start=performance.now();await e.playEvents([opening]);
    await waitFor(()=>qaSprites.some(s=>s.label==='MERCENARY_ADVANCEMENT_FX:barrier'));
    const firstVisibleMs=Math.round(performance.now()-start);
    for(const id of roles){const n=qaSprites.length;await send(id,{targetId:id==='guardian'||id==='healer'?ally:target});await waitFor(()=>qaSprites.slice(n).some(s=>s.label==='MERCENARY_ADVANCEMENT_FX:'+id));await waitFor(()=>!e.effectLayer.children.some(s=>s.label==='MERCENARY_ADVANCEMENT_FX:'+id));}
    const count=id=>e.effectLayer.children.filter(s=>s.label==='MERCENARY_ADVANCEMENT_STATE:'+id).length;
    await send('shield-knight',{targetId:actor,remaining:3,burst:false});await waitFor(()=>count('shield-knight')===3);
    await send('shield-knight',{targetId:actor,remaining:1,burst:false});await waitFor(()=>count('shield-knight')===1);
    await send('shield-knight',{targetId:actor,remaining:0,burst:false});await waitFor(()=>!count('shield-knight'));
    await send('avenger',{targetId:actor,charged:true,burst:false});await waitFor(()=>count('avenger')===1);
    await send('avenger',{targetId:actor,charged:false,burst:false});await waitFor(()=>!count('avenger'));
    await send('commander',{targetId:actor,allyIds:[actor,ally],active:true,burst:false});await waitFor(()=>count('commander')>=2);
    await send('commander',{targetId:actor,active:false,burst:false});await waitFor(()=>!count('commander'));
    await waitFor(()=>!e.effectLayer.children.some(s=>s.label?.startsWith('MERCENARY_ADVANCEMENT')));
    const idle=await stats(false),burst=await stats(true);
    const canvas=document.querySelectorAll('canvas').length;const system=e.app.renderer.gl,ext=system?.getExtension('WEBGL_debug_renderer_info');
    const graphics=ext?system.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unreported';
    await send('commander',{targetId:actor,allyIds:[actor,ally],active:true,burst:false});await waitFor(()=>count('commander')>=2);
    const before=e.simpleTimelines.size;
    window.qaRenderer.destroy();await new Promise(resolve=>setTimeout(resolve,250));
    const remaining=e.effectLayer?.children?.filter(s=>s.label?.startsWith('MERCENARY_ADVANCEMENT')).length||0;
    return {initialResources,firstVisibleMs,roles:[...new Set(qaSprites.filter(s=>s.label.includes('_FX:')).map(s=>s.label.split(':')[1]))],states:3,
      canvas,graphics,idle,burst,beforeHideTimelines:before,remainingSprites:remaining,remainingTimelines:e.simpleTimelines.size,visible:e.visible};
  },{opening,roles:ROLES.map(r=>r.id)});
  assert.equal(info.roles.length,16);assert.equal(info.remainingSprites,0);assert.equal(info.remainingTimelines,0);assert.equal(info.initialResources,0);assert.equal(info.canvas,1);
  return {name:mobile?'battle-mobile':'battle-pc',mountMs,...info};
}

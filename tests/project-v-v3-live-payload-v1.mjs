import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bridge=fs.readFileSync(new URL('../js/battle-v3-live.js',import.meta.url),'utf8');
const engine=fs.readFileSync(new URL('../preview/project-v-v3/source/battle/BattleEngine.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const serviceWorker=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
const battleCss=fs.readFileSync(new URL('../css/battle-v3-live.css',import.meta.url),'utf8');

assert.equal(bridge.includes('/assets/effects/Anime.mp4'),false,'live bridge must never load preview ultimate media');
assert.equal(bridge.includes('pvUltimateVideo'),false,'live bridge must not render the preview ultimate player');
assert.match(bridge,/mountForBattle\(payload, host\)[\s\S]*setBattlefield\(mode\)[\s\S]*setVisible\(true\)[\s\S]*assertFirstFrame/,'server payload, battlefield and first WebGL frame must be ready before playback');
assert.match(bridge,/payload\?\.activatedUltimate[\s\S]*playBattleUltimate/,'player ultimate must use server CMS configuration');
assert.match(bridge,/payload\?\.bossUltimate[\s\S]*playBossBattleUltimate/,'boss ultimate must use server CMS configuration');
assert.match(bridge,/ultimateSourceCard[\s\S]*actorId/,'player ultimate must resolve its configured source card');
assert.match(bridge,/playerUltimateShown = false/,'player cinematic must be protected from repeated playback');
assert.match(bridge,/bossUltimateShown = false/,'boss cinematic must be protected from repeated playback');
assert.doesNotMatch(bridge,/INIT_WATCHDOG_MS|EVENT_WATCHDOG_MS/,'cold mobile loading must not destroy a healthy renderer on an arbitrary deadline');
assert.doesNotMatch(bridge,/recoverRenderer/,'renderer failure must never jump directly to the server result');
assert.match(bridge,/const PLAYBACK_SPEED = 1\.3/,'the V3 runtime speed must be 1.3x');
assert.match(bridge,/for \(let attempt = 0; attempt < 2;/,'WebGL initialization must retry once after an explicit failure');
assert.match(bridge,/battle-v3-preparing/,'the battlefield shell must identify its first-frame state');
assert.match(bridge,/stage\.classList\.add\('is-v3-ready'\);[\s\S]*revealBattle\(\)/,'the modal may reveal only after the renderer is ready');
assert.match(bridge,/durationMs: Math\.max\(320, Math\.round\(baseDuration \/ PLAYBACK_SPEED\)\)/,'CMS cinematics must use the same 1.3x clock');
assert.doesNotMatch(battleCss,/:has\(canvas\) \.battle-v3-loader/,'a canvas alone must never hide the loader before assets are ready');
assert.match(battleCss,/is-v3-ready \.battle-v3-loader/,'the loader may hide only after the renderer is ready');
assert.match(battleCss,/\.battle-v3-modal\.battle-v3-preparing\{opacity:1!important;pointer-events:auto!important/,'the selected battlefield must be visible while Pixi commits its first frame');

assert.equal(engine.includes('FSM/타격 객체 풀 사용'),false,'internal engine implementation text must not reach players');
assert.match(engine,/this\.livePayload=Boolean\(payload\?\.battleV2\)/,'engine must distinguish authoritative live payloads');
assert.match(engine,/card\.visible=!this\.livePayload/,'preview cards must be hidden for live PVE and PVP');
assert.match(engine,/if\(!this\.livePayload&&this\.cards\.every/,'visibility must not auto-deploy a live formation');
assert.match(engine,/if\(this\.livePayload&&this\.liveDeployed&&!force\)/,'live formations must deploy exactly once outside the explicit QC replay');
assert.match(engine,/this\.playEvents\(\[\{type:'DEPLOY'\}\],\{forceDeploy:true\}\)/,'QC replay must force the five-actor formation back through DEPLOY after rewinding alpha');
assert.match(engine,/root\.visible=true;\s*root\.renderable=true;\s*if\(this\.livePayload\)/,'forced QC deploy must restore both Pixi visibility gates before alpha animation');
assert.match(engine,/this\.cards\.filter\(card=>card\.visible&&card\.renderable\)/,'hidden preview cards must not animate into live PVP');
assert.match(engine,/const liveActor=explicitActor\|\|\(this\.livePayload/,'live ultimates must not fall back to the preview-only actor');
assert.match(engine,/instance\.timeScale\(Number\.isFinite\(requestedScale\)&&requestedScale>0[\s\S]*\?requestedScale[\s\S]*:this\.reducedMotion\?8:PLAYBACK_SPEED\*\(this\.paceScale\|\|1\)\)/,'Pixi timelines must honor fixed clocks and otherwise use the 1.3x paced clock');
assert.match(engine,/this\.textures=Object\.fromEntries\(Object\.keys\(ASSETS\)/,'live battles must skip the preview asset bundle');
assert.match(engine,/const unique=\[\.\.\.new Set\(preloadUrls\)\]\.filter\(Boolean\);[\s\S]*Promise\.allSettled\(unique\.map\(url=>Assets\.load\(url\)\)\)/,'live card and monster assets must load concurrently');
assert.match(engine,/onInterrupt:\(\)=>settle\(false\)/,'interrupted GSAP timelines must settle instead of hanging');

assert.match(app,/project-v-pixi-battle\.bundle\.js\?v=98-gilded-dragon-battle-suit/);
assert.match(app,/battle-v3-live\.js\?v=3\.30\.0-battle-suit-per-action-fire/);
assert.equal(app.includes('battle-resource-loader'),false,'the renewed V3 flow must never show the old resource loading battlefield');
assert.match(app,/const resourceTask=ensureFeatureResources\('battleV2'\)[\s\S]*const fightTask=apiRequest\('battle\/fight'[\s\S]*await Promise\.all\(\[resourceTask,fightTask\]\)[\s\S]*const live=window\.prepareBattleV2LiveLoading/,'PVE must finish its parallel resource and server work before revealing the ready V3 scene');
assert.match(app,/const d=await apiRequest\('pvp\/fight'[\s\S]*const live=window\.prepareBattleV2LiveLoading/,'PVP must calculate first and reveal only the ready V3 scene');
assert.match(app,/window\.playBattleUltimate=playBattleUltimate/);
assert.match(app,/window\.playBossBattleUltimate=playBossBattleUltimate/);
assert.match(index,/js\/app\.js\?v=2032-ranked-challenger/);
assert.match(serviceWorker,/soop-card-shell-v2032-ranked-challenger/);

const calls=[];
const phase={textContent:''};
const status={textContent:''};
const loader={remove:()=>calls.push(['loader-remove'])};
const modal={classList:{remove:value=>calls.push(['modal-remove',value])}};
const stage={
  classList:{add:(...values)=>calls.push(['stage-add',...values]),remove:(...values)=>calls.push(['stage-remove',...values])},
  querySelector(selector){
    if(selector==='#battlePhase')return phase;
    if(selector==='#pvBattleStatus')return status;
    return null;
  },
  querySelectorAll:()=>[]
};
const canvas={width:1600,height:820,getContext:()=>({isContextLost:()=>false})};
const host={querySelector:selector=>selector==='canvas'?canvas:loader,querySelectorAll:()=>[]};
const context={
  console,
  setTimeout,
  clearTimeout,
  requestAnimationFrame:callback=>{callback(0);return 1},
  Promise,
  document:{querySelectorAll:()=>[]},
  window:null,
  ProjectVPixiBattle:{
    destroy:()=>calls.push(['destroy']),
    mount:async()=>calls.push(['mount']),
    setBattlePayload:async payload=>calls.push(['payload',payload.mode]),
    setBattlefield:async mode=>calls.push(['field',mode]),
    setVisible:async value=>calls.push(['visible',value]),
    playEvents:async events=>calls.push(['events',events.map(event=>({...event}))])
  },
  playBattleUltimate:async(_stage,ultimate,damage)=>calls.push(['player-cms',ultimate.name,damage,ultimate.playbackRate,ultimate.durationMs]),
  playBossBattleUltimate:async(_stage,_phase,ultimate)=>calls.push(['boss-cms',ultimate.name,ultimate.playbackRate,ultimate.durationMs])
};
context.window=context;
vm.runInNewContext(bridge,context,{filename:'battle-v3-live.js'});
const runtime=context.ProjectVBattleV3Live;
const renderer=await runtime.createRenderer({
  stage,host,modal,mode:'PVE',playUltimateCinematics:true,
  data:{
    activatedUltimate:{name:'CMS USER ULTIMATE'},
    ultimateSourceCard:{id:'CARD-CMS-01'},
    bossUltimate:{name:'CMS BOSS ULTIMATE'},
    battleV2:{teams:{B:{cards:[{id:'MONSTER:7',cardId:'MONSTER:7',grade:'MONSTER'}]}},result:{timeline:[
      {type:'PVE_ULTIMATE',targetId:'MONSTER:7',damage:777},
      {type:'PVE_ULTIMATE',targetId:'MONSTER:7',damage:333},
      {type:'BOSS_ULTIMATE',hits:[]},
      {type:'BOSS_ULTIMATE',hits:[]}
    ]}}
  }
});
await renderer.play();
assert.deepEqual(calls.slice(0,4).map(call=>call[0]),['mount','payload','field','visible'],'live initialization order');
assert.deepEqual(calls[4],['stage-add','is-v3-ready'],'ready class must be set before revealing the modal');
assert.deepEqual(calls[5],['modal-remove','battle-v3-preparing'],'the modal must reveal only after its first authoritative frame');
assert.equal(calls.filter(call=>call[0]==='player-cms').length,1,'CMS user ultimate must play once');
assert.equal(calls.filter(call=>call[0]==='boss-cms').length,1,'CMS boss ultimate must play once');
const playerUltimateCall=calls.find(call=>call[0]==='player-cms');
const bossUltimateCall=calls.find(call=>call[0]==='boss-cms');
assert.deepEqual(playerUltimateCall.slice(1),['CMS USER ULTIMATE',777,1.3,2308],'CMS user ultimate must use the 1.3x clock');
assert.deepEqual(bossUltimateCall.slice(1),['CMS BOSS ULTIMATE',1.3,1846],'CMS boss ultimate must use the 1.3x clock');
const eventCalls=calls.filter(call=>call[0]==='events');
assert.equal(eventCalls.length,5,'deploy plus four server timeline events');
assert.equal(eventCalls[1][1][0].actorId,'CARD-CMS-01');
assert.equal(eventCalls[1][1][0].label,'CMS USER ULTIMATE');
assert.equal(eventCalls[3][1][0].actorId,'MONSTER:7');
assert.equal(eventCalls[3][1][0].label,'CMS BOSS ULTIMATE');

console.log('project-v-v3 live payload contract: OK');

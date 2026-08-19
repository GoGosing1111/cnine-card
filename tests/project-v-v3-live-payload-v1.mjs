import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bridge=fs.readFileSync(new URL('../js/battle-v3-live.js',import.meta.url),'utf8');
const engine=fs.readFileSync(new URL('../preview/project-v-v3/source/battle/BattleEngine.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const serviceWorker=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');

assert.equal(bridge.includes('/assets/effects/Anime.mp4'),false,'live bridge must never load preview ultimate media');
assert.equal(bridge.includes('pvUltimateVideo'),false,'live bridge must not render the preview ultimate player');
assert.match(bridge,/setBattlePayload\(payload\)[\s\S]*setBattlefield\(mode\)[\s\S]*setVisible\(true\)/,'server payload and battlefield must be ready before first visible frame');
assert.match(bridge,/payload\?\.activatedUltimate[\s\S]*playBattleUltimate/,'player ultimate must use server CMS configuration');
assert.match(bridge,/payload\?\.bossUltimate[\s\S]*playBossBattleUltimate/,'boss ultimate must use server CMS configuration');
assert.match(bridge,/ultimateSourceCard[\s\S]*actorId/,'player ultimate must resolve its configured source card');
assert.match(bridge,/playerUltimateShown = false/,'player cinematic must be protected from repeated playback');
assert.match(bridge,/bossUltimateShown = false/,'boss cinematic must be protected from repeated playback');
assert.match(bridge,/withTimeout\(root\.ProjectVPixiBattle\.setBattlePayload/,'asset synchronization needs a bounded failure state');

assert.equal(engine.includes('FSM/타격 객체 풀 사용'),false,'internal engine implementation text must not reach players');
assert.match(engine,/this\.livePayload=Boolean\(payload\?\.battleV2\)/,'engine must distinguish authoritative live payloads');
assert.match(engine,/card\.visible=!this\.livePayload/,'preview cards must be hidden for live PVE and PVP');
assert.match(engine,/if\(!this\.livePayload&&this\.cards\.every/,'visibility must not auto-deploy a live formation');
assert.match(engine,/if\(this\.livePayload&&this\.liveDeployed\)/,'live formations must deploy exactly once');
assert.match(engine,/this\.cards\.filter\(card=>card\.visible&&card\.renderable\)/,'hidden preview cards must not animate into live PVP');
assert.match(engine,/const liveActor=explicitActor\|\|\(this\.livePayload/,'live ultimates must not fall back to the preview-only actor');

assert.match(app,/project-v-pixi-battle\.bundle\.js\?v=44-cms-payload-runtime/);
assert.match(app,/battle-v3-live\.js\?v=3\.0\.1-cms-live/);
assert.match(app,/window\.playBattleUltimate=playBattleUltimate/);
assert.match(app,/window\.playBossBattleUltimate=playBossBattleUltimate/);
assert.match(index,/js\/app\.js\?v=1762-v3-cms-payload-fix/);
assert.match(serviceWorker,/soop-card-shell-v1762-v3-cms-payload-fix/);

const calls=[];
const phase={textContent:''};
const status={textContent:''};
const loader={classList:{add:value=>calls.push(['loader-class',value])}};
const stage={
  classList:{add:value=>calls.push(['stage-class',value])},
  querySelector(selector){
    if(selector==='#battlePhase')return phase;
    if(selector==='#pvBattleStatus')return status;
    return null;
  }
};
const host={querySelector:()=>loader};
const context={
  console,
  setTimeout,
  clearTimeout,
  Promise,
  window:null,
  ProjectVPixiBattle:{
    destroy:()=>calls.push(['destroy']),
    mount:async()=>calls.push(['mount']),
    setBattlePayload:async payload=>calls.push(['payload',payload.mode]),
    setBattlefield:async mode=>calls.push(['field',mode]),
    setVisible:async value=>calls.push(['visible',value]),
    playEvents:async events=>calls.push(['events',events.map(event=>({...event}))])
  },
  playBattleUltimate:async(_stage,ultimate,damage)=>calls.push(['player-cms',ultimate.name,damage]),
  playBossBattleUltimate:async(_stage,_phase,ultimate)=>calls.push(['boss-cms',ultimate.name])
};
context.window=context;
vm.runInNewContext(bridge,context,{filename:'battle-v3-live.js'});
const runtime=context.ProjectVBattleV3Live;
const renderer=await runtime.createRenderer({
  stage,host,mode:'PVE',playUltimateCinematics:true,
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
assert.deepEqual(calls.slice(0,5).map(call=>call[0]),['destroy','mount','payload','field','visible'],'live initialization order');
assert.equal(calls.filter(call=>call[0]==='player-cms').length,1,'CMS user ultimate must play once');
assert.equal(calls.filter(call=>call[0]==='boss-cms').length,1,'CMS boss ultimate must play once');
const eventCalls=calls.filter(call=>call[0]==='events');
assert.equal(eventCalls.length,5,'deploy plus four server timeline events');
assert.equal(eventCalls[1][1][0].actorId,'CARD-CMS-01');
assert.equal(eventCalls[1][1][0].label,'CMS USER ULTIMATE');
assert.equal(eventCalls[3][1][0].actorId,'MONSTER:7');
assert.equal(eventCalls[3][1][0].label,'CMS BOSS ULTIMATE');

console.log('project-v-v3 live payload contract: OK');

import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {Container} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleSuitSkillChipPlayback} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {SKILL_CHIP_CLOCK} from '../shared/battle-suit-skill-chips.mjs';
after(()=>gsap.ticker.sleep());
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('zero-budget saved cinematics finish in server order instead of hiding concurrent boss casts',async()=>{
 const seen=[],release=[];
 const engine={visible:true,playbackEpoch:1,paceScale:1,mobile:false,audio:{enabled:()=>false},combatLayer:new Container(),effectLayer:new Container(),stage:new Container(),enemies:[],
  combatantById:()=>null,updateStatus(){},playEvents:async([event])=>{seen.push(event.skillCode||event.type);await new Promise(resolve=>release.push(resolve));}};
 const events=[{type:'MERCENARY_LEONEL_AREA'},...['SAHYEON_SEAL','SAHYEON_CURSE','SAHYEON_ULTIMATE'].map(skillCode=>({type:'APOCALYPSE_SKILL',skillCode})),{type:'MERCENARY_JINMU_AREA'}]
  .map((e,i)=>({...e,seq:i+1,combatClock:SKILL_CHIP_CLOCK,combatAtMs:0,combatGroup:i,combatGroupDurationMs:0}));
 const playback=new BattleSuitSkillChipPlayback(engine,events),run=playback.play();
 try{
  await playback.ready;playback.timeline.pause();await flush();
  for(let i=0;i<events.length;i++){
   assert.deepEqual(seen,events.slice(0,i+1).map(e=>e.skillCode||e.type),'only the next authoritative action starts');
   release.shift()();await flush();
  }
  assert.equal(await run,true);
 }finally{playback.cancel();for(const done of release)done();}
});

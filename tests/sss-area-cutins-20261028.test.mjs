import test from 'node:test';
import assert from 'node:assert/strict';
import {Container,Texture,TextureSource} from 'pixi.js';
import {AREA_CUTIN_PROFILES,AREA_CUTIN_DURATION,resolveAreaCutin,claimAreaCutin,areaCutinBattleKey} from '../shared/mercenary-area-cutins-v1.mjs';
import {withMercenaryAreaPresentation,clearMercenaryAreaPresentation,cancelMercenaryAreaPresentation} from '../preview/project-v-v3/source/battle/MercenaryAreaCutinPlayback.js';
import {BattleSuitSkillChipPlayback} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {SKILL_CHIP_CLOCK} from '../shared/battle-suit-skill-chips.mjs';
const actor=p=>({id:'A:MERCENARY:'+p.code,cardId:p.code,isMercenary:true,team:'ALLY',root:{destroyed:false},cutInTexture:new Texture({source:new TextureSource({width:1024,height:1536})})});
const event=(p,s)=>({type:p.event,battleMode:'PVE',actorId:'A:MERCENARY:'+p.code,skillId:p.code==='V-971'?'MS-929':s.id,visualMode:s.visualMode,hits:[{targetId:'B:0',damage:50,targetHpAfter:50}]});
function engine(){return {battleData:{mode:'HUNT',battleId:'one'},playbackEpoch:1,mercenaryEpoch:1,visible:true,effectLayer:new Container(),app:{screen:{width:1440,height:800}},combatantById:()=>({team:'ENEMY',root:{destroyed:false}}),timelineCount:0,async timeline(build,cleanup){this.timelineCount++;build({to:(clock,options)=>{clock.time=.5;options.onUpdate();}});cleanup();return true;}};}

test('all 16 current area presentations resolve while basics, PVP and unrelated events do not',()=>{
 assert.equal(AREA_CUTIN_PROFILES.flatMap(p=>p.skills).length,16);
 for(const p of AREA_CUTIN_PROFILES){const a=actor(p);for(const s of p.skills){const e=event(p,s);assert.equal(resolveAreaCutin(e,a).skill.name,s.name);assert.equal(resolveAreaCutin({...e,battleMode:'PVP'},a),null);assert.equal(resolveAreaCutin({...e,type:'ATTACK'},a),null);assert.equal(resolveAreaCutin({...e,skillId:'unknown'},a),null);assert.equal(resolveAreaCutin({...e,hits:[]},a),null);}a.cutInTexture.destroy(true);}
});
test('each actor gets exactly one strip in a battle across all successive area skills',async()=>{
 const e=engine();let delegated=0;
 for(const p of AREA_CUTIN_PROFILES){const a=actor(p);const before=e.timelineCount;for(const s of [...p.skills,...p.skills]){const receipt=event(p,s),original=structuredClone(receipt);assert.equal(await withMercenaryAreaPresentation(e,receipt,a,()=>{delegated++;return true;}),true);assert.deepEqual(receipt,original);assert.equal(e.activeMercenaryAreaCutin,null);}assert.equal(e.timelineCount-before,1);assert.equal(e.effectLayer.children.length,0);a.cutInTexture.destroy(true);}
 assert.equal(delegated,32);assert.equal(e.timelineCount,5);clearMercenaryAreaPresentation(e);
});
test('cancellation and actor recreation retain the allowance; a new battle resets it',async()=>{
 const p=AREA_CUTIN_PROFILES[0],a=actor(p),ev=event(p,p.skills[0]),e=engine();
 await withMercenaryAreaPresentation(e,ev,a,()=>true);cancelMercenaryAreaPresentation(e);e.playbackEpoch++;clearMercenaryAreaPresentation(e);
 e.battleData={mode:'HUNT',battleId:'one'};await withMercenaryAreaPresentation(e,ev,a,()=>true);assert.equal(e.timelineCount,1);
 e.battleData={mode:'HUNT',battleId:'two'};await withMercenaryAreaPresentation(e,ev,a,()=>true);assert.equal(e.timelineCount,2);clearMercenaryAreaPresentation(e);a.cutInTexture.destroy(true);
});
test('two owners of the same mercenary have separate once-only allowances',()=>{
 const s={shown:new Set()},p=AREA_CUTIN_PROFILES[0],a=actor(p),b={...a,id:'A:OWNER2:MERCENARY:'+p.code};
 assert.equal(claimAreaCutin(s,a),true);assert.equal(claimAreaCutin(s,a),false);assert.equal(claimAreaCutin(s,b),true);a.cutInTexture.destroy(true);
 assert.equal(areaCutinBattleKey({mode:'HUNT',battleId:'abc'}),'HUNT:abc');
});
test('missing optional portrait and missing targets cannot suppress or add authoritative damage',async()=>{
 const p=AREA_CUTIN_PROFILES[1],a=actor(p),e=engine();a.cutInTexture.destroy(true);a.cutInTexture=null;let applied=0;
 await withMercenaryAreaPresentation(e,event(p,p.skills[0]),a,()=>{applied++;return true;});assert.equal(applied,1);assert.equal(e.timelineCount,0);
 e.combatantById=()=>null;await withMercenaryAreaPresentation(e,event(p,p.skills[1]),a,()=>{applied++;return true;});assert.equal(applied,2);assert.equal(e.timelineCount,0);clearMercenaryAreaPresentation(e);
});
test('an interrupted intro never starts the deferred attack and does not replay on recovery',async()=>{
 const p=AREA_CUTIN_PROFILES[2],a=actor(p),e=engine(),ev=event(p,p.skills[0]);let hits=0;
 e.timeline=async function(build,cleanup){this.timelineCount++;build({to(){}});this.playbackEpoch++;cleanup();return false;};
 assert.equal(await withMercenaryAreaPresentation(e,ev,a,()=>{hits++;return true;}),false);assert.equal(hits,0);
 assert.equal(await withMercenaryAreaPresentation(e,ev,a,()=>{hits++;return true;}),true);assert.equal(hits,1);assert.equal(e.timelineCount,1);clearMercenaryAreaPresentation(e);a.cutInTexture.destroy(true);
});
test('the user-selected cut-in is brief and contains no extra title or dialogue card',()=>{
 assert.equal(AREA_CUTIN_DURATION,1.15);
 assert.equal(new Set(AREA_CUTIN_PROFILES.map(p=>p.dialogue.theme)).size,5);
 for(const p of AREA_CUTIN_PROFILES){assert(p.dialogue.lines.length);assert(p.dialogue.theme.startsWith('sss-'));assert.equal(p.dialogue.portrait,p.art);assert(p.face.every(v=>v>0&&v<1));}
});

test('the combat clock waits for every selected ultimate before dispatching the next normal action',async()=>{
 for(const p of AREA_CUTIN_PROFILES){
  const events=[{type:p.event,combatClock:SKILL_CHIP_CLOCK,combatAtMs:0,combatGroup:'area',hits:[]},{type:'ATTACK',combatClock:SKILL_CHIP_CLOCK,combatAtMs:0,combatGroup:'after'}],calls=[];
  let release;const pending=new Promise(r=>{release=r;});
  const e={visible:true,playbackEpoch:1,combatantById:()=>null,playEvents:async rows=>{calls.push(rows[0].type);if(rows[0].type===p.event)await pending;}};
  const clock=new BattleSuitSkillChipPlayback(e,events);clock.finish=()=>{clock.active=false;};
  assert.equal(clock.groups[0].blocking,true);clock.pump();
  await new Promise(r=>setImmediate(r));assert.deepEqual(calls,[p.event]);
  release();await new Promise(r=>setImmediate(r));assert.deepEqual(calls,[p.event,'ATTACK']);assert.equal(clock.pending.size,0);
 }
});

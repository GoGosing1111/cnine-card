import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFighter,simulateBattleV2Preview,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {ICON_ROLES,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {skillChipCombatEventMs} from '../shared/battle-suit-skill-chips.mjs';
import {SKILL_CHIP_CLOCK} from '../shared/battle-suit-skill-chips.mjs';
import {BattleSuitSkillChipPlayback} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {gsap} from 'gsap';
after(()=>gsap.ticker.sleep());

const fixture=JSON.parse(fs.readFileSync(new URL('./helpers/icon-apocalypse-20261006.json',import.meta.url)));
const live=JSON.parse(fs.readFileSync(new URL('./helpers/icon-cadence-roles-20261006.json',import.meta.url)));
export function iconActor(def,slot,side,{mode='PVP',gear=500000}={}){
 const card={id:def.cardId,title:def.name,grade:'ICON',power:180000,equipmentShare:gear,effectivePower:180000+gear};
 card.iconRole={...iconRoleSnapshot(card,live.document,mode,live.revision),supremacy:fixture.iconArgs.cards[2].iconRole.supremacy};
 return buildFighter(card,slot,side,null,mode);
}
const actions=(result,id)=>result.timeline.filter(e=>e.actorId===id&&(['TURN','ICON_SKILL'].includes(e.type)||e.type==='ICON_STATUS'&&e.status==='CHANNEL'));
function durable(actor){actor.hp=actor.maxHp=1e12;actor.attack=1;actor.defense=1e12;actor.shield=actor.maxShield=0;return actor;}

test('all seven ICONs receive proportional turns on both sides below the old speed threshold',()=>{
 for(const def of ICON_ROLES)for(const gear of [100000,500000]){
  const ally=ICON_ROLES.find(d=>d.cardId!==def.cardId&&d.role!=='ASSAULT');
  const team=side=>[iconActor(def,0,side,{gear}),iconActor(ally,1,side,{gear}),...Array.from({length:3},(_,i)=>buildFighter({id:'neutral-'+i,grade:'ZENITH',power:180000+gear},i+2,side))].map(durable);
  const a=team('A'),b=team('B');
  // No skill or damage feedback: measure speed scheduling alone.
  for(const x of [...a,...b])x.apocalypseStatus={seal:{remaining:1000}};
  const result=simulateBattleV2Preview({teamA:a,teamB:b,seed:1,maxActions:200});
  const totalSpeed=[...a,...b].reduce((n,x)=>n+x.speed,0);
  for(const x of [...a,...b]){
   const count=actions(result,x.id).length,expected=200*x.speed/totalSpeed;
   assert.ok(count>0,`${def.name} ${gear} ${x.id}: no starvation`);
   assert.ok(Math.abs(count-expected)<=2,`${x.id}: ${count} vs ${expected.toFixed(2)}`);
  }
 }
});

test('one magic-seal charge blocks one eligible ICON skill, then all seven roles recover without equipped magic',()=>{
 for(const def of ICON_ROLES){
  const a=iconActor(def,0,'A',{gear:1000000}),b=durable(buildFighter({id:'sealed-training-target',power:1000000},0,'B'));
  a.hp=Math.round(a.maxHp*.1);a.speed=1e6;b.speed=1;a.magicSealCharges=1;a.magicSealSourceId=b.id;
  const result=simulateBattleV2Preview({teamA:[a],teamB:[b],seed:11,maxActions:15});
  const own=actions(result,a.id),casts=own.filter(e=>e.type==='ICON_SKILL');
  assert.ok(casts.length>0,def.name+' must resume skills');
  assert.equal(result.timeline.filter(e=>e.type==='ICON_STATUS'&&e.status==='SEAL_BLOCK').length,1,def.name+' one charge consumed');
  const first=own.findIndex(e=>e.type==='ICON_SKILL')+1;
  assert.equal(first,a.iconRole.tuning.firstAction+1+(def.role==='MAGIC'?1:0),def.name+' one blocked opportunity, then normal channel/cast');
  assert.ok(casts.length<=a.iconRole.tuning.maxCasts);
 }
});

test('support keeps attacking without healing targets; Apocalypse seal still expires by own actions',()=>{
 const support=iconActor(ICON_ROLES.find(d=>d.role==='SUPPORT'),0,'A'),enemy=durable(buildFighter({id:'idle-target',power:1e6},0,'B'));
 support.speed=1e6;enemy.speed=1;
 let result=simulateBattleV2Preview({teamA:[support],teamB:[enemy],seed:1,maxActions:8});
 assert.ok(!result.timeline.some(e=>e.status==='SEAL_BLOCK'||e.type==='ICON_SKILL'));
 for(const def of ICON_ROLES){
  const a=iconActor(def,0,'A');a.speed=1e6;a.hp=Math.round(a.maxHp*.1);a.apocalypseStatus={seal:{remaining:3}};
  result=simulateBattleV2Preview({teamA:[a],teamB:[enemy],seed:1,maxActions:12});
  assert.ok(actions(result,a.id).slice(0,3).every(e=>e.type==='TURN'));
  assert.ok(result.timeline.some(e=>e.type==='ICON_SKILL'),def.name+' resumes after timed seal');
 }
});

test('every ICON skill and mage channel reserves presentation time in timed PVE encounters',()=>{
 for(const def of ICON_ROLES){
  const actor=iconActor(def,0,'A',{mode:'PVE'}),args=structuredClone(fixture.iconArgs);
  args.cards[2]={id:def.cardId,title:def.name,grade:'ICON',power:180000,iconRole:actor.iconRole};
  args.characterBonus=10000000;args.battleSuit={code:'BATTLE_SUIT_03',pvePower:300000,skillChips:['SKILL_CHIP_ROCKET_LAUNCHER']};
  const battle=createPveBattleV2(args),skills=battle.result.timeline.filter(e=>e.type==='ICON_SKILL');
  assert.ok(skills.length,def.name+' real timed PVE skill');
  for(const e of skills){assert.ok(skillChipCombatEventMs(e)>0,def.name+' skill budget');assert.ok(e.combatGroupDurationMs>0,def.name+' blocking action group');}
  for(const e of battle.result.timeline.filter(e=>e.type==='ICON_STATUS'&&e.status==='CHANNEL'))assert.ok(e.combatGroupDurationMs>0,'channel action budget');
 }
 assert.equal(skillChipCombatEventMs({type:'ICON_STATUS',status:'HEAT'}),0,'passive stack is not an extra turn');
 assert.equal(skillChipCombatEventMs({type:'ICON_SKILL',iconRole:'ATTACK',hits:[{},{},{}]},{iconActions:false}),0,'existing cooperative clock revisions stay unchanged');
});

test('old zero-duration ICON receipts do not overlap the following skill',async()=>{
 const called=[],release=[];
 const engine={visible:true,playbackEpoch:1,paceScale:1,audio:{enabled:()=>false},combatantById:()=>null,
  playEvents:async events=>{called.push(events[0].seq);await new Promise(r=>release.push(r));}};
 const events=[{type:'ICON_STATUS',status:'MARK',combatGroup:0},{type:'ICON_SKILL',combatGroup:0},{type:'ICON_SKILL',combatGroup:1}].map((e,i)=>({...e,seq:i+1,combatClock:SKILL_CHIP_CLOCK,combatAtMs:0,combatGroupDurationMs:0}));
 const p=new BattleSuitSkillChipPlayback(engine,events),run=p.play(),flush=()=>new Promise(r=>setImmediate(r));
 try{
  await flush();p.timeline.pause();assert.deepEqual(called,[1]);
  release.shift()();await flush();assert.deepEqual(called,[1,2],'first skill follows its mark');
  assert.equal(p.waiting,true);release.shift()();await flush();assert.deepEqual(called,[1,2,3],'second skill waits for the first');
 }finally{p.cancel();for(const done of release)done();await run;}
});

test('long-battle acceleration counts ICON skills and channel turns exactly once',()=>{
 const state={formationCoop:false,paceActions:39,paceScale:1};
 BattleEngine.prototype.advancePace.call(state,'ICON_SKILL');assert.equal(state.paceActions,40);
 BattleEngine.prototype.advancePace.call(state,'ICON_STATUS',{status:'CHANNEL'});assert.equal(state.paceScale,1.28);
 for(const status of ['HEAT','WARD','SEAL_BLOCK','CURSE'])BattleEngine.prototype.advancePace.call(state,'ICON_STATUS',{status});
 assert.equal(state.paceActions,41,'passive notices add no action');
});

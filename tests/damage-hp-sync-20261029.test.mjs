import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {gsap} from 'gsap';
import {BattleSuitSkillChipPlayback} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {SKILL_CHIP_CLOCK} from '../shared/battle-suit-skill-chips.mjs';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {BattleEngine as HuntEngine} from '../preview/sustained-hunt-v2/source/HuntBattleEngine.js';
const flush=()=>new Promise(r=>setImmediate(r));
after(()=>gsap.ticker.sleep());
const timed=(events)=>events.map((e,i)=>({seq:i+1,combatClock:SKILL_CHIP_CLOCK,combatAtMs:0,combatGroup:i,combatGroupDurationMs:0,...e}));
function fixture(events){
 const target={id:'boss',hp:100,shield:50,root:{visible:true}},contacts=[];let release;
 const engine={visible:true,playbackEpoch:1,combatantById:id=>id===target.id?target:null,eventHpPercent:(t,v)=>v,
  updateStatus(){},isAccountBattleUnitDamageEvent:e=>e.actorKind==='BATTLE_SUIT',
  playEvents:async rows=>{for(const e of rows){
   if(e.type==='MERCENARY_WINDUP')continue;
   if(e.type.startsWith('MERCENARY_')||e.type==='APOCALYPSE_SKILL'||e.type==='ICON_SKILL')await new Promise(r=>{release=r;});
   const row=e.hits?.[0]||e;
   if(e.actorKind==='BATTLE_SUIT')clock.remember(e); // Actual queued shots remember at contact.
   if(row.targetHpAfter!==undefined){target.hp=clock.currentHp(target,row.targetHpAfter);target.shield=clock.currentShield(target,row.targetShieldAfter);contacts.push({type:e.type,hp:target.hp,damage:row.damage});}
  }},syncTargetHp:(t,v)=>{t.hp=clock.currentHp(t,v);},syncTargetShield:(t,v)=>{t.shield=clock.currentShield(t,v);},
  showAccountBattleUnitDamage:(t,{damage})=>contacts.push({type:'SKILL_CHIP_HIT',hp:t.hp,damage})};
 const clock=new BattleSuitSkillChipPlayback(engine,events);clock.render=()=>{};clock.finish=()=>{};
 return {engine,target,contacts,clock,release:()=>release?.()};
}
test('Leonel impact owns its HP and shield before the next independent suit receipt',async()=>{
 const events=timed([
  {type:'MERCENARY_WINDUP',combatGroup:0},
  {type:'MERCENARY_LEONEL_AREA',combatGroup:0,hits:[{targetId:'boss',damage:60,targetHpAfter:40,targetShieldAfter:0}]},
  {type:'TURN',actorKind:'BATTLE_SUIT',targetId:'boss',damage:5,targetHpAfter:35,targetShieldAfter:0}
 ]),original=structuredClone(events),q=fixture(events);
 q.clock.pump();await flush();assert.equal(q.target.hp,100);assert.equal(q.contacts.length,0);
 q.release();await flush();assert.deepEqual(q.contacts,[{type:'MERCENARY_LEONEL_AREA',hp:40,damage:60},{type:'TURN',hp:35,damage:5}]);
 assert.deepEqual(events,original);q.clock.cancel();
});
test('all existing authored actions retain collision order with zero presentation budgets',async()=>{
 for(const type of ['MERCENARY_LEONEL_AREA','MERCENARY_JINMU_AREA','MERCENARY_HELIOS_AREA','MERCENARY_SHIRANUI_AREA','MERCENARY_KAIRON_AREA','MERCENARY_JOKRO_AREA','MERCENARY_ZERO_AREA','MERCENARY_PRIME_REQUIEM_AREA','MERCENARY_GENERAL_JOK_AREA','MERCENARY_CARDGU_AREA','MERCENARY_REVAN_AREA','APOCALYPSE_SKILL','ICON_SKILL']){
  const q=fixture(timed([{type,hits:[{targetId:'boss',damage:60,targetHpAfter:40}]},{type:'TURN',actorKind:'BATTLE_SUIT',targetId:'boss',damage:5,targetHpAfter:35}]));
  q.clock.pump();await flush();assert.equal(q.target.hp,100,type);q.release();await flush();assert.deepEqual(q.contacts.map(c=>c.hp),[40,35],type);q.clock.cancel();
 }
});
test('older queued bullets land before publishing an authored HP snapshot',async()=>{
 const q=fixture(timed([{type:'MERCENARY_LEONEL_AREA',hits:[{targetId:'boss',damage:60,targetHpAfter:35}]}]));let land;
 q.engine.accountBattleUnitDamageQueue=[{id:'older-shot'}];
 q.engine.waitForAccountBattleUnitDamageQueueDrain=()=>new Promise(r=>{land=()=>{q.target.hp=95;q.engine.accountBattleUnitDamageQueue=[];r(true);};});
 q.clock.pump();await flush();assert.equal(q.clock.snapshots.size,0);assert.equal(q.target.hp,100);
 land();await flush();assert.equal(q.target.hp,95);assert.equal(q.contacts.length,0);
 q.release();await flush();assert.deepEqual(q.contacts,[{type:'MERCENARY_LEONEL_AREA',hp:35,damage:60}]);q.clock.cancel();
});
test('direct shots without a sustained loop drain on later frames and settle on session replacement',async()=>{
 for(const Engine of [BattleEngine,HuntEngine]){
  const e={playbackEpoch:1,accountBattleUnit:{fireTimeline:{}},accountBattleUnitDamageQueue:[]};let settled=false;
  const p=Engine.prototype.waitForAccountBattleUnitDamageQueueDrain.call(e,1000).then(v=>{settled=true;return v;});
  await flush();assert.equal(settled,false);e.accountBattleUnit.fireTimeline=null;assert.equal(await p,true);
  e.accountBattleUnit.fireTimeline={};const cancelled=Engine.prototype.waitForAccountBattleUnitDamageQueueDrain.call(e,1000);e.playbackEpoch++;assert.equal(await cancelled,true);
 }
});
function armVolley(q){
 q.clock.fx.set('octa',{chip:{silent:true},continuousVolley:true,started:true,at:0,targetIds:['boss'],scheduledImpacts:new Map([[0,0]]),impacts:new Map(),fx:{confirmImpact(){},destroy(){}}});
}
const volley={type:'SKILL_CHIP_HIT',chipCode:'SKILL_CHIP_OCTA_SEEKER',castId:'octa',hitIndex:0,targetId:'boss',damage:5,targetHpAfter:35,targetShieldAfter:0};
test('already flying homing missiles cannot apply future HP during an authored cast',async()=>{
 const q=fixture(timed([{type:'MERCENARY_LEONEL_AREA',hits:[{targetId:'boss',damage:60,targetHpAfter:40}]},volley]));armVolley(q);
 q.clock.pump();await flush();q.clock.pumpScheduledContacts();assert.equal(q.contacts.length,0);assert.equal(q.target.hp,100);
 q.release();await flush();q.clock.pump();await flush();assert.deepEqual(q.contacts.map(c=>c.hp),[40,35]);q.clock.cancel();
});
test('lookahead cannot leap over an authored action that has not yet been dispatched',()=>{
 const q=fixture(timed([{type:'MERCENARY_LEONEL_AREA',hits:[]},volley]));armVolley(q);
 q.clock.pumpScheduledContacts();assert.equal(q.clock.hits,0);assert.equal(q.target.hp,100);q.clock.cancel();
});
test('an earlier homing collision still lands while an unrelated ordinary action finishes',()=>{
 const q=fixture(timed([{...volley,targetHpAfter:95}]));armVolley(q);q.clock.fence=new Promise(()=>{});
 q.clock.pumpScheduledContacts();assert.equal(q.clock.hits,1);assert.equal(q.target.hp,95);q.clock.pumpScheduledContacts();assert.equal(q.clock.hits,1);q.clock.cancel();
});
test('shield absorption is preserved and healing can increase HP after the action',async()=>{
 const q=fixture(timed([{type:'MERCENARY_LEONEL_AREA',hits:[{targetId:'boss',damage:0,absorbed:30,targetHpAfter:100,targetShieldAfter:20}]},{type:'TURN',actorKind:'BATTLE_SUIT',targetId:'boss',damage:10,targetHpAfter:90,targetShieldAfter:0}]));
 q.clock.pump();await flush();q.release();await flush();assert.deepEqual(q.contacts.map(c=>c.hp),[100,90]);
 q.clock.remember({seq:10,type:'REGEN',targetId:'boss',hpAfter:98});q.clock.remember({seq:3,targetId:'boss',targetHpAfter:40});assert.equal(q.clock.currentHp(q.target,0),98);q.clock.cancel();
});
test('cancelling during an authored action does not dispatch later damage',async()=>{
 const q=fixture(timed([{type:'MERCENARY_LEONEL_AREA',hits:[]},{type:'TURN',actorKind:'BATTLE_SUIT',targetId:'boss',targetHpAfter:0}]));
 q.clock.pump();await flush();q.clock.cancel();q.release();await flush();assert.equal(q.contacts.length,0);assert.equal(q.clock.authoredFence,null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {SS_LIMITED_COMBAT} from '../shared/mercenary-ss-limited-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat,mercenarySkillCapActions} from '../functions/_mercenary_combat.js';
import {buildFighter} from '../functions/_battle_v2_preview.js';
import {ssLimitedSnapshot,sssReferences} from '../scripts/measure-ss-limited-balance-20261008.mjs';
const codes=Object.keys(SS_LIMITED_COMBAT);
function harness(code,mode='PVP',season2=null){
 const actor=buildMercenaryFighter(ssLimitedSnapshot(code),'A',mode,buildFighter),events=[];
 const targets=Array.from({length:3},(_,i)=>({...buildFighter({id:'target-'+i,power:1e9},i,'B',null,mode),hp:1e12,maxHp:1e12}));
 const runtime=mercenaryCombat({teams:{A:[actor],B:targets},season2,hit:()=>({damage:100,dodge:false}),damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},clock:()=>0,emit:(type,event)=>events.push({type,...event})});
 return {actor,targets,runtime,events,casts:()=>events.filter(e=>e.type==='MERCENARY_WINDUP'&&!e.continuation)};
}
test('energy threshold, cooldown and pending followups control casts independently',()=>{
 for(const mode of ['PVE','PVP'])for(const code of codes){
  const {actor,runtime,casts}=harness(code,mode),state=runtime.state(actor);
  state.energy=9;actor.actions=1;assert.equal(runtime.beforeAction(actor),false);assert.equal(state.energy,19);assert.equal(casts().length,0);
  actor.actions=2;assert.equal(runtime.beforeAction(actor),true);assert.equal(state.energy,9);assert.equal(casts().length,1);assert.equal(state.cooldown.get(actor.skills[0].id),4);
  actor.actions=3;runtime.beforeAction(actor);assert.equal(casts().length,1);assert.equal(state.energy,19);
  actor.actions=4;runtime.beforeAction(actor);
  assert.equal(casts().length,code==='V-993'?1:2,'three-part volley finishes its last hit before recasting');
  if(code==='V-993'){actor.actions=5;runtime.beforeAction(actor);assert.equal(casts().length,2);}
  assert.ok(state.energy>=0&&state.energy<=actor.combat.energyMax);
 }
});
test('silence, stun, seal and command severance still block skills; blocked actions regenerate only once',()=>{
 for(const mode of ['PVE','PVP'])for(const code of codes)for(const control of ['silenced','stunned','sealed','command']){
  let severed=false;const {actor,runtime,casts}=harness(code,mode,{skillBlocked:()=>severed}),state=runtime.state(actor);
  actor.actions=1;runtime.beforeAction(actor);assert.equal(casts().length,1);
  if(control==='sealed')actor.apocalypseStatus={seal:{remaining:3}};else if(control==='command')severed=true;else actor[control]=true;
  state.energy=30;actor.actions=2;runtime.beforeAction(actor);runtime.beforeAction(actor);
  assert.equal(state.energy,40);assert.equal(state.pending,null);assert.equal(casts().length,1);
  actor.silenced=false;actor.stunned=false;actor.apocalypseStatus={};severed=false;
  actor.actions=3;runtime.beforeAction(actor);assert.equal(casts().length,2);assert.equal(state.energy,30);
 }
});
test('dead or untargetable actors cannot recharge, and absent targets cannot charge a skill cost',()=>{
 for(const code of codes){
  for(const flags of [{hp:0,alive:false},{untargetable:true}]){
   const {actor,runtime,casts}=harness(code);Object.assign(actor,flags);runtime.state(actor).energy=30;actor.actions=1;runtime.beforeAction(actor);
   assert.equal(runtime.state(actor).energy,30);assert.equal(casts().length,0);
  }
  const {actor,targets,runtime,casts}=harness(code);targets.forEach(t=>{t.hp=0;t.alive=false;});runtime.state(actor).energy=30;actor.actions=1;runtime.beforeAction(actor);
  assert.equal(runtime.state(actor).energy,40);assert.equal(casts().length,0);assert.equal(runtime.state(actor).cooldown.size,0);
 }
});
test('extra PVP skill budget is limited to the seven exact identities and ordinary energy rules stay unchanged',()=>{
 for(const code of codes){
  const pvp=buildMercenaryFighter(ssLimitedSnapshot(code),'A','PVP',buildFighter),pve=buildMercenaryFighter(ssLimitedSnapshot(code),'A','PVE',buildFighter);
  assert.equal(mercenarySkillCapActions(pvp,pvp.skills[0],false)/mercenarySkillCapActions(pve,pve.skills[0],false),1.5);
 }
 for(const ref of [...sssReferences,ssLimitedSnapshot('V-996'),ssLimitedSnapshot('V-999')]){
  const actor=buildMercenaryFighter(ref,'A','PVP',buildFighter),target=buildFighter({id:'target',power:1e9},0,'B',null,'PVP');
  actor.silenced=true;
  const runtime=mercenaryCombat({teams:{A:[actor],B:[target]},hit:()=>({damage:1,dodge:false}),damage:()=>({hpDamage:0,absorbed:0}),knockout(){},clock:()=>0,emit(){}});
  runtime.state(actor).energy=30;actor.actions=1;runtime.beforeAction(actor);assert.equal(runtime.state(actor).energy,30,ref.code);
 }
});

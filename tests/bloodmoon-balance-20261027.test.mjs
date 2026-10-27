import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {ssLimitedProfile} from '../shared/mercenary-ss-limited-v1.mjs';
import {NAMSUDAENG_SKILLS, NAMSUDAENG_EVENT} from '../shared/mercenary-bloodmoon-namsudaeng-v1.mjs';
import {resolveNamsudaengCast} from '../functions/_mercenary_bloodmoon_namsudaeng.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code,side='A',mode='PVP',extra={})=>buildMercenaryFighter({...snapshot(code),...extra},side,mode,buildFighter);
function harness({dodge=false,dead=false,immune=false}={}){
 const actor=fighter('V-961'),target=fighter('V-962','B');
 if(immune){target.code='V-996';target.cardId='V-996';target.controlImmune=true;}
 const events=[],hits=[];
 const runtime=mercenaryCombat({teams:{A:[actor],B:[target]},
  hit:(a,t,ratio,options)=>{hits.push({actor:a.id,ratio,options});return {dodge,damage:7};},
  damage:(t,n)=>{if(dead)t.hp=0;return {hpDamage:n,absorbed:0};},knockout(){},
  emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 const cast=()=>{actor.actions++;runtime.beforeAction(actor);};
 return {actor,target,events,hits,runtime,cast};
}
test('Joeun restrains a surviving first hit without waiting for enemy basic attacks',()=>{
 const h=harness();h.cast();
 assert.deepEqual(h.events.filter(e=>e.type==='MERCENARY_DEBUFF').map(e=>e.effect),['BASIC_WEAKENED','OFFENDER_MARK']);
 assert.equal(h.runtime.basicMultiplier(h.target),.75);
 h.target.actions++;assert.equal(h.runtime.basicMultiplier(h.target),.75);
 h.target.actions++;assert.equal(h.runtime.basicMultiplier(h.target),1);
 assert.equal(h.events.filter(e=>e.type==='MERCENARY_HIT').length,1);
});
test('Joeun repeat marks weaken exactly one offensive cast and reset the mark cycle',()=>{
 const h=harness();for(let i=0;i<3;i++)h.cast();
 assert.equal(h.events.filter(e=>e.effect==='OFFENSIVE_SKILL_ONLY').length,1);
 assert.equal(h.runtime.debuffs.get(h.target.id).offender[h.actor.id],undefined);
 // A basic attack does not spend the next-skill weakening.
 h.runtime.basicMultiplier(h.target);h.runtime.afterBasic(h.target,h.actor,true);
 assert.equal(h.runtime.debuffs.get(h.target.id).veil.percent,25);
 const skill=h.target.skills[0],expected=skill.balance.damageRatio;
 h.target.actions=1;h.runtime.beforeAction(h.target);
 const first=h.hits.find(e=>e.actor===h.target.id);assert.equal(first.ratio,expected*.75);
 assert.equal(h.runtime.debuffs.get(h.target.id).veil,undefined);
 h.target.actions=2;h.runtime.beforeAction(h.target);
 const second=h.hits.filter(e=>e.actor===h.target.id)[1];assert.equal(second.ratio,expected);
 assert.equal(first.options.capScale/second.options.capScale,.75);
});
test('restraint retains miss, knockout and control immunity protections',()=>{
 for(const opts of [{dodge:true},{dead:true},{immune:true}]){
  const h=harness(opts);for(let i=0;i<3;i++)h.cast();
  assert.equal(h.events.filter(e=>e.type==='MERCENARY_DEBUFF').length,0,JSON.stringify(opts));
 }
});
test('cleansing removes the added weakening through the existing debuff path',()=>{
 const h=harness();for(let i=0;i<3;i++)h.cast();
 assert.equal(h.runtime.cleanse(h.target),'veil');
 assert.equal(h.runtime.cleanse(h.target),'restraint');
 assert.equal(h.runtime.basicMultiplier(h.target),1);
});
test('server battle mode selects Namsudaeng stats, linkage and tempo; PVE cannot opt into PVP',()=>{
 const pve=fighter('V-965','A','PVE'),forged=fighter('V-965','A','PVE',{battleMode:'PVP'}),pvp=fighter('V-965');
 assert.deepEqual(forged,pve);
 assert.equal(ssLimitedProfile(pve).scale,3.3);assert.equal(ssLimitedProfile(pve).actionCredit,2.25);
 assert.equal(ssLimitedProfile(pvp).scale,8.1);assert.equal(ssLimitedProfile(pvp).actionCredit,3.75);
 assert.deepEqual(ssLimitedProfile(pvp).link,{attackPercent:1782,hpPercent:2268,shieldPercent:1215});
 const disguised=fighter('V-965','A','PVP',{battleMode:'PVE'});assert.deepEqual(disguised,pvp);
 const cards=Array.from({length:5},(_,i)=>({id:String(i),rarity:'FUR',power:2e7,power_type:'ATTACK'}));
 const args={cards,monster:{id:1,battle_power:5e10},seed:2701};
 assert.deepEqual(createPveBattleV2({...args,mercenary:snapshot('V-965')}),createPveBattleV2({...args,mercenary:{...snapshot('V-965'),battleMode:'PVP'}}));
});
test('Namsudaeng retains 1440% total damage per cast, unique targets and shared cooldown',()=>{
 for(const mode of ['PVE','PVP']){
  const actor=fighter('V-965','A',mode),targets=Array.from({length:5},(_,i)=>({...buildFighter({id:'t'+i,power:1e8,type:'NONE'},i,'B',null,mode),hp:1e12,maxHp:1e12}));
  for(const skill of NAMSUDAENG_SKILLS){
   const ratios=[],touched=[];
   resolveNamsudaengCast({actor,skill,targets:[...targets,targets[0]],hit:(a,t,r)=>{ratios.push(r);return {damage:1};},damage:(t,n)=>{touched.push(t.id);return {hpDamage:n,absorbed:0};},knockout(){},emit(){}});
   assert(Math.abs(ratios.reduce((a,b)=>a+b,0)-14.4)<1e-8);assert.equal(new Set(touched).size,touched.length);
  }
  const events=[],runtime=mercenaryCombat({teams:{A:[actor],B:targets},hit:()=>({damage:1}),damage:(t,n)=>({hpDamage:n,absorbed:0}),knockout(){},emit:(type,row)=>events.push({type,...row,action:actor.actions}),clock:()=>0});
  for(let i=1;i<=7;i++){actor.actions=i;runtime.beforeAction(actor);}
  const casts=events.filter(e=>e.type===NAMSUDAENG_EVENT);assert.deepEqual(casts.map(e=>e.action),[1,3,5,7]);assert.deepEqual(casts.map(e=>e.visualMode),['pierce','volley','rain','pierce']);
 }
});
test('public codex accepts the new skill budget and explains both buffs',()=>{
 const doc=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61}));
 const joeun=doc.cards.find(c=>c.code==='V-961'),nam=doc.cards.find(c=>c.code==='V-965');
 assert.equal(joeun.skills[0].balance.damageRatio,13.2);assert.match(joeun.skills[0].effect,/적중 즉시/);assert.match(joeun.combatLinkDescription,/다음 공격 스킬/);
 assert.match(nam.combatLinkDescription,/PVE 자연 행동 속도 2.25배/);assert.match(nam.combatLinkDescription,/PVP 자연 행동 속도 3.15배/);
 assert.equal(joeun.basePower,356400);assert.equal(nam.basePower,356400);
});

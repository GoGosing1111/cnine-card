import test from 'node:test';
import assert from 'node:assert/strict';
import {cards,snapshot,fighter,team,scenarios} from './helpers/helios-king-balance-20261106.mjs';
import {JIN_JOKRO_CODE as J,JIN_JOKRO_COMBAT,JIN_JOKRO_AREA_SKILLS as SKILLS,JIN_JOKRO_BASIC_FORMS,JIN_JOKRO_AREA_EVENT as EVENT,jinJokroIncomingDamage} from '../shared/mercenary-jin-jokro-v1.mjs';
import {HELIOS_KING_CODE as H,HELIOS_KING_COMBAT,HELIOS_KING_AREA_SKILLS,heliosKingIncomingDamage} from '../shared/mercenary-helios-king-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack,mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';
import {mercenaryCombat,mercenaryBaseActionCredit} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {resolveJinJokroArea} from '../functions/_mercenary_jin_jokro.js';
import {mercenaryLevelXpMultiplier} from '../shared/mercenary-level-v1.mjs';

test('Jin Jokro matches Helios King stats and tempo across growth, gear and modes',()=>{
 for(const mode of ['PVE','PVP'])for(const s of scenarios){
  const pairs=[J,H].map(code=>team(code,'A',mode,s.level,s.gear,s.power));
  pairs.forEach(t=>applyMercenaryCombatLink([t,cards().map((c,i)=>buildFighter(c,i,'B',null,mode))]));
  const [j,h]=pairs.map(t=>t.at(-1));
  for(const key of ['basePower','attack','defense','maxHp','shield','counterImmune','controlImmune','poisonImmune'])assert.equal(j[key],h[key],`${mode}/${s.name}/${key}`);
  assert.equal(j.speed,h.speed);
  assert.equal(mercenaryEffectiveAttack(j),mercenaryEffectiveAttack(h));assert.equal(mercenaryDamageCapHp(j),mercenaryDamageCapHp(h));
  assert.equal(mercenaryBaseActionCredit([j]),4.5);assert.equal(jinJokroIncomingDamage(j,123456),heliosKingIncomingDamage(h,123456));
  assert.equal(mercenaryLevelXpMultiplier(j),5);assert.equal(j.skills.length,mode==='PVE'?3:0);
  assert.deepEqual(pairs[0].slice(0,-1).map(a=>[a.attack,a.maxHp,a.shield]),pairs[1].slice(0,-1).map(a=>[a.attack,a.maxHp,a.shield]));
 }
 for(const k of Object.keys(HELIOS_KING_COMBAT))if(!['version','motionPlaybackRate','effectPlaybackRate'].includes(k))assert.deepEqual(JIN_JOKRO_COMBAT[k],HELIOS_KING_COMBAT[k],k);
 assert.equal(JIN_JOKRO_COMBAT.motionPlaybackRate,1.5);assert.equal(JIN_JOKRO_COMBAT.effectPlaybackRate,1.5);
});

test('three basic visuals retain one 165% attack and all area forms share Helios mean damage/cap',()=>{
 const j=fighter(J),h=fighter(H),target=buildFighter(cards()[0],0,'B',null,'PVE');
 const c=mercenaryCombat({teams:{A:[j,h],B:[target]},clock:()=>0,hit:()=>({damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit(){}});
 assert.equal(JIN_JOKRO_BASIC_FORMS.length,3);assert.equal(c.beforeBasicDamage(j,target,10000),16500);assert.equal(c.basicDamageCapScale(j),c.basicDamageCapScale(h));
 const mean=(skills,key)=>skills.reduce((n,s)=>n+(key==='damageRatio'?s.balance[key]:s[key]),0)/skills.length;
 for(const key of ['damageRatio','damageCapScale'])assert(Math.abs(mean(SKILLS,key)-mean(HELIOS_KING_AREA_SKILLS,key))<1e-10);
});

test('each area resolver divides one budget among unique living enemies and preserves authoritative shield/dodge',()=>{
 for(const skill of SKILLS)for(const count of [1,3,13]){
  const actor=fighter(J),targets=Array.from({length:count},(_,i)=>({id:'t'+i,side:'B',hp:1000,maxHp:1000,shield:20,alive:true})),calls=[],events=[];
  const args={actor,skill,targets:[...targets,targets[0],actor,{id:'dead',side:'B',hp:0},{id:'untargetable',side:'B',hp:100,untargetable:true}],
   hit:(a,t,ratio,options)=>{calls.push({ratio,options});return {damage:100};},damage:(t,n)=>{t.hp-=n-20;t.shield=0;return {hpDamage:n-20,absorbed:20};},knockout(){},emit:(type,row)=>events.push({type,...row})};
  const hits=resolveJinJokroArea(args);assert.equal(hits.length,count);assert.equal(events.length,1);assert.equal(events[0].type,EVENT);
  assert(Math.abs(calls.reduce((n,c)=>n+c.ratio,0)-skill.balance.damageRatio)<1e-9);assert(calls.every(c=>c.options.pveCapScale===skill.damageCapScale));
  assert(hits.every(h=>h.targetHpAfter===920&&h.targetShieldAfter===0&&h.absorbed===20));assert.equal(new Set(hits.map(h=>h.targetId)).size,count);
  for(const change of [{battleMode:'PVP'},{hp:0},{stunned:true},{silenced:true},{code:H}])assert.deepEqual(resolveJinJokroArea({...args,actor:{...actor,...change}}),[]);
  for(const ratio of [NaN,Infinity,-1,10001])assert.deepEqual(resolveJinJokroArea({...args,skill:{...skill,balance:{...skill.balance,damageRatio:ratio}}}),[]);
  const dodged=resolveJinJokroArea({...args,hit:()=>({dodge:true,damage:0}),damage:()=>{throw Error('dodge must not apply damage');}});assert(dodged.every(h=>h.dodge));
 }
});

test('three skills rotate every two actions at one ten-energy charge per cast',()=>{
 const actor=fighter(J),enemy={...buildFighter(cards()[0],0,'B',null,'PVE'),hp:1e15,maxHp:1e15},events=[];
 const c=mercenaryCombat({teams:{A:[actor],B:[enemy]},clock:()=>actor.actions,hit:()=>({hit:true,damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit:(type,row)=>{if(type===EVENT)events.push({action:actor.actions,...row});}});
 for(actor.actions=1;actor.actions<=60;actor.actions++){const before=c.state(actor).energy,cast=c.beforeAction(actor);if(cast)assert.equal(before-c.state(actor).energy,10);else c.afterBasic(actor,enemy,true);assert.equal(c.state(actor).pending,null);}
 assert.deepEqual(events.map(e=>e.action),Array.from({length:30},(_,i)=>2*i+1));events.forEach((e,i)=>assert.equal(e.skillId,SKILLS[i%3].id));
});

test('real PVE emits all three skills and PVP runs normal attacks',()=>{
 for(const level of [1,11,21]){
  const pve=createPveBattleV2({cards:cards(),monster:{id:1,battle_power:160e9},seed:77,mercenary:snapshot(J,level)});
  const events=pve.result.timeline.filter(e=>e.type===EVENT);assert.equal(new Set(events.map(e=>e.skillId)).size,3);assert(events.every(e=>e.hits.every(h=>Number.isFinite(h.targetHpAfter))));
  for(let seed=1;seed<=12;seed++){
   const j=createPvpBattleV2({attackerCards:cards(),defenderCards:cards(),attackerMercenary:snapshot(J,level,'PVP'),defenderMercenary:snapshot('V-971',level,'PVP'),seed});
   const actions=j.result.timeline.filter(e=>e.actorId==='A:MERCENARY:'+J);
   assert(actions.some(e=>e.type==='TURN'));assert(!actions.some(e=>e.type===EVENT||e.type==='MERCENARY_WINDUP'));
  }
 }
});

test('General Jok priority has the same floor without stacked PVP bonuses',()=>{
 const run=code=>{const t=[team(code,'A','PVP'),team('V-974','B','PVP',21,1e8)];applyMercenaryCombatLink(t);return t;};
 const j=run(J),h=run(H),a=j[0].at(-1),b=h[0].at(-1);assert(a.mercenaryLink.primeZeroGeneralJokPriority);assert.equal(a.mercenaryLink.primeZeroPvp,undefined);
 for(const key of ['maxHp','shield'])assert.equal(a[key],b[key]);assert.equal(mercenaryEffectiveAttack(a),mercenaryEffectiveAttack(b));
 const once=structuredClone(j);applyMercenaryCombatLink(j);assert.deepEqual(j,once);
});

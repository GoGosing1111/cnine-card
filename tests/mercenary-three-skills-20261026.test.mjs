import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {buildFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {ZERO_COMBAT,ZERO_BASIC_FORMS,ZERO_AREA_SKILLS,zeroCodexSkills} from '../shared/mercenary-zero-v1.mjs';
import {PRIME_COMBAT,PRIME_BASIC_FORMS,PRIME_AREA_SKILLS,primeCodexSkills} from '../shared/mercenary-prime-requiem-v1.mjs';
import {GENERAL_JOK_COMBAT,GENERAL_JOK_BASIC_FORMS,GENERAL_JOK_AREA_SKILLS,generalJokCodexSkills} from '../shared/mercenary-general-jok-v1.mjs';
import {resolveZeroArea} from '../functions/_mercenary_zero.js';
import {resolvePrimeArea} from '../functions/_mercenary_prime_requiem.js';
import {resolveGeneralJokArea} from '../functions/_mercenary_general_jok.js';

const rows=[['V-976',ZERO_COMBAT,ZERO_BASIC_FORMS,ZERO_AREA_SKILLS,resolveZeroArea,zeroCodexSkills,35,5],['V-975',PRIME_COMBAT,PRIME_BASIC_FORMS,PRIME_AREA_SKILLS,resolvePrimeArea,primeCodexSkills,20,3],['V-974',GENERAL_JOK_COMBAT,GENERAL_JOK_BASIC_FORMS,GENERAL_JOK_AREA_SKILLS,resolveGeneralJokArea,generalJokCodexSkills,20,3]];
const fighter=(code,mode='PVE')=>buildMercenaryFighter({...limitedDeploymentSnapshot(code),combat:fixture.combat},'A',mode,buildFighter);
const target=mode=>({...buildFighter({id:'target',power:1e7},0,'B',null,mode),speed:1,attack:1,hp:1e8,maxHp:1e8,shield:1e10,maxShield:1e10});

for(const [code,policy,forms,skills,resolve,codex,cost,cooldown]of rows){
 test(code+' basic forms strengthen one actual PVE/PVP hit by 50%, including capped hits',()=>{
  for(const mode of ['PVE','PVP'])for(const capped of [false,true]){
   const a={...fighter(code,mode),skills:[],speed:1e8,attack:capped?1e15:1e5},t=target(mode);
   const first=actor=>simulateBattleV2Preview({teamA:[actor],teamB:[t],seed:7919,maxActions:1}).timeline.find(e=>e.type==='TURN'&&e.actorId===a.id&&!e.dodge);
   const updated=first(a),reference=first({...a,code:'V-978',cardId:'V-978'});
   assert(updated&&reference,'single attack must actually resolve');
   assert.equal(updated.damage+updated.absorbed,Math.floor((reference.damage+reference.absorbed)*1.5));
  }
  assert(forms.every(s=>s.balance.damageRatio===1.5&&s.balance.cost===0&&s.balance.cooldownTurns===0));
  const a=fighter(code),t=target('PVE'),runtime=mercenaryCombat({teams:{A:[a],B:[t]},hit(){},damage(){},knockout(){},emit(){},clock:()=>0});
  assert.equal(runtime.beforeBasicDamage({...a,isMercenary:false},t,100),100);
  assert.equal(runtime.beforeBasicDamage({...a,code:'V-978',cardId:'V-978',name:a.name},t,100),100);
 });
 test(code+' all area forms use 3024% once across 1/5/12 unique enemies and retain resource/control guards',()=>{
  for(const s of skills)for(const count of [1,5,12]){
   const a=fighter(code),targets=Array.from({length:count},(_,i)=>({...target('PVE'),id:'t'+i})),events=[],ratios=[];
   const args={actor:a,skill:s,targets:[...targets,targets[0],{id:'dead',hp:0},{id:'suit',hp:100,isBattleSuit:true}],hit:(actor,t,r,o)=>{ratios.push(r);assert.equal(o.pveCapScale,2);return {damage:100};},damage:(t,n)=>({hpDamage:n,absorbed:0}),knockout(){},emit:(type,data)=>events.push({type,...data})};
   assert.equal(resolve(args).length,count);assert.equal(events.length,1);assert.equal(events[0].hits.length,count);assert(Math.abs(ratios.reduce((n,r)=>n+r,0)-30.24)<1e-9);
   assert.equal(s.balance.cost,cost);assert.equal(s.balance.cooldownTurns,cooldown);
   for(const change of [{battleMode:'PVP'},{hp:0},{stunned:true},{silenced:true}])assert.deepEqual(resolve({...args,actor:{...a,...change}}),[]);
  }
  assert.equal(policy.basePower,code==='V-974'?2700000:3000000);assert.equal(policy.damageTakenScale,.2);assert.equal(policy.actionCredit,3.12);
  for(const s of codex())assert.match(s.effect,s.basicForm?/1\.5배/:/3,024%/);
 });
 test(code+' actual PVE area cap doubles without enabling PVP area attacks',()=>{
  const a={...fighter(code),speed:1e8,attack:1e15,skills:[skills[0]]},t=target('PVE');
  const result=simulateBattleV2Preview({teamA:[a],teamB:[t],seed:7919,maxActions:1});
  const event=result.timeline.find(e=>e.actorId===a.id&&e.type.endsWith('_AREA'));
  assert(event,'actual engine must cast an area skill');
  assert.equal(event.damage+event.absorbed,Math.round(t.maxHp*.46*2));
  assert.deepEqual(fighter(code,'PVP').skills,[]);
 });
}

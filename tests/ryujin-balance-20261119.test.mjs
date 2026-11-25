import test from 'node:test';
import assert from 'node:assert/strict';
import {cards,snapshot,fighter,team,scenarios} from './helpers/helios-king-balance-20261106.mjs';
import {RYUJIN_CODE as J,RYUJIN_COMBAT,RYUJIN_AREA_SKILLS as SKILLS,RYUJIN_BASIC_FORMS,RYUJIN_AREA_EVENT as EVENT,ryujinIncomingDamage} from '../shared/mercenary-ryujin-v1.mjs';
import {HELIOS_KING_CODE as H,HELIOS_KING_COMBAT,HELIOS_KING_AREA_SKILLS,heliosKingIncomingDamage} from '../shared/mercenary-helios-king-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack,mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';
import {mercenaryCombat,mercenaryBaseActionCredit} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {resolveRyujinArea} from '../functions/_mercenary_ryujin.js';
import {mercenaryLevelXpMultiplier} from '../shared/mercenary-level-v1.mjs';

test('Ryujin exceeds Helios King at equal growth and gear without speeding up the artwork',()=>{
 for(const mode of ['PVE','PVP'])for(const s of scenarios){
  const pairs=[J,H].map(code=>team(code,'A',mode,s.level,s.gear,s.power));
  pairs.forEach(t=>applyMercenaryCombatLink([t,cards().map((c,i)=>buildFighter(c,i,'B',null,mode))]));
  const [r,h]=pairs.map(t=>t.at(-1));
  for(const key of ['basePower','attack','defense','maxHp','shield','speed'])assert(r[key]>h[key],mode+'/'+s.name+'/'+key);
  assert(mercenaryEffectiveAttack(r)>mercenaryEffectiveAttack(h));assert(mercenaryDamageCapHp(r)>mercenaryDamageCapHp(h));
  assert.equal(mercenaryBaseActionCredit([r]),5.5);assert.equal(ryujinIncomingDamage(r,10000),1500);
  assert.equal(mercenaryLevelXpMultiplier(r),5);assert.equal(r.skills.length,mode==='PVE'?3:0);
  assert(r.controlImmune&&r.counterImmune&&r.poisonImmune);
 }
 assert.equal(RYUJIN_COMBAT.motionPlaybackRate,1);assert.equal(RYUJIN_COMBAT.effectPlaybackRate,1);
 const actor=fighter(J),enemy=buildFighter(cards()[0],0,'B',null,'PVE');
 const c=mercenaryCombat({teams:{A:[actor],B:[enemy]},clock:()=>0,hit:()=>({damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit(){}});
 assert.equal(c.beforeBasicDamage(actor,enemy,10000),22000);
});

test('each area resolver divides one budget among unique living enemies and preserves authoritative shield/dodge',()=>{
 for(const skill of SKILLS)for(const count of [1,3,13]){
  const actor=fighter(J),targets=Array.from({length:count},(_,i)=>({id:'t'+i,side:'B',hp:1000,maxHp:1000,shield:20,alive:true})),calls=[],events=[];
  const args={actor,skill,targets:[...targets,targets[0],actor,{id:'dead',side:'B',hp:0},{id:'untargetable',side:'B',hp:100,untargetable:true}],
   hit:(a,t,ratio,options)=>{calls.push({ratio,options});return {damage:100};},damage:(t,n)=>{t.hp-=n-20;t.shield=0;return {hpDamage:n-20,absorbed:20};},knockout(){},emit:(type,row)=>events.push({type,...row})};
  const hits=resolveRyujinArea(args);assert.equal(hits.length,count);assert.equal(events.length,1);assert.equal(events[0].type,EVENT);
  assert(Math.abs(calls.reduce((n,c)=>n+c.ratio,0)-skill.balance.damageRatio)<1e-9);assert(calls.every(c=>c.options.pveCapScale===skill.damageCapScale));
  assert(hits.every(h=>h.targetHpAfter===920&&h.targetShieldAfter===0&&h.absorbed===20));assert.equal(new Set(hits.map(h=>h.targetId)).size,count);
  for(const change of [{battleMode:'PVP'},{hp:0},{stunned:true},{silenced:true},{code:H}])assert.deepEqual(resolveRyujinArea({...args,actor:{...actor,...change}}),[]);
  for(const ratio of [NaN,Infinity,-1,10001])assert.deepEqual(resolveRyujinArea({...args,skill:{...skill,balance:{...skill.balance,damageRatio:ratio}}}),[]);
  const dodged=resolveRyujinArea({...args,hit:()=>({dodge:true,damage:0}),damage:()=>{throw Error('dodge must not apply damage');}});assert(dodged.every(h=>h.dodge));
 }
});

test('three skills rotate every two actions at one ten-energy charge per cast',()=>{
 const actor=fighter(J),enemy={...buildFighter(cards()[0],0,'B',null,'PVE'),hp:1e15,maxHp:1e15},events=[];
 const c=mercenaryCombat({teams:{A:[actor],B:[enemy]},clock:()=>actor.actions,hit:()=>({hit:true,damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit:(type,row)=>{if(type===EVENT)events.push({action:actor.actions,...row});}});
 for(actor.actions=1;actor.actions<=60;actor.actions++){const before=c.state(actor).energy,cast=c.beforeAction(actor);if(cast)assert.equal(before-c.state(actor).energy,10);else c.afterBasic(actor,enemy,true);assert.equal(c.state(actor).pending,null);}
 assert.deepEqual(events.map(e=>e.action),Array.from({length:30},(_,i)=>2*i+1));events.forEach((e,i)=>assert.equal(e.skillId,SKILLS[i%3].id));assert.equal(new Set(events.map(e=>e.visualMode)).size,13);
});

test('real PVE emits all three skills and PVP runs normal attacks',()=>{
 for(const level of [1,11,21]){
  const pve=createPveBattleV2({cards:cards(),monster:{id:1,battle_power:160e9},seed:77,mercenary:snapshot(J,level)});
  const events=pve.result.timeline.filter(e=>e.type===EVENT);assert(events.length>0);assert(events.every(e=>e.hits.every(h=>Number.isFinite(h.targetHpAfter))));
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
 for(const key of ['maxHp','shield'])assert(a[key]>=b[key]);assert(mercenaryEffectiveAttack(a)>=mercenaryEffectiveAttack(b));
 const once=structuredClone(j);applyMercenaryCombatLink(j);assert.deepEqual(j,once);
});

test('actual registered Ryujin wins both sides against the previously released lower-power top mercenaries',()=>{
 const doc=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1});
 const competitors=doc.cards.filter(c=>c.basePower<RYUJIN_COMBAT.basePower&&c.basePower>=2200000&&limitedDeploymentSnapshot(c.code));
 assert.equal(Math.max(...competitors.map(c=>c.basePower)),3500000);
 const rows=[];let battles=0;
 for(const s of scenarios)for(const opponent of competitors){let wins=0;
  for(let seed=1;seed<=12;seed++)for(const side of ['A','B']){
   const own=snapshot(J,s.level,'PVP',s.gear),other=snapshot(opponent.code,s.level,'PVP',s.gear);
   const result=createPvpBattleV2({attackerCards:cards(s.power),defenderCards:cards(s.power),attackerMercenary:side==='A'?own:other,defenderMercenary:side==='A'?other:own,seed}).result;
   assert.equal(result.winner,side,s.name+'/'+opponent.code+'/'+seed+'/'+side);wins++;battles++;
  }rows.push({scenario:s.name,opponent:opponent.code,name:opponent.name,wins});
 }
 console.log(JSON.stringify({actualRegisteredCode:J,battles,wins:battles,competitors:competitors.length,scenarios:scenarios.length}));
 if(process.env.RYUJIN_QA_OUT)fs.writeFileSync(process.env.RYUJIN_QA_OUT+'/matchups.json',JSON.stringify({battles,wins:battles,rows},null,2));
});
import fs from 'node:fs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';

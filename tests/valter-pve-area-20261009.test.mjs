import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {VALTER_CODE,VALTER_AREA_SKILL,VALTER_AREA_EVENT} from '../shared/mercenary-valter-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';

const snapshot=()=>({...limitedDeploymentSnapshot(VALTER_CODE),combat:fixture.combat});
function harness({mode='PVE',count=12,control}={}){
 const actor=buildMercenaryFighter({...snapshot(),skills:[]},'A',mode,buildFighter);if(control)actor[control]=true;
 const targets=Array.from({length:count},(_,i)=>({...buildFighter({id:'T'+i,power:1e8},i,'B',null,mode),id:'T'+i,hp:1e8,maxHp:1e8,shield:i===1?1e4:0}));
 const events=[],rolls=[],knockouts=[];
 const runtime=mercenaryCombat({teams:{A:[actor],B:targets},hit(_a,t,ratio,options){rolls.push({id:t.id,ratio,...options});return {damage:ratio*1000,dodge:t.id==='T0'&&count>1};},
  damage(t,n,options){assert.equal(options.actor,actor);const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.hp-=hpDamage;t.shield-=absorbed;return {hpDamage,absorbed};},
  knockout:t=>knockouts.push({id:t.id,rolls:rolls.length,events:events.length}),emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 return {actor,targets,events,rolls,knockouts,runtime,turn(){actor.actions++;return runtime.beforeAction(actor);}};
}

test('an empty legacy Valter snapshot receives the PVE-only server skill; other tiers and PVP cannot opt in',()=>{
 const stale={...snapshot(),rank:'C',skills:[]},before=structuredClone(stale);
 const pve=buildMercenaryFighter(stale,'A','PVE',buildFighter),pvp=buildMercenaryFighter(snapshot(),'A','PVP',buildFighter);
 assert.deepEqual(stale,before);assert.deepEqual(pve.skills,[VALTER_AREA_SKILL]);assert.deepEqual(pvp.skills,[]);
 assert.equal(pve.rank,'SSS');assert.equal(pve.basePower,1080000);assert.ok(pve.controlImmune&&pve.counterImmune&&pve.poisonImmune);
 const fake=harness();fake.actor.code='V-055';fake.actor.cardId='V-055';fake.turn();assert.equal(fake.rolls.length,0);assert.equal(fake.runtime.state(fake.actor).energy,100);
});

test('PVE area shares one 560% budget across all distinct enemies, honors dodge/shield and charges once',()=>{
 const h=harness();h.turn();const event=h.events.find(e=>e.type===VALTER_AREA_EVENT);
 assert.equal(event.hits.length,12);assert.equal(new Set(event.targetIds).size,12);assert.equal(event.skillId,VALTER_AREA_SKILL.id);
 assert.ok(Math.abs(h.rolls.reduce((n,r)=>n+r.ratio,0)-5.6)<1e-10);assert.ok(h.rolls.every(r=>!r.rangedSkill));
 assert.equal(event.hits[0].damage,0);assert.equal(event.hits[0].dodge,true);assert.equal(event.hits[1].damage,0);assert.ok(event.hits[1].absorbed>0);
 assert.equal(event.damage,event.hits.reduce((n,r)=>n+r.damage,0));assert.equal(event.absorbed,event.hits.reduce((n,r)=>n+r.absorbed,0));
 assert.equal(h.actor.damageDealt,event.damage+event.absorbed);
 assert.equal(h.runtime.state(h.actor).energy,65);assert.equal(h.runtime.state(h.actor).cooldown.get('MS-996'),6);
 assert.ok(h.knockouts.every(k=>k.rolls===12&&k.events>=2),'settle knockouts after all contacts and the receipt');
 h.turn();assert.equal(h.rolls.length,12);assert.equal(h.runtime.state(h.actor).energy,65);
 h.actor.actions=5;h.turn();assert.equal(h.rolls.length,24);assert.equal(h.runtime.state(h.actor).energy,30);
 const one=harness({count:1});one.turn();assert.equal(one.rolls.length,1);assert.equal(one.rolls[0].ratio,5.6);
});

test('PVP, control, no enemies and dead actors do not spend energy; hidden/dead targets are excluded',()=>{
 for(const config of [{mode:'PVP'},{control:'stunned'},{control:'silenced'},{count:0}]){
  const h=harness(config);h.turn();assert.equal(h.rolls.length,0);assert.equal(h.runtime.state(h.actor).energy,100);assert.equal(h.runtime.state(h.actor).cooldown.size,0);
 }
 const dead=harness();dead.actor.hp=0;dead.turn();assert.equal(dead.rolls.length,0);assert.equal(dead.runtime.state(dead.actor).energy,100);
 const h=harness();h.targets[0].isBattleSuit=true;h.targets[1].untargetable=true;h.targets[2].hp=0;h.turn();assert.equal(h.rolls.length,9);
 const low=harness();low.runtime.state(low.actor).energy=34;low.turn();assert.equal(low.rolls.length,0);assert.equal(low.runtime.state(low.actor).energy,34);
});

test('real PVE boss and twelve-enemy legion timelines retain area hits and correct damage totals',()=>{
 const cards=tierCards(2e7),mercenary=snapshot();
 const input={cards,mercenary,monster:{id:1,name:'광역 검수 보스',battle_power:6e8},seed:7919};
 const boss=createPveBattleV2(input),events=boss.result.timeline.filter(e=>e.actorId?.includes(VALTER_CODE));
 const area=events.filter(e=>e.type===VALTER_AREA_EVENT);assert.ok(area.length>0);assert.ok(area.every(e=>e.hits.length===1&&e.hits[0].damage>0));
 assert.equal(boss.result.damageBreakdown.mercenary,events.reduce((sum,e)=>sum+(e.damage||0)+(e.absorbed||0),0));
 assert.deepEqual(boss,createPveBattleV2(input));
 const hunt=createHuntSession({snapshot:{cards,mercenary,accountNickname:'광역 검수'},seed:7919,limitMs:15000});
 const casts=hunt.payload.battleV2.result.timeline.filter(e=>e.type===VALTER_AREA_EVENT);
 assert.ok(casts.length>0);assert.ok(casts.some(e=>e.hits.length===12));assert.ok(casts.every(e=>e.battleMode==='PVE'));
 for(const e of casts){assert.equal(new Set(e.hits.map(h=>h.targetId)).size,e.hits.length);assert.equal(e.damage,e.hits.reduce((sum,h)=>sum+h.damage,0));}
});

test('both PVP sides keep the existing basic-only performance and deterministic timeline',()=>{
 const cards=tierCards(2e7),mercenary=snapshot(),legacy={...snapshot(),skills:[]};
 for(const side of ['attackerMercenary','defenderMercenary']){
  const input={attackerCards:cards,defenderCards:cards,seed:7919};
  const current=createPvpBattleV2({...input,[side]:mercenary}),before=createPvpBattleV2({...input,[side]:legacy});
  assert.deepEqual(current,before);assert.ok(!current.result.timeline.some(e=>e.type===VALTER_AREA_EVENT||e.skillId==='MS-996'));
  assert.ok(current.result.timeline.some(e=>e.actorId?.includes(VALTER_CODE)&&e.damage>0));
 }
});

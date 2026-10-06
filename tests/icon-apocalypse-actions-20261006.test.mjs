import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFighter,createPveBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {ICON_ROLES,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./helpers/icon-apocalypse-20261006.json',import.meta.url)));
const roleCard=role=>{const def=ICON_ROLES.find(d=>d.role===role);return {id:def.cardId,title:def.name,grade:'ICON',power:180000,iconRole:{...iconRoleSnapshot({id:def.cardId,grade:'ICON'},fixture.roles,'PVE'),supremacy:fixture.iconArgs.cards[2].iconRole.supremacy}};};

test('Apocalypse: the same winning lower-card deck no longer loses its damage floor on ICON skill actions',()=>{
 for(const [role,seed] of [['ATTACK',5],['MAGIC',4],['ASSAULT',3]]){
  const lower=createPveBattleV2({...structuredClone(fixture.lowArgs),seed});
  const args=structuredClone(fixture.iconArgs);args.cards[2]=roleCard(role);args.seed=seed;
  const icon=createPveBattleV2(args);
  assert.equal(lower.result.winner,'A',role+' lower baseline');
  assert.equal(icon.result.winner,'A',role+' stronger card replacement');
  assert.ok(icon.result.final.B.every(c=>c.hp===0),role+' boss and all six minions defeated');
  assert.deepEqual(createPveBattleV2(args),icon,'deterministic repeat');
 }
});

test('multi-hit ICON skills share the scaled PVE floor and retain the whole-cast target cap',()=>{
 const args=structuredClone(fixture.iconArgs),b=createPveBattleV2(args);
 const actor=b.teams.A.cards[2],boss=b.teams.B.cards[0];
 const scale=Math.min(6,Math.max(.4,b.teams.A.cards.reduce((n,c)=>n+c.power,0)/boss.power*1.7));
 const skills=b.result.timeline.filter(e=>e.type==='ICON_SKILL'&&e.actorId===actor.id&&e.targetId===boss.id);
 assert.ok(skills.length);
 for(const skill of skills){
  const multiplier=actor.iconRole.tuning.damagePercent/100*(1+skill.stacksConsumed*actor.iconRole.tuning.stackPercent/100)*actor.iconRole.tuning.pveScale/100;
  const expectedPerHit=Math.round(boss.maxHp*.016*scale*multiplier/3);
  for(const row of skill.hits)if(!row.dodge&&row.targetHpAfter>0)assert.ok(row.damage+row.absorbed>=expectedPerHit-1,'each landed pellet receives its proportional floor');
  assert.ok(skill.hits.reduce((n,h)=>n+h.damage+h.absorbed,0)<=Math.round(boss.maxHp*actor.iconRole.tuning.damageCapPercent/100),'pellets do not multiply the cast cap');
 }
 const total=b.result.timeline.filter(e=>e.actorId?.startsWith('A:')).reduce((n,e)=>n+(e.type==='ICON_SKILL'?e.hits.reduce((m,h)=>m+h.damage+h.absorbed,0):Number(e.damage||0)+Number(e.absorbed||0)),0);
 assert.equal(b.result.damageBreakdown.cards,total,'the battle damage report includes skill impacts');
});

function supportBattle({casterCurse=false,casterSeal=false,targetCurse=false,targetSeal=false,fullHp=false}={}){
 const support=buildFighter(roleCard('SUPPORT'),0,'A',null,'PVE');
 const ally=buildFighter({id:'injured-ally',grade:'FUR',power:180000},1,'A',null,'PVE');
 const enemy=buildFighter({id:'durable-target',grade:'FUR',power:18000000},0,'B',null,'PVE');
 support.speed=10000;ally.speed=enemy.speed=1;enemy.attack=1;enemy.maxHp=enemy.hp=1e10;ally.hp=fullHp?ally.maxHp:Math.floor(ally.maxHp*.1);
 support.apocalypseStatus={...(casterCurse?{curse:{remaining:5}}:{}),...(casterSeal?{seal:{remaining:5}}:{})};
 ally.apocalypseStatus={...(targetSeal?{seal:{remaining:10}}:{}),...(targetCurse?{curse:{remaining:10}}:{})};
 return {support,ally,result:simulateBattleV2Preview({teamA:[support,ally],teamB:[enemy],seed:18,maxActions:2})};
}

test('Joeun can cleanse and heal while her own received healing is cursed',()=>{
 const {support,ally,result}=supportBattle({casterCurse:true,targetCurse:true,targetSeal:true});
 const skill=result.timeline.find(e=>e.type==='ICON_SKILL'&&e.actorId===support.id);
 assert.ok(skill,'curse does not suppress the cleanse action');assert.equal(skill.targets[0].targetId,ally.id);
 assert.ok(skill.targets[0].amount>0);assert.equal(skill.targets[0].cleaned,true);
 const end=result.final.A[1];assert.equal(end.apocalypseStatus.curse,undefined);assert.ok(end.apocalypseStatus.seal,'one-effect cleanse keeps the other effect');
 assert.ok(end.hp>ally.hp,'a seal blocks the recipient skill, not incoming healing');
 assert.ok(result.timeline.some(e=>e.type==='TURN'&&e.actorId===support.id),'basic attack before cooldown');
});

test('Joeun recognizes full-HP allies needing Apocalypse cleanse',()=>{
 const {result}=supportBattle({targetCurse:true,fullHp:true});
 const skill=result.timeline.find(e=>e.type==='ICON_SKILL');assert.ok(skill);assert.equal(skill.targets[0].amount,0);assert.equal(skill.targets[0].cleaned,true);
 assert.equal(result.final.A[1].apocalypseStatus.curse,undefined);
});

test('Joeun attacks when no ally needs help or when her skill is sealed',()=>{
 for(const options of [{fullHp:true},{casterSeal:true}]){
  const {support,result}=supportBattle(options);assert.equal(result.timeline.filter(e=>e.type==='ICON_SKILL').length,0);
  assert.equal(result.timeline.filter(e=>e.type==='TURN'&&e.actorId===support.id).length,2);
 }
});

test('PVP retains per-target skill limits and has no monster HP floor',()=>{
 const card=roleCard('ATTACK');card.iconRole=iconRoleSnapshot(card,fixture.roles,'PVP');
 const attacker=buildFighter(card,0,'A',null,'PVP'),defender=buildFighter({id:'large-defender',grade:'FUR',power:1e9},0,'B',null,'PVP');
 defender.speed=1;defender.attack=1;
 const b=simulateBattleV2Preview({teamA:[attacker],teamB:[defender],seed:13,maxActions:3});
 const skills=b.timeline.filter(e=>e.type==='ICON_SKILL');assert.equal(skills.length,1);
 for(const e of skills)for(const hit of e.hits)assert.ok(hit.damage+hit.absorbed<1e6,'no PVE percent-HP floor in PVP');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cards,snapshot,fighter,team,scenarios} from './helpers/helios-king-balance-20261106.mjs';
import {HELIOS_KING_CODE,HELIOS_KING_COMBAT,HELIOS_KING_BASIC_FORMS,HELIOS_KING_AREA_SKILLS,HELIOS_KING_AREA_EVENT,HELIOS_KING_ART} from '../shared/mercenary-helios-king-v1.mjs';
import {HEUKMU_CODE,HEUKMU_COMBAT,HEUKMU_PVE_BALANCE,HEUKMU_ART,HEUKMU_AREA_EVENT} from '../shared/mercenary-heukmu-v1.mjs';
import {PRIME_CODE,PRIME_COMBAT,PRIME_PVE_BALANCE} from '../shared/mercenary-prime-requiem-v1.mjs';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryCombat,mercenaryBaseActionCredit} from '../functions/_mercenary_combat.js';
import {resolveHeliosKingArea} from '../functions/_mercenary_helios_king.js';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack,mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryLevelXpMultiplier} from '../shared/mercenary-level-v1.mjs';
import {mercenaryBattleTier} from '../shared/mercenary-rank-growth-v1.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';

test('Heukmu uses 3.5m in server fighters, catalog and snapshot; only its power budget changes',async()=>{
 const original=execFileSync('git',['show','125ab6d1238a2f47133a4231644eb090ce8c15b6:shared/mercenary-heukmu-v1.mjs'],{windowsHide:true}).toString();
 const old=await import('data:text/javascript;base64,'+Buffer.from(original).toString('base64'));
 assert.equal(HEUKMU_COMBAT.basePower,3500000);
 for(const k of ['statScale','basicCapScale'])assert.equal(HEUKMU_COMBAT[k],old.HEUKMU_COMBAT[k]*.875);
 for(const k of ['attackPercent','hpPercent'])assert(Math.abs(HEUKMU_COMBAT.link[k]/old.HEUKMU_COMBAT.link[k]-.875)<1e-12);
 assert(Math.abs((HEUKMU_COMBAT.link.shieldPercent+60)/(old.HEUKMU_COMBAT.link.shieldPercent+60)-.875)<1e-12);
 for(const k of ['actionCredit','speedScale','damageTakenScale','basicDamageScale','areaDamageCapScale'])assert.equal(HEUKMU_COMBAT[k],old.HEUKMU_COMBAT[k]);
 assert.deepEqual(HEUKMU_PVE_BALANCE,old.HEUKMU_PVE_BALANCE);
 for(const k of ['sourceArt','sourceArtSha256','battleSprite','battleSpriteSha256','skills','acquisitionEnabled','deploymentEnabled'])assert.deepEqual(HEUKMU_ART[k],old.HEUKMU_ART[k]);
 for(const mode of ['PVE','PVP'])for(const gear of [0,1e8])assert.equal(fighter(HEUKMU_CODE,'A',mode,1,gear).basePower,3500000+gear);
 assert.equal(limitedDeploymentSnapshot(HEUKMU_CODE).basePower,3500000);
 const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1});
 assert.equal(catalog.cards.find(c=>c.code===HEUKMU_CODE).basePower,3500000);
 assert.match(HEUKMU_ART.combatLinkDescription,/3,500,000/);
});

test('Helios King is stronger than Prime at equal growth and gear in actual PVE and PVP linkage',()=>{
 for(const mode of ['PVE','PVP'])for(const s of scenarios){
  const teams=[team(HELIOS_KING_CODE,'A',mode,s.level,s.gear,s.power),team(PRIME_CODE,'B',mode,s.level,s.gear,s.power)];
  const [h,p]=teams.map(t=>t.at(-1));
  assert.equal(h.basePower,3500000+s.gear);
  assert.equal(mercenaryBattleTier(h),mercenaryBattleTier(p));
  assert.equal(mercenaryLevelXpMultiplier(h),5);
  for(const key of ['attack','maxHp','defense'])assert(h[key]>p[key],`${mode} ${s.name} ${key}`);
  assert.equal(h.speed,p.speed);applyMercenaryCombatLink(teams);
  assert(mercenaryEffectiveAttack(h)>mercenaryEffectiveAttack(p));
  for(const key of ['maxHp','shield'])assert(h[key]>p[key],`${mode} linked ${key}`);
  assert.equal(mercenaryBaseActionCredit([h]),3.12);
  assert.equal(h.skills.length,mode==='PVE'?2:0);
  for(const key of ['counterImmune','controlImmune','poisonImmune'])assert.equal(h[key],true);
  assert.equal(!!h.mercenaryLink.primeZeroPvp,mode==='PVP');
  if(mode==='PVP')assert(mercenaryDamageCapHp(h)<(h.maxHp+h.mercenaryLink.openingShield)/5);
  h.hp=Math.floor(h.hp*.43);h.shield=Math.floor(h.shield*.27);const captured=structuredClone(teams);
  applyMercenaryCombatLink(teams);assert.deepEqual(teams,captured,'do not heal or compound linked fighters');
 }
});

test('two normal forms apply 165% once and retain one ordinary action',()=>{
 const h=fighter(HELIOS_KING_CODE),p=fighter(PRIME_CODE),target=buildFighter(cards()[0],0,'B',null,'PVE');
 const combat=mercenaryCombat({teams:{A:[h,p],B:[target]},clock:()=>0,hit:()=>({damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit(){}});
 assert.equal(HELIOS_KING_BASIC_FORMS.length,2);
 assert.equal(combat.beforeBasicDamage(h,target,10000),16500);
 assert.equal(combat.beforeBasicDamage(p,target,10000),15000);
 assert(combat.basicDamageCapScale(h)>combat.basicDamageCapScale(p));
});

test('area ratios and real hit caps exceed Prime by 25% and 50%, preserving a single distributed budget',()=>{
 for(const [index,skill]of HELIOS_KING_AREA_SKILLS.entries())for(const count of [1,3,13]){
  const actor=fighter(HELIOS_KING_CODE),targets=Array.from({length:count},(_,i)=>({id:'t'+i,side:'B',hp:1e9,maxHp:1e9,alive:true}));
  const calls=[],events=[],knocks=[];
  const args={actor,skill,targets:[...targets,targets[0],actor,{id:'ally',side:'A',hp:10},{id:'dead',side:'B',hp:0},{id:'suit',side:'B',hp:100,isBattleSuit:true}],
   hit:(a,t,ratio,options)=>{calls.push({ratio,options});return {damage:100};},
   damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout:t=>knocks.push(t.id),emit:(type,e)=>events.push({type,...e})};
  const hits=resolveHeliosKingArea(args),factor=index?1.5:1.25;
  assert.equal(hits.length,count);assert.equal(knocks.length,count);assert.equal(events.length,1);
  assert.equal(new Set(hits.map(h=>h.targetId)).size,count);assert(targets.every(t=>t.hp===1e9-100));
  assert(Math.abs(calls.reduce((n,c)=>n+c.ratio,0)-PRIME_PVE_BALANCE.damageRatio*factor)<1e-10);
  assert(calls.every(c=>c.options.pveCapScale===PRIME_COMBAT.areaDamageCapScale*factor));
  assert.equal(events[0].type,HELIOS_KING_AREA_EVENT);
  for(const change of [{battleMode:'PVP'},{hp:0},{stunned:true},{silenced:true},{code:PRIME_CODE}])assert.deepEqual(resolveHeliosKingArea({...args,actor:{...actor,...change}}),[]);
  for(const ratio of [NaN,Infinity,-1,10001])assert.deepEqual(resolveHeliosKingArea({...args,skill:{...skill,balance:{...skill.balance,damageRatio:ratio}}}),[]);
 }
});

test('shared three-action cooldown alternates both skills and charges energy only once',()=>{
 const run=code=>{const actor=fighter(code),enemy={...buildFighter(cards()[0],0,'B',null,'PVE'),hp:1e15,maxHp:1e15},events=[];
  const combat=mercenaryCombat({teams:{A:[actor],B:[enemy]},clock:()=>actor.actions,hit:()=>({hit:true,damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit:(type,row)=>{if(type===HELIOS_KING_AREA_EVENT||type===HEUKMU_AREA_EVENT)events.push({action:actor.actions,type,...row});}});
  for(actor.actions=1;actor.actions<=19;actor.actions++){
   const before=combat.state(actor).energy,cast=combat.beforeAction(actor);
   if(cast)assert.equal(before-combat.state(actor).energy,code===HELIOS_KING_CODE?20:35);
   else combat.afterBasic(actor,enemy,true);
   assert.equal(combat.state(actor).pending,null);assert(combat.state(actor).energy>=0);
  }return events;};
 const h=run(HELIOS_KING_CODE);assert.deepEqual(h.map(e=>e.action),[1,4,7,10,13,16,19]);
 h.forEach((e,i)=>assert.equal(e.skillId,HELIOS_KING_AREA_SKILLS[i%2].id));
 assert.deepEqual(run(HEUKMU_CODE).map(e=>e.action),[1,6,11,16]);
});

test('real PVE battle emits both authoritative skills; real PVP remains normal attacks only',()=>{
 for(const level of [1,11,21]){
  const pve=createPveBattleV2({cards:cards(),monster:{id:1,battle_power:160e9},seed:77,mercenary:snapshot(HELIOS_KING_CODE,level)});
  const events=pve.result.timeline.filter(e=>e.type===HELIOS_KING_AREA_EVENT);
  assert.equal(new Set(events.map(e=>e.skillId)).size,2);
  for(const e of events){assert(e.hits.every(h=>Number.isFinite(h.targetHpAfter)));assert.equal(new Set(e.hits.map(h=>h.targetId)).size,e.hits.length);}
  const pvp=createPvpBattleV2({attackerCards:cards(),defenderCards:cards(),attackerMercenary:snapshot(HELIOS_KING_CODE,level,'PVP'),defenderMercenary:snapshot(PRIME_CODE,level,'PVP'),seed:77});
  assert(!pvp.result.timeline.some(e=>e.type===HELIOS_KING_AREA_EVENT));
  assert(pvp.result.timeline.some(e=>e.type==='TURN'&&e.actorId==='A:MERCENARY:'+HELIOS_KING_CODE));
 }
});

test('General Jok priority and ordinary PVP boost never stack for Helios King',()=>{
 const teams=[team(HELIOS_KING_CODE,'A','PVP'),team('V-974','B','PVP',21,1e8)];applyMercenaryCombatLink(teams);
 const [h,j]=teams.map(t=>t.at(-1));
 assert(h.mercenaryLink.primeZeroGeneralJokPriority);assert.equal(h.mercenaryLink.primeZeroPvp,undefined);
 assert(mercenaryEffectiveAttack(h)>=Math.ceil(mercenaryEffectiveAttack(j)*4*7/6));
 assert(h.maxHp>=Math.ceil(j.maxHp*16*7/6));
 const once=structuredClone(teams);applyMercenaryCombatLink(teams);assert.deepEqual(teams,once);
});

test('new King remains unregistered and cannot replace Helios V-999 or change Prime policy',()=>{
 assert.equal(limitedDeploymentSnapshot(HELIOS_KING_CODE),null);
 assert.equal(HELIOS_KING_ART.deploymentEnabled,false);assert.equal(HELIOS_KING_ART.acquisitionEnabled,false);
 assert.equal(limitedDeploymentSnapshot('V-999').name,'헬리오스');
 assert.equal(PRIME_COMBAT.basePower,3000000);assert.equal(PRIME_PVE_BALANCE.damageRatio,30.24);
 assert.equal(HELIOS_KING_COMBAT.basePower,3500000);
});

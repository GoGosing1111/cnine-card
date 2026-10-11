import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {heliosPreparedSnapshot} from '../shared/mercenary-helios-preparation-v1.mjs';
import {HELIOS_COMBAT,HELIOS_AREA_SKILL,HELIOS_AREA_EVENT,heliosActionCredit,heliosIncomingDamage,heliosMotionRate} from '../shared/mercenary-helios-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {VALTER_COMBAT} from '../shared/mercenary-valter-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {resolveHeliosArea} from '../functions/_mercenary_helios.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';

const snapshot=(code='V-999')=>({...code==='V-999'?heliosPreparedSnapshot():limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code='V-999',side='A',mode='PVP',equipment)=>buildMercenaryFighter({...snapshot(code),equipment},side,mode,buildFighter);
const card=(side,ownerId)=>({id:side+':card:'+ownerId,side,ownerId,hp:1,alive:true});
const drain=c=>{const out=[];while(c.pending()){const a=c.pending();out.push(a);c.acted(a);assert.ok(out.length<=4,'Reserved actions must terminate');}return out;};

test('canonical Helios policy overrides stale stats and gains 4% natural speed with the same gear in either mode',()=>{
 for(const mode of ['PVE','PVP'])for(const side of ['A','B'])for(const power of [0,100000000]){
  const equipment={schemaVersion:1,mode,power},h=fighter('V-999',side,mode,equipment),v=fighter('V-996',side,mode,equipment);
  assert.equal(h.speed,Math.round(v.speed*1.04));assert.equal(h.stats.speed,h.speed);
  assert.equal(h.basePower-power,1123200);assert.equal(h.heliosPolicyVersion,1);
  assert.deepEqual(h.skills.map(s=>s.id),mode==='PVE'?['MS-999']:[]);
  for(const key of ['controlImmune','counterImmune','poisonImmune'])assert.equal(h[key],true);
  const stale={...snapshot(),rank:'C',basePower:1,stats:{hp:1,attack:1,defense:1,speed:1},skills:[],heliosPolicyVersion:0},before=structuredClone(stale);
  assert.equal(buildMercenaryFighter(stale,side,mode,buildFighter).speed,fighter('V-999',side,mode).speed);assert.deepEqual(stale,before);
 }
 assert.equal(HELIOS_COMBAT.basePower/VALTER_COMBAT.basePower,1.04);
 assert.equal(heliosMotionRate('attack')/2.5,1.04);assert.equal(heliosMotionRate('ultimate'),2.6);assert.equal(heliosMotionRate('aura'),1);
});

test('equal decks gain 4% HP and full opening shield without compounding the linked attack floor',()=>{
 for(const mode of ['PVE','PVP']){
  const h=fighter('V-999','A',mode),v=fighter('V-996','B',mode);
  const teams=['A','B'].map((side,i)=>[...tierCards(2e7).map((c,j)=>buildFighter(c,j,side,null,mode)),[h,v][i]]);
  applyMercenaryCombatLink(teams);
  assert.equal(h.maxHp,Math.round(v.maxHp*1.04));assert.equal(h.shield,Math.round(v.shield*1.04));
  assert.equal(mercenaryEffectiveAttack(h),mercenaryEffectiveAttack(v));
 }
});

test('fractional cadence funds exactly 312 turns per 100 allied actions, including long runs and both sides',()=>{
 for(const mode of ['PVE','PVP'])for(const side of ['A','B']){
  const other=side==='A'?'B':'A',ally=card(side),enemy=card(other),h=fighter('V-999',side,mode),c=mercenaryTurnCadence({[side]:[ally,h],[other]:[enemy]});
  let turns=0;
  for(let i=1;i<=1000;i++){
   for(const flags of [{isMonster:true},{isBattleSuit:true,actorKind:'BATTLE_SUIT'},{hp:0,alive:false}])c.acted({...ally,...flags});
   c.acted(enemy);assert.equal(c.pending(),null);c.acted(ally);turns+=drain(c).length;
   if(i%25===0)assert.equal(turns,i*3.12);
  }
  assert.equal(turns,3120);h.hp=0;h.alive=false;c.acted(ally);assert.equal(c.pending(),null);assert.equal(heliosActionCredit([h]),1);
 }
 assert.equal(heliosActionCredit([{...fighter(),isMercenary:false}]),1);
 assert.equal(heliosActionCredit([{...fighter(),code:'V-001',name:'헬리오스'}]),1);
});

test('duo credit stays with the owner and last-stand responses retain the fractional cadence',()=>{
 const a=card('A',1),b=card('A',2),enemy=card('B',3),h={...fighter(),ownerId:1},v={...fighter('V-996'),ownerId:2};
 const c=mercenaryTurnCadence({A:[a,b,h,v],B:[enemy]});let ht=0,vt=0;
 for(let i=0;i<25;i++){c.acted(a);const ha=drain(c);assert.ok(ha.every(x=>x===h));ht+=ha.length;c.acted(b);const va=drain(c);assert.ok(va.every(x=>x===v));vt+=va.length;}
 assert.equal(ht,78);assert.equal(vt,75);a.hp=0;a.alive=false;ht=0;
 for(let i=0;i<25;i++){c.acted(enemy);const turns=drain(c);assert.ok(turns.every(x=>x===h));ht+=turns.length;}
 assert.equal(ht,78);
});

test('canonical long battles keep the 312 funded turns instead of truncating at the Valter safety cap',()=>{
 for(const mode of ['PVE','PVP'])for(const side of ['A','B']){
  const other=side==='A'?'B':'A',sturdy=(a,speed)=>({...a,attack:1,hp:1e15,maxHp:1e15,shield:0,maxShield:0,speed,gauge:0});
  const ally=sturdy(buildFighter({id:'ally',power:10000},0,side,null,mode),1e6),enemy=sturdy(buildFighter({id:'enemy',power:10000},0,other,null,mode),1),h=sturdy(fighter('V-999',side,mode),1);h.skills=[];
  const teams={[side]:[ally,h],[other]:[enemy]},input={teamA:teams.A,teamB:teams.B,seed:7919,maxActions:101,suddenDeathAfter:1000};
  const result=simulateBattleV2Preview(input);
  assert.equal(result.actions,101);assert.equal(result.mercenaryActions,312);assert.deepEqual(result,simulateBattleV2Preview(input));
 }
});

test('Helios personal mitigation and Berkan immunity affect neither allies nor lookalike card names',()=>{
 const h=fighter(),berkan={isMercenary:true,code:'V-055'};
 assert.equal(heliosIncomingDamage(h,1000,berkan),0);assert.equal(heliosIncomingDamage(h,1000,{...berkan,code:'V-054'}),250);
 assert.equal(heliosIncomingDamage({...h,isMercenary:false},1000,berkan),1000);
 assert.equal(heliosIncomingDamage({...h,code:'V-001',name:'헬리오스'},1000,berkan),1000);
 assert.equal(heliosIncomingDamage(h,1000,{code:'V-055'}),250);
});

test('PVE collapse uses one budget per cast and rejects duplicate, dead, immune-object and PVP contacts',()=>{
 const h=fighter('V-999','A','PVE'),foes=Array.from({length:5},(_,i)=>({id:'t'+i,alive:true,hp:10000,maxHp:10000,shield:0})),calls=[],events=[],kos=[];
 const input={actor:h,skill:HELIOS_AREA_SKILL,targets:[...foes,foes[0],{id:'dead',hp:0},{id:'suit',hp:100,isBattleSuit:true}],
  hit:(a,t,ratio)=>{calls.push({id:t.id,ratio});return {damage:ratio*100,dodge:t.id==='t2'};},
  damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout:t=>kos.push(t.id),emit:(type,event)=>events.push({type,...event})};
 const hits=resolveHeliosArea(input);assert.equal(hits.length,5);assert.equal(calls.length,5);
 assert.ok(Math.abs(calls.reduce((n,h)=>n+h.ratio,0)-5.6)<1e-9);assert.equal(events.length,1);assert.equal(events[0].type,HELIOS_AREA_EVENT);
 assert.equal(hits[2].damage,0);assert.equal(foes[2].hp,10000);assert.equal(new Set(kos).size,5);
 assert.deepEqual(resolveHeliosArea({...input,actor:{...h,battleMode:'PVP'}}),[]);
 assert.deepEqual(resolveHeliosArea({...input,actor:{...h,stunned:true}}),[]);
});

test('PVE skill energy and cooldown resolve on the same actions as Valter, and debuffs cannot slow the new sovereign',()=>{
 const schedule=code=>{
  const h=fighter(code,'A','PVE'),enemy={...buildFighter({id:'enemy',power:1e6},0,'B',null,'PVE'),hp:1e12,maxHp:1e12},casts=[];
  const runtime=mercenaryCombat({teams:{A:[h],B:[enemy]},hit:()=>({damage:1,dodge:false}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},clock:()=>0,emit:(type,e)=>{if(type==='MERCENARY_WINDUP')casts.push({action:h.actions,energy:e.energyAfter});}});
  for(let i=1;i<=40;i++){h.actions=i;if(!runtime.beforeAction(h))runtime.afterBasic(h,enemy,true);}
  return casts;
 };
 const hc=schedule('V-999');assert.deepEqual(hc,schedule('V-996'));assert.ok(hc.length>=6);assert.equal(hc[0].energy,fixture.combat.energyMax-35);
 for(let i=1;i<hc.length;i++)assert.ok(hc[i].action-hc[i-1].action>=5);
 for(const mechanic of ['FRONT_OFFENSE_VEIL','BREAK_ARMOR_WINDOW','REPEAT_OFFENDER_RESTRAINT','DUEL_OATH','THORN_RECOIL_SEAL','INFILTRATE_DELAYED_VENOM']){
  const h=fighter(),foe={...fighter('V-996','B'),skills:[{id:'QA',name:'QA',mechanic,balance:{damageRatio:1,cost:0,cooldownTurns:1}}]},defense=h.defense;
  h.shield=1000;
  const r=mercenaryCombat({teams:{A:[h],B:[foe]},hit:()=>({damage:1,dodge:false}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},clock:()=>0,emit(){}});
  foe.actions=1;r.beforeAction(foe);assert.equal(h.defense,defense);assert.deepEqual(r.debuffs.get(h.id)||{},{},mechanic);
 }
});

test('real server payloads publish Helios actions and PVE skill without changing ordinary fighters or opening acquisition',()=>{
 const cards=tierCards(2e7),mercenary=snapshot();
 for(const mode of ['PVE','PVP']){
  const input={cards,mercenary,monster:{id:1,battle_power:6e10},seed:7919},pvp={attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,seed:7919};
  const battle=mode==='PVE'?createPveBattleV2(input):createPvpBattleV2(pvp),without=mode==='PVE'?createPveBattleV2({...input,mercenary:null}):createPvpBattleV2({...pvp,attackerMercenary:null});
  assert.deepEqual(battle.teams.A.cards,without.teams.A.cards);
  assert.equal(battle.teams.A.mercenaries[0].heliosPolicyVersion,1);
  assert.equal(battle.result.timeline.some(e=>e.type===HELIOS_AREA_EVENT),mode==='PVE');
 }
 assert.equal(limitedDeploymentSnapshot('V-999').deploymentEnabled,true);assert.equal(heliosPreparedSnapshot().deploymentEnabled,false);
});

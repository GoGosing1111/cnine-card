import test from 'node:test';
import assert from 'node:assert/strict';
import {SS_LIMITED_COMBAT,SS_LIMITED_TEMPO,SS_LIMITED_TARGET,ssLimitedActionCredit} from '../shared/mercenary-ss-limited-v1.mjs';
import {mercenaryTurnCadence,buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {ssLimitedSnapshot,sssReferences} from '../scripts/measure-ss-limited-balance-20261008.mjs';
import {measureMercenaryTempo} from '../scripts/measure-ss-limited-tempo-20261009.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';

const codes=Object.keys(SS_LIMITED_COMBAT),fighter=(code,side='A',mode='PVP')=>buildMercenaryFighter(ssLimitedSnapshot(code),side,mode,buildFighter);
const card=(side='A',ownerId)=>({id:side+':card:'+ownerId,side,ownerId,alive:true,hp:100});
function drain(c){const ids=[];let actor;while((actor=c.pending())){assert.ok(ids.length<4,'no recursive extra actions');ids.push(actor.id);c.acted(actor);}return ids;}

test('all seven receive two reserved actions and doubled natural speed in PVE and PVP',()=>{
 for(const mode of ['PVE','PVP']){
  const reference=sssReferences.map(s=>measureMercenaryTempo(s,mode)),mean=reference.reduce((n,r)=>n+r.reservedActions,0)/reference.length;
  assert.equal(mean,68);
  for(const code of codes){
   const actor=fighter(code,'A',mode),base=buildFighter({id:code,power:180000,type:'NONE'},5,'A',null,mode),measured=measureMercenaryTempo(ssLimitedSnapshot(code),mode);
   assert.equal(actor.speed,Math.round(base.speed*SS_LIMITED_TEMPO.speedScale));assert.equal(actor.stats.speed,actor.speed);assert.equal(actor.rank,'SS');
   assert.equal(measured.reservedActions,128);assert.deepEqual(measured.counts,Array(64).fill(2));
   assert.equal(measured.energyMax,100);assert.equal(measured.energyPerBasic,10);assert.equal(measured.skills[0].cost,20);assert.equal(measured.skills[0].cooldownTurns,2);
   const cycle=code==='V-993'?3:2;
   assert.deepEqual(measured.casts.map(c=>c.action),Array.from({length:Math.ceil(64/cycle)},(_,i)=>1+i*cycle),'a full 64-action fight never waits for energy');
   assert.ok(measured.casts.every(c=>c.energyAfter>=0));
  }
 }
 for(const code of [...SS_LIMITED_TARGET.excludes,'V-004','constructor','__proto__'])assert.equal(ssLimitedActionCredit([{code,rank:'SS',edition:'LIMITED',statMode:'RANK_FIXED',isMercenary:true,hp:1}]),1);
});

test('both sides accrue only allied card actions, with no ghost turns or suit/monster recursion',()=>{
 for(const mode of ['PVE','PVP'])for(const side of ['A','B'])for(const code of codes){
  const ally=card(side),enemy=card(side==='A'?'B':'A'),actor=fighter(code,side,mode),teams={[side]:[ally,actor],[enemy.side]:[enemy]},c=mercenaryTurnCadence(teams);
  let count=0;
  for(let i=0;i<16;i++){
   for(const extra of [{isBattleSuit:true,actorKind:'BATTLE_SUIT'},{isMonster:true},{hp:0}])c.acted({...ally,...extra});
   c.acted(enemy);assert.deepEqual(drain(c),[]);c.acted(ally);count+=drain(c).length;
  }
  assert.equal(count,32);assert.equal(c.pending(),null);
  actor.hp=0;actor.alive=false;for(let i=0;i<16;i++)c.acted(ally);assert.equal(c.pending(),null);
 }
});

test('duo credit remains owner-local and last-stand PVP responses preserve the same cadence',()=>{
 const a=card('A',1),b=card('A',2),enemy=card('B',3),m={...fighter('V-990'),ownerId:1},n={...fighter('V-998'),ownerId:2};
 const c=mercenaryTurnCadence({A:[a,b,m,n],B:[enemy]});
 for(const [ally,merc]of [[a,m],[b,n]]){let count=0;for(let i=0;i<16;i++){c.acted(ally);const actions=drain(c);assert.ok(actions.every(id=>id===merc.id));count+=actions.length;}assert.equal(count,32);}
 a.hp=0;a.alive=false;let count=0;for(let i=0;i<16;i++){c.acted(enemy);const actions=drain(c);assert.ok(actions.every(id=>id===m.id));count+=actions.length;}assert.equal(count,32);
});

test('additional visual impacts cannot recover energy or repeat a paid cast',()=>{
 for(const code of codes){
  const actor=fighter(code),target={...buildFighter({id:'target',power:1e9},0,'B',null,'PVP'),hp:1e12,maxHp:1e12},events=[];
  const r=mercenaryCombat({teams:{A:[actor],B:[target]},hit:()=>({damage:1,dodge:false}),damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},clock:()=>0,emit:(type,data)=>events.push({type,...data})});
  actor.actions=1;r.beforeAction(actor);assert.equal(r.state(actor).energy,80);
  for(let i=0;i<10;i++)r.afterBasic(actor,target,true,{additional:true});assert.equal(r.state(actor).energy,80);
  actor.actions=2;r.beforeAction(actor);assert.equal(r.state(actor).energy,90);
  r.beforeAction(actor);assert.equal(r.state(actor).energy,90,'revisiting the same action cannot regenerate twice');
  assert.equal(events.filter(e=>e.type==='MERCENARY_WINDUP'&&!e.continuation).length,1);
  assert.equal(r.state(actor).cooldown.get(actor.skills[0].id),3);
 }
});

test('canonical PVE, PVP and duo publish adjusted speed without changing regular cards or ordinary SSS',()=>{
 const cards=tierCards(2e7),regular=sssReferences.find(c=>c.code==='V-049');
 for(const code of codes){
  const mercenary=ssLimitedSnapshot(code),pve=createPveBattleV2({cards,mercenary,monster:{id:1,battle_power:6e8},seed:7919}),args={attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,defenderMercenary:regular,seed:7919},pvp=createPvpBattleV2(args);
  assert.deepEqual(createPvpBattleV2(args),pvp);
  for(const [battle,mode]of [[pve,'PVE'],[pvp,'PVP']]){assert.equal(battle.teams.A.cards.length,5);assert.equal(battle.teams.A.mercenaries[0].stats.speed,fighter(code,'A',mode).speed);assert.ok(battle.result.timeline.some(e=>e.actorId?.endsWith(code)&&e.type==='MERCENARY_HIT'));}
  assert.equal(pvp.teams.B.mercenaries[0].stats.speed,buildMercenaryFighter(regular,'B','PVP',buildFighter).speed);
 }
 const squad=(ownerId,mercenary)=>({ownerId,mercenary,cards}),duo=createDuoBattleV2({attackerSquads:[squad(1,ssLimitedSnapshot('V-990')),squad(2,ssLimitedSnapshot('V-998'))],defenderSquads:[squad(3,regular),squad(4,regular)],seed:7919});
 assert.equal(duo.teams.A.mercenaries.length,2);assert.ok(duo.teams.A.mercenaries.every(m=>m.stats.speed===fighter(m.code).speed));
});

test('codex explains the SS limited tier and action policy without applying it to SSS limited',()=>{
 const data=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61});
 for(const code of codes){const c=data.cards.find(c=>c.code===code);assert.match(c.combatLinkDescription,/일반 SSS/);assert.match(c.combatLinkDescription,/1회 행동당.*2회/);assert.match(c.combatLinkDescription,/에너지 10.*비용은 20.*자기 2행동/);assert.equal(c.rank,'SS');assert.equal(c.acquisitionEnabled,false);}
 for(const code of SS_LIMITED_TARGET.excludes)assert.equal(data.cards.find(c=>c.code===code).combatLinkDescription,undefined);
});

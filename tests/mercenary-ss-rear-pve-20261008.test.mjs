import test from 'node:test';
import assert from 'node:assert/strict';
import {SS_REAR_PVE_POLICY,isSsRearPveMercenary,ssRearPveSnapshot,ssRearPveInterval} from '../shared/mercenary-ss-rear-pve-v1.mjs';
import {SS_LIMITED_COMBAT} from '../shared/mercenary-ss-limited-v1.mjs';
import {battleConfig} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {buildMercenaryFighter,mercenaryCombat,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {buildFighter,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {fixture,snapshot,scenarios,runBattle,metrics} from '../scripts/measure-ss-rear-pve-20261008.mjs';

const targets=fixture.roster.filter(isSsRearPveMercenary);
const document={mercenaries:fixture.roster,assignments:fixture.roster.map(m=>({code:m.code,skillIds:m.skills.map(s=>s.id)})),
 skills:[...new Map(fixture.roster.flatMap(m=>m.skills).map(s=>[s.id,s])).values()]};
const card=(side='A',ownerId)=>({id:side+':card:'+ownerId,side,ownerId,hp:100,alive:true});
function actor(code='V-051',mode='PVE',ownerId){
 const m=fixture.roster.find(m=>m.code===code);
 return {...m,...ssRearPveSnapshot(m),id:'A:merc:'+code,side:'A',ownerId,isMercenary:true,hp:100,alive:true,battleMode:mode};
}
function clean(value){return JSON.parse(JSON.stringify(value,(key,v)=>key==='pveRearCadence'?undefined:v));}

test('new account snapshots capture all four nurses and eleven rear ranged fighters; other ranks and limited remain excluded',()=>{
 assert.equal(targets.length,15);
 assert.equal(targets.filter(m=>m.role==='SUPPORT').length,4);
 assert.equal(targets.filter(m=>m.position==='MIDDLE').length,7);
 const original=structuredClone(document);
 for(const m of fixture.roster){
  const fresh=battleConfig(document,m.code,1);
  assert.deepEqual(fresh.pveRearCadence,isSsRearPveMercenary(m)?SS_REAR_PVE_POLICY:undefined,m.code);
  if(fresh.pveRearCadence){fresh.pveRearCadence.regularActionsPerTurn=99;assert.equal(battleConfig(document,m.code,1).pveRearCadence.regularActionsPerTurn,2);}
 }
 assert.deepEqual(document,original);
 for(const [code,profile]of Object.entries(SS_LIMITED_COMBAT)){
  const m={code,rank:'SS',...profile};assert.equal(isSsRearPveMercenary(m),false,code);assert.deepEqual(ssRearPveSnapshot(m),{});
 }
 for(const rank of ['S','SSS'])assert.equal(isSsRearPveMercenary({...targets[0],rank}),false);
 assert.equal(isSsRearPveMercenary({...targets[0],position:'FRONT'}),false);
});

test('PVE reserves one action per two allied cards; PVP and legacy snapshots keep one per card',()=>{
 for(const mode of ['PVE','PVP'])for(const legacy of [false,true]){
  const m=actor('V-004',mode),a=card(),enemy=card('B');if(legacy)delete m.pveRearCadence;
  const runtime=mercenaryTurnCadence({A:[a,m],B:[enemy]});
  for(let i=0;i<3;i++){runtime.acted(enemy);runtime.acted({...a,isBattleSuit:true,actorKind:'BATTLE_SUIT'});runtime.acted({...a,isMonster:true});}
  assert.equal(runtime.pending(),null);
  runtime.acted(a);
  const slow=mode==='PVE'&&!legacy;
  assert.equal(runtime.pending(),slow?null:m);
  if(slow){runtime.acted(a);assert.equal(runtime.pending(),m);}
  assert.equal(runtime.pending(()=>false),null,'sealed/ineligible actors cannot consume a reservation');
  runtime.acted(m);assert.equal(runtime.pending(),null,'natural or reserved actions clear debt');
  runtime.acted(a);runtime.acted(m);runtime.acted(a);
  assert.equal(runtime.pending(),slow?null:m,'natural turns cannot preserve old debt');
  m.hp=0;m.alive=false;assert.equal(runtime.pending(),null);
 }
});

test('owner-scoped formations cannot borrow teammate actions, and SSS cadence stays intact',()=>{
 const a=card('A',1),b=card('A',2),nurse=actor('V-051','PVE',1),sss=actor('V-021','PVE',2);
 const runtime=mercenaryTurnCadence({A:[a,b,nurse,sss],B:[card('B')]});
 runtime.acted(a);assert.equal(runtime.pending(),null);
 runtime.acted(b);assert.equal(runtime.pending(),sss);
 runtime.acted(sss);assert.equal(runtime.pending(),null);
 runtime.acted(a);assert.equal(runtime.pending(),nurse);
 runtime.acted(nurse);assert.equal(runtime.pending(),null);
});

function heal({mode='PVE',legacy=false,attack=1000000,reduction=0,converted=false}={}){
 const m=snapshot({code:'V-051',equipment:0,adjusted:!legacy}).mercenary;
 const a=buildMercenaryFighter(m,'A',mode,buildFighter);
 Object.assign(a,{attack,maxHp:100000,hp:1000,healingReductionPercent:reduction});
 const dead={...a,id:'A:dead',hp:0,alive:false},full={...a,id:'A:full',hp:100000};
 const events=[];let request;
 const runtime=mercenaryCombat({teams:{A:[a,full,dead],B:[]},hit:()=>assert.fail(),damage:()=>assert.fail(),knockout:()=>assert.fail(),
  emit:(type,event)=>events.push({type,...event}),clock:()=>0,
  ...(converted?{season2:{skillBlocked:()=>false,heal:(t,amount)=>{if(t===a)request=amount;const actual=Math.min(t.maxHp-t.hp,amount);t.hp+=actual;return actual;}}}:{})});
 a.actions++;runtime.beforeAction(a);
 return {a,dead,full,request,event:events.find(e=>e.type==='MERCENARY_GROUP_HEAL')};
}
test('nurse PVE budget is 120% and each target caps at 10% before suppression; no resurrection or redistributed overheal',()=>{
 for(const converted of [false,true])for(const reduction of [0,50,100]){
  const r=heal({reduction,converted});assert.equal(r.event.budget,1200000);assert.equal(r.event.amount,10000*(1-reduction/100));
  assert.equal(r.dead.hp,0);assert.equal(r.full.hp,100000);assert.equal(r.event.heals.length,2);
  if(converted)assert.equal(r.request,r.event.amount);
 }
 const budgetBound=heal({attack:1000});assert.equal(budgetBound.event.budget,1200);assert.equal(budgetBound.event.amount,600,'full HP ally still owns its unused share');
 for(const options of [{mode:'PVP'},{legacy:true}]){
  const r=heal(options);assert.equal(r.event.budget,1600000);assert.equal(r.event.amount,15000);
 }
});

test('all affected mercenaries retain exactly the previous PVP timelines and outcomes, on either side',()=>{
 const cards=snapshot({code:'V-051',equipment:6000000}).cards;
 for(const target of targets)for(const seed of [101,202])for(const side of ['attacker','defender']){
  const prior=snapshot({code:target.code,equipment:6000000}).mercenary;
  const changed=snapshot({code:target.code,equipment:6000000,adjusted:true}).mercenary;
  const opponent=snapshot({code:'V-049',equipment:6000000}).mercenary;
  const args={attackerCards:cards,defenderCards:cards,attackerEquipmentBonus:6000000,defenderEquipmentBonus:6000000,
   attackerMercenary:opponent,defenderMercenary:opponent,seed};
  const before=createPvpBattleV2({...args,[side+'Mercenary']:prior}),after=createPvpBattleV2({...args,[side+'Mercenary']:changed});
  assert.deepEqual(clean(after),clean(before),target.code+'/'+side+'/'+seed);
 }
});

test('apocalypse, tower and legion builders carry the captured policy and reduce rear contribution with a battle suit',()=>{
 const selected=[scenarios.find(s=>s.mode==='APOCALYPSE'),scenarios.find(s=>s.mode==='TOWER'&&s.id==='70'),scenarios.find(s=>s.mode==='LEGION'&&s.id==='inferno')];
 for(const scenario of selected)for(const code of ['V-004','V-051']){
  const args={code,equipment:6000000,suit:12500000},before=runBattle(scenario,snapshot(args),7919),after=runBattle(scenario,snapshot({...args,adjusted:true}),7919);
  const m=after.final.mercenaries.A[0];assert.deepEqual(m.pveRearCadence,SS_REAR_PVE_POLICY);
  assert.ok(metrics(after).mercenaryBasics<metrics(before).mercenaryBasics,scenario.mode+'/'+code);
  assert.ok(metrics(after).mercenaryDamage>0);
  for(const e of after.timeline.filter(e=>e.type==='MERCENARY_GROUP_HEAL'))for(const h of e.heals)assert.ok(h.amount<=Math.floor(h.targetMaxHp*.1));
 }
});

test('saved snapshots, SS front and SSS do not opt into the new PVE policy',()=>{
 for(const m of fixture.roster){
  const old={...m,isMercenary:true,battleMode:'PVE'};assert.equal(ssRearPveInterval(old),1);
  if(!isSsRearPveMercenary(m)){
   const args={code:m.code,equipment:6000000},scenario=scenarios[0];
   assert.deepEqual(runBattle(scenario,snapshot({...args,adjusted:true}),7),runBattle(scenario,snapshot(args),7));
  }
 }
 for(const [code,profile]of Object.entries(SS_LIMITED_COMBAT)){
  const a={...actor('V-004'),code,...profile};assert.equal(ssRearPveInterval(a),1);
 }
});

test('public codex describes actual PVE cadence and healing without changing displayed rank or the base CMS values',()=>{
 const raw=structuredClone(seed.document);
 for(const m of fixture.roster){const row=raw.mercenaries.find(c=>c.code===m.code);Object.assign(row,{rank:m.rank,position:m.position,role:m.role});}
 const codex=mercenaryCodexDocument({payload_json:JSON.stringify(raw),revision:61});
 for(const m of targets){const row=codex.cards.find(c=>c.code===m.code);assert.equal(row.rank,'SS');assert.match(row.combatLinkDescription,/PVE에서는 아군 카드 2회, PVP에서는 1회/);}
 const nurse=codex.cards.find(c=>c.code==='V-051').skills[0];
 assert.match(nurse.effect,/PVE.*120%.*10%.*PVP.*160%.*15%/);assert.equal(nurse.balance.damageRatio,1.6);
 assert.equal(nurse.pveBalance.damageRatio,1.2);assert.doesNotMatch(nurse.bossRule,/동일한 총 회복/);
 assert.match(codex.cards.find(c=>c.code==='V-048').combatLinkDescription,/아군 카드 1회 행동마다/);
});

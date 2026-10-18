import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFighter,createPveBattleV2,createPvpBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {battleConfig} from '../functions/_mercenary_account.js';
import {HALLOWEEN_COMBAT} from '../shared/mercenary-halloween-combat-v1.mjs';
import {IMPERIAL_ARCHER_COMBAT as archer,IMPERIAL_ARCHER_SKILLS,imperialArcherCredit} from '../shared/mercenary-kangyun-v1.mjs';
import {balanceSnapshot,balanceFingerprint,halloweenCodes,balanceFormations} from '../scripts/measure-ss-mercenary-balance-20261019.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';

function harness(code,mode='PVP'){
 const actor=buildMercenaryFighter(balanceSnapshot(code),'A',mode,buildFighter),hits=[],events=[];
 const targets=Array.from({length:3},(_,i)=>({id:'B:'+i,side:'B',slot:i,row:i<2?'FRONT':'BACK',attack:1000+i,openingAttack:1000+i,hp:1e9,maxHp:1e9,shield:0,alive:true}));
 const ally={...targets[0],id:'A:ally',side:'A'},runtime=mercenaryCombat({teams:{A:[actor,ally],B:targets},
  hit:(a,t,ratio,options)=>{hits.push({id:t.id,action:a.actions,ratio,options});return {damage:Math.floor(ratio*100),dodge:false};},
  damage:(t,n)=>{const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.shield-=absorbed;t.hp-=hpDamage;return {absorbed,hpDamage};},
  knockout:t=>{if(t.hp<=0)t.alive=false;},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 return {actor,targets,ally,hits,events,runtime,act(){actor.actions++;return runtime.beforeAction(actor);}};
}

test('independent mirrored holdout has no globally dominant seasonal fighter and Kangyun beats every SS matchup overall',()=>{
 const r=JSON.parse(fs.readFileSync('docs/qa/ss-mercenary-balance-20261019/holdout.json'));
 assert.equal(r.policyFingerprint,balanceFingerprint());assert.equal(r.total,20160);assert.equal(r.count,32);assert.equal(r.start,890001);
 assert.equal(r.formations.length,9);assert.equal(r.matches.length,35);
 for(const row of r.summaries){assert.equal(row.draws,0);assert.equal(row.sides.A.total,row.sides.B.total);
  if(row.code==='V-057'){assert.ok(row.winRate>.85);for(const matchup of Object.values(row.opponents))assert.ok(matchup.winRate>.65);}
  else {assert.ok(row.winRate>=.4&&row.winRate<=.6,`${row.code}: ${row.winRate}`);assert.equal(Object.keys(row.opponents).length,6);}
 }
 // Replay a small independent slice through the current server, not just JSON.
 for(const m of r.matches.filter(m=>['V-980','V-057'].includes(m.a))){const s=m.samples[0],f=balanceFormations[1];
  const battle=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMercenary:balanceSnapshot(m.a),defenderMercenary:balanceSnapshot(m.b),seed:s.seed});
  assert.equal(battle.result.winner,s.winner);assert.equal(battle.result.timeline.length,s.events);
 }
});

test('seasonal skills retain their distinct targets, one paid budget and continued action sequence in PVE and PVP',()=>{
 for(const mode of ['PVE','PVP'])for(const code of halloweenCodes.filter(c=>c!=='V-984')){
  const h=harness(code,mode),p=HALLOWEEN_COMBAT[code],turns=code==='V-981'?3:['V-983','V-985'].includes(code)?2:1;
  for(let n=0;n<turns;n++)h.act();
  assert.equal(h.events.filter(e=>e.type==='MERCENARY_WINDUP'&&!e.continuation).length,1,code);
  assert.equal(h.runtime.state(h.actor).energy,80+(turns-1)*10,code);
  assert.ok(Math.abs(h.hits.reduce((sum,hit)=>sum+hit.ratio,0)-p.skill.balance.damageRatio)<1e-9,code);
  assert.deepEqual(h.hits.map(t=>t.id),code==='V-981'?['B:0','B:1','B:2']:code==='V-983'?['B:0','B:1','B:0','B:1']:code==='V-985'?['B:0','B:0']:['B:0']);
  assert.deepEqual(h.hits.map(t=>t.action),code==='V-981'?[1,2,3]:code==='V-983'?[1,1,2,2]:code==='V-985'?[1,2]:[1]);
 }
 const mark=harness('V-983');mark.act();mark.act();mark.act();assert.equal(mark.hits.length,4,'explosion has a response window before re-marking');mark.act();assert.equal(mark.hits.length,6);
 const draw=harness('V-986');draw.targets[2].hp=5e8;draw.act();assert.equal(draw.hits[0].id,'B:2');assert.equal(draw.hits[0].ratio,6.72*1.25);draw.act();assert.equal(draw.events.filter(e=>e.type==='MERCENARY_WINDUP').length,2);
 for(const code of halloweenCodes)for(const status of ['stunned','silenced','dead']){
  const h=harness(code);if(status==='dead'){h.actor.hp=0;h.actor.alive=false;}else h.actor[status]=true;
  h.act();assert.equal(h.hits.length,0);assert.equal(h.events.filter(e=>e.type==='MERCENARY_WINDUP').length,0);assert.equal(h.runtime.state(h.actor).energy,100);
 }
});

test('Kangyun skill default migration is read-only, idempotent and preserves manual CMS changes and assignments',()=>{
 const old=structuredClone(seed.document);
 for(const [id,balance]of [['MS-059',{damageRatio:6.8,cooldownTurns:4,cost:35}],['MS-060',{damageRatio:7,cooldownTurns:5,cost:35}]])old.skills.find(s=>s.id===id).balance=balance;
 const copy=structuredClone(old),next=expandMercenarySkillCatalog(old,seed.document,seed.catalog);
 assert.deepEqual(old,copy);assert.deepEqual(expandMercenarySkillCatalog(next,seed.document,seed.catalog),next);
 for(const s of IMPERIAL_ARCHER_SKILLS)assert.deepEqual(next.skills.find(x=>x.id===s.id).balance,s.balance);
 assert.deepEqual(next.assignments,old.assignments);assert.deepEqual(next.mercenaries,old.mercenaries);assert.deepEqual(next.settings,old.settings);
 assert.deepEqual(next.skills.filter(s=>!s.id.match(/^MS-0(59|60)$/)),old.skills.filter(s=>!s.id.match(/^MS-0(59|60)$/)));
 const codex=mercenaryCodexDocument({payload_json:JSON.stringify(old),revision:1}).cards.find(c=>c.code==='V-057');
 const live=battleConfig(next,'V-057',1);assert.equal(codex.basePower,324000);assert.equal(live.basePower,324000);assert.deepEqual(codex.skills.map(s=>s.balance),live.skills.map(s=>s.balance));assert.match(codex.combatLinkDescription,/속도 3배/);
 old.skills.find(s=>s.id==='MS-059').balance.cost=31;old.skills.find(s=>s.id==='MS-060').balance.damageRatio=null;old.assignments.find(s=>s.code==='V-057').skillIds=[];
 const custom=expandMercenarySkillCatalog(old,seed.document,seed.catalog);assert.deepEqual(custom,old);
});

test('Kangyun equipment scaling and action credit stay intrinsic, finite and owner-scoped',()=>{
 for(const mode of ['PVP','PVE'])for(const power of [0,100000000]){
  const snapshot={...balanceSnapshot('V-057'),equipment:{schemaVersion:1,mode,power}},a=buildMercenaryFighter(snapshot,'A',mode,buildFighter);
  assert.equal(a.basePower,324000+power);
  for(const code of halloweenCodes){const b=buildMercenaryFighter({...balanceSnapshot(code),equipment:{schemaVersion:1,mode,power}},'B',mode,buildFighter);assert.ok(a.maxHp>b.maxHp);assert.ok(a.attack>b.attack);assert.ok(a.speed>b.speed);}
  if(power){const bare=buildMercenaryFighter(balanceSnapshot('V-057'),'A',mode,buildFighter);assert.equal(a.equipmentStats.attack,a.attack-bare.attack);assert.equal(a.equipmentStats.hp,a.maxHp-bare.maxHp);}
 }
 const a=buildMercenaryFighter(balanceSnapshot('V-057'),'A','PVP',buildFighter),b=buildMercenaryFighter(balanceSnapshot('V-057'),'A','PVP',buildFighter);
 a.ownerId=1;b.ownerId=2;const card={id:'C',ownerId:1,side:'A',hp:10,alive:true};
 const cadence=mercenaryTurnCadence({A:[a,b,card],B:[]});cadence.acted(card);
 for(let i=0;i<3;i++){assert.equal(cadence.pending(),a);cadence.acted(a);}assert.equal(cadence.pending(),null);
 assert.equal(imperialArcherCredit([{...a,alive:false,hp:0}]),1);
 const h=harness('V-057');h.runtime.state(h.actor).energy=0;h.act();assert.equal(h.runtime.state(h.actor).energy,10);h.runtime.beforeAction(h.actor);assert.equal(h.runtime.state(h.actor).energy,10,'one regeneration per actual action');
 assert.equal(h.runtime.basicDamageCapScale(h.actor),archer.basicCapScale);
});

test('canonical PVE and duo paths execute each seasonal specialty and Kangyun rain is PVE-only',()=>{
 const cards=tierCards(2e7);
 for(const code of ['V-057',...halloweenCodes]){
  const s=balanceSnapshot(code),pve=createPveBattleV2({cards,mercenary:s,monster:{id:1,name:'QA',battle_power:5e9},seed:35001});
  assert.equal(pve.teams.A.mercenaries[0].code,code);assert.ok(pve.result.timeline.some(e=>e.actorId?.endsWith(code)&&e.type==='MERCENARY_WINDUP'),code);
  const duo=createDuoBattleV2({attackerSquads:[{ownerId:1,cards,mercenary:s},{ownerId:2,cards,mercenary:balanceSnapshot('V-985')}],defenderSquads:[{ownerId:3,cards,mercenary:balanceSnapshot('V-984')},{ownerId:4,cards,mercenary:balanceSnapshot('V-982')}],seed:35002});
  assert.equal(duo.teams.A.mercenaries.length,2);assert.ok(duo.result.timeline.some(e=>e.skillId===s.skills[0].id),code);
  if(code==='V-057'){assert.ok(pve.result.timeline.some(e=>e.type==='MERCENARY_IMPERIAL_ARROW_RAIN'));assert.ok(!duo.result.timeline.some(e=>e.type==='MERCENARY_IMPERIAL_ARROW_RAIN'));}
 }
});

test('PVE comparison preserves the ranged skill floor without multiplying one cast per arrow',()=>{
 const r=JSON.parse(fs.readFileSync('docs/qa/ss-mercenary-balance-20261019/pve.json'));
 assert.equal(r.policyFingerprint,balanceFingerprint());assert.equal(r.total,360);
 for(const c of r.cases){const own=r.rows.find(row=>row.code==='V-057'&&row.scenario===c.id);
  for(const other of r.rows.filter(row=>row.code!=='V-057'&&row.scenario===c.id)){
   assert.ok(own.averageTurns<other.averageTurns);assert.ok(own.averageDamage>=other.averageDamage);assert.ok(own.clears>=other.clears);
  }
 }
 for(const mode of ['PVP','PVE'])for(const skill of IMPERIAL_ARCHER_SKILLS){
  if(mode==='PVP'&&skill.pveOnly)continue;
  const h=harness('V-057',mode);h.actor.skills=[structuredClone(skill)];h.act();
  assert.ok(h.hits.every(hit=>hit.options.rangedSkill===(mode==='PVE')));
  assert.ok(Math.abs(h.hits.reduce((n,h)=>n+h.ratio,0)-skill.balance.damageRatio)<1e-9);
 }
 assert.ok(r.rows.filter(row=>row.code==='V-984').every(row=>row.shieldGranted>0));
});

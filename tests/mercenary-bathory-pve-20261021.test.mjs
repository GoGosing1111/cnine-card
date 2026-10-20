import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {cooperativeEnemies} from '../functions/_cooperative_enemies.js';
import {coopDifficulty} from '../shared/cooperative-battleground-v1.mjs';
import {applyMercenaryCombatLink} from '../shared/mercenary-combat-link-v2103.mjs';
import {balanceSnapshot} from '../scripts/measure-ss-mercenary-balance-20261019.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {currentSquads} from './helpers/cooperative-current.mjs';
import live from '../docs/qa/bathory-damage-audit-20261021/live.json' with {type:'json'};

const root=new URL('../',import.meta.url);
const snapshot=(code,level)=>{
 const s=balanceSnapshot(code,level);
 return {...s,combat:live.runtime.combat,mercenaryLevel:{...s.mercenaryLevel,policyRevision:live.growth.revision,growth:live.growth.growth}};
};
function moduleUrl(file,replacements=[],imports=new Map()){
 const url=new URL(file,root);let source=fs.readFileSync(url,'utf8');
 for(const [from,to] of replacements){
  assert.equal(source.split(from).length,2,'unique test seam: '+from);
  source=source.replace(from,to);
 }
 source=source.replace(/from\s+(['"])(\.{1,2}\/[^'"]+)\1/g,(_,quote,path)=>
  'from '+quote+(imports.get(new URL(path,url).href)||new URL(path,url).href)+quote);
 return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
}
// Restore only the old Bathory opt-in in memory. No duplicate battle formulas.
const oldCombatUrl=moduleUrl('functions/_mercenary_combat.js',[
 ["ssLimitedProfile(a)?.pveSkillMinimumDamage===true","a.code==='V-977'"]
]);
const oldCombat=await import(oldCombatUrl);
const oldEngineUrl=moduleUrl('functions/_battle_v2_preview.js',[],new Map([
 [new URL('functions/_mercenary_combat.js',root).href,oldCombatUrl]
]));
const oldEngine=await import(oldEngineUrl);
const oldCoop=await import(moduleUrl('functions/_cooperative_battle.js',[],new Map([
 [new URL('functions/_battle_v2_preview.js',root).href,oldEngineUrl]
])));
const exposedEngine=await import(moduleUrl('functions/_battle_v2_preview.js',[
 ['function hitResult(','export function hitResult(']
]));

function firstStrike({level=10,hp=2e9,hpRatio=1,apocalypse=false,legacy=false}={}){
 const cards=tierCards(2e6).map((card,i)=>buildFighter(card,i,'A',null,'PVE'));
 const actor=buildMercenaryFighter(snapshot('V-977',level),'A','PVE',buildFighter);
 applyMercenaryCombatLink([[...cards,actor]]);
 const target={id:'B:QA',side:'B',slot:0,row:'FRONT',isBoss:true,isMonster:true,isApocalypse:apocalypse,
  battleMode:'PVE',alive:true,maxHp:hp,hp:hp*hpRatio,defense:1e7,shield:0,maxShield:0,attack:1000,actions:0};
 const events=[],impacts=[];
 const runtime=(legacy?oldCombat.mercenaryCombat:mercenaryCombat)({
  teams:{A:[...cards,actor],B:[target]},
  hit:(a,t,m,options)=>{
   const result=exposedEngine.hitResult(a,t,()=>.5,m,false,{
    minDamagePercent:options.rangedSkill ? .016*m : 0,capMinimumDamage:options.rangedSkill,apocalypseFloorScale:.4
   });
   impacts.push({multiplier:m,damage:result.damage});return result;
  },
  damage:(t,amount)=>{const absorbed=Math.min(t.shield,amount),hpDamage=Math.min(t.hp,amount-absorbed);t.shield-=absorbed;t.hp-=hpDamage;return {hpDamage,absorbed};},
  knockout:t=>{if(t.hp<=0)t.alive=false;},emit:(type,data)=>events.push({type,...data}),clock:()=>0
 });
 actor.actions++;runtime.beforeAction(actor);
 assert.equal(impacts.length,1);
 assert.equal(events.filter(e=>e.type==='MERCENARY_WINDUP').length,1);
 assert.equal(events.filter(e=>e.type==='MERCENARY_HIT').length,1);
 return {...impacts[0],energy:runtime.state(actor).energy};
}

test('actual Bathory cast follows attack strength instead of increasing with boss maximum HP',()=>{
 const low=firstStrike({hp:2e9}),high=firstStrike({hp:2e10});
 assert.equal(low.damage,242172328);assert.equal(high.damage,low.damage);
 assert.equal(firstStrike({hp:2e9,legacy:true}).damage,338688000);
 assert.equal(firstStrike({hp:2e10,legacy:true}).damage,3386880000);
});

test('Apocalypse HP floor is removed without removing missing-HP bonus, growth or one-hit cost',()=>{
 for(const level of [1,10]){
  const full=firstStrike({level,hp:2e10,apocalypse:true});
  const old=firstStrike({level,hp:2e10,apocalypse:true,legacy:true});
  const wounded=firstStrike({level,hp:2e10,hpRatio:.1,apocalypse:true});
  assert(full.damage<old.damage);
  assert(Math.abs(wounded.damage/full.damage-1.45)<1e-7);
  assert.equal(full.energy,80);assert.equal(wounded.energy,80);
 }
 assert(firstStrike({level:10}).damage>firstStrike({level:1}).damage);
});

test('full PVE and Apocalypse battles reduce the first boss skill hit; exposing calculation changes nothing',()=>{
 for(const apocalypse of [false,true]){
  const input={cards:tierCards(2e6),mercenary:snapshot('V-977',1),seed:9772110,
   monster:{id:75,name:'QA',is_boss:1,battle_power:120e6,pve_hp_percent:12000,...(apocalypse?{pve_difficulty:'APOCALYPSE'}:{})}};
  const current=createPveBattleV2(input),old=oldEngine.createPveBattleV2(input);
  assert.deepEqual(exposedEngine.createPveBattleV2(input),current);
  const firstBoss=b=>b.result.timeline.find(e=>e.type==='MERCENARY_HIT'&&e.actorId==='A:MERCENARY:V-977'&&e.targetId==='B:0:MONSTER:75');
  assert(firstBoss(current));assert(firstBoss(old));
  assert(firstBoss(current).damage<firstBoss(old).damage,JSON.stringify({apocalypse,current:firstBoss(current),old:firstBoss(old)}));
 }
});

test('cooperative Extreme remains identical through V3 waves and an isolated final boss at levels 1/10',()=>{
 const config=coopDifficulty('EXTREME'),saved=live.cooperative.combat.difficulties.find(d=>d.id==='EXTREME');
 const boss=cooperativeEnemies(config,saved.monsters,live.cooperative.combat.stages).monster;
 for(const code of ['V-977','V-989'])for(const level of [1,10])for(const single of [false,true]){
  const squads=currentSquads();
  squads.forEach((s,i)=>{s.mercenary=snapshot(i?s.mercenary.code:code,level);});
  const input={squads,difficulty:'EXTREME',combat:live.cooperative.combat,seed:9772110,
   ...(single?{monsterSnapshot:boss}:{encounter:{version:3,policyVersion:1,mobs:['STALKER','WATCHER','IRONHOUND'],elite:'BASTION',boss:'ARKE'}})};
  assert.deepEqual(createCooperativeBattle(input),oldCoop.createCooperativeBattle(input));
 }
});

test('Bathory PVP is identical at levels 1/10 on either side',()=>{
 for(const level of [1,10])for(const side of ['A','B']){
  const input={attackerCards:tierCards(2e6),defenderCards:tierCards(2e6),
   attackerMercenary:snapshot(side==='A'?'V-977':'V-989',level),
   defenderMercenary:snapshot(side==='B'?'V-977':'V-989',level),seed:9772110};
  assert.deepEqual(createPvpBattleV2(input),oldEngine.createPvpBattleV2(input));
 }
});

test('Jinmu, a melee limited and a ranged limited keep their existing PVE results',()=>{
 for(const code of ['V-989','V-997','V-990']){
  const input={cards:tierCards(2e6),mercenary:snapshot(code,10),
   monster:{id:1,name:'QA',is_boss:1,battle_power:120e6,pve_hp_percent:12000},seed:9772110};
  assert.deepEqual(createPveBattleV2(input),oldEngine.createPveBattleV2(input));
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFighter,createPveBattleV2,createPvpBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {MERCENARY_POWER_STANDARD as powerStandard} from '../shared/equipment-mercenary-power-v1.mjs';
import {MERCENARY_SKILL_BALANCE_V2097 as balanceDraft} from '../shared/mercenary-skill-balance-v2097.mjs';
import {SKILL_CHIP_CATALOG,SKILL_CHIP_CLOCK} from '../shared/battle-suit-skill-chips.mjs';
import {buildScrapyardV3Battle} from '../functions/_scrapyard_v3.js';

const cards=power=>Array.from({length:5},(_,i)=>({id:String(i+1),power,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]}));
const sniper={...structuredClone(seed.document.skills.find(s=>s.mechanic==='LOCKED_THREAT_SHOT')),balance:balanceDraft.find(s=>s.id==='MS-004').balance};
const mercenary=(rank='SS',skills=[sniper])=>({code:'V-004',name:'베스페라',rank,role:'MARKSMAN',position:'BACK',statMode:'RANK_FIXED',combat,skills,sourceArt:'/art.png',battleSprite:'/sprite.png'});
const ownedEvents=(battle,side='A')=>battle.result.timeline.filter(e=>e.actorId===`${side}:MERCENARY:V-004`);

test('high-power gauges drain ready actors before advancing time, on both sides without mercenaries',()=>{
 const team=side=>cards(20000000).map((card,i)=>({...buildFighter(card,i,side,null,'PVP'),maxHp:1e12,hp:1e12,attack:100,defense:1,shield:0,maxShield:0,type:'NONE'}));
 const a=team('A'),b=team('B');
 const result=simulateBattleV2Preview({teamA:a,teamB:b,maxActions:60,seed:12});
 const turns=result.timeline.filter(e=>e.type==='TURN');
 for(const actor of [...a,...b])assert.ok(turns.some(e=>e.actorId===actor.id),actor.id+' gets an actual turn');
 assert.ok(turns.filter(e=>e.actorId==='A:2:3').length<turns.length/4,'fastest actor cannot monopolize the capped gauge');
});

for(const power of [1000000,20000000,100000000])test(`rank-fixed mercenary attacks in PVE and both PVP sides with ${power} power cards`,()=>{
 const party=cards(power),merc=mercenary();
 const pve=createPveBattleV2({cards:party,mercenary:merc,monster:{id:1,name:'공격 검수',battle_power:power*50},seed:12});
 const pvp=createPvpBattleV2({attackerCards:party,defenderCards:party,attackerMercenary:merc,defenderMercenary:merc,seed:12});
 for(const [battle,side]of [[pve,'A'],[pvp,'A'],[pvp,'B']]){
  const events=ownedEvents(battle,side);
  assert.ok(events.some(e=>e.type==='MERCENARY_WINDUP'),side+' prepares a skill');
  assert.ok(events.some(e=>e.type==='MERCENARY_HIT'&&e.damage+e.absorbed>0),side+' lands the server hit');
  assert.equal(battle.teams[side].cards.length,5);
  assert.equal(battle.teams[side].mercenaries.length,1);
  assert.equal(battle.teams[side].mercenaries[0].power,120000);
 }
 assert.ok(ownedEvents(pve).some(e=>e.type==='TURN'),'basic attacks resume during cooldown');
 assert.ok(pve.result.damageBreakdown.mercenary>0);
});

test('all six ranks without an assigned skill still perform basic attacks at real deck power',()=>{
 for(const [rank,power]of Object.entries(powerStandard.basePowerByRank)){
  const battle=createPveBattleV2({cards:cards(20000000),mercenary:mercenary(rank,[]),monster:{id:1,name:'평타 검수',battle_power:1e9},seed:12});
  assert.ok(ownedEvents(battle).some(e=>e.type==='TURN'&&e.damage+e.absorbed>0),rank);
  const actual=battle.teams.A.mercenaries[0],fixed=buildFighter({id:1,power,type:'NONE'},5,'A',null,'PVE');
  for(const key of ['attack','defense','speed'])assert.equal(actual[key],fixed[key],rank+' '+key+' stays fixed');
  assert.ok(actual.maxHp>=fixed.maxHp,rank+' includes linked HP');assert.equal(actual.hp,actual.maxHp);
 }
});

test('mercenary reservation uses allied card turns only, clears on a natural turn and excludes dead actors',()=>{
 const card=side=>({id:side+':card',side,hp:100,alive:true}),a=card('A'),b=card('B');
 const m={...card('A'),id:'A:MERCENARY:V-004',isMercenary:true};
 const cadence=mercenaryTurnCadence({A:[a,m],B:[b]});
 for(let i=0;i<20;i++){cadence.acted(b);cadence.acted({...a,isBattleSuit:true});cadence.acted({...a,isMonster:true});}
 assert.equal(cadence.select(a),a);
 for(let i=0;i<5;i++)cadence.acted(a);
 assert.equal(cadence.select(a),m);assert.equal(cadence.select(b),b);
 cadence.acted(m);assert.equal(cadence.select(a),a);
 for(let i=0;i<5;i++)cadence.acted(a);
 m.hp=0;m.alive=false;assert.equal(cadence.select(a),a);
});

test('dead mercenaries cannot receive reserved basic or skill turns',()=>{
 const battle=createPveBattleV2({cards:cards(20000000),mercenary:{...mercenary(),startingHpPercent:0},monster:{id:1,battle_power:1e9},seed:12});
 assert.deepEqual(ownedEvents(battle),[]);
});

test('apocalypse chip clock and continuous monster replacement retain actual mercenary attacks',()=>{
 const party=cards(20000000),merc=mercenary(),battleSuit={code:'BATTLE_SUIT_03',pvePower:300000,skillChips:SKILL_CHIP_CATALOG.map(c=>c.code)};
 const apocalypse=createPveBattleV2({cards:party,mercenary:merc,battleSuit,monster:{id:1,battle_power:1e9,is_boss:1,pve_difficulty:'APOCALYPSE',pve_attack_percent:1},seed:12});
 const continuous=buildScrapyardV3Battle({snapshot:{cards:party,mercenary:merc,battleSuit,characterBonus:{},power:{cards:1e8,equipment:0,battleSuit:300000,mercenary:120000}},difficulty:{id:'OUTER',requiredPowerStart:10000000,requiredPowerEnd:30000000,waves:3},config:{normalCount:5,simultaneous:3,maxActions:180,maxDuration:2,forcedMonsterEvery:6},seed:12});
 for(const battle of [apocalypse,continuous.battleV2]){
  assert.ok(ownedEvents(battle).some(e=>e.type==='MERCENARY_HIT'&&e.damage+e.absorbed>0));
  assert.ok(ownedEvents(battle).every(e=>e.combatClock===SKILL_CHIP_CLOCK));
  const dead=new Set();
  for(const e of battle.result.timeline){
   if(e.type==='KO')dead.add(e.targetId);
   if(e.type==='MERCENARY_HIT')assert.ok(!dead.has(e.targetId),'no attack on an already retired target');
  }
 }
 assert.ok(continuous.battleV2.result.timeline.some(e=>e.type==='ENEMY_SPAWN'));
});

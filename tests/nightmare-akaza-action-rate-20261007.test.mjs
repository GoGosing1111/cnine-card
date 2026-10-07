import test from 'node:test';
import assert from 'node:assert/strict';
import {pveDifficultyRuntime} from '../functions/_pve_nightmare.js';
import {buildMonsterFighter,buildPvePlayerTeam,createPveBattleV2,createPvpBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';

const profile={battlePower:1800000,rewardCoin:80000,hpPercent:300,attackPercent:380,defensePercent:300,speedPercent:300,rewardPercent:800,bossUltimateCapPercent:400};
const settings={nightmare:{enabled:true,bossUltimateUnlocked:true,bossProfiles:{70:{...profile},79:profile,80:{...profile}}}};
const monster={id:79,name:'아카자',is_boss:1,pve_tab:'NIGHTMARE',battle_power:1800000,reward_coin:80000};
const cards=Array.from({length:5},(_,i)=>({id:'QA'+i,name:'QA'+i,grade:'ZENITH',power:1000000,power_type:'ATTACK'}));
const runtime=(id=79,tab='NIGHTMARE')=>pveDifficultyRuntime(settings,{...monster,id,pve_tab:tab});
const attacks=(timeline,id)=>timeline.filter(e=>e.type==='TURN'&&e.actorId===id);
function durableTeams(frequency=5){
 const a=buildPvePlayerTeam({cards}).teamA.map(c=>({...c,type:'NONE',speed:200000,maxHp:1e12,hp:1e12,attack:1,defense:1,maxShield:1e18,shield:1e18}));
 const boss=buildMonsterFighter(runtime().engineMonster);
 return {teamA:a,teamB:[{...boss,actionFrequency:frequency,maxHp:1e12,hp:1e12,attack:1,defense:1,maxShield:1e18,shield:1e18}]};
}

test('only Nightmare Akaza receives fivefold action frequency; saved stats, rewards, speed and common ultimate are preserved',()=>{
 const akaza=runtime(),gold=runtime(70);
 assert.equal(akaza.attackCount,1);assert.equal(akaza.actionFrequency,5);assert.equal(buildMonsterFighter(akaza.engineMonster).actionFrequency,5);
 assert.equal(akaza.effectiveBattlePower,5832000);assert.equal(akaza.effectiveRewardCoin,640000);
 assert.equal(akaza.bossUltimateCapPercent,400);assert.equal(akaza.speedPercent,300);assert.equal(akaza.forcedActionEvery,0);
 const fields=['maxHp','attack','defense','speed','shield','gauge'];
 const a=buildMonsterFighter(akaza.engineMonster),b=buildMonsterFighter(gold.engineMonster);
 for(const key of fields)assert.equal(a[key],b[key],key);
 for(const id of [45,61,63,70,78,80]){assert.equal(runtime(id).actionFrequency,1);assert.equal(runtime(id).statCapsUnlocked,false);}
 for(const tab of ['NORMAL','HARD','HELL','APOCALYPSE']){assert.equal(runtime(79,tab).actionFrequency,1);assert.equal(runtime(79,tab).statCapsUnlocked,false);}
 assert.equal(runtime(79,'APOCALYPSE').attackCount,2);
 const customized=pveDifficultyRuntime({apocalypse:{monsterProfiles:{79:{...profile,attackCount:3}}}},{...monster,pve_tab:'APOCALYPSE'});
 assert.equal(customized.attackCount,3);
});

test('fifty attacks replace ten per seventy player actions, with at most two card actions between attacks including the opening',()=>{
 const simulate=count=>simulateBattleV2Preview({...durableTeams(count),seed:1234,maxActions:300,forcedMonsterEvery:8});
 const baseline=simulate(1),boosted=simulate(5),id='B:0:MONSTER:79';
 const throughSeventyPlayerActions=timeline=>{
  let playerActions=0;const selected=[];
  for(const event of timeline){
   if(event.type==='TURN'&&event.actorId.startsWith('A:')&&++playerActions===71)break;
   selected.push(event);
  }
  assert.equal(playerActions,71);return selected;
 };
 const oldTurns=throughSeventyPlayerActions(baseline.timeline),newTurns=throughSeventyPlayerActions(boosted.timeline);
 assert.equal(attacks(oldTurns,id).length,10);assert.equal(attacks(newTurns,id).length,50);
 const gaps=timeline=>{let players=0;const result=[];for(const e of timeline.filter(e=>e.type==='TURN')){if(e.actorId===id){result.push(players);players=0;}else players++;}return result;};
 assert.equal(gaps(oldTurns)[0],7);assert.equal(gaps(newTurns)[0],2);
 assert.ok(gaps(newTurns).every(n=>n>=1&&n<=2));
 assert.equal(newTurns.some(e=>e.type==='MONSTER_MULTI_ATTACK_READY'),false);
 for(const e of attacks(newTurns,id))assert.ok(e.targetId.startsWith('A:'),'Every strike must hit the player deck');
});

test('frequent attacks retarget after a KO and stop when Akaza is defeated',()=>{
 const {teamA,teamB}=durableTeams(5);
 teamB[0].gauge=100;teamB[0].attack=1e9;
 teamA.forEach(c=>{c.hp=1;c.maxHp=100;c.shield=c.maxShield=0;c.speed=55;});
 const result=simulateBattleV2Preview({teamA,teamB,seed:1,maxActions:100,forcedMonsterEvery:8});
 const hits=attacks(result.timeline,teamB[0].id).filter(e=>!e.dodge);
 assert.equal(hits.length,5);assert.equal(new Set(hits.map(h=>h.targetId)).size,5);
 assert.equal(result.final.A.filter(c=>c.hp>0).length,0);
 const other=durableTeams(5);other.teamB[0].hp=1;other.teamB[0].shield=0;other.teamA[0].attack=1e15;other.teamA[0].gauge=100;
 const dead=simulateBattleV2Preview({...other,seed:3,maxActions:30,forcedMonsterEvery:8});
 assert.equal(dead.final.B[0].hp,0);assert.equal(attacks(dead.timeline,other.teamB[0].id).length,0);
});

test('PVE payload keeps the common one-off ultimate and PVP has no monster repeats',()=>{
 const r=runtime();
 const fight=createPveBattleV2({cards,monster:r.engineMonster,seed:7,bossUltimatePercent:15,bossUltimateCapPercent:r.bossUltimateCapPercent});
 assert.equal(fight.rules.monsterAttackCount,1);assert.equal(fight.rules.monsterActionFrequency,5);assert.equal(fight.rules.forcedMonsterEvery,8);
 const ult=fight.result.timeline.filter(e=>e.type==='BOSS_ULTIMATE');assert.equal(ult.length,1);assert.equal(ult[0].damagePercent,15);
 assert.equal(fight.result.timeline.some(e=>e.type==='MONSTER_MULTI_ATTACK_READY'),false);
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,seed:7});
 assert.equal(pvp.result.timeline.some(e=>e.type==='MONSTER_MULTI_ATTACK_READY'),false);
});

test('Akaza CMS attack and defense values above both old clamps reach the engine; other boss caps remain',()=>{
 const high={...profile,attackPercent:5000,defensePercent:7000};
 const settings={nightmare:{bossProfiles:{79:high,70:high}}};
 const akaza=pveDifficultyRuntime(settings,monster),gold=pveDifficultyRuntime(settings,{...monster,id:70});
 assert.equal(akaza.attackPercent,5000);assert.equal(akaza.defensePercent,7000);
 assert.equal(akaza.effectiveBattlePower,60930000);
 assert.equal(gold.attackPercent,1000);assert.equal(gold.defensePercent,1000);
 const boosted=buildMonsterFighter(akaza.engineMonster),base=buildMonsterFighter({...akaza.engineMonster,pve_attack_percent:100,pve_defense_percent:100});
 assert.equal(boosted.attack,base.attack*50);assert.equal(boosted.defense,base.defense*70);
 assert.equal(boosted.statCapsUnlocked,true);assert.equal(buildMonsterFighter(gold.engineMonster).statCapsUnlocked,false);
});

test('only unlocked Akaza can exceed the target max-HP damage cap',()=>{
 const run=unlocked=>{
  const {teamA,teamB}=durableTeams();
  teamA.splice(1);Object.assign(teamA[0],{maxHp:100000,hp:100000,shield:0,maxShield:0,speed:1,gauge:0});
  Object.assign(teamB[0],{speed:1000000,gauge:100,attack:1000000000,statCapsUnlocked:unlocked});
  return simulateBattleV2Preview({teamA,teamB,seed:3,maxActions:1,forcedMonsterEvery:8});
 };
 const capped=run(false),unlocked=run(true);
 assert.equal(attacks(capped.timeline,'B:0:MONSTER:79')[0].damage,46000);
 assert.equal(attacks(unlocked.timeline,'B:0:MONSTER:79')[0].damage,100000);
 assert.equal(unlocked.final.A[0].hp,0);
});

test('Akaza defense grows beyond 65% mitigation and does not hit the monster minimum-damage floor',()=>{
 const run=(defense,unlocked)=>{
  const {teamA,teamB}=durableTeams();teamA.splice(1);
  Object.assign(teamA[0],{speed:1000000,gauge:100,attack:100000});
  Object.assign(teamB[0],{speed:1,gauge:0,maxHp:1000000,hp:1000000,shield:0,maxShield:0,defense,statCapsUnlocked:unlocked});
  return simulateBattleV2Preview({teamA,teamB,seed:3,maxActions:1,forcedMonsterEvery:8}).timeline.find(e=>e.type==='TURN'&&e.actorId===teamA[0].id).damage;
 };
 assert.equal(run(10000,false),run(1000000000,false));
 const low=run(10000,true),high=run(1000000000,true);
 assert.ok(low<16000);assert.ok(high<low);assert.equal(high,1);
});

test('the actual timed combat path also starts Akaza after two card actions and keeps the gaps short',()=>{
 const result=simulateBattleV2Preview({...durableTeams(),seed:1234,maxActions:200,forcedMonsterEvery:8,maxCombatDurationMs:30000});
 assert.ok(result.timeline.some(e=>e.combatClock==='V3_COMBAT_MS_V1'));
 let gap=0,count=0;
 for(const e of result.timeline.filter(e=>e.type==='TURN')){
  if(e.actorId==='B:0:MONSTER:79'){assert.ok(gap<=2);gap=0;count++;}else gap++;
 }
 assert.ok(count>=10);
});

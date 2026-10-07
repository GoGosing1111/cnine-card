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
function durableTeams(count=5){
 const a=buildPvePlayerTeam({cards}).teamA.map(c=>({...c,type:'NONE',speed:200000,maxHp:1e12,hp:1e12,attack:1,defense:1,maxShield:1e18,shield:1e18}));
 const boss=buildMonsterFighter(runtime().engineMonster);
 return {teamA:a,teamB:[{...boss,attackCount:count,maxHp:1e12,hp:1e12,attack:1,defense:1,maxShield:1e18,shield:1e18}]};
}

test('only Nightmare Akaza receives five actions; CMS damage, rewards, speed and common ultimate are unchanged',()=>{
 const akaza=runtime(),gold=runtime(70);
 assert.equal(akaza.attackCount,5);assert.equal(buildMonsterFighter(akaza.engineMonster).attackCount,5);
 assert.equal(akaza.effectiveBattlePower,5832000);assert.equal(akaza.effectiveRewardCoin,640000);
 assert.equal(akaza.bossUltimateCapPercent,400);assert.equal(akaza.speedPercent,300);assert.equal(akaza.forcedActionEvery,0);
 const fields=['maxHp','attack','defense','speed','shield','gauge'];
 const a=buildMonsterFighter(akaza.engineMonster),b=buildMonsterFighter(gold.engineMonster);
 for(const key of fields)assert.equal(a[key],b[key],key);
 for(const id of [45,61,63,70,78,80])assert.equal(runtime(id).attackCount,1);
 for(const tab of ['NORMAL','HARD','HELL'])assert.equal(runtime(79,tab).attackCount,1);
 assert.equal(runtime(79,'APOCALYPSE').attackCount,2);
 const customized=pveDifficultyRuntime({apocalypse:{monsterProfiles:{79:{...profile,attackCount:3}}}},{...monster,pve_tab:'APOCALYPSE'});
 assert.equal(customized.attackCount,3);
});

test('the same seventy player actions receive exactly fifty Akaza attacks instead of ten, in uninterrupted five-hit turns',()=>{
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
 const turns=newTurns.filter(e=>e.type==='TURN'),groups=[];
 for(const e of turns){if(e.actorId===id){if(!groups.length||groups.at(-1).closed)groups.push({count:0,closed:false});groups.at(-1).count++;}else if(groups.length)groups.at(-1).closed=true;}
 assert.equal(groups.length,10);assert.ok(groups.every(g=>g.count===5));
 assert.equal(newTurns.filter(e=>e.type==='MONSTER_MULTI_ATTACK_READY'&&e.attackCount===5).length,10);
 for(const e of attacks(newTurns,id))assert.ok(e.targetId.startsWith('A:'),'Every strike must hit the player deck');
});

test('repeat attacks retarget after a KO and stop when Akaza is defeated',()=>{
 const {teamA,teamB}=durableTeams(5);
 teamB[0].gauge=100;teamB[0].attack=1e9;
 teamA.forEach(c=>{c.hp=1;c.maxHp=100;c.shield=c.maxShield=0;c.speed=55;});
 const result=simulateBattleV2Preview({teamA,teamB,seed:1,maxActions:10,forcedMonsterEvery:8});
 const hits=attacks(result.timeline,teamB[0].id);
 assert.equal(hits.length,5);assert.equal(new Set(hits.map(h=>h.targetId)).size,5);
 assert.equal(result.final.A.filter(c=>c.hp>0).length,0);
 const other=durableTeams(5);other.teamB[0].hp=1;other.teamB[0].shield=0;other.teamA[0].attack=1e15;other.teamA[0].gauge=100;
 const dead=simulateBattleV2Preview({...other,seed:3,maxActions:30,forcedMonsterEvery:8});
 assert.equal(dead.final.B[0].hp,0);assert.equal(attacks(dead.timeline,other.teamB[0].id).length,0);
});

test('PVE payload keeps the common one-off ultimate and PVP has no monster repeats',()=>{
 const r=runtime();
 const fight=createPveBattleV2({cards,monster:r.engineMonster,seed:7,bossUltimatePercent:15,bossUltimateCapPercent:r.bossUltimateCapPercent});
 assert.equal(fight.rules.monsterAttackCount,5);assert.equal(fight.rules.forcedMonsterEvery,8);
 const ult=fight.result.timeline.filter(e=>e.type==='BOSS_ULTIMATE');assert.equal(ult.length,1);assert.equal(ult[0].damagePercent,15);
 assert.ok(fight.result.timeline.some(e=>e.type==='MONSTER_MULTI_ATTACK_READY'&&e.attackCount===5));
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,seed:7});
 assert.equal(pvp.result.timeline.some(e=>e.type==='MONSTER_MULTI_ATTACK_READY'),false);
});

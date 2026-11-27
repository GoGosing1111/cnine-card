import test from 'node:test';
import assert from 'node:assert/strict';
import {cards,snapshot,team} from './helpers/helios-king-balance-20261106.mjs';
import {HEUKMU_CODE,HEUKMU_AREA_EVENT} from '../shared/mercenary-heukmu-v1.mjs';
import {HELIOS_KING_CODE,HELIOS_KING_AREA_SKILLS} from '../shared/mercenary-helios-king-v1.mjs';
import {JIN_JOKRO_CODE} from '../shared/mercenary-jin-jokro-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {mercenaryBattleTier} from '../shared/mercenary-rank-growth-v1.mjs';
import {MAGIC_SEASON2_REVIEW} from '../shared/magic-season2-v1.mjs';
import {buildMonsterFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {pveDifficultyRuntime} from '../functions/_pve_nightmare.js';
import {resolveHeliosKingArea} from '../functions/_mercenary_helios_king.js';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {citadelEnemies} from '../functions/_legion_citadel_battle.js';
import {FIRST_TIER,DOCKYARD} from '../functions/_legion_citadel_tiers.js';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';

const trio=[HEUKMU_CODE,HELIOS_KING_CODE,JIN_JOKRO_CODE];
const impact=hit=>hit.damage+hit.absorbed;
const near=(actual,expected,tolerance=1)=>assert(Math.abs(actual-expected)<=tolerance,`${actual} vs ${expected}`);

test('all three share the neutral tier and stats, with comparable real PvE damage at equal growth and gear',()=>{
 for(const [level,gear] of [[1,0],[11,1e6],[21,1e8]]){
  const stats=[],totals=[];
  for(const code of trio){
   const formation=team(code,'A','PVE',level,gear);
   applyMercenaryCombatLink([formation]);
   const actor=formation.at(-1);
   assert.equal(mercenaryBattleTier(actor),6);
   assert.equal(actor.basePower,3500000+gear);
   stats.push([mercenaryEffectiveAttack(actor),actor.maxHp,actor.shield,actor.defense,actor.speed]);
   let total=0;
   for(let seed=1;seed<=32;seed++){
    const battle=createPveBattleV2({cards:cards(),mercenary:snapshot(code,level,'PVE',gear),seed,
     monster:{id:9172,is_boss:1,battle_power:160e9}});
    for(const event of battle.result.timeline){
     if(event.actorId===actor.id&&(event.type==='TURN'||event.hits?.length))total+=(event.damage||0)+(event.absorbed||0);
    }
   }
   totals.push(total);
  }
  assert.deepEqual(stats[1],stats[0]);assert.deepEqual(stats[2],stats[0]);
  assert(Math.min(...totals)>0&&Math.max(...totals)/Math.min(...totals)<1.05);
 }
});

test('Heukmu deals bonus damage only to the Apocalypse leader and guards its basic and piercing ultimate',()=>{
 const self='A:MERCENARY:'+HEUKMU_CODE;
 for(const id of [84,85,98765])for(const season2 of [false,true]){
  const monster=pveDifficultyRuntime({},{id,battle_power:8e9,is_boss:1,pve_tab:'APOCALYPSE'}).engineMonster;
  const simulate=m=>createPveBattleV2({cards:cards(),mercenary:snapshot(HEUKMU_CODE),monster:m,seed:23,
   bossUltimatePercent:55,[MAGIC_SEASON2_REVIEW]:season2}).result.timeline;
  const {apocalypseHunt,...control}=monster;
  assert.equal(apocalypseHunt,true);
  const plain=simulate(control),bonus=simulate(monster);
  const firstArea=events=>events.find(e=>e.type===HEUKMU_AREA_EVENT).hits;
  const [leader,...adds]=firstArea(bonus),[baseLeader,...baseAdds]=firstArea(plain);
  near(impact(leader),impact(baseLeader)*1.25);
  assert.deepEqual(adds.map(impact),baseAdds.map(impact));
  const basic=(events,source,target)=>events.find(e=>e.type==='TURN'&&e.actorId===source&&e.targetId===target&&!e.dodge);
  near(impact(basic(bonus,self,leader.targetId)),impact(basic(plain,self,leader.targetId))*1.25);
  const ultimate=events=>events.find(e=>e.type==='BOSS_ULTIMATE'||(e.type==='APOCALYPSE_SKILL'&&e.kind==='ultimate')).hits;
  const baseUlt=ultimate(plain),guarded=ultimate(bonus);
  near(impact(guarded.find(h=>h.targetId===self)),impact(baseUlt.find(h=>h.targetId===self))*.75,2);
  if(adds.length){
   near(impact(basic(bonus,leader.targetId,self)),impact(basic(plain,leader.targetId,self))*.75,2);
  }
 }
 const classified=m=>buildMonsterFighter(m).isApocalypseHuntBoss===true;
 assert.equal(classified({is_boss:1,pve_difficulty:'APOCALYPSE'}),false); // Other content reuses this difficulty curve.
 assert.equal(classified(pveDifficultyRuntime({},{id:98765,is_boss:0,pve_tab:'APOCALYPSE'}).engineMonster),false);
 assert.equal(classified(pveDifficultyRuntime({},{id:98765,is_boss:1,pve_tab:'HELL'}).engineMonster),false);
});

test('King boosts both the distributed ratio and cap only for two or more distinct living Legion enemies',()=>{
 const actor={code:HELIOS_KING_CODE,isMercenary:true,battleMode:'PVE',hp:10,side:'A',damageDealt:0};
 const enemy=(id,legion=true)=>({id,side:'B',isMonster:true,isLegionHuntMonster:legion,hp:100});
 for(const skill of HELIOS_KING_AREA_SKILLS){
  const cast=targets=>{
   const calls=[];
   resolveHeliosKingArea({actor,skill,targets,hit:(_a,t,ratio,opt)=>{
    calls.push({id:t.id,ratio,cap:opt.pveCapScale});return {damage:0};
   },damage:()=>({hpDamage:0,absorbed:0}),knockout(){},emit(){}});
   return calls;
  };
  const boss=enemy('boss'),one=cast([boss,boss,{...enemy('dead'),hp:0},{...enemy('untargetable'),untargetable:true}]);
  assert.deepEqual(one,[{id:'boss',ratio:skill.balance.damageRatio,cap:skill.damageCapScale}]);
  const mixed=cast([boss,enemy('mob'),enemy('unrelated',false)]);
  for(const hit of mixed){
   const scale=hit.id==='unrelated'?1:1.3;
   near(hit.ratio,skill.balance.damageRatio/3*scale,1e-10);
   near(hit.cap,skill.damageCapScale*scale,1e-10);
  }
 }
});

test('regional and party Legion waves apply the King bonus in their server timelines',()=>{
 const firstCast=(result,code)=>result.timeline.find(e=>e.actorId?.endsWith(':MERCENARY:'+code)&&e.type.endsWith('_AREA'));
 const hunt=code=>createHuntSession({snapshot:{cards:cards(100000),mercenary:snapshot(code)},
  regionId:'desert',difficulty:'calamity',seed:23,limitMs:45000}).payload.battleV2.result;
 const party=(code,area)=>{
  const squads=[1,2].map(ownerId=>({ownerId,ownerName:'QA'+ownerId,
   cards:cards(100000).slice(0,2).map((c,i)=>({...c,id:ownerId+'-'+i,grade:'ICON'})),
   mercenaries:[snapshot(ownerId===1?code:'V-975'),snapshot('V-974')]}));
  return createCooperativeBattle({squads,seed:23,difficulty:{id:'CITADEL',forcedEvery:3},
   combat:{maxBattleSeconds:30,difficulties:[]},citadelEnemies:citadelEnemies(FIRST_TIER,area)}).payload.battleV2.result;
 };
 for(const [run,count] of [[hunt,12],[code=>party(code,null),16],[code=>party(code,DOCKYARD.id),16]]){
  const king=firstCast(run(HELIOS_KING_CODE),HELIOS_KING_CODE),jin=firstCast(run(JIN_JOKRO_CODE),JIN_JOKRO_CODE);
  assert.equal(king.hits.length,count);assert.equal(jin.hits.length,count);
  near(impact(king),impact(jin)*1.3,count);
 }
});

test('Jin has a measured PvP advantage from either seat while equal rivals can still win',()=>{
 for(const opponent of [HEUKMU_CODE,HELIOS_KING_CODE]){
  const wins=[0,0];
  for(const level of [1,11,21])for(let seed=1;seed<=64;seed++)for(const [seat,side] of ['A','B'].entries()){
   const [a,b]=seat===0?[JIN_JOKRO_CODE,opponent]:[opponent,JIN_JOKRO_CODE];
   const {result}=createPvpBattleV2({attackerCards:cards(),defenderCards:cards(),seed,
    attackerMercenary:snapshot(a,level,'PVP'),defenderMercenary:snapshot(b,level,'PVP')});
   if(result.winner===side)wins[seat]++;
  }
  for(const count of wins)assert(count>192*.52&&count<192*.85,String(wins));
 }
});

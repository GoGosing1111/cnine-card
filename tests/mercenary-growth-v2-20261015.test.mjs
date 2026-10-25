import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryLevelDraft,mercenaryLevelReadiness,attachMercenaryLevel,applyMercenaryLevelStats,planMercenaryBreakthrough,MERCENARY_LEVEL_RELEASE_ENABLED,MERCENARY_GROWTH_REVIEW} from '../shared/mercenary-level-v1.mjs';
import {mercenaryGrowthDraft,validateMercenaryGrowth,mercenaryGrowthReadiness,mercenaryGrowthSummary,mercenaryGrowthStatPreview,mercenaryGrowthLevelTable,mercenaryGrowthIncomingDamage,mercenaryGrowthMitigationBypass,applyMercenaryGrowthMatchups,mercenaryGrowthActionCredit} from '../shared/mercenary-growth-review-v2.mjs';
import {mercenaryTurnCadence,mercenaryBaseActionCredit} from '../functions/_mercenary_combat.js';
import {VALTER_COMBAT,valterIncomingDamage} from '../shared/mercenary-valter-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {PVP_POWER_BALANCE_RELEASED,PVP_POWER_BALANCE_REVIEW} from '../shared/pvp-power-balance-v1.mjs';
import {growthReviewPolicy,growthState,growthLimitedSnapshot} from '../scripts/measure-mercenary-growth-v2-20261015.mjs';
import {sssReferences} from '../scripts/measure-ss-limited-balance-20261008.mjs';
import {tierCards,tierDecks} from './helpers/mercenary-operating-roster-v2144.mjs';
const actor=(level=20,mask=15)=>({isMercenary:true,isMonster:false,statMode:'RANK_FIXED',battleMode:'PVP',id:'A:MERCENARY:V-049',code:'V-049',side:'A',rank:'SSS',hp:500,maxHp:1000,attack:100,defense:50,speed:100,shield:200,maxShield:200,skills:[],mercenaryLink:{attackFloor:200,hpFloor:1000,openingShield:200},mercenaryLevel:{version:2,level,breakthroughMask:mask,growth:structuredClone(MERCENARY_GROWTH_REVIEW)}});

test('unconfigured and partial V2 policies stay OFF and cannot enter battle',()=>{
 assert.equal(MERCENARY_LEVEL_RELEASE_ENABLED,true);assert.equal(PVP_POWER_BALANCE_RELEASED,true);
 const p=mercenaryLevelDraft();assert.equal(p.growth,null);assert.equal(mercenaryLevelReadiness(p,{requireGrowth:true}).ready,false);
 const draft=mercenaryGrowthDraft();assert.deepEqual(validateMercenaryGrowth(draft),draft);assert.equal(mercenaryGrowthReadiness(draft).ready,false);
 assert.throws(()=>mercenaryGrowthSummary(draft,growthState(1)));
 const ready=growthReviewPolicy();ready.growth=draft;assert.throws(()=>attachMercenaryLevel(sssReferences[0],ready,growthState(1)),{code:'MERCENARY_LEVEL_UNCONFIGURED'});
 for(const [key,value]of [['speedPercent',81],['mitigationBypassPercent',51],['actionCatchupPercent',71],['actionCreditPercent',76]]){const bad=structuredClone(MERCENARY_GROWTH_REVIEW);bad.milestones[0][key]=value;assert.throws(()=>validateMercenaryGrowth(bad));}
});

test('all 21 levels and four breakthroughs have explicit additive, monotonic totals',()=>{
 const table=mercenaryGrowthLevelTable(MERCENARY_GROWTH_REVIEW);assert.equal(table.length,21);
 for(let i=1;i<21;i++)for(const key of ['hpPercent','attackPercent','defensePercent','speedPercent'])assert.ok(table[i].beforeBreakthrough.total[key]>=table[i-1].beforeBreakthrough.total[key]);
 const total=mercenaryGrowthSummary(MERCENARY_GROWTH_REVIEW,growthState(20)).total;
 assert.deepEqual(total,{hpPercent:875,attackPercent:975,defensePercent:174,speedPercent:27,skillPowerPercent:20,mitigationBypassPercent:50,actionCatchupPercent:70,actionCreditPercent:75});
 assert.equal(table[19].beforeBreakthrough.breakthroughCount,3);assert.equal(table[19].afterBreakthrough.breakthroughCount,4);
 assert.deepEqual(mercenaryGrowthStatPreview({hp:1000,attack:200,defense:100,speed:100},mercenaryGrowthSummary(MERCENARY_GROWTH_REVIEW,growthState(20))).after,{hp:9750,attack:2150,defense:274,speed:127});
});

test('growth scales effective stats once, keeps wounds, original shield and power',()=>{
 const a=actor();a.power=180000;applyMercenaryLevelStats(a);assert.equal(a.maxHp,9750);assert.equal(a.hp,4875);assert.equal(a.attack,1075);assert.equal(a.mercenaryLink.attackFloor,2150);assert.equal(a.power,180000);assert.equal(a.shield,200);
 const once=structuredClone(a);applyMercenaryLevelStats(a);assert.deepEqual(a,once);
 const cloned=structuredClone(MERCENARY_GROWTH_REVIEW);const p=growthReviewPolicy(),snapshot=attachMercenaryLevel(sssReferences[0],p,growthState(20));p.growth.perLevel.hpPercent=0;assert.deepEqual(snapshot.mercenaryLevel.growth,cloned);
});

test('failure preserves all earned growth; successful final breakthrough grants level 21 and the last package',()=>{
 const p=growthReviewPolicy(),target=sssReferences[0],state={...growthState(20),breakthroughMask:7,experience:1000},before=mercenaryGrowthSummary(p.growth,state);
 const failed=planMercenaryBreakthrough({policy:p,target,state,roll:999999});assert.deepEqual(mercenaryGrowthSummary(p.growth,failed.after),before);assert.equal(failed.after.experience,0);
 const success=planMercenaryBreakthrough({policy:p,target,state,roll:0}),after=mercenaryGrowthSummary(p.growth,success.after);assert.equal(after.total.hpPercent-before.total.hpPercent,125);assert.equal(after.total.actionCreditPercent-before.total.actionCreditPercent,30);assert.equal(success.reward.level,20);
});

test('conditional speed floor uses frozen pre-growth opponent speed and never compounds',()=>{
 const a=actor(),b=actor(1,0);b.id='B:MERCENARY:V-996';b.side='B';b.speed=1000;applyMercenaryLevelStats(a);applyMercenaryLevelStats(b);b.speed=99999;
 applyMercenaryGrowthMatchups([[a],[b]]);assert.equal(a.speed,738);assert.equal(b.speed,99999);const once=structuredClone(a);applyMercenaryGrowthMatchups([[a],[b]]);assert.deepEqual(a,once);
 const equal=actor();equal.id='B:MERCENARY:V-996';equal.side='B';equal.speed=1000;applyMercenaryLevelStats(equal);const same=actor();applyMercenaryLevelStats(same);applyMercenaryGrowthMatchups([[same],[equal]]);assert.equal(same.speed,127);
 const pve=actor();pve.battleMode='PVE';applyMercenaryLevelStats(pve);applyMercenaryGrowthMatchups([[pve],[b]]);assert.equal(pve.speed,127);
 const old={...equal,mercenaryLevel:{version:1,level:1},speed:100000,mercenaryGrowthBaseSpeed:undefined},fresh=actor();applyMercenaryLevelStats(fresh);applyMercenaryGrowthMatchups([[fresh],[old]]);assert.equal(fresh.speed,127);
});

test('gap mastery restores bounded lost damage, including Berkan immunity, without globally changing it',()=>{
 const source=actor();source.code='V-055';applyMercenaryLevelStats(source);const target={isMercenary:true,code:'V-996',battleMode:'PVP',mercenaryLevel:{version:2,level:1}};
 assert.equal(valterIncomingDamage(target,1000,source),0);assert.equal(mercenaryGrowthIncomingDamage(target,1000,0,source),500);
 source.mercenaryLevel.level=6;assert.equal(mercenaryGrowthMitigationBypass(source,target),.25);assert.equal(mercenaryGrowthIncomingDamage(target,1000,250,source),437);
 target.mercenaryLevel.level=6;assert.equal(mercenaryGrowthIncomingDamage(target,1000,0,source),0);
 target.battleMode='PVE';assert.equal(mercenaryGrowthIncomingDamage(target,1000,0,source),0);assert.equal(VALTER_COMBAT.damageTakenScale,.25);assert.equal(VALTER_COMBAT.actionCredit,3);
});

test('PVP mastery adds 0.75 credit instead of multiplying innate cadence; PVE and legacy unchanged',()=>{
 const run=(code,mode='PVP',growth=true)=>{const m=actor();m.code=code;m.battleMode=mode;if(growth)applyMercenaryLevelStats(m);else delete m.mercenaryLevel;const card={id:'A:0',side:'A',hp:1,alive:true},cadence=mercenaryTurnCadence({A:[card,m],B:[]});let actions=0;for(let i=0;i<4;i++){cadence.acted(card);let pending;while((pending=cadence.pending())){actions++;cadence.acted(pending);if(actions>40)throw Error('recursive growth credit');}}return actions;};
 assert.equal(run('V-049'),7);assert.equal(run('V-996'),15);assert.equal(run('V-049','PVE'),4);assert.equal(run('V-996','PVP',false),12);
 const a=actor();applyMercenaryLevelStats(a);assert.equal(mercenaryGrowthActionCredit([a,a]),.75);
});

test('level-1 V2 and legacy battle paths are identical; high-level formation can overturn a low-level limited',()=>{
 const p=growthReviewPolicy(),regular=sssReferences.find(c=>c.code==='V-049'),limited=growthLimitedSnapshot('V-996'),cards=tierCards(180000,tierDecks.defense),base={attackerCards:cards,defenderCards:cards,seed:630001};
 const old=createPvpBattleV2({...base,attackerMercenary:regular,defenderMercenary:limited}).result;
 const initial=createPvpBattleV2({...base,attackerMercenary:attachMercenaryLevel(regular,p,growthState(1)),defenderMercenary:attachMercenaryLevel(limited,p,growthState(1))}).result;
 assert.deepEqual(initial.timeline,old.timeline);assert.equal(initial.winner,old.winner);
 let wins=0;for(const side of ['A','B'])for(let i=0;i<4;i++){
  const grown=attachMercenaryLevel(regular,p,growthState(20));const result=createPvpBattleV2({...base,attackerMercenary:side==='A'?grown:limited,defenderMercenary:side==='B'?grown:limited,seed:630001+i*7919,[PVP_POWER_BALANCE_REVIEW]:true}).result;
  wins+=result.winner===side;
 }assert.ok(wins>0,'grown ordinary needs real wins with unchanged premium combat policy');
});


test('0.01 percent action credit accumulates exactly and duo owners earn only their own credit',()=>{
 const m=actor(),card={side:'A',id:'A:0',hp:1,alive:true};m.mercenaryLevel.growth.milestones.forEach((r,i)=>r.actionCreditPercent=i===0?.01:0);applyMercenaryLevelStats(m);
 const c=mercenaryTurnCadence({A:[card,m],B:[]});let count=0;for(let i=0;i<10000;i++){c.acted(card);let p;while((p=c.pending())){count++;c.acted(p);}}assert.equal(count,10001);
 const own=actor();own.ownerId=1;applyMercenaryLevelStats(own);const other=actor();other.ownerId=2;other.id='A:MERCENARY:OTHER';delete other.mercenaryLevel;
 const c1={...card,ownerId:1},c2={...card,id:'A:OWNER2:0',ownerId:2},d=mercenaryTurnCadence({A:[c1,own,c2,other],B:[]}),counts={1:0,2:0};
 for(let i=0;i<4;i++)for(const card of[c1,c2]){d.acted(card);let p;while((p=d.pending())){counts[p.ownerId]++;d.acted(p);}}
 assert.deepEqual(counts,{1:7,2:4});
});


test('action response closes only the frozen opportunity gap and subtracts own innate plus growth credit',()=>{
 const a=actor();a.ownerId=1;const b=actor(1,0);b.ownerId=2;b.side='B';b.code='V-996';b.id='B:OWNER2:V-996';b.speed=1000;applyMercenaryLevelStats(a);applyMercenaryLevelStats(b);
 const cards=(side,ownerId)=>Array.from({length:5},(_,i)=>({id:side+':'+ownerId+':'+i,side,ownerId,hp:100,speed:100,alive:true}));
 const ours=cards('A',1),theirs=cards('B',2),junk=[{...theirs[0],id:'B:dead',hp:0,speed:1e9},{...theirs[0],id:'B:suit',isBattleSuit:true,speed:1e9},{...theirs[0],id:'B:monster',isMonster:true,speed:1e9},{...theirs[0],id:'B:untargetable',untargetable:true,speed:1e9},{...theirs[0],id:'B:otherOwner',ownerId:999,speed:1e9}];
 applyMercenaryGrowthMatchups([[a,...ours,{...ours[0],ownerId:999,speed:1e9}],[b,...theirs,...junk]],{baseActionCredit:mercenaryBaseActionCredit});
 assert.equal(a.mercenaryGrowthMatchup.ownCardClock,500);assert.equal(a.mercenaryGrowthMatchup.ownReservedRate,875);assert.equal(a.mercenaryGrowthMatchup.ownActionRate,1002);
 assert.equal(a.mercenaryGrowthMatchup.opponents[0].referenceActionRate,2500);assert.equal(a.speed,1175);assert.equal(a.speed+875,2050);assert.ok(a.speed+875<2500);
 // The entry budget is frozen: dead cards and a changed opponent speed cannot
 // recreate a new catch-up grant in the same battle.
 theirs.forEach(c=>c.hp=0);b.speed=1e12;const once=structuredClone(a);applyMercenaryGrowthMatchups([[a,...ours],[b,...theirs]],{baseActionCredit:mercenaryBaseActionCredit});assert.deepEqual(a,once);
 const high=actor(),grownRival=actor(11,3);grownRival.side='B';grownRival.code='V-996';grownRival.speed=1000;applyMercenaryLevelStats(high);applyMercenaryLevelStats(grownRival);
 applyMercenaryGrowthMatchups([[high,...cards('A',null)],[grownRival,...cards('B',null)]],{baseActionCredit:mercenaryBaseActionCredit});
 assert.equal(high.mercenaryGrowthMatchup.opponents[0].referenceActionRate,2500);assert.equal(high.speed,1070,'opponent learned credit and grown speed must not be borrowed');
});

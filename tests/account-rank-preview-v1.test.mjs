import test from 'node:test';
import assert from 'node:assert/strict';
import {RANKS,POLICY,XP_SOURCES,estimateGrowth,rankForLevel,totalXpForLevel,levelFromXp,nextLevelXp,draftEffects} from '../preview/account-rank-v1/model.mjs';
test('every level 1–250 belongs to exactly one rank with no gaps or overlaps',()=>{
  for(let l=1;l<=250;l++){const rows=RANKS.filter(r=>r.min<=l&&r.max>=l);assert.equal(rows.length,1,`level ${l}`);assert.equal(rankForLevel(l),rows[0]);}
  assert.equal(rankForLevel(1).name,'훈련병');assert.equal(rankForLevel(250).name,'원수');assert.equal(POLICY.startLevel,1);assert.equal(POLICY.retroactiveXp,false);
});
test('every XP boundary changes level once; max level has no next requirement',()=>{
  for(let l=2;l<=250;l++){const xp=totalXpForLevel(l);assert.equal(levelFromXp(xp-1),l-1);assert.equal(levelFromXp(xp),l);assert.equal(xp-totalXpForLevel(l-1),nextLevelXp(l-1));}
  assert.equal(totalXpForLevel(250),139440);assert.equal(levelFromXp(1e9),250);assert.equal(levelFromXp(-1),1);assert.equal(nextLevelXp(250),0);
});
test('PvP and scored/unknown contexts never receive draft effects',()=>{
  for(let l=1;l<=250;l++)for(const mode of ['PVP','CLAN','TERRITORY','WORLD_RAID','RANKED_PVE',undefined,'NEW_MODE'])assert.deepEqual(draftEffects(l,mode),{attackBp:0,hpBp:0,coinBp:0});
  assert.deepEqual(draftEffects(250,'PERSONAL_PVE_UNRANKED'),{attackBp:1000,hpBp:1500,coinBp:500});
});
test('draft benefits are bounded and monotonic; only three arts are represented as ready',()=>{
  assert.deepEqual(RANKS.filter(r=>r.art).map(r=>r.name),['이병','소령','원수']);
  for(let i=1;i<RANKS.length;i++){assert.ok(RANKS[i].attackBp>=RANKS[i-1].attackBp);assert.ok(RANKS[i].hpBp>=RANKS[i-1].hpBp);assert.ok(RANKS[i].coinBp>=RANKS[i-1].coinBp);assert.ok(RANKS[i].presetSlots<=5);}
});
test('all listed PvE sources grant XP without a new daily or per-source cap',()=>{
  assert.equal(POLICY.dailyXpCap,null);assert.equal(POLICY.xpScope,'ALL_PVE');
  for(const source of XP_SOURCES){assert.ok(estimateGrowth({[source.code]:1}).dailyXp>0);assert.equal(estimateGrowth({[source.code]:100}).dailyXp,source.xp*100);}
  assert.equal(estimateGrowth({IDLE:0.5}).dailyXp,3);
});
test('reduced payouts update duration while seal and siege retain their contribution',()=>{
  const regular=Object.fromEntries(XP_SOURCES.map(s=>[s.code,s.example]));
  assert.deepEqual(estimateGrowth(regular),{dailyXp:280,days:498});
  assert.equal(POLICY.referenceDailyXp,280);
  const double=Object.fromEntries(XP_SOURCES.map(s=>[s.code,s.example*2]));
  assert.deepEqual(estimateGrowth(double),{dailyXp:560,days:249});
  assert.deepEqual(estimateGrowth({...regular,SIEGE:9,SEAL:9}),{dailyXp:2800,days:50});
  assert.deepEqual(estimateGrowth({}),{dailyXp:0,days:null});
});

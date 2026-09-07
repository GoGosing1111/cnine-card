import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {createPveBattleV2,buildFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {SKILL_CHIP_CATALOG} from '../shared/battle-suit-skill-chips.mjs';

// The actual production commit immediately before the user's 2026-09-07 x3 request.
const previousSource=execFileSync('git',['show','507f2454812035592961696881b1f716bf24991d:functions/_battle_v2_preview.js'],{encoding:'utf8',maxBuffer:2*1024*1024});
assert.match(previousSource,/const BATTLE_SUIT_DAMAGE_MULTIPLIER = 4;/);
const resolvableSource=previousSource.replace("'../shared/battle-suit-skill-chips.mjs'",JSON.stringify(new URL('../shared/battle-suit-skill-chips.mjs',import.meta.url).href));
const previous=await import(`data:text/javascript;base64,${Buffer.from(resolvableSource).toString('base64')}`);
const chips=SKILL_CHIP_CATALOG.map(chip=>chip.code);
const cards=['HP','DEFENSE','DEFENSE','ATTACK','SPEED'].map((power_type,i)=>({id:`BUFF-${i}`,title:`BUFF ${i}`,rarity:'FUR',power_type,power:400000}));
const weapons=['','EQ_1785427638137','EQ_1785961232958','EQ_1785961300455','EQ_1786966923833','EQ_1788486929132','EQ_1788486888336'];
const monster={id:2063,name:'Damage regression target',battle_power:10000000,is_boss:1,pve_hp_percent:1200,pve_attack_percent:1,pve_shield_percent:10000,pve_speed_percent:1};
const applied=e=>Number(e.damage||0)+Number(e.absorbed||0);
const suitShots=b=>b.result.timeline.filter(e=>e.type==='TURN'&&e.actorKind==='BATTLE_SUIT');

test('all three suits and seven weapon cadences deal exactly previous live damage x3, including chips and pierce',()=>{
  let checkedShots=0,checkedChipHits=0,checkedCasts=0,checkedCriticals=0,checkedPierces=0;
  assert.deepEqual(SKILL_CHIP_CATALOG.map(chip=>[chip.damageMultiplier,chip.intervalMs]),[[2.5,3000],[5,15000]],'chip coefficients and cooldowns must not receive a second x3');
  for(const apocalypse of [false,true])for(const [i,pvePower] of [100000,200000,300000].entries())for(const weaponCode of weapons)for(const seed of [1,2011]){
    const input={cards,battleSuit:{code:`BATTLE_SUIT_0${i+1}`,pvePower,weapon:{code:weaponCode},skillChips:chips},monster:{...monster,...(apocalypse?{pve_difficulty:'APOCALYPSE'}:{})},seed};
    const before=previous.createPveBattleV2(input),after=createPveBattleV2(input);
    const label=`${apocalypse?'apocalypse':'normal'} ${pvePower} ${weaponCode||'default'} seed=${seed}`;
    assert.equal(after.rules.battleSuitDamageMultiplier,12,label);
    assert.equal(after.rules.battleSuitPveFirepower,24,label);
    assert.equal(after.rules.battleSuitFireInterval,before.rules.battleSuitFireInterval,label);
    assert.equal(after.rules.battleSuitShotsPerCycle,before.rules.battleSuitShotsPerCycle,label);
    assert.deepEqual(after.teams.A.cards,before.teams.A.cards,`${label}: card stats must not inherit suit damage`);
    assert.deepEqual(after.teams.A.supports,before.teams.A.supports,`${label}: equipment power and cadence stay unchanged`);
    const oldShots=suitShots(before).slice(0,8),newShots=suitShots(after).slice(0,8);
    assert.equal(newShots.length,8,`${label}: fixture must survive eight shots`);
    assert.equal(oldShots.length,8,label);
    for(let n=0;n<8;n++){
      const a=oldShots[n],b=newShots[n];
      assert.equal(b.at,a.at,label);assert.equal(b.dodge,a.dodge,label);assert.equal(b.critical,a.critical,label);
      assert.equal(applied(b),applied(a)*3,`${label}: ordinary shot ${n}`);
      assert.equal(Number(b.apocalypsePierce||0),Number(a.apocalypsePierce||0)*3,`${label}: ordinary pierce ${n}`);
      if(b.critical)checkedCriticals++;
      if(b.apocalypsePierce)checkedPierces++;
      checkedShots++;
    }
    const oldCasts=new Map(before.result.timeline.filter(e=>e.type==='SKILL_CHIP_CAST').map(e=>[e.castId,e]));
    for(const code of chips){
      const cast=after.result.timeline.find(e=>e.type==='SKILL_CHIP_CAST'&&e.chipCode===code);
      assert.ok(cast,`${label}: fixture must reach first ${code}`);
      const oldCast=oldCasts.get(cast.castId);
      assert.ok(oldCast,label);
      assert.equal(cast.combatAtMs,oldCast.combatAtMs,label);
      assert.equal(cast.intervalMs,oldCast.intervalMs,label);
      assert.deepEqual(cast.impactOffsetsMs,oldCast.impactOffsetsMs,label);
      assert.equal(cast.damageMultiplier,oldCast.damageMultiplier,`${label}: no double multiplication`);
      assert.equal(cast.baseDamage,oldCast.baseDamage*3,label);
      assert.equal(cast.calculatedDamage,oldCast.calculatedDamage*3,`${label}: ${code} total is x3, not x9`);
      const oldHits=before.result.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===cast.castId);
      const newHits=after.result.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===cast.castId);
      assert.equal(newHits.length,cast.impactOffsetsMs.length,`${label}: fixture must finish the whole skill`);
      assert.equal(newHits.length,oldHits.length,label);
      assert.ok(newHits.at(-1).targetHpAfter>0,`${label}: skill comparison must not include overkill`);
      assert.equal(newHits.reduce((sum,e)=>sum+applied(e),0),oldHits.reduce((sum,e)=>sum+applied(e),0)*3,label);
      for(let n=0;n<newHits.length;n++){
        assert.equal(newHits[n].combatAtMs,oldHits[n].combatAtMs,label);
        assert.equal(applied(newHits[n]),applied(oldHits[n])*3,label);
        assert.equal(Number(newHits[n].apocalypsePierce||0),Number(oldHits[n].apocalypsePierce||0)*3,label);
        checkedChipHits++;
      }
      checkedCasts++;
    }
    const breakdown=after.result.damageBreakdown;
    assert.equal(breakdown.total,breakdown.cards+breakdown.battleSuit+breakdown.skillChips+breakdown.ultimate,label);
    assert.equal(after.result.supports.A[0].damageDealt,breakdown.battleSuit+breakdown.skillChips,label);
  }
  assert.equal(checkedShots,672);assert.equal(checkedCasts,168);assert.equal(checkedChipHits,420);
  assert.ok(checkedCriticals>0,'matrix must include critical shots');
  assert.ok(checkedPierces>0,'matrix must include shield-ignoring pierce');
});

test('unequipped/zero-power PVE and canonical five-card PVP are identical to previous live',()=>{
  for(const seed of [1,17,2011])for(const battleSuit of [null,{code:'BATTLE_SUIT_03',pvePower:0,skillChips:chips}]){
    const input={cards,monster,battleSuit,seed};
    assert.deepEqual(createPveBattleV2(input).result,previous.createPveBattleV2(input).result);
  }
  const input={teamA:cards.map((c,i)=>buildFighter(c,i,'A')),teamB:cards.map((c,i)=>buildFighter({...c,id:`ENEMY-${i}`},i,'B')),maxActions:80,seed:2011};
  assert.deepEqual(simulateBattleV2Preview(input),previous.simulateBattleV2Preview(input));
});

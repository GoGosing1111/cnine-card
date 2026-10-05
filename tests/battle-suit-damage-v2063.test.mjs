import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createPveBattleV2,buildFighter,buildBattleSuitFighter,buildMonsterFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {SKILL_CHIP_CATALOG} from '../shared/battle-suit-skill-chips.mjs';

// 2026-10-05 supersedes the V2063 requirement to preserve the skill-only x3.
// Compare unaffected behavior with the actual last source before this reform.
const engineUrl=new URL('../functions/_battle_v2_preview.js',import.meta.url);
const root=fileURLToPath(new URL('../',import.meta.url));
const beforeSource=execFileSync('git',['show','56b11c3ddc5b3d6b893abf2dd341c6f320f36097:functions/_battle_v2_preview.js'],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
const resolvable=beforeSource.replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,engineUrl).href));
const before=await import('data:text/javascript;base64,'+Buffer.from(resolvable).toString('base64'));
const chips=SKILL_CHIP_CATALOG.map(c=>c.code);
const suits=['BATTLE_SUIT_01','BATTLE_SUIT_02','BATTLE_SUIT_03','BATTLE_SUIT_H_BODY','BATTLE_SUIT_S_BODY','BATTLE_SUIT_Z_BODY','BATTLE_SUIT_X_BODY'];
const weapons=['','EQ_1785427638137','EQ_1785961232958','EQ_1785961300455','EQ_1786966923833','EQ_1788486929132','EQ_1788486888336'];
const types=['HP','DEFENSE','DEFENSE','ATTACK','SPEED'];
const deck=power=>types.map((power_type,i)=>({id:'REFORM-'+i,title:'Controlled '+i,rarity:'FUR',power_type,power}));
const monster={id:999,name:'Controlled boss',battle_power:2_000_000,is_boss:1,pve_difficulty:'APOCALYPSE',pve_hp_percent:260,pve_attack_percent:220,pve_defense_percent:190,pve_speed_percent:160,pve_shield_percent:40,pve_attack_count:2,pve_forced_action_every:4};
const applied=e=>Number(e.damage||0)+Number(e.absorbed||0);
const firstCast=(battle,code)=>battle.timeline.find(e=>e.type==='SKILL_CHIP_CAST'&&(!code||e.chipCode===code)&&!e.dodge);

function controlled({code='BATTLE_SUIT_03',power=3000000,weapon='',bossPower=2000000,apocalypse=false,seed=2011}={}){
  const teamA=deck(100_000_000).map((c,i)=>({...buildFighter(c,i,'A',null,'PVE'),speed:200,attack:1}));
  const support=buildBattleSuitFighter({code,pvePower:power,weapon:{code:weapon},skillChips:chips});
  // The default high-power suit exceeds the old HP floor, isolating the skill
  // multiplier change. A large shield prevents overkill from hiding damage.
  const enemy={...buildMonsterFighter({id:999,battle_power:bossPower,is_boss:1,pve_hp_percent:260}),isApocalypse:apocalypse,attack:1,speed:200,shield:1e12,maxShield:1e12};
  return {teamA:[...teamA,...(support?[support]:[])],teamB:[enemy],seed,maxActions:80};
}

test('all live suits and weapon cadences remove only the separate skill x3 when the HP floor and pierce are absent',()=>{
  assert.deepEqual(SKILL_CHIP_CATALOG.map(c=>[c.damageMultiplier,c.intervalMs]),[[2.5,3000],[5,15000],[10,10000]]);
  let checked=0,intrinsic=0;
  for(const code of suits)for(const weapon of weapons){
    const input=controlled({code,weapon});
    const old=before.simulateBattleV2Preview(input),now=simulateBattleV2Preview(input);
    const oldShots=old.timeline.filter(e=>e.type==='TURN'&&e.actorKind==='BATTLE_SUIT').slice(0,8);
    const newShots=now.timeline.filter(e=>e.type==='TURN'&&e.actorKind==='BATTLE_SUIT').slice(0,8);
    assert.deepEqual(newShots,oldShots,`${code}/${weapon}: ordinary damage and clock`);
    for(const chipCode of [...chips,...(code==='BATTLE_SUIT_X_BODY'?['BATTLE_SUIT_X_CELESTIAL_DRAGON']:code==='BATTLE_SUIT_Z_BODY'?['BATTLE_SUIT_Z_THUNDER_JUDGMENT']:[])]){
      const a=firstCast(old,chipCode),b=firstCast(now,chipCode);
      assert.ok(a&&b,`${code}/${weapon}: ${chipCode} must cast`);
      assert.equal(a.baseDamage,b.baseDamage*3,chipCode);
      assert.equal(a.calculatedDamage,b.calculatedDamage*3,chipCode);
      for(const key of ['combatAtMs','intervalMs','critical','dodge','damageMultiplier'])assert.equal(b[key],a[key],key);
      assert.deepEqual(b.impactOffsetsMs,a.impactOffsetsMs);
      const oldHits=old.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===a.castId);
      const hits=now.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===b.castId);
      assert.equal(hits.length,b.impactOffsetsMs.length);
      assert.equal(hits.reduce((n,e)=>n+applied(e),0),b.calculatedDamage);
      assert.equal(oldHits.reduce((n,e)=>n+applied(e),0),b.calculatedDamage*3);
      checked++;if(b.damageSource==='BATTLE_SUIT_INTRINSIC_SKILL')intrinsic++;
    }
  }
  assert.equal(checked,161);assert.equal(intrinsic,14);
});

test('ordinary and chip damage grow with suit power instead of inheriting monster-max-HP minimum damage',()=>{
  for(const apocalypse of [false,true])for(const weapon of weapons){
    const results=[1,100000,200000,400000].map(power=>createPveBattleV2({cards:deck(400000),monster:{...monster,pve_difficulty:apocalypse?'APOCALYPSE':'NORMAL',pve_hp_percent:1200},battleSuit:{code:'BATTLE_SUIT_03',pvePower:power,weapon:{code:weapon},skillChips:chips},seed:2011}));
    const castDamage=results.map(b=>firstCast(b.result,chips[2]).calculatedDamage);
    assert.ok(castDamage[0]<=400,'token power must not inherit a percent of boss HP');
    assert.ok(castDamage[1]>castDamage[0]*100&&castDamage[2]>castDamage[1]&&castDamage[3]>castDamage[2],JSON.stringify({apocalypse,weapon,castDamage}));
    const shots=results.map(b=>b.result.timeline.find(e=>e.type==='TURN'&&e.actorKind==='BATTLE_SUIT'&&!e.dodge));
    assert.ok(shots.every(Boolean));
    assert.ok(applied(shots[1])>applied(shots[0])&&applied(shots[2])>applied(shots[1])&&applied(shots[3])>applied(shots[2]));
    for(const b of results){const d=b.result.damageBreakdown;assert.equal(d.total,d.cards+d.battleSuit+d.skillChips+d.ultimate);assert.equal(b.result.supports.A[0].damageDealt,d.battleSuit+d.skillChips);}
  }
});

test('a stronger boss no longer grants free pierce through a faster reference-card clock',()=>{
  for(const weapon of weapons){
    const observed=[2_000_000,20_000_000,80_000_000].map(bossPower=>{
      const r=simulateBattleV2Preview(controlled({power:100000,weapon,bossPower,apocalypse:true}));
      const shot=r.timeline.find(e=>e.type==='TURN'&&e.actorKind==='BATTLE_SUIT'&&!e.dodge);
      assert.ok(shot&&shot.apocalypsePierce>0);return shot.apocalypsePierce;
    });
    assert.ok(Math.max(...observed)-Math.min(...observed)<=4,JSON.stringify({weapon,observed}));
    const single=simulateBattleV2Preview(controlled({power:100000,weapon,apocalypse:true}));
    const doubled=simulateBattleV2Preview(controlled({power:200000,weapon,apocalypse:true}));
    const pierce=r=>r.timeline.find(e=>e.type==='TURN'&&e.actorKind==='BATTLE_SUIT'&&!e.dodge).apocalypsePierce;
    assert.ok(Math.abs(pierce(doubled)-pierce(single)*2)<=4);
  }
});

test('normalization never buffs skill or ordinary pierce against low-power apocalypse enemies',()=>{
  for(const bossPower of [10000,100000,300000,1000000])for(const weapon of weapons){
    const input=controlled({power:300000,weapon,bossPower,apocalypse:true});
    // Preserve the live enemy stats/HP ratio, but keep enough HP and shield to
    // observe the first volley before residual health clips the receipt.
    input.teamB[0].hp=1e12;input.teamB[0].maxHp=1e12;
    const old=before.simulateBattleV2Preview(input),now=simulateBattleV2Preview(input);
    const a=firstCast(old,chips[2]),b=firstCast(now,chips[2]);
    assert.ok(a&&b);assert.ok(b.calculatedDamage*3<=a.calculatedDamage,JSON.stringify({bossPower,weapon}));
    const shot=r=>r.timeline.find(e=>e.type==='TURN'&&e.actorKind==='BATTLE_SUIT'&&!e.dodge);
    assert.ok(shot(now).apocalypsePierce<=shot(old).apocalypsePierce);
  }
});

test('a token suit with all three chips cannot exploit the controlled baseline encounter; no minimum-suit gate is added',()=>{
  let oldWins=0,newWins=0,strongDeckWins=0;
  for(let seed=1;seed<=24;seed++){
    const input={cards:deck(400000),monster,battleSuit:{code:'BATTLE_SUIT_03',pvePower:1,weapon:{code:'EQ_1785427638137'},skillChips:chips},seed,bossUltimatePercent:28};
    oldWins+=before.createPveBattleV2(input).result.winner==='A';
    newWins+=createPveBattleV2(input).result.winner==='A';
    strongDeckWins+=createPveBattleV2({...input,cards:deck(680000),battleSuit:null}).result.winner==='A';
  }
  assert.equal(oldWins,24);assert.equal(newWins,0);
  assert.ok(strongDeckWins>=20,'strong decks remain free to clear without a suit');
});

test('unaffected PVE without a suit and PVP preserve pre-reform results, including speed and duplicate guards',()=>{
  for(const seed of [1,17,2011])for(const battleSuit of [null,{code:'BATTLE_SUIT_03',pvePower:0,skillChips:chips}]){
    const input={cards:deck(400000),monster,battleSuit,seed};
    assert.deepEqual(createPveBattleV2(input).result,before.createPveBattleV2(input).result);
  }
  for(const seed of [1,17,2011]){
    const cards=deck(400000),input={teamA:cards.map((c,i)=>buildFighter(c,i,'A')),teamB:cards.map((c,i)=>buildFighter({...c,id:'ENEMY-'+i},i,'B')),maxActions:80,seed};
    assert.deepEqual(simulateBattleV2Preview(input),before.simulateBattleV2Preview(input));
  }
});

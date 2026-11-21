import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattleV2Preview,buildBattleSuitFighter} from '../functions/_battle_v2_preview.js';
import {input,chips} from '../docs/qa/x-body-impact-20261106/probe.mjs';

const sx='BATTLE_SUIT_SX', x='BATTLE_SUIT_X_BODY';
const amount=hit=>hit.damage+hit.absorbed;
const casts=battle=>battle.timeline.filter(e=>e.type==='SKILL_CHIP_CAST');
const hits=(battle,cast)=>battle.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===cast.castId);

function fight(code,{power=50_000_000,apocalypse=false,defense=0,weaponCode='',duration=44_000}={}){
  const args=input({code,power,apocalypse,seed:27});
  args.teamA[5]=buildBattleSuitFighter({code,pvePower:power,weaponCode,skillChips:chips});
  Object.assign(args.teamB[0],{power:500_000_000,hp:1e14,maxHp:1e14,shield:1e14,maxShield:1e14,battleSuitSkillDefensePercent:defense});
  args.maxCombatDurationMs=duration;
  return simulateBattleV2Preview(args);
}

for(const [apocalypse,defense] of [[false,0],[true,0],[true,50],[true,100]]){
  test(`first and second SX ultimate, equipped chips and shields settle correctly (Apocalypse ${apocalypse}, defense ${defense}%)`,()=>{
    const options={apocalypse,defense,weaponCode:'EQ_1788486929132'};
    const sxBattle=fight(sx,options),xBattle=fight(x,options);
    const sxCasts=casts(sxBattle),xCasts=casts(xBattle);
    assert.deepEqual(sxCasts.filter(c=>c.damageSource==='BATTLE_SUIT_INTRINSIC_SKILL').map(c=>c.combatAtMs),[0,40_000]);
    assert.equal(sxCasts.length,xCasts.length);
    for(const [i,cast] of sxCasts.entries()){
      const other=xCasts[i],intrinsic=cast.damageSource==='BATTLE_SUIT_INTRINSIC_SKILL';
      assert.equal(cast.combatAtMs,other.combatAtMs);
      assert.equal(cast.baseDamage,other.baseDamage);
      if(!intrinsic)assert.equal(cast.chipCode,other.chipCode);
      assert.equal(cast.calculatedDamage,other.calculatedDamage*(intrinsic?1.25:1));
      if(!intrinsic)continue;
      const receipts=hits(sxBattle,cast),xReceipts=hits(xBattle,other);
      assert.equal(receipts.length,5);assert.equal(xReceipts.length,5);
      assert.equal(receipts.reduce((s,h)=>s+amount(h),0),cast.calculatedDamage);
      const pierce=rows=>rows.reduce((s,h)=>s+(h.apocalypsePierce||0),0);
      assert.equal(pierce(receipts),pierce(xReceipts)*1.25);
      if(apocalypse&&defense<100)assert.ok(pierce(receipts)>0);
      if(defense===100)assert.equal(cast.calculatedDamage,0);
    }
  });
}

test('SX basic shots prorate Apocalypse pierce across its double cadence on each weapon',()=>{
  for(const weaponCode of ['', 'EQ_1785427638137','EQ_1785961300455','EQ_1788486929132']){
    const options={weaponCode,apocalypse:true,duration:8000};
    const first=b=>b.timeline.find(e=>e.type==='TURN'&&e.actorKind==='BATTLE_SUIT'&&!e.dodge);
    const a=first(fight(sx,options)),b=first(fight(x,options));
    assert.ok(a.apocalypsePierce>0&&b.apocalypsePierce>0);
    // Pierce rounds to an integer before the 4 x 32 common power adjustment.
    assert.ok(Math.abs(a.apocalypsePierce*2-b.apocalypsePierce)<=128);
  }
});

test('with live catalog powers SX delivers the highest opening ultimate to HP and shield',()=>{
  for(const apocalypse of [false,true]){
    const damage=(code,power)=>{
      const b=fight(code,{apocalypse,power,duration:6500});
      const c=casts(b).find(c=>c.damageSource==='BATTLE_SUIT_INTRINSIC_SKILL');
      assert.ok(c&&c.calculatedDamage>0);
      const landed=hits(b,c).reduce((sum,hit)=>sum+amount(hit),0);
      assert.equal(landed,c.calculatedDamage);
      return landed;
    };
    const top=damage(sx,80_000_000);
    for(const [code,power] of [[x,50_000_000],['BATTLE_SUIT_OVERLORD',75_000_000],['BATTLE_SUIT_Z_BODY',25_000_000]])
      assert.ok(top>damage(code,power),code);
  }
});

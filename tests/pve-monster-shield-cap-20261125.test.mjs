import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFighter,buildMonsterFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';

function fight({power=100_000_000_000,shieldRatio=117,boss=false,region}={}) {
  const card=buildFighter({id:'guarded',power:2000,rarity:'ZENITH',power_type:'ATTACK'},0,'A',null,'PVE');
  card.shield=card.maxHp*shieldRatio;
  card.maxShield=card.maxHp*1000;
  const monster=buildMonsterFighter({id:1,battle_power:power,is_boss:boss});
  if(region)monster.legionRegion=region;
  const result=simulateBattleV2Preview({teamA:[card],teamB:[monster],seed:42,maxActions:100,forcedMonsterEvery:1});
  const hits=result.timeline.filter(e=>e.type==='TURN'&&e.actorId===monster.id&&e.targetId===card.id&&!e.dodge);
  return {card,hits,result};
}

test('ordinary PvE monsters and bosses spend the remaining oversized ward, then reach HP',()=>{
  for(const boss of [false,true]){
    const {card,hits,result}=fight({boss});
    assert.equal(hits[0].absorbed,Math.round(card.shield*.46));
    assert.equal(hits[0].damage,0);
    assert.ok(hits[1].absorbed<hits[0].absorbed);
    const hpHits=hits.filter(e=>e.damage>0);
    assert.ok(hpHits.length>0&&hpHits.every(e=>e.targetShieldAfter===0&&e.damage<=Math.round(card.maxHp*.46)));
    assert.equal(result.final.A[0].hp,0);
    assert.ok(hits.length<20);
  }
});

test('a weak monster cannot borrow damage from its target’s shield',()=>{
  const guarded=fight({power:1500}), bare=fight({power:1500,shieldRatio:0});
  assert.ok(guarded.hits[0].absorbed>0);
  assert.deepEqual(guarded.hits.slice(0,3).map(e=>e.absorbed),bare.hits.slice(0,3).map(e=>e.damage));
});

test('all five regional bosses use their 34% pattern cap on the current ward',()=>{
  for(const region of ['coast','desert','theatre','viscera','sky']){
    const {card,hits,result}=fight({boss:true,region});
    assert.ok(hits[0].legionPattern,region);
    assert.equal(hits[0].absorbed,card.shield*.34,region);
    assert.ok(hits.some(e=>e.damage>0&&e.targetShieldAfter===0),region);
    assert.equal(result.final.A[0].hp,0,region);
    const weak=fight({power:1500,boss:true,region}), bare=fight({power:1500,shieldRatio:0,boss:true,region});
    assert.ok(Math.abs(weak.hits[0].absorbed-bare.hits[0].damage)<1e-9,region);
  }
});

test('linked opening shields count once, and past shields never increase the cap',()=>{
  const attacker={isMonster:true};
  for(const battleMode of ['PVE','RAID']){
    const card={battleMode,maxHp:1000,maxShield:100_000,shield:100_000};
    assert.equal(mercenaryDamageCapHp(card,attacker),100_000);
    for(const shield of [0,500,1000])assert.equal(mercenaryDamageCapHp({...card,shield},attacker),1000);
    assert.equal(mercenaryDamageCapHp(card,{isMonster:false}),1000);
    assert.equal(mercenaryDamageCapHp({...card,isMonster:true},attacker),1000);
    const merc={...card,isMercenary:true,mercenaryLink:{openingShield:2000,tierGuard:2}};
    for(const shield of [0,1000,2000])assert.equal(mercenaryDamageCapHp({...merc,shield},attacker),1500);
    assert.equal(mercenaryDamageCapHp({...merc,shield:3000},attacker),2500);
  }
});

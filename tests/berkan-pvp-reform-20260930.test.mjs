import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFighter,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat,mercenarySkillCapActions} from '../functions/_mercenary_combat.js';
import {candidate} from '../scripts/measure-berkan-balance.mjs';
import {BERKAN_PVP_SKILL_CAP_SCALE,BERKAN_BALANCE} from '../shared/mercenary-berkan-v1.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {equippedFixture,equippedDeck} from '../scripts/measure-berkan-pvp-reform-20260930.mjs';

function cast({mode='PVP',code='V-055',veil=0,ratio=5.6,ownerId}={}){
 const snapshot=candidate(code);snapshot.skills=[structuredClone(candidate('V-055').skills.find(s=>s.id==='MS-055'))];snapshot.skills[0].balance.damageRatio=ratio;
 const actor=buildMercenaryFighter(snapshot,'A',mode,buildFighter);if(ownerId)actor.ownerId=ownerId;
 const targets=Array.from({length:5},(_,i)=>({...buildFighter({id:'T'+i,power:1e8},i,'B',null,mode),id:'T'+i,row:i<2?'FRONT':'BACK',attack:1000+i,hp:1e8,maxHp:1e8,shield:100,actions:0}));
 const hits=[],events=[];const runtime=mercenaryCombat({teams:{A:[actor],B:targets},
  hit(a,t,multiplier,options){hits.push({id:t.id,multiplier,...options});return {damage:1000,dodge:t.id==='T3'};},
  damage(t,n){const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.shield-=absorbed;t.hp-=hpDamage;return {absorbed,hpDamage};},
  knockout(){},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 if(veil)runtime.debuffs.set(actor.id,{veil:{percent:veil}});
 actor.actions++;runtime.beforeAction(actor);return {actor,targets,hits,events,runtime};
}

test('only Berkan PVP starfall uses the new cap and existing damage variance, including duo owners',()=>{
 assert.equal(BERKAN_PVP_SKILL_CAP_SCALE,1.865);
 for(const cfg of [{},{ownerId:11},{ownerId:22},{mode:'PVE'},{code:'V-049'}]){
  const h=cast(cfg),pvp=cfg.mode!=='PVE'&&!cfg.code;
  assert.equal(h.hits.length,2);assert.deepEqual(h.hits.map(r=>r.id),['T4','T3']);
  assert.ok(h.hits.every(r=>r.capScale===(pvp?1.865:1.7)&&r.varyDamageCap===pvp));
  assert.ok(h.hits.every(r=>r.multiplier===BERKAN_BALANCE.damageRatio/2));
  assert.equal(h.runtime.state(h.actor).energy,65);assert.equal(h.runtime.state(h.actor).cooldown.get('MS-055'),6);
  const event=h.events.find(e=>e.type==='MERCENARY_STARFALL');assert.equal(event.impacts.length,2);assert.equal(event.impacts[0].damage,900);assert.equal(event.impacts[0].absorbed,100);assert.equal(event.impacts[1].damage,0);assert.equal(event.impacts[1].dodge,true);
 }
 const h=cast();assert.equal(mercenarySkillCapActions(h.actor,{id:'MS-056'},false),1);
});

test('offensive suppression scales the entire new budget once; zero damage never falls back to a basic',()=>{
 for(const veil of [25,75]){const h=cast({veil});for(const r of h.hits){assert.ok(Math.abs(r.capScale-1.865*(1-veil/100))<1e-10);assert.equal(r.varyDamageCap,true);assert.equal(r.multiplier,2.8*(1-veil/100));}}
 for(const cfg of [{veil:100},{ratio:0}]){const h=cast(cfg);assert.equal(h.hits.length,0);assert.equal(h.actor.damageDealt,0);assert.ok(h.targets.every(t=>t.hp===1e8&&t.shield===100));}
});

test('canonical PVP capped contacts vary within the existing roll range and replay deterministically',()=>{
 const cards=tierCards(2e7,['DEFENSE','DEFENSE','DEFENSE','DEFENSE','DEFENSE']),mercenary=candidate('V-055'),ratios=new Set();
 for(const seed of [1,13,31,53,97,193]){
  const input={attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,defenderMercenary:candidate('V-046'),seed:seed*7919};
  const b=createPvpBattleV2(input);assert.deepEqual(createPvpBattleV2(input),b);
  const first=b.result.timeline.find(e=>e.actorId?.includes('V-055')&&e.type==='MERCENARY_STARFALL');assert.ok(first);
  for(const impact of first.impacts){if(impact.dodge)continue;const damage=impact.damage+impact.absorbed,nominal=impact.targetMaxHp*.60*1.865;
   assert.ok(damage<=Math.round(nominal*1.05)+1,'one-contact budget cannot overflow');
   if(impact.targetHpAfter>0){assert.ok(damage>=Math.round(nominal*.95)-1);ratios.add(Math.round(damage/nominal*10000));}
  }
 }
 assert.ok(ratios.size>1,'a capped hit must retain damage variance instead of one fixed damage value');
});

test('equipped comparison retains every fixed formation with five cards, advancement and equipped magic',()=>{
 assert.equal(equippedFixture.formations.length,23);const seen=new Set();
 for(const f of equippedFixture.formations){const cards=equippedDeck(f);assert.equal(cards.length,5);assert.ok(cards.every(c=>c.breakthroughLevel===13));assert.ok(cards.some(c=>c.uniqueAdvancement?.active));assert.ok(equippedFixture.magicProfiles[f.magic].every(m=>m.enhancementLevel===9));const key=JSON.stringify({cards,magic:f.magic});assert.ok(!seen.has(key));seen.add(key);}
 assert.ok(Object.values(equippedFixture.cardProfiles).some(c=>!c.uniqueAdvancement?.active),'retain the observed unadvanced profile instead of inventing an advancement');
});

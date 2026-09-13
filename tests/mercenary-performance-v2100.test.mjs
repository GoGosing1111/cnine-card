import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFighter,createPvpBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {MERCENARY_POWER_STANDARD as powerStandard} from '../shared/equipment-mercenary-power-v1.mjs';
const catalog=JSON.parse(readFileSync(new URL('../preview/mercenary-role-attacks-v2100/catalog-snapshot.json',import.meta.url)));
const cards=power=>Array.from({length:5},(_,i)=>({id:String(i+1),power,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]}));
const snapshot=(code='V-004')=>{const row=catalog.cards.find(r=>r.code===code);return {...row,statMode:'RANK_FIXED',combat,skills:row.skills.map(s=>({...seed.document.skills.find(d=>d.id===s.id),balance:s.balance}))};};

test('optional mercenary leaves the original five-card guard pool and each shield intact',()=>{
 const options={attackerCards:cards(1000000),defenderCards:cards(1000000),seed:4};
 const shield=b=>b.result.timeline.filter(e=>e.type==='START_EFFECT'&&e.effect==='SHIELD'&&!e.targetId.includes('MERCENARY')).map(e=>({id:e.targetId,amount:e.amount}));
 assert.deepEqual(shield(createPvpBattleV2({...options,attackerMercenary:snapshot()})),shield(createPvpBattleV2(options)));
});

test('reserved mercenary actions preserve regular-card order, clock, RNG and full action budget',()=>{
 const team=side=>cards(20000000).map((card,i)=>({...buildFighter(card,i,side,null,'PVP'),row:'FRONT',type:'NONE',maxHp:1e12,hp:1e12,attack:100,defense:1,shield:0,maxShield:0}));
 const a=team('A'),b=team('B'),m={...buildMercenaryFighter({...snapshot(),skills:[]},'A','PVP',buildFighter),speed:35,maxHp:1e12,hp:1e12,attack:10};
 const baseline=simulateBattleV2Preview({teamA:a,teamB:b,maxActions:60,seed:9184});
 const next=simulateBattleV2Preview({teamA:[...a,m],teamB:b,maxActions:60,seed:9184});
 const regular=r=>r.timeline.filter(e=>e.type==='TURN'&&!e.actorId.includes('MERCENARY')).map(({actorId,at,damage,critical,dodge})=>({actorId,at,damage,critical,dodge}));
 assert.deepEqual(regular(next),regular(baseline));assert.equal(next.actions,60);assert.ok(next.mercenaryActions>=5);
 assert.ok(next.timeline.some(e=>e.actionClock==='MERCENARY_ADDITIONAL'&&e.damage>0));
});

test('reservation is immediate after five own card actions and a dead mercenary cannot queue',()=>{
 const card={side:'A',alive:true,hp:1},m={...card,isMercenary:true,id:'M'};
 const cadence=mercenaryTurnCadence({A:[card,m],B:[]});
 assert.equal(cadence.pending(),null);for(let i=0;i<5;i++)cadence.acted(card);
 assert.equal(cadence.pending(),m);cadence.acted(m);assert.equal(cadence.pending(),null);
 for(let i=0;i<5;i++)cadence.acted(card);m.hp=0;assert.equal(cadence.pending(),null);
});

test('a mercenary-only stalemate has a bounded additional-action budget',()=>{
 const m=side=>({...buildMercenaryFighter({...snapshot(),skills:[]},side,'PVP',buildFighter),maxHp:1e12,hp:1e12,attack:1,defense:1e9});
 const r=simulateBattleV2Preview({teamA:[m('A')],teamB:[m('B')],seed:1,maxActions:5});
 assert.equal(r.reason,'ACTION_LIMIT');assert.equal(r.actions,0);assert.equal(r.mercenaryActions,20);
});

test('exhausting an extreme mercenary speed budget never ends remaining regular-card actions',()=>{
 const team=side=>cards(10000).map((c,i)=>({...buildFighter(c,i,side,null,'PVP'),type:'NONE',row:'FRONT',speed:35,hp:1e12,maxHp:1e12,attack:1,defense:1e9}));
 const m={...buildMercenaryFighter({...snapshot(),skills:[]},'A','PVP',buildFighter),speed:1e7,hp:1e12,maxHp:1e12,attack:1,defense:1e9};
 const r=simulateBattleV2Preview({teamA:[...team('A'),m],teamB:team('B'),seed:1,maxActions:20});
 assert.equal(r.actions,20);assert.equal(r.mercenaryActions,40);
});

test('mercenary fixed power is preserved and overtime cannot turn a weak extra attack into a 55% HP strike',()=>{
 for(const [rank,power]of Object.entries(powerStandard.basePowerByRank)){
  const m=buildMercenaryFighter({...snapshot(),rank,skills:[]},'A','PVP',buildFighter);assert.equal(m.power,power);
 }
 const battle=createPvpBattleV2({attackerCards:cards(20000000),defenderCards:cards(20000000),attackerMercenary:{...snapshot(),rank:'C',skills:[]},seed:12});
 for(const e of battle.result.timeline.filter(e=>e.type==='TURN'&&e.actorKind==='MERCENARY'))assert.notEqual(e.suddenDeath,true);
});

test('all 43 current CMS mercenaries avoid aggregate PVP regression at the reported mid/high power bands',()=>{
 // Paired seeds in both attacking/defending positions. Individual battles may
 // change outcome; this checks the systematic loss reported by the user.
 for(const power of [400000,1000000,20000000]){
  const party=cards(power),baseline=new Map();for(let k=1;k<=64;k++)baseline.set(k,createPvpBattleV2({attackerCards:party,defenderCards:party,seed:k*7919}));
  for(const row of catalog.cards){let before=0,after=0;
   for(const side of ['A','B'])for(let k=1;k<=64;k++){
    before+=Number(baseline.get(k).result.winner===side);
    const b=createPvpBattleV2({attackerCards:party,defenderCards:party,[side==='A'?'attackerMercenary':'defenderMercenary']:snapshot(row.code),seed:k*7919});
    after+=Number(b.result.winner===side);assert.equal(b.teams[side].cards.length,5);assert.equal(b.teams[side].mercenaries.length,1);
   }
   assert.ok(after>=before,`${row.code} (${row.role}) at ${power}: ${after}/${128} vs ${before}/${128}`);
  }
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {buildFighter,createPvpBattleV2,createPveBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {speedComboSnapshots} from '../shared/pvp-speed-reform-v1.mjs';
const engine=new URL('../functions/_battle_v2_preview.js',import.meta.url);
const source=execFileSync('git',['show','aef4d6ab:functions/_battle_v2_preview.js'],{encoding:'utf8',maxBuffer:2e6})
 .replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,(_,a,p,b)=>a+new URL(p,engine).href+b);
const before=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const card=(type,id=type,bonus=50)=>({id,title:id,power:120000,rarity:'FUR',uniqueAbility:{dominantType:type,attackPercent:type==='ATTACK'?bonus:0,defensePercent:type==='DEFENSE'?bonus:0,hpPercent:type==='HP'?bonus:0,speedPercent:type==='SPEED'?bonus:0}});
const fighter=(type,id,side,extra={})=>({...buildFighter(card(type,id),0,side,card(type,id).uniqueAbility,'PVP'),...extra});

test('PVP opens at 60 and keeps 70 percent of the bonus against two guards; PVE remains 30',()=>{
 for(const mode of ['PVP','PVE'])assert.equal(buildFighter(card('SPEED'),0,'A',card('SPEED').uniqueAbility,mode).gauge,mode==='PVP'?60:30);
 const speed=fighter('SPEED','s','A'),attack=fighter('ATTACK','a','A'),guards=[fighter('DEFENSE','g1','B'),fighter('DEFENSE','g2','B',{slot:1})];
 const r=simulateBattleV2Preview({teamA:[speed,attack],teamB:guards,maxActions:1});
 const e=r.timeline.filter(e=>e.type==='SPEED_UNIQUE_SUPPRESSED');assert.equal(e.length,1);
 assert.equal(e[0].targetId,speed.id);assert.equal(e[0].gaugeAfter,60);
 assert.equal(e[0].speedAfter,Math.round(speed.speed*1.35/1.5));assert.equal(e[0].suppressedBonusPercent,30);
});

test('guard KO restores speed; an immediate revival keeps suppression',()=>{
 const speed=fighter('SPEED','s','A',{speed:10000,attack:1e9}),guards=[fighter('DEFENSE','g1','B',{hp:1,maxHp:100,shield:0,maxShield:0,slot:0}),fighter('DEFENSE','g2','B',{hp:100,maxHp:100,shield:0,maxShield:0,slot:1})];
 const run=magic=>simulateBattleV2Preview({teamA:[speed],teamB:guards,magicB:magic,maxActions:1,seed:1});
 const r=run([]);assert.ok(r.timeline.some(e=>e.type==='KO'&&e.targetId===guards[0].id));
 const restored=r.timeline.find(e=>e.type==='SPEED_UNIQUE_RESTORED');assert.ok(restored);assert.ok(Math.abs(restored.speedAfter-speed.speed)<=1);
 const revived=run([{slotNo:1,id:1,code:'REVIVE',effectType:'PHOENIX_REVIVE',effectValue:90,triggerChance:100,maxActivations:1}]);
 assert.ok(revived.timeline.some(e=>e.type==='MAGIC_CARD'&&e.revived));assert.equal(revived.timeline.some(e=>e.type==='SPEED_UNIQUE_RESTORED'),false);
});

test('nonpositive bonuses and dead/mercenary guards do not cause suppression',()=>{
 for(const bonus of [0,-30]){
  const c=card('SPEED','s',bonus),s=buildFighter(c,0,'A',c.uniqueAbility,'PVP');
  const r=simulateBattleV2Preview({teamA:[s],teamB:[fighter('DEFENSE','g1','B'),fighter('DEFENSE','g2','B')],maxActions:1});
  assert.equal(r.timeline.some(e=>e.type==='SPEED_UNIQUE_SUPPRESSED'),false);
 }
 for(const second of [{alive:false,hp:0},{isMercenary:true}]){
  const r=simulateBattleV2Preview({teamA:[fighter('SPEED','s','A')],teamB:[fighter('DEFENSE','g1','B'),fighter('DEFENSE','g2','B',second)],maxActions:1});
  assert.equal(r.timeline.some(e=>e.type==='SPEED_UNIQUE_SUPPRESSED'),false);
 }
});

test('1/4/7 basic attacks have three hits, others two; one action and no old random gauge bonus',()=>{
 const s=fighter('SPEED','s','A',{speed:1000,attack:150,defense:1,hp:1e8,maxHp:1e8});
 const t=fighter('NONE','t','B',{speed:500,attack:1,defense:1,hp:1e8,maxHp:1e8});
 const r=simulateBattleV2Preview({teamA:[s],teamB:[t],maxActions:22,seed:33});
 const turns=r.timeline.filter(e=>e.type==='TURN'&&e.actorId===s.id&&!e.dodge);assert.ok(turns.length>=7);
 for(const [i,e] of turns.entries()){
  assert.equal(e.basicAttack,i+1);assert.equal(e.hitCount,i%3===0?3:2);assert.equal(e.hits.length,e.hitCount);
  assert.equal(e.damage,e.hits.reduce((n,h)=>n+h.damage,0));assert.equal(e.absorbed,e.hits.reduce((n,h)=>n+h.absorbed,0));
  assert.equal(e.hits.at(-1).targetHpAfter,e.targetHpAfter);assert.equal(e.hits.at(-1).targetShieldAfter,e.targetShieldAfter);
  assert.ok(e.actorGaugeAfter<1e-9);
 }
 assert.equal(r.actions,r.timeline.filter(e=>e.type==='TURN').length);
});

test('whole triple respects the base 48 percent HP cap',()=>{
 const r=simulateBattleV2Preview({teamA:[fighter('SPEED','s','A',{speed:10000,attack:1e12})],teamB:[fighter('NONE','t','B',{maxHp:1e6,hp:1e6,shield:0,defense:0})],maxActions:1,seed:4});
 const turn=r.timeline.find(e=>e.speedCombo);assert.ok(turn);assert.equal(turn.hitCount,3);assert.equal(turn.damage,480000);
});

test('misses emit no echoes but advance the basic attack cycle',()=>{
 let missed=false;
 for(let seed=1;seed<=50&&!missed;seed++){
  const s=fighter('SPEED','s','A',{speed:1000,hp:1e8,maxHp:1e8,attack:100}),t=fighter('SPEED','t','B',{speed:300,hp:1e8,maxHp:1e8,attack:1});
  const r=simulateBattleV2Preview({teamA:[s],teamB:[t],maxActions:20,seed});let n=0;
  for(const e of r.timeline.filter(e=>e.type==='TURN'&&e.actorId===s.id)){
   n++;if(e.dodge){missed=true;assert.equal(e.hits,undefined);}else {assert.equal(e.basicAttack,n);assert.equal(e.hitCount,(n-1)%3===0?3:2);}
  }
 }
 assert.ok(missed);
});

test('magic haste activates once per landed action, never per echo',()=>{
 const s=fighter('SPEED','s','A',{speed:1000,hp:1e8,maxHp:1e8,attack:100}),t=fighter('NONE','t','B',{speed:300,hp:1e8,maxHp:1e8,attack:1});
 const r=simulateBattleV2Preview({teamA:[s],teamB:[t],magicA:[{slotNo:1,id:1,code:'HASTE',effectType:'FOLLOWUP_HASTE',effectValue:10,triggerChance:100,maxActivations:100}],maxActions:15});
 const turns=r.timeline.filter(e=>e.type==='TURN'&&e.actorId===s.id&&!e.dodge);assert.ok(turns.length>3);
 assert.equal(r.timeline.filter(e=>e.type==='MAGIC_CARD'&&e.effectType==='FOLLOWUP_HASTE').length,turns.length);
});

test('snapshots preserve exact losses and stop on KO, including one HP',()=>{
 for(const hp of [1,7,10000])for(const shield of [0,1,555])for(const n of [2,3]){
  const hits=speedComboSnapshots({hpBefore:hp,shieldBefore:shield,hpDamage:hp,absorbed:shield},n);
  assert.equal(hits.reduce((v,h)=>v+h.damage,0),hp);assert.equal(hits.reduce((v,h)=>v+h.absorbed,0),shield);
  assert.equal(hits.at(-1).targetHpAfter,0);assert.equal(hits.at(-1).targetShieldAfter,0);
  assert.ok(hits.slice(0,-1).every(h=>h.targetHpAfter>0));
 }
});

test('PVE and PVP without speed or duplicate guards preserve full outcomes against the previous real engine',()=>{
 for(let i=1;i<=32;i++){
  const cards=['DEFENSE','HP','ATTACK','ATTACK','SPEED'].map((type,j)=>card(type,'c'+j));
  const pve={cards,characterBonus:500000,seed:i*7919,monster:{id:'boss',name:'boss',battle_power:200000,is_boss:i%2}};
  assert.deepEqual(createPveBattleV2(pve),before.createPveBattleV2(pve));
  const twoGuards={...pve,cards:cards.map((c,j)=>j===2?card('DEFENSE',c.id):c)};
  assert.deepEqual(createPveBattleV2(twoGuards),before.createPveBattleV2(twoGuards));
  const a=cards.map(c=>c.uniqueAbility.dominantType==='SPEED'?card('ATTACK',c.id):c);
  const pvp={attackerCards:a,defenderCards:a,attackerEquipmentBonus:500000,defenderEquipmentBonus:500000,seed:i*7919};
  assert.deepEqual(createPvpBattleV2(pvp),before.createPvpBattleV2(pvp));
 }
});

test('duplicate PVP guards add smaller finite barriers; one guard and PVE stay identical',()=>{
 for(const count of [1,2,3,5]){
  const members=Array.from({length:5},(_,i)=>fighter(i<count?'DEFENSE':'NONE','a'+i,'A',{slot:i,hp:100000,maxHp:100000}));
  const args={teamA:members,teamB:[fighter('NONE','b','B')],maxActions:1};
  const barrier=fn=>fn(args).timeline.find(e=>e.type==='GUARD_PROTECT'&&e.side==='A').amount;
  const old=barrier(before.simulateBattleV2Preview),now=barrier(simulateBattleV2Preview);
  if(count===1)assert.equal(now,old);else assert.ok(now<old);
  if(count===2){assert.equal(old,12800);assert.equal(now,10000);}
 }
});

test('healer priority, deterministic replay and immutable inputs survive',()=>{
 const a=['DEFENSE','DEFENSE','HP','ATTACK','SPEED'].map((type,j)=>card(type,'a'+j));
 const b=['DEFENSE','DEFENSE','HP','ATTACK','ATTACK'].map((type,j)=>card(type,'b'+j));
 const args={attackerCards:a,defenderCards:b,seed:9321},snapshot=structuredClone(args);
 const battle=createPvpBattleV2(args);assert.deepEqual(args,snapshot);assert.deepEqual(createPvpBattleV2(args),battle);
 const turns=battle.result.timeline.filter(e=>e.type==='TURN'&&e.actorId===battle.teams.A.cards[4].id);
 assert.equal(turns[0].targetId,battle.teams.B.cards[2].id);assert.ok(turns.some(e=>e.speedCombo));
});

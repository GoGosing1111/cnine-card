import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,joinRoom,startRoom,advanceRoom,commandRoom,publicSnapshot,RULES,WORLD} from '../preview/coop-defense-v1/source/defense-model.mjs';
import {defaultDefenseGrowth,validateDefenseGrowth,settleWaveGrowth,growthTier,ROGUE_ENEMIES,DEFENSE_TRAITS} from '../shared/monster-defense-growth-v2.mjs';
import {monsterDefenseFixture} from './helpers/monster-defense-fixture.mjs';
const team=(capacity=3,extra={})=>{const r=createRoom({id:'ROGUE',capacity,seed:17,...extra});for(let i=0;i<capacity;i++){const p=joinRoom(r,{id:'p'+i,name:'대원'+i});p.ready=true;}startRoom(r,'p0');return r;};
test('approved double chance policy, caps and CMS validation',()=>{
 const g=defaultDefenseGrowth();assert.deepEqual(Object.values(g.drops).map(d=>d.chance),[50,65,80]);assert.deepEqual(g.tiers.map(t=>t.chance),[60,35,15,5]);
 for(const n of [0,11])assert.equal(growthTier(g,n),undefined);assert.equal(growthTier(g,10).cost,300);
 for(const change of [g=>g.waves=31,g=>g.prepSeconds=0,g=>g.drops.NORMAL.chance=101,g=>g.tiers[1].cost=-1,g=>g.tiers[2].from=6,g=>g.effects.cooldownPercent=4]){const bad=structuredClone(g);change(bad);assert.throws(()=>validateDefenseGrowth(bad));}
 assert.deepEqual(validateDefenseGrowth({...g,guaranteed:true,pity:100}),g);
});
test('per-player independent draws credit once, survive reconnect and never reward final wave',()=>{
 const r=team();r.wave=1;settleWaveGrowth(r);const outcomes=r.players.map(p=>p.growth.draws[0].won);
 assert.ok(outcomes.some(Boolean)&&outcomes.some(v=>!v),'same team includes winner and missed draw');
 const snapshot=structuredClone(r);settleWaveGrowth(r);assert.deepEqual(r,snapshot);
 const restored=structuredClone(r);restored.wave=5;settleWaveGrowth(restored);r.wave=5;settleWaveGrowth(r);assert.deepEqual(r,restored);
 assert.ok(r.players.every(p=>p.growth.offers.length===1&&new Set(p.growth.offers[0].choices).size===3));
 r.wave=30;const balances=r.players.map(p=>p.credits);settleWaveGrowth(r);assert.deepEqual(r.players.map(p=>p.credits),balances);
 const pub=publicSnapshot(r);assert.ok(!('growthRng' in pub));pub.players[0].growth.levels.ATTACK=99;assert.equal(r.players[0].growth.levels.ATTACK,0);
});
test('forge failure spends once without pity, success buffs only owner and does not revive',()=>{
 const r=team();const p=r.players[0];p.credits=1000;r.growthPolicy.tiers[0].chance=0;const before=structuredClone(r.units);
 commandRoom(r,p.id,{type:'FORGE',wave:0,branch:'ATTACK',expectedAttempt:0,chance:100,success:true,cost:0});assert.equal(p.credits,900);assert.equal(p.growth.levels.ATTACK,0);assert.equal(p.growth.attempts[0].chance,0);assert.deepEqual(r.units,before);
 assert.throws(()=>commandRoom(r,p.id,{type:'FORGE',wave:0,branch:'ATTACK',expectedAttempt:0}),/변경/);assert.equal(p.credits,900);
 r.growthPolicy.tiers[0].chance=100;r.units[0].hp=0;p.reviveAt=15000;p.wipeCount=1;
 commandRoom(r,p.id,{type:'FORGE',wave:0,branch:'VITAL',expectedAttempt:1});assert.equal(p.growth.levels.VITAL,1);assert.equal(r.units[0].hp,0);assert.equal(p.reviveAt,15000);assert.equal(r.units[0].maxHp,935);assert.deepEqual(r.units.filter(u=>u.ownerId!=='p0'),before.filter(u=>u.ownerId!=='p0'));
 assert.ok(r.events.every((e,i,a)=>!i||e.seq>a[i-1].seq),'receipt sequence cannot overwrite global event sequence');
 for(const branch of ['INVALID','__proto__'])assert.throws(()=>commandRoom(r,p.id,{type:'FORGE',wave:0,branch,expectedAttempt:2}));
});
test('max +10 and exact tier prices, no concurrent stale commands or outside PREP spending',()=>{
 const r=team(),p=r.players[0];p.credits=100000;r.growthPolicy.tiers.forEach(t=>t.chance=100);
 const costs=[];for(let i=0;i<10;i++){const before=p.credits;commandRoom(r,p.id,{type:'FORGE',wave:0,branch:'TACTIC',expectedAttempt:i});costs.push(before-p.credits);}
 assert.deepEqual(costs,[100,100,100,150,150,150,200,200,200,300]);assert.equal(r.units[0].skillCooldown,12600);
 assert.throws(()=>commandRoom(r,p.id,{type:'FORGE',wave:0,branch:'TACTIC',expectedAttempt:10}),/최대/);
 const before=structuredClone(p);r.phase='WAVE';assert.throws(()=>commandRoom(r,p.id,{type:'FORGE',wave:0,branch:'ATTACK',expectedAttempt:10}),/정비/);assert.deepEqual(p,before);
 r.phase='PREP';r.wave=1;assert.throws(()=>commandRoom(r,p.id,{type:'FORGE',wave:0,branch:'ATTACK',expectedAttempt:10}),/웨이브/);
});
test('trait choices carry over, stale offer and duplicate acquisition cannot apply twice',()=>{
 const r=team();r.wave=5;settleWaveGrowth(r);r.wave=10;settleWaveGrowth(r);const p=r.players[0],a=p.growth.offers[0],b=p.growth.offers[1],choice=a.choices[0];
 commandRoom(r,p.id,{type:'TRAIT',wave:10,offerId:a.id,traitId:choice});assert.ok(!b.choices.includes(choice));assert.ok(b.choices.every(id=>!p.growth.traits.includes(id)));assert.equal(b.choices.length,3);
 assert.throws(()=>commandRoom(r,p.id,{type:'TRAIT',wave:10,offerId:a.id,traitId:choice}),/특성/);assert.equal(p.growth.traits.length,1);
 commandRoom(r,p.id,{type:'TRAIT',wave:10,offerId:b.id,traitId:b.choices[0]});assert.equal(new Set(p.growth.traits).size,2);
});
test('all-ready starts after minimum reveal interval; timeout never spends, new waves include seven enemies and three boss phases',()=>{
 const r=team();r.players.forEach(p=>{p.credits=1000;commandRoom(r,p.id,{type:'READY_WAVE',wave:0,ready:true});});advanceRoom(r,2900);assert.equal(r.phase,'PREP');advanceRoom(r,100);assert.equal(r.phase,'WAVE');assert.ok(r.players.every(p=>p.credits===1000));
 const seen=new Set();for(let wave=1;wave<=30;wave++){r.phase='PREP';r.wave=wave-1;r.phaseUntil=r.time;r.enemies=[];advanceRoom(r,100);for(const e of r.spawnQueue)seen.add(e.archetype);
  if(wave%10===0){assert.equal(r.spawnQueue.at(-1).archetype,'NOX');r.spawnQueue=[r.spawnQueue.at(-1)];r.spawnAt=0;advanceRoom(r,100);assert.equal(r.enemies[0].pattern,{10:'BARRAGE',20:'RALLY',30:'TRIAD'}[wave]);}
 }assert.deepEqual([...seen].sort(),ROGUE_ENEMIES.map(e=>e.id).sort());
});
test('new enemy support heals allies, traits affect actual combat and extra cooldown is capped',()=>{
 const r=team();r.phase='WAVE';r.wave=10;r.spawnQueue=[{archetype:'WEAVER',type:'SUPPORT',lane:0},{archetype:'BASTION',type:'ELITE',lane:0}];r.spawnAt=0;r.units.forEach(u=>u.nextAttack=1e9);advanceRoom(r,1000);const healer=r.enemies.find(e=>e.archetype==='WEAVER'),guard=r.enemies.find(e=>e.archetype==='BASTION');guard.hp-=100;healer.healAt=r.time;const hp=guard.hp;advanceRoom(r,100);assert.ok(guard.hp>hp);
 r.phase='PREP';const p=r.players[0];p.growth.levels.TACTIC=10;p.growth.offers.push({id:'quick',choices:['QUICK'],selected:null});
 commandRoom(r,p.id,{type:'TRAIT',wave:10,offerId:'quick',traitId:'QUICK'});assert.equal(r.units[0].skillCooldown,10800);
 assert.ok(DEFENSE_TRAITS.every(t=>t.description&&t.id));
});
test('real durable transactions: duplicated and simultaneous forge requests, reload and frozen CMS odds',async()=>{
 const h=await monsterDefenseFixture();const id=()=>crypto.randomUUID();
 try{
  const a=await h.api(1,'defense/create',{capacity:2,practice:true,difficulty:'NORMAL',loadout:{mercenaries:['V-003','V-002'],card:'FAKER'},requestId:id()});
  assert.equal(a.status,200,JSON.stringify(a));const cmd=(command,requestId=id())=>h.live(a,'command',{requestId,command});
  await cmd({type:'READY',ready:true});await cmd({type:'START'});let stored=await h.room(a.roomId);stored.players.forEach(p=>p.bot=false);stored.players[0].credits=1000;stored.growthPolicy.tiers[0].chance=0;stored.serverAt=Date.now();await h.room(a.roomId,stored);
  const request=id(),command={type:'FORGE',wave:0,branch:'ATTACK',expectedAttempt:0};const results=await Promise.all([cmd(command,request),cmd(command,request)]);assert.ok(results.every(r=>r.status===200));assert.equal(results.filter(r=>r.duplicate).length,1);
  stored=await h.room(a.roomId);assert.equal(stored.players[0].credits,900);assert.equal(stored.players[0].growth.attemptSeq,1);
  const competing=await Promise.all([cmd({...command,expectedAttempt:1}),cmd({...command,branch:'VITAL',expectedAttempt:1})]);assert.deepEqual(competing.map(r=>r.status).sort(),[200,400]);
  const session=await h.api(1,'defense/session',{roomId:a.roomId});assert.equal(session.snapshot.players[0].credits,800);assert.equal(session.snapshot.players[0].growth.attempts.length,2);
  const settings=(await h.api(1,'admin/defense/settings')).settings;settings.growth.drops.NORMAL.chance=0;settings.growth.tiers[0].chance=99;
  const saved=await h.api(1,'admin/defense/settings',{settings,requestId:id()});assert.equal(saved.status,200);stored=await h.room(a.roomId);assert.equal(stored.growthPolicy.drops.NORMAL.chance,50);assert.equal(stored.growthPolicy.tiers[0].chance,0);
  stored.phase='WAVE';stored.wave=1;stored.enemies=[];stored.spawnQueue=[];advanceRoom(stored,100);stored.serverAt=Date.now();await h.room(a.roomId,stored);const earned=stored.players[0].credits;await h.live(a,'state');await h.live(a,'state');assert.equal((await h.room(a.roomId)).players[0].credits,earned);
 }finally{await h.dispose();}
});

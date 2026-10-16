import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRoom,joinRoom,startRoom,advanceRoom,commandRoom,RULES,WORLD} from '../preview/coop-defense-v1/source/defense-model.mjs';
import {LEGACY_DEFENSE_DIFFICULTIES as DEFENSE_DIFFICULTIES,LEGACY_DEFENSE_ENEMIES as DEFENSE_ENEMIES,defenseEnemy} from '../shared/monster-defense-v1.mjs';
const team=(difficulty='NORMAL',capacity=3)=>{const r=createRoom({ruleset:2,id:'CONTENT',capacity,difficulty});for(let i=0;i<capacity;i++){const p=joinRoom(r,{id:'p'+i,name:'대원 '+i});p.ready=true;}startRoom(r,'p0');return r;};
test('five different encounters have existing originals, progressive pools, mid bosses and final bosses',()=>{
 assert.equal(DEFENSE_ENEMIES.length,13);assert.equal(new Set(DEFENSE_DIFFICULTIES.map(d=>d.boss)).size,5);
 for(const e of DEFENSE_ENEMIES)assert.ok(fs.statSync(e.asset).size>10000,e.asset);
 for(const d of DEFENSE_DIFFICULTIES)for(const capacity of [2,3]){
  const r=team(d.id,capacity);advanceRoom(r,RULES.prepMs);const first=r.spawnQueue.map(e=>e.archetype);assert.ok(first.every(id=>d.pool.slice(0,2).includes(id)));
  for(const [wave,boss] of [[Math.floor(d.waves/2),d.midBoss],[d.waves,d.boss]]){r.phase='PREP';r.wave=wave-1;r.phaseUntil=r.time;r.enemies=[];advanceRoom(r,100);assert.equal(r.wave,wave);assert.equal(r.spawnQueue.at(-1).archetype,boss);assert.equal(r.spawnQueue.at(-1).type,'BOSS');}
 }
});
test('all five boss patterns telegraph, resolve, enrage and remain identical after snapshot restore',()=>{
 for(const d of DEFENSE_DIFFICULTIES){
  const r=team(d.id);r.phase='WAVE';r.wave=d.waves;r.spawnQueue=[{archetype:d.boss,type:'BOSS',lane:0}];r.spawnAt=0;advanceRoom(r,100);const boss=r.enemies[0];boss.x=WORLD.spawnX-400;boss.patternAt=r.time;boss.hp=Math.floor(boss.maxHp*.3);r.units.forEach(u=>u.nextAttack=1e9);
  const replay=structuredClone(r);advanceRoom(r,100);advanceRoom(replay,100);assert.deepEqual(replay,r,'seeded server replay');assert.equal(boss.enraged,true);assert.ok(boss.cast);assert.ok(r.events.some(e=>e.type==='BOSS_WARNING'));
  const before=r.units.filter(u=>u.lane===0).map(u=>u.hp),bossHp=boss.hp;
  commandRoom(r,'p0',{type:'MOVE',unitId:'p0:0',lane:1});advanceRoom(r,2500);assert.equal(r.units[0].hp,before[0],'support travel escapes telegraph');
  if(boss.pattern==='RALLY')assert.equal(r.enemies.filter(e=>e.archetype==='FROG').length,3);
  else{assert.ok(r.units[1].hp<before[1]);if(boss.pattern==='DRAIN')assert.ok(boss.hp>bossHp);}
  assert.ok(r.events.some(e=>e.type==='BOSS_CAST'));
  if(boss.pattern==='TRIAD'){boss.patternAt=r.time;advanceRoom(r,100);assert.equal(boss.cast.lane,1);}
 }
});
test('two and three squad defaults finish entry/normal and high difficulties retain pressure without runaway state',()=>{
 for(const capacity of [2,3])for(const d of DEFENSE_DIFFICULTIES){
  const r=createRoom({ruleset:2,id:'SIM',capacity,difficulty:d.id,seed:17});for(let i=0;i<capacity;i++)joinRoom(r,{id:'p'+i,name:'대원 '+i,bot:true});startRoom(r,'p0');
  while(['PREP','WAVE'].includes(r.phase)&&r.time<1800000){advanceRoom(r,1000);assert.ok(r.enemies.length<=RULES.maxEnemies);assert.ok(r.events.length<=RULES.maxEvents);}
  assert.ok(['VICTORY','DEFEAT'].includes(r.phase));if(['GUIDE','NORMAL'].includes(d.id))assert.equal(r.phase,'VICTORY');
  if(['NIGHTMARE','CATACLYSM'].includes(d.id))assert.ok(r.players.some(p=>p.wipeCount>0));assert.equal(r.rewardsEnabled,false);
 }
});

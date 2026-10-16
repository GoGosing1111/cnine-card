import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,joinRoom,startRoom,commandRoom,advanceRoom,WORLD} from '../preview/coop-defense-v1/source/defense-model.mjs';
import {DEFENSE_PROFILES} from '../shared/monster-defense-loadout-v1.mjs';
import {monsterDefenseFixture} from './helpers/monster-defense-fixture.mjs';

function practiceRoom(){
 const room=createRoom({id:'RANGE',capacity:3,practice:true,seed:531});
 joinRoom(room,{id:'p0',name:'근접·회복 분대',loadout:{mercenaries:['V-001','V-004'],card:'FAKER'}});
 for(let i=1;i<3;i++)joinRoom(room,{id:'p'+i,name:'자동 대원 '+i,bot:true});
 commandRoom(room,'p0',{type:'READY',ready:true});startRoom(room,'p0');return room;
}
function lastEnemy(room,archetype='VEIL'){
 room.phase='WAVE';room.wave=2;room.enemies=[];room.spawnQueue=[{archetype,type:archetype==='CRAWLER'?'ELITE':'RANGED',lane:0}];room.spawnAt=room.time;
 advanceRoom(room,100);const enemy=room.enemies[0],front=room.units.find(u=>u.ownerId===room.hostId&&u.slot===0);
 enemy.x=front.x+enemy.range-1;enemy.y=front.y;enemy.nextAttack=room.time;return enemy;
}
function clearWithin(room,limit=60000){
 for(let elapsed=0;elapsed<limit&&room.phase==='WAVE';elapsed+=100)advanceRoom(room,100);
 assert.equal(room.phase,'PREP','the last enemy must be defeated without a manual skill');
 assert.equal(room.events.filter(e=>e.type==='WAVE_CLEAR'&&e.wave===2).length,1);
 assert.equal(room.coreHp,room.coreMaxHp);assert.ok(room.events.some(e=>e.type==='KO'));
}

test('saved sniper/healer stalemate resumes, clears naturally and settles each point draw once',()=>{
 let room=practiceRoom();lastEnemy(room);room.time=600000;room=JSON.parse(JSON.stringify(room));
 const positions=room.units.map(({x,y})=>({x,y})),enemyX=room.enemies[0].x;
 advanceRoom(room,1000);
 assert.ok(room.enemies[0].x<enemyX,'sniper continues advancing while firing outside allied attack range');
 assert.ok(room.players[0].stats.heal>0);assert.ok(room.events.some(e=>e.type==='ENEMY_HIT'));
 clearWithin(room);assert.deepEqual(room.units.map(({x,y})=>({x,y})),positions);
 assert.ok(room.players[0].stats.damage>0);assert.ok(room.players.every(p=>p.growth.draws.filter(d=>d.wave===2).length===1));
 const settled=room.players.map(p=>({credits:p.credits,draws:structuredClone(p.growth.draws)}));
 advanceRoom(room,1000);assert.deepEqual(room.players.map(p=>({credits:p.credits,draws:p.growth.draws})),settled);
});

test('sniper, siege and support enemies reach a melee defender despite a healing back line',()=>{
 for(const archetype of ['VEIL','CRAWLER','WEAVER']){const room=practiceRoom();lastEnemy(room,archetype);clearWithin(room);}
});

test('an enemy already in a damage dealer range keeps its normal firing position and cadence',()=>{
 const room=practiceRoom(),front=room.units[0];Object.assign(front,DEFENSE_PROFILES.RANGED,{role:'RANGED',maxHp:DEFENSE_PROFILES.RANGED.hp});
 const enemy=lastEnemy(room);const x=enemy.x;advanceRoom(room,100);
 assert.equal(enemy.x,x);assert.ok(enemy.hp<enemy.maxHp);assert.ok(front.hp<front.maxHp);
 const hits=room.events.filter(e=>e.type==='ENEMY_HIT').length;advanceRoom(room,100);
 assert.equal(room.events.filter(e=>e.type==='ENEMY_HIT').length,hits);clearWithin(room);
});

test('a lone healer cannot pin enemies forever when all damage dealers in that lane are down',()=>{
 const room=practiceRoom(),enemy=lastEnemy(room),front=room.units[0];
 Object.assign(front,DEFENSE_PROFILES.HEALER,{role:'HEALER',maxHp:DEFENSE_PROFILES.HEALER.hp});
 for(const unit of room.units.filter(u=>u.ownerId==='p0'&&u.slot!==0))unit.hp=0;
 // The other lanes cannot block this enemy, even if visually adjacent.
 const other=room.units.find(u=>u.ownerId==='p1');other.x=enemy.x-100;other.y=enemy.y;
 enemy.x=front.x+front.range-1;const x=enemy.x;advanceRoom(room,2000);
 assert.ok(enemy.x<x-40);assert.ok(front.hp>0);assert.ok(room.players[0].stats.heal>0);
});

test('the real saved room resumes through server polling and reconnection without duplicate growth',async()=>{
 const h=await monsterDefenseFixture();
 try{
  const options=await h.api(1,'defense/options'),loadout={mercenaries:['STRIKER','HEALER'].map(role=>options.mercenaries.find(m=>m.role===role).code),card:options.cards[0].code};
  const session=await h.api(1,'defense/create',{capacity:3,practice:true,difficulty:'NORMAL',loadout,requestId:crypto.randomUUID()});
  assert.equal(session.status,200);await h.ready(session);assert.equal((await h.live(session,'command',{requestId:crypto.randomUUID(),command:{type:'START'}})).status,200);
  let room=await h.room(session.roomId);assert.deepEqual(room.units.filter(u=>u.ownerId===session.playerId).map(u=>u.role),['STRIKER','HEALER','CAPTAIN']);
  // This fixture represents a room saved before automatic V3 skills existed.
  // New rooms can kill this last enemy during the first poll's skill cast.
  delete room.mercenarySkillRevision;delete room.mercenaryRuntime;
  lastEnemy(room);room.time=600000;room.serverAt=Date.now()-5000;await h.room(session.roomId,room);
  const startX=room.enemies[0].x;let snapshot=await h.live(session,'state');assert.equal(snapshot.status,200);assert.ok(snapshot.enemies[0].x<startX);
  for(let i=0;i<12&&snapshot.phase==='WAVE';i++){room=await h.room(session.roomId);room.serverAt=Date.now()-5000;await h.room(session.roomId,room);snapshot=await h.live(session,'state');}
  assert.equal(snapshot.phase,'PREP');assert.equal(snapshot.wave,2);assert.equal(snapshot.coreHp,snapshot.coreMaxHp);
  const settled=snapshot.players.map(p=>({credits:p.credits,draws:p.growth.draws}));assert.ok(settled.every(p=>p.draws.filter(d=>d.wave===2).length===1));
  const reconnected=await h.api(1,'defense/session',{roomId:session.roomId});assert.equal(reconnected.status,200);
  await Promise.all([h.live(session,'state'),h.live(reconnected,'state')]);
  assert.deepEqual((await h.room(session.roomId)).players.map(p=>({credits:p.credits,draws:p.growth.draws})),settled);
 }finally{await h.dispose();}
});

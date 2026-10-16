import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,joinRoom,startRoom,advanceRoom,commandRoom,publicSnapshot,defenseWaveBrief,WORLD} from '../preview/coop-defense-v1/source/defense-model.mjs';
function team(extra={}){const r=createRoom({id:'TEMPO',capacity:3,seed:17,...extra});for(let i=0;i<r.capacity;i++){const p=joinRoom(r,{id:'p'+i,name:'대원'+i});p.ready=true;}return r;}
function single(r,archetype='NOX'){r.phase='WAVE';r.wave=10;r.spawnQueue=[{lane:0,archetype,type:archetype==='NOX'?'BOSS':'NORMAL'}];r.spawnAt=r.time;advanceRoom(r,100);return r.enemies[0];}
test('new rooms shorten empty travel and ordinary prep; persisted rooms preserve pacing and CMS choices',()=>{
 const fresh=team(),old=team();delete old.tempoRevision;startRoom(fresh,'p0');startRoom(old,'p0');
 assert.equal(fresh.phaseUntil,8000);assert.equal(old.phaseUntil,15000);
 const a=single(fresh,'RIVET'),b=single(old,'RIVET');assert.equal(a.maxHp,b.maxHp);assert.equal(a.speed,b.speed*2);assert.ok(a.x<b.x-390);
 for(const [r,seconds] of [[fresh,8],[old,15]]){r.enemies=[];r.spawnQueue=[];r.wave=1;advanceRoom(r,100);assert.equal(r.phaseUntil-r.time,seconds*1000);assert.equal(r.players[0].growth.draws.length,1);}
 fresh.growthPolicy.prepSeconds=23;fresh.phase='WAVE';fresh.wave=5;advanceRoom(fresh,100);assert.equal(fresh.phaseUntil-fresh.time,23000);
 const saved=JSON.parse(JSON.stringify(old));assert.equal(publicSnapshot(saved).tempoRevision,0);assert.equal(publicSnapshot(saved).waveBrief,null);
 assert.equal(fresh.encounter.waves,30);assert.equal(fresh.rewardsEnabled,false);
});
test('pressure forecasts rotate across every lane and match the actual spawning wave',()=>{
 for(const capacity of [2,3]){const r=team({capacity});startRoom(r,'p0');const lanes=new Set();
 for(const wave of [3,6,9,12]){r.phase='PREP';r.wave=wave-1;r.phaseUntil=r.time;const forecast=defenseWaveBrief(r);lanes.add(forecast.focus);advanceRoom(r,100);assert.deepEqual(defenseWaveBrief(r),forecast);assert.equal(forecast.kind,'RUSH');assert.ok(r.spawnQueue.filter(e=>e.lane===forecast.focus&&e.archetype==='HOUND').length>=3);}
 assert.equal(lanes.size,capacity);
 r.phase='PREP';r.wave=4;assert.equal(defenseWaveBrief(r).kind,'SIEGE');r.wave=9;assert.equal(defenseWaveBrief(r).kind,'BOSS');}
});
test('offensive tactics require real range without consuming cooldown on rejected attempts',()=>{
 const r=team();startRoom(r,'p0');const e=single(r,'RIVET'),u=r.units[1];u.nextAttack=1e9;e.x=WORLD.spawnX;e.y=u.y;
 assert.throws(()=>commandRoom(r,'p0',{type:'SKILL',unitId:u.id}),error=>error.code==='NO_TARGET');assert.equal(u.skillReadyAt,0);
 e.x=u.x+800;const hp=e.hp;commandRoom(r,'p0',{type:'SKILL',unitId:u.id});assert.ok(e.hp<hp);assert.ok(u.skillReadyAt>r.time);
 const legacy=team();delete legacy.tempoRevision;startRoom(legacy,'p0');const enemy=single(legacy,'RIVET');enemy.x=WORLD.spawnX;commandRoom(legacy,'p0',{type:'SKILL',unitId:legacy.units[1].id});assert.ok(enemy.hp<enemy.maxHp);
});
test('the same telegraphed bombardment is survivable through defense or a timely support teleport',()=>{
 const base=team();startRoom(base,'p0');const boss=single(base);boss.lane=1;boss.x=2000;boss.speed=0;boss.nextAttack=1e9;boss.patternAt=1e9;boss.cast={lane:0,endsAt:base.time+2500};base.units.forEach(u=>u.nextAttack=1e9);
 const idle=structuredClone(base),guard=structuredClone(base),evade=structuredClone(base),hp=base.units[0].hp;
 commandRoom(guard,'p0',{type:'SKILL',unitId:'p0:0'});commandRoom(evade,'p0',{type:'MOVE',unitId:'p0:0',lane:1});
 const event=evade.events.at(-1),move=evade.units[0].move;assert.equal(event.fromX,move.fromX);assert.equal(event.x,move.x);assert.equal(event.endsAt,move.endsAt);
 for(const r of [idle,guard,evade])advanceRoom(r,2500);
 assert.ok(idle.units[0].hp<hp);assert.ok(guard.units[0].hp>idle.units[0].hp);assert.equal(evade.units[0].hp,hp);assert.equal(evade.units[0].lane,1);
 assert.equal(evade.players[0].stats.supportMoves,1);assert.equal(evade.events.filter(e=>e.type==='MOVE').length,1);
});

import test from 'node:test';import assert from 'node:assert/strict';import {sample,shots,SKILL} from './skill.mjs';
import {QUANTUM,quantumShots,missiles} from './skill.mjs';
import {AURA_REGISTRATION,auraTransform} from './aura-registration.mjs';
import {strikeLayout,missileTip} from './missile-flight.mjs';
import {BULLET,bulletSegment} from './bullet-flight.mjs';
test('both muzzles share each volley and hits follow release',()=>{assert.equal(shots.length,20);for(const s of shots){assert.equal(s.pair,2);assert.ok(s.at>=SKILL.release);assert.ok(s.target>=0&&s.target<3);assert.ok(sample(s.at+.01).shots.some(x=>x.at===s.at));}});
test('seeking yields the same frame state and clamps at cleanup',()=>{const a=sample(2.63);sample(4);assert.deepEqual(sample(2.63),a);assert.equal(sample(-1).time,0);const done=sample(50);assert.equal(done.time,SKILL.duration);assert.equal(done.shots.length,0);assert.equal(done.finishes.length,0);assert.equal(done.pose,0);assert.equal(done.done,true);});
test('all phases and requested continuous body poses are covered',()=>{assert.match(sample(.4).label,/포착/);assert.match(sample(1.5).label,/난사/);assert.match(sample(3.6).label,/집중/);assert.match(sample(4.7).label,/잔광/);assert.deepEqual(new Set(Array.from({length:580},(_,i)=>sample(i/100).pose)),new Set([0,1,2,3,4,5,6,7]));});
test('scope artwork centers stay fixed through frame changes and rotation',()=>{
 assert.ok(Math.max(...AURA_REGISTRATION.map(r=>r.y))-Math.min(...AURA_REGISTRATION.map(r=>r.y))>=40);
 for(let t=0;t<8;t+=.031){const r=AURA_REGISTRATION[Math.floor(t*8)%12],tr=auraTransform({registration:r,rect:{width:362,height:362}},340,t);
  const dx=(r.x-tr.anchorX*362)*tr.scale,dy=(r.y-tr.anchorY*362)*tr.scale;
  assert.ok(Math.abs(tr.x+dx*Math.cos(tr.rotation)-dy*Math.sin(tr.rotation)+12)<1e-8);
  assert.ok(Math.abs(tr.y+dx*Math.sin(tr.rotation)+dy*Math.cos(tr.rotation)+207.4)<1e-8);
  assert.ok(Math.abs(r.radius*tr.scale-103.7)<1e-8);
 }
});
test('quantum skill has five distinct contacts after the common detonation',()=>{
 assert.deepEqual(new Set(quantumShots.map(s=>s.target)),new Set([0,1,2,3,4]));
 assert.equal(QUANTUM.finish.length,5);assert.ok(QUANTUM.finish.every(t=>t>QUANTUM.detonation));
 QUANTUM.finish.forEach((t,i)=>assert.ok(sample(t+.03,'quantum').finishes.some(f=>f.target===i)));
 assert.ok(sample(2.7,'quantum').missiles.some(m=>m.id==='primary'));assert.ok(sample(4.7,'quantum').blast);assert.equal(sample(7.8,'quantum').blast,null);
});
test('quantum backward seek and cleanup do not retain transient state',()=>{
 const before=sample(2.4,'quantum');sample(5.4,'quantum');assert.deepEqual(sample(2.4,'quantum'),before);
 const done=sample(50,'quantum');assert.equal(done.time,QUANTUM.duration);assert.equal(done.pose,0);assert.equal(done.dim,0);assert.equal(done.flash,0);assert.equal(done.shots.length,0);assert.equal(done.finishes.length,0);assert.equal(done.charge,null);assert.equal(done.blast,null);assert.equal(done.missiles.length,0);
});
test('every missile descends from above and its nose reaches the exact impact coordinate',()=>{
 for(const m of missiles){const hit={x:1100,y:420},length=160*m.scale;let previous=-Infinity;
  for(let i=0;i<=100;i++){const t=m.launch+(m.impact-m.launch)*i/100,p=missileTip(m,t,hit,length);assert.equal(p.x,hit.x);assert.ok(p.y>=previous);previous=p.y;}
  assert.ok(missileTip(m,m.launch,hit,length).y<0);assert.deepEqual(missileTip(m,m.impact,hit,length),{...hit,progress:1});
 }
 assert.equal(missiles[0].impact,QUANTUM.detonation);assert.equal(sample(QUANTUM.detonation-.001,'quantum').blast,null);
 assert.equal(sample(QUANTUM.detonation,'quantum').blast.frame,4);
 missiles.slice(1).forEach(m=>assert.equal(m.impact,QUANTUM.finish[m.target]));
});
test('explosion stays at torso height when the canvas is too short for the artwork',()=>{
 const points=[{x:1300,y:498},{x:945,y:458},{x:1475,y:354},{x:905,y:194},{x:1320,y:188}],extents={left:.5,right:.5,up:.6,down:.4};
 const desktop=strikeLayout(points,{width:1600,height:820},extents),short=strikeLayout(points,{width:1600,height:520},extents);
 assert.equal(desktop.epicenter.y,343);assert.deepEqual(short.epicenter,desktop.epicenter);assert.ok(short.size<desktop.size);
 for(const [layout,height] of [[desktop,820],[short,520]]){assert.ok(layout.epicenter.y-layout.size*extents.up>=23.99);assert.ok(layout.epicenter.y+layout.size*extents.down<=height-23.99);}
});
test('both Uzi muzzles fire collinear streaks with exact contact and no lingering trail',()=>{
 const origins=[{x:420,y:100},{x:405,y:160}],hits=[{x:1300,y:498},{x:945,y:458},{x:1475,y:354},{x:905,y:194},{x:1320,y:188}];
 for(const origin of origins)for(const hit of hits){
  const dx=hit.x-origin.x,dy=hit.y-origin.y,distance=Math.hypot(dx,dy);let previous=-1;
  for(let age=0;age<.08;age+=.001){const s=bulletSegment(origin,hit,age);if(!s)continue;
   for(const p of [s.start,s.end]){
    assert.ok(Math.abs((p.x-origin.x)*dy-(p.y-origin.y)*dx)/distance<1e-8,'streak must stay on the muzzle-to-hit line');
    const along=((p.x-origin.x)*dx+(p.y-origin.y)*dy)/distance;assert.ok(along>=-1e-8&&along<=distance+1e-8);
   }
   const travel=Math.hypot(s.end.x-origin.x,s.end.y-origin.y);assert.ok(travel>=previous);previous=travel;
   assert.ok(Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y)<=BULLET.maxTrail+1e-8);
  }
  assert.deepEqual(bulletSegment(origin,hit,BULLET.flight).end,hit);
  assert.equal(bulletSegment(origin,hit,-.001),null);assert.equal(bulletSegment(origin,hit,.08),null);
 }
 assert.equal(bulletSegment(origins[0],origins[0],.01),null);
});

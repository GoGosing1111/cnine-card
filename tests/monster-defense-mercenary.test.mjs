import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,joinRoom,startRoom,advanceRoom,publicSnapshot,unitPosition} from '../preview/coop-defense-v1/source/defense-model.mjs';
import {monsterDefenseFixture} from './helpers/monster-defense-fixture.mjs';
import {SHIRANUI_ART,SHIRANUI_AREA_SKILL} from '../shared/mercenary-shiranui-v1.mjs';
import {defenseMercenaryRuntime} from '../shared/monster-defense-mercenary-v1.mjs';
import {MERCENARY_SKILLS} from '../shared/mercenary-skills-v1.mjs';

function roomFor(mercenaries,card){
 const r=createRoom({id:'skill-fixture',capacity:2,accountRoster:true,seed:53});
 const loadout={mercenaries:mercenaries.map(c=>c.code),card:card.code};
 for(let lane=0;lane<2;lane++){const p=joinRoom(r,{id:String(lane+1),name:'검수'+lane,loadout,roster:[...mercenaries,card]});p.ready=true;}
 startRoom(r,'1');r.phase='WAVE';r.wave=1;r.phaseUntil=999999;r.spawnQueue=['RIVET'];r.spawnAt=999999;
 r.players.forEach(p=>p.bot=false);
 r.units.forEach(u=>{u.hp=Math.round(u.maxHp*.65);u.nextAttack=0;});
 r.enemies=Array.from({length:6},(_,i)=>({id:'qa-e-'+i,lane:i%2,x:1550+i*4,y:unitPosition(0,i%2,2).y,
  hp:100000,maxHp:100000,attack:0,type:'NORMAL',archetype:'RIVET',range:170,speed:0,armor:0,nextAttack:999999}));
 return r;
}
test('released owned mercenaries use canonical skills, real damage/healing and persistent energy/cooldowns',async()=>{
 const h=await monsterDefenseFixture();
 try{
  const o=await h.api(1,'defense/options');assert.equal(o.status,200);
  assert.equal(o.mercenaries.find(c=>c.code==='V-004').role,'RANGED','Vespera must not retain the old healer placeholder');
  const card=o.cards[0];let observed=new Set();
  for(let i=0;i<o.mercenaries.length;i+=2){
   const pair=[o.mercenaries[i],o.mercenaries[(i+1)%o.mercenaries.length]];let r=roomFor(pair,card);
   const casts=new Set();for(let t=0;t<16;t++){advanceRoom(r,1000);for(const e of r.events)if(e.type.startsWith('MERCENARY_')){observed.add(e.mechanic);if(e.type!=='MERCENARY_CANCEL')casts.add(e.actorId);}r=JSON.parse(JSON.stringify(r));}
   pair.forEach((merc,slot)=>{if(merc.mercenary.skills.length)assert.ok(casts.has('1:'+slot),merc.code+' must cast its server assigned skill');});
   assert.ok(r.units.every(u=>Number.isFinite(u.hp)&&u.hp>=0));assert.ok(r.enemies.every(e=>Number.isFinite(e.hp)&&e.hp>=0));
   assert.ok(r.players.every(p=>Number.isFinite(p.stats.damage)&&Number.isFinite(p.stats.heal)));
   assert.ok(r.mercenaryRuntime?.states.length>0);
  }
  for(const m of ['LOCKED_THREAT_SHOT','CRYSTAL_CROWN','WHITE_OATH_GROUP_HEAL','GILDED_STARFALL','RIFT_MARK_DETONATION'])assert.ok(observed.has(m),m);
  let r=roomFor([o.mercenaries.find(c=>c.code==='V-055'),o.mercenaries.find(c=>c.code==='V-051')],card);
  advanceRoom(r,100);const first=structuredClone(r);assert.ok(r.events.some(e=>e.type==='MERCENARY_STARFALL'));
  advanceRoom(r,1000);const restored=JSON.parse(JSON.stringify(first));advanceRoom(restored,1000);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)),JSON.parse(JSON.stringify(r)),'JSON/DO reload cannot restart skills, energy or shield state');
  const clone=structuredClone(r),seq=r.seq;advanceRoom(clone,0);assert.equal(clone.seq,seq);
  assert.ok(r.players[0].stats.damage>0);assert.ok(r.players[0].stats.heal>0);
 }finally{await h.dispose();}
});

test('canonical barriers absorb basic and boss damage after reload; suppression delays approach and respects boss immunity',()=>{
 const entry=(code,mechanic,role)=>({code,name:code,kind:'MERCENARY',role,
  mercenary:{code,role:'GUARDIAN',skills:[{...MERCENARY_SKILLS.find(s=>s.mechanic===mechanic),balance:{cost:0,cooldownTurns:5,damageRatio:4}}]}});
 const r=roomFor([entry('V-003','FRONT_SHARED_BARRIER','GUARD'),entry('V-002','ADVANCE_SUPPRESSION','RANGED')],{code:'CARD:QA',kind:'CARD',role:'CAPTAIN',name:'카드'});
 let runtime=defenseMercenaryRuntime(r,()=>{}),front=r.units[0];runtime.action(front);assert.ok(front.shield>0);
 const hp=front.hp,shield=front.shield;runtime.enemyBasic(r.enemies[0],front,20);assert.equal(front.hp,hp);assert.equal(front.shield,shield-20);
 runtime.save();const restored=JSON.parse(JSON.stringify(r));runtime=defenseMercenaryRuntime(restored,()=>{});
 const f=restored.units[0];runtime.areaDamage(restored.enemies[0],f,20);assert.equal(f.hp,hp);assert.equal(f.shield,shield-40);
 runtime.action(restored.units[1]);assert.ok(restored.enemies[0].suppressedUntil>restored.time);
 const b=roomFor([entry('V-003','FRONT_SHARED_BARRIER','GUARD'),entry('V-002','ADVANCE_SUPPRESSION','RANGED')],{code:'CARD:QA',kind:'CARD',role:'CAPTAIN',name:'카드'});
 b.enemies.forEach(e=>e.type='BOSS');defenseMercenaryRuntime(b,()=>{}).action(b.units[1]);assert.ok(b.enemies.every(e=>!e.suppressedUntil));
});
test('area skills only hit reachable enemies in the caster lane and old saved rooms do not acquire new skills',()=>{
 const merc={code:SHIRANUI_ART.code,name:'시라누이',kind:'MERCENARY',role:'RANGED',mercenary:{code:SHIRANUI_ART.code,role:'VANGUARD',attackStyle:'RANGED',skills:[structuredClone(SHIRANUI_AREA_SKILL)]}};
 const partner={...merc,code:'V-003',name:'호위',role:'GUARD',mercenary:{code:'V-003',role:'GUARDIAN',skills:[]}};
 const card={code:'CARD:QA',kind:'CARD',role:'CAPTAIN',name:'카드'};
 let r=roomFor([merc,partner],card);r.enemies[2].x=2800;r.units.filter(u=>u.ownerId==='2').forEach(u=>u.nextAttack=999999);
 advanceRoom(r,100);
 const e=r.events.find(e=>e.type==='MERCENARY_SHIRANUI_AREA');assert.ok(e);assert.ok(e.hits.length>0);
 for(const hit of e.hits){const enemy=r.enemies.find(t=>t.id===hit.targetId);assert.equal(enemy.lane,0);assert.ok(enemy.x<2500);}
 assert.equal(r.enemies[2].hp,100000);assert.equal(r.enemies[1].hp,100000);
 const old=roomFor([merc,partner],card);delete old.mercenarySkillRevision;delete old.mercenaryRuntime;
 advanceRoom(old,2000);assert.ok(!old.events.some(e=>e.type.startsWith('MERCENARY_')));
 assert.ok(!('mercenaryRuntime' in publicSnapshot(r)),'internal skill tables are not public');
});

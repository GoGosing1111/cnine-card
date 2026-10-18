import test from 'node:test';
import assert from 'node:assert/strict';
import {petEffectRows,petOpeningMatches,skippedPetOpenings} from '../preview/project-v-v3/source/battle/PetSupportPresentation.mjs';
import {restorePetSupport,playPetOpening} from '../preview/project-v-v3/source/battle/PetSupportPlayback.js';
import {petSupportFixture,PET_EFFECT_TYPES,reviewPet} from './helpers/pet-support-fixture.mjs';
import {registerHooks} from 'node:module';
const hooks=registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('/shared/')?new URL('..'+specifier,import.meta.url).href:specifier,context);}});
const {mountCoopBattle}=await import('../raid/cooperative/battle.mjs');
hooks.deregister();

test('all five actual buff types have distinct readable motifs and preserve CMS percentages',()=>{
 const rows=petEffectRows(PET_EFFECT_TYPES.map((type,i)=>({type,percent:20+i*.5})));
 assert.equal(rows.length,5);assert.equal(new Set(rows.map(row=>row.motif)).size,5);
 rows.forEach((row,i)=>assert(row.text.endsWith(`+${20+i*.5}%`)));
 assert.deepEqual(petEffectRows([{type:'UNKNOWN',percent:20},{type:'SPEED_PERCENT',percent:null}]),[]);
});
test('PVE/PVP opening presentation follows real one-time server events without adding combat actors',()=>{
 for(const mode of ['PVE','PVP'])for(const type of PET_EFFECT_TYPES){
  const p=petSupportFixture({mode,type}),events=p.battleV2.result.timeline.filter(e=>e.type==='PET_OPENING_BUFF');
  assert.equal(events.length,mode==='PVP'?2:1);
  for(const event of events){
   const team=p.battleV2.teams[event.actorSide],row={side:event.actorSide,snapshot:team.pet};
   assert(petOpeningMatches(row,event));assert(!petOpeningMatches({...row,applied:true},event));
   assert.equal(event.hits.length,team.cards.length);
   for(const hit of event.hits){const card=team.cards.find(c=>c.id===hit.targetId);assert(card);assert.equal(card.maxHp,hit.after.maxHp);}
   assert(!p.battleV2.result.timeline.some(e=>e.type==='TURN'&&e.actorId===event.actorId));
  }
 }
});
test('cooperative activation and late restore stay owner-scoped, idempotent and never refill HP or shield',()=>{
 const payload=petSupportFixture({mode:'COOP',type:'ALL'}),events=payload.battleV2.result.timeline.filter(e=>e.type==='PET_OPENING_BUFF'),calls=[];
 assert.equal(events.length,3);
 const rows=new Map(payload.battleV2.teams.A.pets.map(snapshot=>['A:'+snapshot.ownerId,{snapshot,ownerId:snapshot.ownerId,side:'A',applied:false}]));
 const engine={battleData:payload,petSupports:rows,petSupportHud:{apply:(...args)=>calls.push(args)},combatantById:()=>{throw Error('late restore must not access current fighter stats');},syncTargetShield:()=>{throw Error('must not refill shield');}};
 for(const e of events){
  assert.equal(e.hits.length,3);const own=[...payload.battleV2.teams.A.cards,...payload.battleV2.teams.A.mercenaries].filter(c=>c.ownerId===e.ownerId);
  assert.deepEqual(new Set(e.hits.map(h=>h.targetId)),new Set(own.map(c=>c.id)));
  assert(!petOpeningMatches(rows.get('A:'+e.ownerId),{...e,ownerId:99}));
  assert(!petOpeningMatches(rows.get('A:'+e.ownerId),{...e,petCode:'PET-WRONG'}));
 }
 assert.equal(skippedPetOpenings(events,0).length,0);
 assert.equal(restorePetSupport(engine,2000),3);assert.equal(calls.length,3);
 assert.equal(restorePetSupport(engine,2000),0);
 assert.equal(playPetOpening(engine,events[0]),false);assert.equal(calls.length,3);
 assert(calls.every(([, ,options])=>options.restored));
 const single={side:'A',snapshot:reviewPet()};assert(petOpeningMatches(single,{...events[0],petCode:single.snapshot.definition.code,ownerId:1}));
});
test('cooperative controller restores skipped openings on late entry and clock catch-up without replaying them',async()=>{
 const previous={window:globalThis.window,document:globalThis.document,raf:globalThis.requestAnimationFrame,caf:globalThis.cancelAnimationFrame,now:Date.now};
 let pump,now=10000;const restored=[],played=[];
 const payload=petSupportFixture({mode:'COOP'}),api={restoreDeployedFormation:async()=>{},cancelActiveAnimations(){},syncFinalState(){},syncCooperativeState(){},restorePetSupport:ms=>restored.push(ms),playEvents:async events=>played.push(...events),diagnostics:()=>({})};
 try{
  Date.now=()=>now;globalThis.requestAnimationFrame=fn=>(pump=fn,1);globalThis.cancelAnimationFrame=()=>{};
  globalThis.window={ProjectVPixiBattle:api,ProjectVBattleV3Live:{ensureRuntime:async()=>{},prepareLoading:()=>({stage:{querySelector:()=>({})}}),createRenderer:async()=>({destroy(){}})}};
  globalThis.document={hidden:false};
  const controller=await mountCoopBattle({classList:{add(){}}},payload,{clock:{now:()=>now,diagnostics:()=>({})}});
  controller.update({serverNow:now,state:{status:'ACTIVE',startsAt:5000},payload});
  assert(restored.includes(4700));pump();await new Promise(resolve=>setImmediate(resolve));
  assert(!played.some(e=>e.type==='PET_OPENING_BUFF'));
  now+=8000;pump();assert(restored.includes(12900));controller.destroy();
 }finally{Date.now=previous.now;globalThis.window=previous.window;globalThis.document=previous.document;globalThis.requestAnimationFrame=previous.raf;globalThis.cancelAnimationFrame=previous.caf;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {cards,fighter,snapshot} from './helpers/helios-king-balance-20261106.mjs';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {resolveLightningSaint} from '../functions/_mercenary_lightning_saint.js';
import {SAINT_CODE,SAINT_EVENT,SAINT_ART,SAINT_SKILLS,SAINT_PVP_RATIO} from '../shared/mercenary-lightning-saint-v1.mjs';
import {RYUJIN_ART} from '../shared/mercenary-ryujin-v1.mjs';
import {mercenaryLevelXpMultiplier} from '../shared/mercenary-level-v1.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {skillList} from '../preview/project-v-v3/source/battle/lightning-saint/choreography.mjs';
import {citadelStation} from '../shared/cooperative-battleground-v1.mjs';

test('SSS limited owner, account loadout, power and the approved portrait agree with the codex',async t=>{
 const doc=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1}));
 const card=doc.cards.find(c=>c.code===SAINT_CODE);assert.equal(card.name,'하츠');assert.equal(card.rank,RYUJIN_ART.rank);assert.equal(card.edition,RYUJIN_ART.edition);
 assert.equal(card.basePower,4500000);assert.equal(card.skills.filter(s=>s.target==='적 전체').length,8);
 assert.equal(card.skills.length,11);assert.equal(mercenaryLevelXpMultiplier(card),5);assert.equal(mercenaryAcquisitionEnabled(SAINT_CODE,{}),false);
 assert.equal(createHash('sha256').update(readFileSync(card.sourceArt)).digest('hex'),'5a74e96cc13d130ddd865294fc381feee710e47b575c447e1980b99c320d498b');
 const f=await mercenaryFixture(t,{postgres:true});
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCodes:[SAINT_CODE],revision:0}),{code:'MERCENARY_NOT_OWNED'});
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,SAINT_CODE,'2026-11-25','2026-11-25').run();
 for(const mode of ['PVE','PVP']){
  await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCodes:[SAINT_CODE],revision:0});
  const snap=await loadMercenaryBattleSnapshot(f.env,f.user,mode);assert.equal(snap.name,card.name);assert.equal(snap.basePower,4500000);assert.equal(snap.skills.length,11);
  const saved={...snapshot(SAINT_CODE,21,mode),name:'번개 검성'};
  const actor=buildMercenaryFighter(saved,'A',mode,buildFighter);
  assert.equal(actor.name,card.name);assert.equal(actor.title,card.name);assert.equal(actor.basePower,4500000);assert.equal(actor.grade,'SSS');
 }
 const state=await mercenaryAccountState(f.env,f.user),owned=state.cards.find(c=>c.code===SAINT_CODE);
 assert.equal(owned.name,card.name);assert.equal(owned.sourceArt,SAINT_ART.sourceArt);
});
test('every server contact matches the approved playback and guards each authoritative hit',()=>{
 for(const def of SAINT_SKILLS){
  const clip=skillList.find(s=>s.id===def.key);assert.deepEqual(def.contactsMs,clip.contacts.map(s=>Math.round(s*1000)));assert.equal(def.durationMs,Math.round(clip.seconds*1000));
  for(const mode of ['PVE','PVP']){
   const actor=fighter(SAINT_CODE,'A',mode),make=(id,hp=9000,shield=75)=>({id,side:'B',alive:true,hp,maxHp:9000,shield,maxShield:75});
   const targets=[make('t0'),make('t1'),make('t2')],invalid=[{...make('ally'),side:'A'},make('dead',0),{...make('suit'),isBattleSuit:true},{...make('hidden'),untargetable:true}];
   const events=[],ratios=[],kos=[];
   const args={actor,skill:def,targets:[...invalid,...targets,targets[0]],hit:(_a,t,ratio)=>{ratios.push(ratio);return {damage:100,dodge:t.id==='t1'};},
    damage:(t,n)=>{const absorbed=Math.min(t.shield,n);t.shield-=absorbed;const hpDamage=Math.min(t.hp,n-absorbed);t.hp-=hpDamage;return {hpDamage,absorbed};},
    knockout:t=>kos.push(t.id),emit:(type,e)=>events.push({type,...e})};
   resolveLightningSaint(args);assert.equal(events.length,1);const e=events[0],ids=def.targetRule==='all'?['t0','t1','t2']:['t0'];
   assert.deepEqual(e.targetIds,ids);assert.deepEqual(e.beats.map(b=>b.atMs),def.contactsMs);assert(e.beats.every(b=>b.hits.length===ids.length));assert.equal(e.hits[0].absorbed,75);
   assert(e.hits.filter(h=>h.targetId==='t1').every(h=>h.dodge&&h.damage===0&&h.targetShieldAfter===75));
   assert.equal(e.damage+e.absorbed,actor.damageDealt);assert.equal(e.damage,e.beats.flatMap(b=>b.hits).reduce((n,h)=>n+h.damage,0));
   assert(Math.abs(ratios.reduce((a,b)=>a+b,0)-def.balance.damageRatio*(mode==='PVE'?1:SAINT_PVP_RATIO))<1e-8);
   assert.deepEqual(kos,[]);assert.deepEqual(resolveLightningSaint({...args,actor:{...actor,stunned:true}}),[]);
  }
 }
});
test('dead enemies leave subsequent hits, shields cannot be spent twice, and all eleven skills rotate from the regular action loop',()=>{
 for(const mode of ['PVE','PVP']){
  const actor=fighter(SAINT_CODE,'A',mode),large={...buildFighter(cards()[0],0,'B',null,mode),hp:1e13,maxHp:1e13};
  const weak={...large,id:'B:weak',hp:25,maxHp:25,shield:15},dropped=[],events=[];
  const combat=mercenaryCombat({teams:{A:[actor],B:[large,weak]},clock:()=>actor.actions,hit:()=>({damage:45}),
   damage:(t,n)=>{const absorbed=Math.min(n,t.shield||0);t.shield-=absorbed;const hpDamage=Math.min(t.hp,n-absorbed);t.hp-=hpDamage;return {absorbed,hpDamage};},
   knockout:t=>{t.alive=false;dropped.push(t.id);},emit:(type,row)=>{if(type===SAINT_EVENT)events.push(row);}});
  for(actor.actions=1;actor.actions<=23;actor.actions++){const last=combat.state(actor).energy;if(combat.beforeAction(actor))assert.equal(last-combat.state(actor).energy,10);else combat.afterBasic(actor,large,true);}
  assert.deepEqual(events.map(e=>e.visualMode),[...SAINT_SKILLS.map(s=>s.key),'cleave']);
  const area=events[1];assert.deepEqual(dropped,[weak.id]);assert.equal(area.beats[0].hits.find(t=>t.targetId===weak.id).absorbed,15);
  assert(area.beats.slice(1).every(b=>b.hits.every(h=>h.targetId!==weak.id)));
 }
});
test('both actual battle simulators record positive HP damage and replayable target snapshots',()=>{
 for(const mode of ['PVE','PVP']){
  const data=mode==='PVE'?createPveBattleV2({cards:cards(),monster:{id:1,battle_power:160e9},seed:77,mercenary:snapshot(SAINT_CODE)}):
   createPvpBattleV2({attackerCards:cards(),defenderCards:cards(),attackerMercenary:snapshot(SAINT_CODE,1,'PVP'),seed:77});
  const events=data.result.timeline.filter(e=>e.type===SAINT_EVENT);assert(events.length>0,mode);
  assert(events.some(e=>e.damage>0),mode);assert(events.flatMap(e=>e.hits).every(h=>h.targetHpAfter>=0&&h.targetShieldAfter>=0));
 }
});

test('Hatsu rotates single casts across occupied Citadel rows and keeps every beat on its selected monster',()=>{
 for(const [mode,region,hideSecond] of [['PVE','CITADEL',false],['PVE','CITADEL',true],['PVE','ordinary',false],['PVP','CITADEL',false]]){
  const actor=fighter(SAINT_CODE,'A',mode),team=[13,5,1,9].map(slot=>({
   ...buildFighter(cards()[0],slot,'B',null,mode),id:'enemy-'+slot,slot,row:'FRONT',legionRegion:region,
   untargetable:slot===5&&hideSecond,hp:1e12,maxHp:1e12,shield:0,maxShield:0
  }));
  const alive=team.filter(t=>!t.untargetable),casts=[];
  const combat=mercenaryCombat({teams:{A:[actor],B:team},clock:()=>actor.actions,
   hit:()=>({damage:1}),damage:(target,n)=>{target.hp-=n;return {hpDamage:n,absorbed:0};},knockout:()=>{},
   emit:(type,event)=>{if(type===SAINT_EVENT)casts.push(event);}});
  for(actor.actions=1;actor.actions<=68;actor.actions++){
   if(!combat.beforeAction(actor))combat.afterBasic(actor,alive[0],true);
  }
  const ordered=alive.slice().sort((a,b)=>citadelStation('cards',a.slot,true,false).y-citadelStation('cards',b.slot,true,false).y);
  let singles=0;
  for(const cast of casts){
   const skill=SAINT_SKILLS.find(s=>s.id===cast.skillId);
   const single=skill.targetRule==='single';
   const target=ordered[mode==='PVE'&&region==='CITADEL'?singles%ordered.length:0];
   const expected=new Set(single?[target.id]:ordered.map(t=>t.id));
   assert.deepEqual(new Set(cast.targetIds),expected);
   for(const beat of cast.beats)assert.deepEqual(new Set(beat.hits.map(h=>h.targetId)),expected);
   if(single)singles++;
  }
  assert(singles>=2*ordered.length);
 }
});

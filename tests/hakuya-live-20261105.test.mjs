import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {eunseolLevelFixture} from './helpers/eunseol-level-fixture-20261026.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {HAKUYA_CODE,HAKUYA_ART,HAKUYA_COMBAT,HAKUYA_AREA_SKILL,HAKUYA_AREA_EVENT,HAKUYA_BASIC_FORMS,HAKUYA_AREA_FORMS,HAKUYA_PLAYBACK_RATE,hakuyaIncomingDamage} from '../shared/mercenary-hakuya-v1.mjs';
import {REVAN_CODE,REVAN_COMBAT,REVAN_PVE_BALANCE,revanIncomingDamage} from '../shared/mercenary-revan-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryAcquisitionEnabled,assertMercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {ALL_LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {BLOODMOON_PACK_CARDS} from '../shared/mercenary-bloodmoon-pool-v3.mjs';
import {MERCENARY_CRAFTS} from '../shared/mercenary-craft-v1.mjs';
import {mercenaryLevelXpMultiplier} from '../shared/mercenary-level-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {resolveHakuyaArea} from '../functions/_mercenary_hakuya.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code,side='A',mode='PVE',power=0)=>buildMercenaryFighter({...snapshot(code),equipment:{schemaVersion:1,mode,power}},side,mode,buildFighter);
test('Hakuya independently matches current Revan stats, equipment, link, caps, defenses and 3.12 cadence',()=>{
 assert.notEqual(HAKUYA_COMBAT,REVAN_COMBAT);assert.equal(HAKUYA_COMBAT.basePower,2700000);assert.equal(HAKUYA_PLAYBACK_RATE,2);assert.equal(mercenaryLevelXpMultiplier({code:HAKUYA_CODE}),5);
 for(const mode of ['PVE','PVP'])for(const gear of [0,1e8]){
  const r=fighter(HAKUYA_CODE,'A',mode,gear),j=fighter(REVAN_CODE,'B',mode,gear);
  for(const key of ['attack','maxHp','defense','speed','counterImmune','controlImmune','poisonImmune'])assert.equal(r[key],j[key],key);
  applyMercenaryCombatLink(['A','B'].map((side,i)=>[...tierCards(2e7).map((c,n)=>buildFighter(c,n,side,null,mode)),[r,j][i]]));
  assert.equal(mercenaryEffectiveAttack(r),mercenaryEffectiveAttack(j));assert.equal(r.maxHp,j.maxHp);assert.equal(r.shield,j.shield);
  const runtime=mercenaryCombat({teams:{A:[r],B:[j]},hit(){},damage(){},knockout(){},emit(){},clock:()=>0});assert.equal(runtime.basicDamageCapScale(r),runtime.basicDamageCapScale(j));assert.equal(runtime.beforeBasicDamage(r,j,100),runtime.beforeBasicDamage(j,r,100));
  for(const source of [null,{isMercenary:true,code:'V-055'},{isMercenary:false,code:'V-055'}])assert.equal(hakuyaIncomingDamage(r,1000,source),revanIncomingDamage(j,1000,source));
  assert.deepEqual(r.skills.map(s=>s.id),mode==='PVE'?[HAKUYA_AREA_SKILL.id]:[]);
 }
 const r=fighter(HAKUYA_CODE),card={id:'card',side:'A',hp:1},enemy={id:'enemy',side:'B',hp:1},cadence=mercenaryTurnCadence({A:[card,r],B:[enemy]});let actions=0;
 for(let i=0;i<25;i++){cadence.acted(card);while(cadence.pending()){cadence.acted(r);actions++;assert(actions<100);}}assert.equal(actions,78);
});
test('two basic forms do not add actions or damage; area divides exactly 3024% once across unique living targets',()=>{
 assert.equal(HAKUYA_BASIC_FORMS.length,2);assert(HAKUYA_BASIC_FORMS.every(s=>s.basicForm&&s.balance.damageRatio===1.5));
 const actor=fighter(HAKUYA_CODE),targets=Array.from({length:12},(_,i)=>({id:'t'+i,hp:10000,maxHp:10000,alive:true})),ratios=[],events=[];
 const args={actor,skill:HAKUYA_AREA_SKILL,targets:[...targets,targets[0],{id:'dead',hp:0},{id:'hidden',hp:5,untargetable:true},{id:'suit',hp:5,isBattleSuit:true}],hit:(a,t,r,options)=>{assert.equal(options.pveCapScale,REVAN_COMBAT.areaDamageCapScale);ratios.push(r);return {damage:100};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit:(type,data)=>events.push({type,...data})};
 assert.equal(resolveHakuyaArea(args).length,12);assert(Math.abs(ratios.reduce((a,b)=>a+b)-30.24)<1e-9);assert(targets.every(t=>t.hp===9900));assert.equal(events.length,1);assert.equal(events[0].type,HAKUYA_AREA_EVENT);
 for(const change of [{battleMode:'PVP'},{hp:0},{stunned:true},{silenced:true},{code:REVAN_CODE}])assert.deepEqual(resolveHakuyaArea({...args,actor:{...actor,...change}}),[]);
 assert.deepEqual(resolveHakuyaArea({...args,skill:{...HAKUYA_AREA_SKILL,id:'MS-000'}}),[]);
});
test('area energy and cooldown match Revan, with no area cast in PVP',()=>{
 const run=(code,mode='PVE')=>{
  const a=fighter(code,'A',mode),enemy={...buildFighter(tierCards(2e7)[0],0,'B',null,mode),hp:1e15,maxHp:1e15},events=[];
  const c=mercenaryCombat({teams:{A:[a],B:[enemy]},clock:()=>a.actions,hit:()=>({hit:true,damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit:(type,data)=>{if(type.endsWith('_AREA'))events.push({action:a.actions,...data});}});
  for(a.actions=1;a.actions<=30;a.actions++){if(!c.beforeAction(a))c.afterBasic(a,enemy,true);assert(c.state(a).energy>=0);}return {events,energy:c.state(a).energy};
 };
 const r=run(HAKUYA_CODE),j=run(REVAN_CODE);assert.deepEqual(r.events.map(e=>e.action),[1,4,7,10,13,16,19,22,25,28]);assert.deepEqual(r.events.map(e=>e.action),j.events.map(e=>e.action));assert.equal(r.energy,j.energy);assert.deepEqual(r.events.map(e=>e.visualMode),Array.from({length:10},(_,i)=>i%2?'skill_rain':'skill_wheel'));assert.deepEqual(HAKUYA_AREA_FORMS.map(s=>s.id),['MS-911','MS-912']);for(const key of ['damageRatio','cost','cooldownTurns'])assert.equal(HAKUYA_AREA_SKILL.balance[key],REVAN_PVE_BALANCE[key]);assert.deepEqual(run(HAKUYA_CODE,'PVP').events,[]);
});
test('actual seeded PVE and PVP outcomes match Revan at three power tiers on both sides',()=>{
 const state=a=>Object.fromEntries(['hp','maxHp','shield','maxShield','attack','defense','speed','gauge','openingAttack'].map(k=>[k,a[k]]));
 const outcome=b=>({winner:b.result.winner,turns:b.result.timeline.filter(e=>e.type==='TURN').map(e=>({side:e.side,damage:e.damage,absorbed:e.absorbed,dodge:e.dodge,critical:e.critical})),final:Object.fromEntries(['A','B'].map(side=>[side,[...b.result.final[side],...(b.result.final.mercenaries?.[side]||[])].map(state)]))});
 for(const power of [1e6,2e7,1e8])for(let seed=1;seed<=16;seed++){
  const cards=tierCards(power),options={cards,monster:{id:1,battle_power:power*800},seed};
  assert.deepEqual(outcome(createPveBattleV2({...options,mercenary:snapshot(HAKUYA_CODE)})),outcome(createPveBattleV2({...options,mercenary:snapshot(REVAN_CODE)})));
  for(const side of ['attackerMercenary','defenderMercenary']){
   const options={attackerCards:cards,defenderCards:cards,seed};const r=createPvpBattleV2({...options,[side]:snapshot(HAKUYA_CODE)}),j=createPvpBattleV2({...options,[side]:snapshot(REVAN_CODE)});
   assert.deepEqual(outcome(r),outcome(j));assert(!r.result.timeline.some(e=>e.type===HAKUYA_AREA_EVENT));
  }
 }
});
test('all acquisition pools remain closed and catalog lists four ready skills',()=>{
 const rules={cardWeights:{[HAKUYA_CODE]:1000000}},cards=[{code:HAKUYA_CODE,name:'하쿠야 신',rank:'SSS'},{code:'V-001',name:'일반',rank:'SSS'}];
 assert.equal(mercenaryAcquisitionEnabled(HAKUYA_CODE,rules),false);assert.throws(()=>assertMercenaryAcquisitionEnabled(HAKUYA_CODE,rules),{code:'MERCENARY_ACQUISITION_DISABLED'});assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);assert.equal(mercenaryCardChances(1e6,[HAKUYA_CODE],rules)[0].percent,0);
 for(const pool of [ALL_LIMITED_MERCENARIES,HALLOWEEN_PACK_CARDS,BLOODMOON_PACK_CARDS,MERCENARY_CMS_SEED.catalog.cards,MERCENARY_CRAFTS])assert(!pool.some(c=>(c.code||c.mercenaryCode)===HAKUYA_CODE));
 const data=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})),card=data.cards.find(c=>c.code===HAKUYA_CODE);assert.equal(card.name,'하쿠야 신');assert.equal(card.edition,'LIMITED');assert.equal(card.basePower,2700000);assert.deepEqual(card.skills.map(s=>s.name),['절광발도','삼첩관통','회천검압','만검낙성']);assert(card.skills.every(s=>s.ready));
});
test('only fixture ownership enables PVE and PVP through the regular loadout path',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});assert(!(await mercenaryAccountState(f.env,f.user)).cards.some(c=>c.code===HAKUYA_CODE));
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCodes:[HAKUYA_CODE],revision:0}),{code:'MERCENARY_NOT_OWNED'});
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,HAKUYA_CODE,'2026-10-27','2026-10-27').run();
 for(const mode of ['PVE','PVP']){await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCodes:[HAKUYA_CODE],revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).basePower,2700000);}
 assert((await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===HAKUYA_CODE).canDeploy);
});
test('Hakuya is present in the regular five-times limited growth catalog',async t=>{
 const f=await eunseolLevelFixture(t);await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)',HAKUYA_CODE,'2026-10-27','2026-10-27').run();
 const result=await f.call('state');assert.equal(result.status,200);assert(JSON.stringify(result.body).includes(HAKUYA_CODE));
});
test('approved illustration, body and all shipped resources match the release manifest',()=>{
 const root='assets/ui/project-v/mercenaries/hakuya-shin-20261105/';
 const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 assert.equal(hash(HAKUYA_ART.sourceArt).toUpperCase(),HAKUYA_ART.sourceArtSha256);
 assert.equal(hash(HAKUYA_ART.battleSprite).toUpperCase(),HAKUYA_ART.battleSpriteSha256);
 const m=JSON.parse(fs.readFileSync(root+'manifest.json'));for(const f of m.files)assert.equal(hash(root+f.path),f.sha256,f.path);
 assert.equal(m.illustrationApproved,true);assert.equal(m.runtimeVersion,'4.3.13');
});

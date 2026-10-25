import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {EUNSEOL_CODE,EUNSEOL_ART,EUNSEOL_COMBAT,EUNSEOL_AREA_SKILL,EUNSEOL_AREA_EVENT,EUNSEOL_AREA_VARIANTS,EUNSEOL_PLAYBACK_RATE,eunseolIncomingDamage} from '../shared/mercenary-eunseol-v1.mjs';
import {JOKRO_CODE,JOKRO_COMBAT,JOKRO_AREA_SKILL,jokroIncomingDamage} from '../shared/mercenary-jokro-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryAcquisitionEnabled,assertMercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {ALL_LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {BLOODMOON_PACK_CARDS} from '../shared/mercenary-bloodmoon-pool-v3.mjs';
import {MERCENARY_CRAFTS} from '../shared/mercenary-craft-v1.mjs';
import {mercenaryLevelXpMultiplier} from '../shared/mercenary-level-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {resolveEunseolArea} from '../functions/_mercenary_eunseol.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {readSssCubeCatalog} from '../functions/_sss_miracle_cube.js';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code,side='A',mode='PVE',power=0)=>buildMercenaryFighter({...snapshot(code),equipment:{schemaVersion:1,mode,power}},side,mode,buildFighter);

test('Eunseol retains its approved 1.94089m stats and cadence independently of the Jokro buff',()=>{
 assert.notEqual(EUNSEOL_COMBAT,JOKRO_COMBAT);assert.equal(EUNSEOL_COMBAT.basePower,1940890);
 const approved=(a,b)=>assert(Math.abs(a-b*1.2)<=2,`${a} must retain the approved 20% increase over ${b}`);
 assert.equal(EUNSEOL_PLAYBACK_RATE,2);assert.equal(mercenaryLevelXpMultiplier({code:EUNSEOL_CODE}),5);
 for(const mode of ['PVE'])for(const gear of [0,1e8]){
  const e=fighter(EUNSEOL_CODE,'A',mode,gear),j=fighter('V-989','B',mode,gear);
  for(const key of ['attack','maxHp','defense'])approved(e[key],j[key]);
  for(const key of ['speed','counterImmune','controlImmune','poisonImmune'])assert.equal(e[key],j[key],key);
  applyMercenaryCombatLink(['A','B'].map((side,i)=>[...tierCards(2e7).map((c,n)=>buildFighter(c,n,side,null,mode)),[e,j][i]]));
  approved(mercenaryEffectiveAttack(e),mercenaryEffectiveAttack(j));approved(e.maxHp,j.maxHp);approved(e.shield,j.shield);
  assert.deepEqual(e.skills.map(s=>s.id),mode==='PVE'?[EUNSEOL_AREA_SKILL.id]:[]);
  const runtime=mercenaryCombat({teams:{A:[e],B:[j]},hit(){},damage(){},knockout(){},emit(){},clock:()=>0});
  approved(runtime.basicDamageCapScale(e),runtime.basicDamageCapScale(j));
  for(const source of [null,{isMercenary:true,code:'V-055'},{isMercenary:false,code:'V-055'}])assert.equal(eunseolIncomingDamage(e,1000,source),jokroIncomingDamage(fighter(JOKRO_CODE),1000,source));
 }
 const e=fighter(EUNSEOL_CODE),card={id:'card',side:'A',hp:1},enemy={id:'enemy',side:'B',hp:1},cadence=mercenaryTurnCadence({A:[card,e],B:[enemy]});let actions=0;
 for(let i=0;i<25;i++){cadence.acted(card);while(cadence.pending()){cadence.acted(e);actions++;assert(actions<100);}}
 assert.equal(actions,78);assert.equal(eunseolIncomingDamage(e,1000),200);
});
test('normal, limited, Halloween and fusion pools remain closed while the current Bloodmoon catalog retains Eunseol',()=>{
 const rules={cardWeights:{[EUNSEOL_CODE]:1000000}},cards=[{code:EUNSEOL_CODE,name:'은설',rank:'SSS'},{code:'V-001',name:'일반',rank:'SSS'}];
 assert.equal(mercenaryAcquisitionEnabled(EUNSEOL_CODE,rules),false);assert.throws(()=>assertMercenaryAcquisitionEnabled(EUNSEOL_CODE,rules),{code:'MERCENARY_ACQUISITION_DISABLED'});
 assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);assert.equal(mercenaryCardChances(1000000,[EUNSEOL_CODE],rules)[0].percent,0);
 assert.deepEqual(limitedNormalCards(cards,cards,rules).map(c=>c.code),['V-001']);
 for(const pool of [ALL_LIMITED_MERCENARIES,HALLOWEEN_PACK_CARDS,MERCENARY_CMS_SEED.catalog.cards])assert(!pool.some(c=>c.code===EUNSEOL_CODE));
 assert(BLOODMOON_PACK_CARDS.some(c=>c.code===EUNSEOL_CODE),'Preserve the independently deployed 2026-10-25 Bloodmoon expansion');

});
test('three cosmetic sword forms share one 1512% cast and unique living targets; invalid actors/skills never hit',()=>{
 const actor=fighter(EUNSEOL_CODE),skill=EUNSEOL_AREA_SKILL;
 for(let cast=0;cast<6;cast++){
  const targets=Array.from({length:12},(_,i)=>({id:'t'+i,hp:10000,maxHp:10000,alive:true})),ratios=[],events=[];
  const args={actor,skill,targets:[...targets,targets[0],{id:'dead',hp:0},{id:'suit',hp:10,isBattleSuit:true},{id:'hidden',hp:10,untargetable:true}],hit:(a,t,r)=>{ratios.push(r);return {damage:100};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit:(type,row)=>events.push({type,...row})};
  assert.equal(resolveEunseolArea(args).length,12);assert(Math.abs(ratios.reduce((a,b)=>a+b)-15.12)<1e-9);assert.equal(events.length,1);assert.equal(events[0].type,EUNSEOL_AREA_EVENT);assert.equal(events[0].visualMode,EUNSEOL_AREA_VARIANTS[cast%3].visualMode);assert(targets.every(t=>t.hp===9900));
  for(const change of [{battleMode:'PVP'},{hp:0},{stunned:true},{silenced:true},{code:JOKRO_CODE}])assert.deepEqual(resolveEunseolArea({...args,actor:{...actor,...change}}),[]);
  assert.deepEqual(resolveEunseolArea({...args,skill:{...skill,id:'MS-000'}}),[]);
 }
});
test('own-action cooldown and energy are identical to Jokro: six casts per thirty actions, one shared area skill, no PVP area',()=>{
 const run=(code,mode='PVE')=>{
  const actor=fighter(code,'A',mode),enemy={...buildFighter(tierCards(2e7)[0],0,'B',null,mode),hp:1e15,maxHp:1e15};
  const events=[],combat=mercenaryCombat({teams:{A:[actor],B:[enemy]},clock:()=>actor.actions,hit:()=>({hit:true,damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit:(type,data)=>{if(type.endsWith('_AREA'))events.push({action:actor.actions,...data});}});
  for(actor.actions=1;actor.actions<=30;actor.actions++){if(!combat.beforeAction(actor))combat.afterBasic(actor,enemy,true);assert(combat.state(actor).energy>=0);}
  return {events,energy:combat.state(actor).energy};
 };
 const e=run(EUNSEOL_CODE),j=run(JOKRO_CODE);
 assert.equal(e.events.length,6);assert.deepEqual(e.events.map(e=>e.action),[1,6,11,16,21,26]);assert.deepEqual(e.events.map(e=>e.action),j.events.map(e=>e.action));assert.equal(e.energy,j.energy);
 assert.deepEqual(e.events.map(e=>e.visualMode),['moon','tiger','domain','moon','tiger','domain']);assert(e.events.every(e=>e.skillId===EUNSEOL_AREA_SKILL.id));assert.equal(fighter(EUNSEOL_CODE,'A','PVP').code,EUNSEOL_CODE);assert.deepEqual(run(EUNSEOL_CODE,'PVP').events,[]);
 assert.deepEqual(EUNSEOL_AREA_SKILL.balance,JOKRO_AREA_SKILL.balance);
});
test('actual server PVE keeps Eunseol unchanged while buffed Jokro finishes with fewer casts; PVP never emits Eunseol area events',()=>{
 const cards=tierCards(2e7),options={cards,monster:{id:1,battle_power:1.6e10},seed:77};
 const e=createPveBattleV2({...options,mercenary:snapshot(EUNSEOL_CODE)}).result,j=createPveBattleV2({...options,mercenary:snapshot(JOKRO_CODE)}).result;
 const casts=e.timeline.filter(e=>e.type===EUNSEOL_AREA_EVENT),reference=j.timeline.filter(e=>e.type==='MERCENARY_JOKRO_AREA');
 assert(casts.length>=2);assert(reference.length>0&&reference.length<casts.length,'Higher damage finishes this encounter sooner without changing cast cooldown');assert(reference[0].damage>casts[0].damage,'Only Jokro receives the damage increase');assert.equal(e.winner,j.winner);
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(EUNSEOL_CODE),defenderMercenary:snapshot(JOKRO_CODE),seed:77});assert(!pvp.result.timeline.some(e=>e.type===EUNSEOL_AREA_EVENT));
});
test('public codex displays SSS LIMITED locked Eunseol; ownership is required and no account is auto-granted',async t=>{
 const data=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})),card=data.cards.find(c=>c.code===EUNSEOL_CODE);
 assert.equal(card.name,'은설');assert.equal(card.edition,'LIMITED');assert.equal(card.rank,'SSS');assert.equal(card.basePower,1940890);assert.equal(card.acquisitionEnabled,false);assert.equal(card.packAcquisitionEnabled,false);assert.equal(card.skills.length,1);assert(card.skills.every(s=>s.ready));assert.equal(card.skills[0].presentationVariants.length,3);
 const f=await mercenaryFixture(t,{postgres:true});
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:EUNSEOL_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 assert(!(await mercenaryAccountState(f.env,f.user)).cards.some(c=>c.code===EUNSEOL_CODE));
 await ensureLimitedPackSchema(f.env);
 const cube=(await readSssCubeCatalog(f.env)).catalog.find(c=>c.code===EUNSEOL_CODE);assert(cube);assert.equal(cube.available,false);
 // Fixture-only holding verifies future authorized ownership, never live grants.
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,EUNSEOL_CODE,'2026-10-23','2026-10-23').run();
 await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:EUNSEOL_CODE,revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,'PVE')).basePower,1940890);
 await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVP',mercenaryCode:EUNSEOL_CODE,revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,'PVP')).code,EUNSEOL_CODE);
 assert((await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===EUNSEOL_CODE).canDeploy);
});
test('public catalog art is the exact approved source and fixed idle frame',()=>{
 const root=process.env.EUNSEOL_ASSET_ROOT||process.cwd();
 for(const [file,hash]of [[EUNSEOL_ART.sourceArt,EUNSEOL_ART.sourceArtSha256],[EUNSEOL_ART.battleSprite,EUNSEOL_ART.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(root+'/'+file)).digest('hex').toUpperCase(),hash);
});

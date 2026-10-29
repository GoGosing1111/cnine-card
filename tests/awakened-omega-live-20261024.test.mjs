import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {AWAKENED_OMEGA_CODE as code,AWAKENED_OMEGA_ART as art,AWAKENED_OMEGA_COMBAT as policy,AWAKENED_OMEGA_SKILLS as skills,AWAKENED_OMEGA_EVENT as eventType,awakenedOmegaDeploymentSnapshot,awakenedOmegaIncomingDamage} from '../shared/mercenary-awakened-omega-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryAcquisitionEnabled,assertMercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {ALL_LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {BLOODMOON_PACK_CARDS} from '../shared/mercenary-bloodmoon-pool-v3.mjs';
import {MERCENARY_CRAFTS} from '../shared/mercenary-craft-v1.mjs';
import {mercenaryLevelXpMultiplier} from '../shared/mercenary-level-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat,mercenaryBaseActionCredit} from '../functions/_mercenary_combat.js';
import {resolveAwakenedOmegaCast,awakenedOmegaTargets} from '../functions/_mercenary_awakened_omega.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {readSssCubeCatalog} from '../functions/_sss_miracle_cube.js';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {jinmuDeploymentSnapshot} from '../shared/mercenary-jinmu-v1.mjs';
import {jokroDeploymentSnapshot} from '../shared/mercenary-jokro-v1.mjs';
const snapshot=()=>({...awakenedOmegaDeploymentSnapshot(),combat:fixture.combat});
const fighter=(mode='PVE',gear=0)=>buildMercenaryFighter({...snapshot(),equipment:{schemaVersion:1,mode,power:gear}},'A',mode,buildFighter);
test('Pages excludes only preserved Node authoring files and keeps every runtime atlas',async()=>{
 const {isProductionFile,awakenedOmegaNodeOnly}=await import('../scripts/prepare-production-assets.mjs');
 const records=JSON.parse(fs.readFileSync('docs/qa/awakened-omega-live-20261024/pages-authoring-exclusions.json')).records;
 assert.equal(records.length,32);assert.equal(awakenedOmegaNodeOnly.size,32);
 for(const r of records){const bytes=fs.readFileSync(r.file);assert.match(bytes.toString(),/node:(fs|child_process|test)/);assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);assert.equal(isProductionFile(r.file),false);}
 const root='assets/ui/project-v/mercenaries/awakened-omega-20261024/',m=JSON.parse(fs.readFileSync(root+'motion-manifest.json'));
 for(const file of [art.sourceArt,art.battleSprite,root+'motion-manifest.json',...Object.values(m.motion).map(s=>root+s.atlas),...Object.values(m.effects).map(s=>root+s.atlas)])assert.equal(isProductionFile(file),true);
});
test('SSS LIMITED 2,200,000 is enforced by real stats, cadence and linkage matching Jokro',()=>{
 assert.equal(limitedDeploymentSnapshot(code).basePower,2200000);assert.equal(mercenaryLevelXpMultiplier({code}),5);
 for(const mode of ['PVE','PVP'])for(const gear of [0,100000]){
  const actor=fighter(mode,gear),reference=buildFighter({id:code,power:1123200+gear,type:'NONE'},5,'A',null,mode);
  assert.equal(actor.basePower,2200000+gear);for(const[a,b]of [['attack','attack'],['maxHp','maxHp'],['defense','defense']])assert.equal(actor[a],Math.round(reference[b]*policy.statScale));
  assert.equal(actor.rank,'SSS');assert.equal(actor.edition,'LIMITED');assert.equal(actor.controlImmune,true);assert.equal(mercenaryBaseActionCredit([actor]),3.12);
  assert.deepEqual(actor.skills.map(s=>s.id),skills.filter(s=>!s.pveOnly||mode==='PVE').map(s=>s.id));
  const linked=[jinmuDeploymentSnapshot(),awakenedOmegaDeploymentSnapshot(),jokroDeploymentSnapshot()].map(s=>{
   const m=buildMercenaryFighter({...s,combat:fixture.combat},'A',mode,buildFighter),cards=tierCards(2e7).map((c,i)=>buildFighter(c,i,'A',null,mode));applyMercenaryCombatLink([[...cards,m],[]]);return m;
  });
  for(const key of ['maxHp','shield'])assert(linked[0][key]<linked[1][key]&&linked[1][key]===linked[2][key]);
  assert(mercenaryEffectiveAttack(linked[0])<mercenaryEffectiveAttack(linked[1])&&mercenaryEffectiveAttack(linked[1])===mercenaryEffectiveAttack(linked[2]));
  assert.equal(awakenedOmegaIncomingDamage(actor,1000,{code:'V-055',isMercenary:true}),200);
 }
});
test('craft opens only in its dedicated recipe; pack, fusion and cube candidates remain locked and no direct grant',async t=>{
 const rules={cardWeights:{[code]:1000000}},cards=[{code,rank:'SSS'},{code:'V-001',rank:'SSS'}];
 assert.equal(art.acquisition,'CRAFT_ONLY');assert.equal(art.craftAcquisitionEnabled,true);assert.equal(mercenaryAcquisitionEnabled(code,rules),false);assert.throws(()=>assertMercenaryAcquisitionEnabled(code,rules),{code:'MERCENARY_ACQUISITION_DISABLED'});
 assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);assert.equal(mercenaryCardChances(1000000,[code],rules)[0].percent,0);assert.deepEqual(limitedNormalCards(cards,cards,rules).map(c=>c.code),['V-001']);
 for(const pool of [ALL_LIMITED_MERCENARIES,HALLOWEEN_PACK_CARDS,BLOODMOON_PACK_CARDS,seed.catalog.cards])assert(!pool.some(c=>c.code===code));assert.equal(MERCENARY_CRAFTS.find(c=>c.code===code)?.art.craftAcquisitionEnabled,true);
 const f=await mercenaryFixture(t,{postgres:true});await ensureLimitedPackSchema(f.env);assert(!(await readSssCubeCatalog(f.env)).catalog.some(c=>c.code===code&&c.available));
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:code,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 assert(!(await mercenaryAccountState(f.env,f.user)).cards.some(c=>c.code===code));
 // Local-only ownership fixture validates future holders without a live grant.
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,code,'2026-10-24','2026-10-24').run();
 for(const mode of ['PVE','PVP']){await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:code,revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).basePower,2200000);}
 const held=(await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===code);assert(held.canDeploy);assert.equal(held.edition,'LIMITED');assert.equal(held.basePower,2200000);
});
test('two single attacks and two PVE areas share one per-cast budget without duplicate or dead-target hits',()=>{
 for(const mode of ['PVE','PVP'])for(const skill of skills){
  const actor=fighter(mode),targets=Array.from({length:12},(_,i)=>({id:'t'+i,hp:10000,maxHp:10000,attack:i,slot:i,row:i<3?'FRONT':'BACK',side:'B',alive:true})),ratios=[],events=[],mutations=[];
  const input=[...targets,targets[0],{id:'dead',hp:0},{id:'hidden',hp:100,untargetable:true},{id:'suit',hp:100,isBattleSuit:true}];
  const result=resolveAwakenedOmegaCast({actor,skill,targets:input,hit:(a,t,r)=>{ratios.push(r);return{damage:10};},damage:(t,n)=>{mutations.push(t.id);t.hp-=n;return{hpDamage:n,absorbed:0};},knockout(){},emit:(type,row)=>events.push({type,...row})});
  if(skill.pveOnly&&mode==='PVP'){assert.equal(result.length,0);continue;}
  assert.equal(result.length,skill.targetCount??12);assert.equal(new Set(mutations).size,result.length);assert(Math.abs(ratios.reduce((a,b)=>a+b,0)-(mode==='PVP'?policy.pvpSkillDamageRatio:skill.balance.damageRatio))<1e-9);assert.equal(events[0].type,eventType);
  if(skill.targetCount===1)assert.equal(result[0].targetId,'t0');assert.deepEqual(awakenedOmegaTargets({...actor,code:'V-021'},skill,input),[]);
 }
});
test('all four skills pay once and share five-action cooldown; PVP only uses the two single attacks',()=>{
 for(const mode of ['PVE','PVP']){
  const actor=fighter(mode),enemy={...buildFighter(tierCards(2e7)[0],0,'B',null,mode),hp:1e15,maxHp:1e15},events=[];
  const combat=mercenaryCombat({teams:{A:[actor],B:[enemy]},clock:()=>actor.actions,hit:()=>({damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit:(type,data)=>{if(type===eventType)events.push({action:actor.actions,...data});}});
  for(actor.actions=1;actor.actions<=60;actor.actions++){if(!combat.beforeAction(actor))combat.afterBasic(actor,enemy,true);assert(combat.state(actor).energy>=0);}
  assert(events.length>=4);assert(events.every((e,i)=>!i||e.action-events[i-1].action>=5));assert.deepEqual([...new Set(events.map(e=>e.skillId))],skills.filter(s=>!s.pveOnly||mode==='PVE').map(s=>s.id));
 }
});
test('actual PVE/PVP timelines emit authoritative Omega skills and keep legacy Omega-X intact',()=>{
 const cards=tierCards(2e7),pve=createPveBattleV2({cards,monster:{id:1,battle_power:1.6e10},mercenary:snapshot(),seed:77}).result,pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(),seed:77}).result;
 assert(pve.timeline.some(e=>e.type===eventType));assert(pvp.timeline.some(e=>e.type===eventType));assert(!pvp.timeline.some(e=>e.type===eventType&&['MS-066','MS-067'].includes(e.skillId)));
 assert(seed.catalog.cards.some(c=>c.code==='V-021'));assert.notEqual(code,'V-021');
});
test('public codex and accepted original/atlas bytes retain the exact art, proportions, 2x motion and foreground FX',()=>{
 const data=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1})),card=data.cards.find(c=>c.code===code);
 assert.equal(card.name,'각성 오메가');assert.equal(card.rank,'SSS');assert.equal(card.edition,'LIMITED');assert.equal(card.basePower,2200000);assert.equal(card.acquisitionEnabled,true);assert.equal(card.skills.length,4);
 for(const[file,hash]of [[art.sourceArt,art.sourceArtSha256],[art.battleSprite,art.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),hash);
 const root='assets/ui/project-v/mercenaries/awakened-omega-20261024/',m=JSON.parse(fs.readFileSync(root+'motion-manifest.json'));
 assert.equal(m.runtime.defaultSpeed,2);assert.equal(m.runtime.physicalBodyHeight,330);assert.equal(m.motion.idle.frameCount,1);assert.equal(m.runtime.effectLayer,'front');
 for(const group of [m.motion,m.effects])for(const spec of Object.values(group))assert.equal(createHash('sha256').update(fs.readFileSync(root+spec.atlas)).digest('hex'),spec.sha256);
});

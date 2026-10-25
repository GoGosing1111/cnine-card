import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {RAZAK_CODE as code,RAZAK_ART as art,RAZAK_SKILLS as skills,RAZAK_COMBAT,RAZAK_EVENT as eventType,razakDeploymentSnapshot} from '../shared/mercenary-razak-v1.mjs';
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
import {resolveRazakCast,razakTargets} from '../functions/_mercenary_razak.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {readSssCubeCatalog} from '../functions/_sss_miracle_cube.js';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
const snapshot=()=>({...razakDeploymentSnapshot(),combat:fixture.combat});
const fighter=(mode='PVE',gear=0)=>buildMercenaryFighter({...snapshot(),equipment:{schemaVersion:1,mode,power:gear}},'A',mode,buildFighter);
test('approved runtime assets fit Pages and excluded Node commands remain byte-identical in Git',async()=>{
 const {isProductionFile,razakNodeOnly}=await import('../scripts/prepare-production-assets.mjs');
 const records=JSON.parse(fs.readFileSync('docs/qa/razak-live-20261024/pages-authoring-exclusions.json')).records;
 assert.equal(records.length,20);assert.equal(razakNodeOnly.size,20);
 for(const r of records){const bytes=fs.readFileSync(r.file);assert.match(bytes.toString(),/node:(fs|child_process|test)/);assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);assert.equal(isProductionFile(r.file),false);}
 for(const file of [art.sourceArt,art.battleSprite,'shared/mercenary-razak-v1.mjs','assets/ui/project-v/mercenaries/razak-20261024/motion-manifest.json'])assert.equal(isProductionFile(file),true);
});
test('Razak remains ordinary SSS at 1,000,000 with an explicit balance policy independent of visual speed',()=>{
 assert.equal(limitedDeploymentSnapshot(code).edition,'STANDARD');assert.equal(mercenaryLevelXpMultiplier({code}),1);
 for(const mode of ['PVE','PVP'])for(const gear of [0,100000]){
  const actor=fighter(mode,gear),reference=buildFighter({id:code,power:1000000+gear,type:'NONE'},5,'A',null,mode);
  assert.equal(actor.basePower,1000000+gear);for(const [a,b]of [['attack','attack'],['maxHp','maxHp'],['defense','defense'],['speed','speed']])assert.equal(actor[a],Math.round(reference[b]*(a==='speed'?RAZAK_COMBAT.speedScale:RAZAK_COMBAT.statScale)));
  assert.equal(actor.rank,'SSS');assert.equal(actor.role,'ASSASSIN');assert.equal(actor.controlImmune,false);assert.equal(actor.counterImmune,false);
  assert.equal(mercenaryBaseActionCredit([actor]),RAZAK_COMBAT.actionCredit);assert.deepEqual(actor.skills.map(s=>s.id),skills.filter(s=>!s.pveOnly||mode==='PVE').map(s=>s.id));
 }
});
test('other acquisition pools remain closed, including positive CMS weights and limited/craft/cube paths',async t=>{
 const rules={cardWeights:{[code]:1000000}},cards=[{code,rank:'SSS'},{code:'V-001',rank:'SSS'}];
 assert.equal(mercenaryAcquisitionEnabled(code,rules),false);assert.throws(()=>assertMercenaryAcquisitionEnabled(code,rules),{code:'MERCENARY_ACQUISITION_DISABLED'});
 assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);assert.equal(mercenaryCardChances(1000000,[code],rules)[0].percent,0);assert.deepEqual(limitedNormalCards(cards,cards,rules).map(c=>c.code),['V-001']);
 for(const pool of [ALL_LIMITED_MERCENARIES,HALLOWEEN_PACK_CARDS,seed.catalog.cards])assert(!pool.some(c=>c.code===code));assert(!JSON.stringify(MERCENARY_CRAFTS).includes(code));assert.equal(BLOODMOON_PACK_CARDS.find(c=>c.code===code).stockPolicy,'UNLIMITED');
 const f=await mercenaryFixture(t,{postgres:true});await ensureLimitedPackSchema(f.env);assert(!(await readSssCubeCatalog(f.env)).catalog.some(c=>c.code===code&&c.available));
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:code,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 assert(!(await mercenaryAccountState(f.env,f.user)).cards.some(c=>c.code===code));
 // Local fixture only; no operational account receives the new character.
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,code,'2026-10-24','2026-10-24').run();
 for(const mode of ['PVE','PVP']){await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:code,revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).basePower,1000000);}
 const held=(await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===code);assert(held.canDeploy);assert.equal(held.edition,'STANDARD');assert.equal(held.basePower,1000000);
});
test('assassination targets and one total damage budget are stable across duplicate, dead and hidden targets',()=>{
 for(const mode of ['PVE','PVP'])for(const skill of skills){
  const actor=fighter(mode),targets=Array.from({length:12},(_,i)=>({id:'t'+i,hp:10000-i*100,maxHp:10000,attack:i,row:i<3?'FRONT':'BACK',side:'B',alive:true})),ratios=[],events=[],mutations=[];
  const input=[...targets,targets[0],{id:'dead',hp:0},{id:'hidden',hp:100,untargetable:true},{id:'suit',hp:100,isBattleSuit:true}];
  const result=resolveRazakCast({actor,skill,targets:input,hit:(a,t,r)=>{ratios.push(r);return {damage:10};},damage:(t,n)=>{mutations.push(t.id);t.hp-=n;return{hpDamage:n,absorbed:0};},knockout(){},emit:(type,row)=>events.push({type,...row})});
  if(skill.pveOnly&&mode==='PVP'){assert.equal(result.length,0);continue;}
  assert.equal(result.length,skill.targetCount??12);assert.equal(new Set(mutations).size,result.length);assert(Math.abs(ratios.reduce((a,b)=>a+b,0)-skill.balance.damageRatio)<1e-9);assert.equal(events[0].type,eventType);
  if(skill.visualMode==='cross'||skill.visualMode==='flurry')assert.equal(result[0].targetId,'t11');
  assert.deepEqual(razakTargets({...actor,code:'V-021'},skill,input),[]);
 }
});
test('three skills share cooldown and pay once per cast; no area cast in PVP',()=>{
 for(const mode of ['PVE','PVP']){
  const actor=fighter(mode),enemy={...buildFighter(tierCards(2e7)[0],0,'B',null,mode),hp:1e15,maxHp:1e15},events=[];
  const combat=mercenaryCombat({teams:{A:[actor],B:[enemy]},clock:()=>actor.actions,hit:()=>({damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit:(type,data)=>{if(type===eventType)events.push({action:actor.actions,...data});}});
  for(actor.actions=1;actor.actions<=40;actor.actions++){if(!combat.beforeAction(actor))combat.afterBasic(actor,enemy,true);assert(combat.state(actor).energy>=0);}
  assert(events.length>4);assert(events.every((e,i)=>!i||e.action-events[i-1].action>=3));assert.deepEqual([...new Set(events.map(e=>e.skillId))],skills.filter(s=>!s.pveOnly||mode==='PVE').map(s=>s.id));
 }
});
test('actual PVE/PVP server timelines preserve 1,000,000 and use only the allowed Razak skills',()=>{
 const cards=tierCards(2e7),pve=createPveBattleV2({cards,monster:{id:1,battle_power:1.6e10},mercenary:snapshot(),seed:77}).result;
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(),seed:77}).result;
 assert(pve.timeline.some(e=>e.type===eventType));assert(pvp.timeline.some(e=>e.type===eventType));assert(!pvp.timeline.some(e=>e.type===eventType&&e.skillId==='MS-063'));
});
test('public codex and byte-identical source retain the accepted name, grade, power and 2+1 skills',()=>{
 const data=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1})),card=data.cards.find(c=>c.code===code);
 assert.equal(card.name,'라자크');assert.equal(card.rank,'SSS');assert.equal(card.edition,'STANDARD');assert.equal(card.basePower,1000000);assert.equal(card.acquisitionEnabled,false);assert.equal(card.skills.length,3);assert(!card.skills.some(s=>/0000000/.test(s.effect)));
 for(const[file,hash]of [[art.sourceArt,art.sourceArtSha256],[art.battleSprite,art.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),hash);
 const m=JSON.parse(fs.readFileSync('assets/ui/project-v/mercenaries/razak-20261024/motion-manifest.json'));assert.equal(m.runtime.defaultSpeed,2);assert.equal(m.runtime.effectScale,1.65);assert.equal(m.motion.idle.frameCount,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {PRIME_CODE,PRIME_ART,PRIME_COMBAT,PRIME_AREA_SKILLS,PRIME_AREA_EVENT,primeIncomingDamage} from '../shared/mercenary-prime-requiem-v1.mjs';
import {ZERO_CODE,ZERO_COMBAT} from '../shared/mercenary-zero-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryAcquisitionEnabled,assertMercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {ALL_LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {resolvePrimeArea} from '../functions/_mercenary_prime_requiem.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
const root='preview/prime-requiem-blood-skills-20261021-v1/';
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code,side='A',mode='PVE',power=0)=>buildMercenaryFighter({...snapshot(code),equipment:{schemaVersion:1,mode,power}},side,mode,buildFighter);

test('Prime equals Zero in actual PVE/PVP stats, gear, links, mitigation and action cadence',()=>{
 assert.equal(PRIME_COMBAT,ZERO_COMBAT);assert.equal(PRIME_COMBAT.basePower,3000000);
 for(const mode of ['PVE','PVP'])for(const gear of [0,1e8]){
  const z=fighter(PRIME_CODE,'A',mode,gear),l=fighter(ZERO_CODE,'B',mode,gear);
  for(const key of ['attack','maxHp','defense','speed','counterImmune','controlImmune','poisonImmune'])assert.equal(z[key],l[key],key);
  applyMercenaryCombatLink(['A','B'].map((side,i)=>[...tierCards(2e7).map((c,n)=>buildFighter(c,n,side,null,mode)),[z,l][i]]));
  assert.equal(mercenaryEffectiveAttack(z),mercenaryEffectiveAttack(l));assert.equal(z.maxHp,l.maxHp);assert.equal(z.shield,l.shield);
  assert.deepEqual(z.skills.map(s=>s.id),mode==='PVE'?PRIME_AREA_SKILLS.map(s=>s.id):[]);
 }
 const z=fighter(PRIME_CODE),card={id:'card',side:'A',hp:1},enemy={id:'enemy',side:'B',hp:1},cadence=mercenaryTurnCadence({A:[card,z],B:[enemy]});let actions=0;
 for(let i=0;i<25;i++){cadence.acted(card);while(cadence.pending()){cadence.acted(z);actions++;assert(actions<100);}}
 assert.equal(actions,78);assert.equal(primeIncomingDamage(z,1000),200);assert.equal(PRIME_COMBAT.actionCredit,ZERO_COMBAT.actionCredit);
});
test('normal/limited/Halloween/fusion selection cannot award Prime even with positive CMS weight',()=>{
 const rules={cardWeights:{[PRIME_CODE]:1000000}},cards=[{code:PRIME_CODE,name:'제로',rank:'SSS'},{code:'V-001',name:'일반',rank:'SSS'}];
 assert.equal(mercenaryAcquisitionEnabled(PRIME_CODE,rules),false);assert.throws(()=>assertMercenaryAcquisitionEnabled(PRIME_CODE,rules),{code:'MERCENARY_ACQUISITION_DISABLED'});
 assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);assert.equal(mercenaryCardChances(1000000,[PRIME_CODE],rules)[0].percent,0);
 assert.deepEqual(limitedNormalCards(cards,cards,rules).map(c=>c.code),['V-001']);
 for(const pool of [ALL_LIMITED_MERCENARIES,HALLOWEEN_PACK_CARDS,MERCENARY_CMS_SEED.catalog.cards])assert(!pool.some(c=>c.code===PRIME_CODE));
});
test('four PVE area skills retain one 3024% budget per cast and rotate more frequently',()=>{
 for(const skill of PRIME_AREA_SKILLS){
  const actor=fighter(PRIME_CODE),targets=Array.from({length:12},(_,i)=>({id:'t'+i,hp:10000,maxHp:10000,alive:true})),ratios=[],events=[];
  const args={actor,skill,targets:[...targets,targets[0],{id:'dead',hp:0},{id:'suit',hp:10,isBattleSuit:true}],hit:(a,t,r)=>{ratios.push(r);return {damage:100};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit:(type,row)=>events.push({type,...row})};
  assert.equal(resolvePrimeArea(args).length,12);assert(Math.abs(ratios.reduce((a,b)=>a+b)-30.24)<1e-9);assert.equal(events.length,1);assert.equal(events[0].type,PRIME_AREA_EVENT);assert(targets.every(t=>t.hp===9900));
  for(const change of [{battleMode:'PVP'},{hp:0},{stunned:true},{silenced:true}])assert.deepEqual(resolvePrimeArea({...args,actor:{...actor,...change}}),[]);
 }
 const cards=tierCards(2e7),options={cards,monster:{id:1,battle_power:1.6e10},seed:77};
 const prime=createPveBattleV2({...options,mercenary:snapshot(PRIME_CODE)}).result,zero=createPveBattleV2({...options,mercenary:snapshot(ZERO_CODE)}).result;
 const casts=prime.timeline.filter(e=>e.type===PRIME_AREA_EVENT),reference=zero.timeline.filter(e=>e.type==='MERCENARY_ZERO_AREA');
 assert(casts.length>reference.length);assert(casts.length>=2);
 casts.forEach((e,i)=>assert.equal(e.skillId,PRIME_AREA_SKILLS[i%4].id));
 for(const type of ['MERCENARY_WINDUP','MERCENARY_END'])assert.equal(prime.timeline.filter(e=>e.type===type&&PRIME_AREA_SKILLS.some(s=>s.id===e.skillId)).length,casts.length);
 assert.equal(prime.winner,zero.winner);
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(PRIME_CODE),defenderMercenary:snapshot(ZERO_CODE),seed:77});assert(!pvp.result.timeline.some(e=>e.type===PRIME_AREA_EVENT));
});
test('PVE cadence is ten casts per thirty own actions instead of six, with shared cooldown and no PVP casts',()=>{
 const run=(legacy=false,mode='PVE')=>{
  const actor=fighter(PRIME_CODE,'A',mode),enemy={...buildFighter(tierCards(2e7)[0],0,'B',null,mode),hp:1e15,maxHp:1e15};
  if(legacy)for(const skill of actor.skills)Object.assign(skill.balance,{cooldownTurns:5,cost:35});
  const events=[],combat=mercenaryCombat({teams:{A:[actor],B:[enemy]},clock:()=>actor.actions,
   hit:()=>({hit:true,damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},
   emit:(type,data)=>{if(type===PRIME_AREA_EVENT)events.push({action:actor.actions,...data});}});
  for(actor.actions=1;actor.actions<=30;actor.actions++){
   if(!combat.beforeAction(actor))combat.afterBasic(actor,enemy,true);
   assert(combat.state(actor).energy>=0);
  }
  return events;
 };
 const before=run(true),after=run();
 assert.equal(before.length,6);assert.equal(after.length,10);
 assert.deepEqual(after.map(e=>e.action),[1,4,7,10,13,16,19,22,25,28]);
 after.forEach((e,i)=>assert.equal(e.skillId,PRIME_AREA_SKILLS[i%4].id));
 assert.deepEqual(run(false,'PVP'),[]);
});
test('public codex exposes seven skills and acquisition lock while deployment requires ownership',async t=>{
 const data=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})),card=data.cards.find(c=>c.code===PRIME_CODE);
 assert.equal(card.basePower,3000000);assert.equal(card.title,'적월의 광전사');assert.equal(card.acquisitionEnabled,false);assert.equal(card.packAcquisitionEnabled,false);assert.equal(card.skills.length,7);assert(card.skills.every(s=>s.ready));
 assert(card.skills.filter(s=>!s.basicForm).every(s=>s.balance.cost===20&&s.balance.cooldownTurns===3));
 const f=await mercenaryFixture(t,{postgres:true});
 for(const mode of ['PVE','PVP'])await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:PRIME_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 assert(!(await mercenaryAccountState(f.env,f.user)).cards.some(c=>c.code===PRIME_CODE));
 // Local fixture only: future authorized ownership must use the same server policy.
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,PRIME_CODE,'2026-10-20','2026-10-20').run();
 for(const mode of ['PVE','PVP']){await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:PRIME_CODE,revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).basePower,3000000);}
 assert((await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===PRIME_CODE).canDeploy);
});
test('approved V7 assets stay byte-identical and all actual V3 consumers ship Prime',()=>{
 for(const [file,hash]of [[PRIME_ART.sourceArt,PRIME_ART.sourceArtSha256],[PRIME_ART.battleSprite,PRIME_ART.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),hash);
 const approval=JSON.parse(fs.readFileSync(root+'live-approval-20261021.json'));
 assert.equal(approval.status,'USER_APPROVED');
 for(const f of approval.files)assert.equal(createHash('sha256').update(fs.readFileSync(root+f.file)).digest('hex'),f.sha256);
 const m=JSON.parse(fs.readFileSync(root+'manifest.json'));assert.equal(m.liveApproval.userVisualApproval,true);assert.equal(m.character.rosterCode,PRIME_CODE);
 assert(m.sheets['fx-idle-shattered-moon-v7']);assert(!m.sheets['fx-idle-shattered-moon-v6']);
 for(const p of [PRIME_ART.sourceArt,PRIME_ART.battleSprite,PRIME_ART.frame,...Object.values(m.sheets).map(s=>root+s.path),root+'assets/blood-sanctum.png']){assert(isProductionFile(p),p);assert(fs.statSync(p).size>0,p);}
 const impact='assets/ui/project-v/mercenaries/prime-requiem-pve-20261022/eclipse-impact-v1.webp';
 assert(isProductionFile(impact));assert(fs.statSync(impact).size<700000);
 for(const file of ['preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js','pve-v3/battle.bundle.js','preview/coop-defense-v1/defense.bundle.js']){const s=fs.readFileSync(file,'utf8');assert(s.includes(PRIME_AREA_EVENT),file);assert(s.includes('PRIME_REQUIEM_MOTION_ASSETS'),file);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {CRYVERN_RELEASE_ENABLED,CRYVERN_CODE,CRYVERN_SKILL_ID,CRYVERN_BALANCE,CRYVERN_CAP_SCALE} from '../shared/mercenary-cryvern-v1.mjs';
import {prepareCryvernCandidate,appendCryvernRoster} from '../preview/mercenary-ice-crystal-dual-sword-v1/release/registration.mjs';
import {expandMercenarySkillCatalog,validateMercenaryCms} from '../shared/mercenary-cms-model-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryGradePools} from '../shared/mercenary-draw-policy-v1.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {cryvern,ragniel,measure} from '../scripts/measure-cryvern-balance.mjs';
import {tierCards,fixture} from './helpers/mercenary-operating-roster-v2144.mjs';
import {cryvernPlaybackPlan} from '../preview/project-v-v3/source/battle/CryvernCombatPlayback.js';
import {sample} from '../preview/mercenary-ice-crystal-dual-sword-v1/skill.mjs';
const manifest=JSON.parse(fs.readFileSync('preview/mercenary-ice-crystal-dual-sword-v1/manifest.json'));
const prepared=prepareCryvernCandidate(seed,manifest);
const prior=structuredClone(seed);prior.catalog.cards=prior.catalog.cards.filter(c=>c.code!==CRYVERN_CODE);prior.catalog.skills=prior.catalog.skills.filter(s=>s.id!==CRYVERN_SKILL_ID);
prior.document.mercenaries=prior.document.mercenaries.filter(c=>c.code!==CRYVERN_CODE);prior.document.skills=prior.document.skills.filter(s=>s.id!==CRYVERN_SKILL_ID);prior.document.assignments=prior.document.assignments.filter(c=>c.code!==CRYVERN_CODE);

test('catalog and grade pool exactly follow the explicit release gate; name has no title',()=>{
 assert.equal(seed.catalog.cards.some(c=>c.code===CRYVERN_CODE),CRYVERN_RELEASE_ENABLED);
 assert.equal(seed.document.skills.some(s=>s.id===CRYVERN_SKILL_ID),CRYVERN_RELEASE_ENABLED);
 assert.equal(mercenaryGradePools(seed.document.mercenaries,seed.catalog.cards.map(c=>c.code)).SSS.includes(CRYVERN_CODE),CRYVERN_RELEASE_ENABLED);
 assert.equal(prepared.registration.card.name,'크라이베른');assert.equal(prepared.registration.card.title,'');
 assert.equal(prepared.registration.card.rank,'SSS');assert.equal(manifest.motionStatus,'USER_APPROVED');
 assert.equal(manifest.runtimeEnabled,CRYVERN_RELEASE_ENABLED);
 for(const [file,hash] of [[manifest.sourceArt,manifest.sourceArtInfo.sha256],[manifest.battleSprite,manifest.battleSpriteSha256]])
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),hash);
});
test('local release candidate appends only one card/skill, retains CMS edits and is idempotent',()=>{
 const current=structuredClone(prior.document);current.mercenaries[0].name='보존할 운영 이름';current.skills[0].balance.cost=17;current.assignments[0].skillIds=['MS-004'];
 const before=structuredClone(current),next=expandMercenarySkillCatalog(current,prepared.document,prepared.catalog);
 for(const key of ['mercenaries','skills','assignments'])assert.deepEqual(next[key].slice(0,-1),before[key]);
 assert.deepEqual(current,before);assert.deepEqual(next.settings,before.settings);
 assert.deepEqual(next.mercenaries.at(-1).title,'');assert.deepEqual(next.skills.at(-1).balance,CRYVERN_BALANCE);
 next.skills.at(-1).balance.cost=40;next.assignments.at(-1).skillIds=[];
 assert.deepEqual(expandMercenarySkillCatalog(next,prepared.document,prepared.catalog),next);
 const bad=structuredClone(next);bad.mercenaries.at(-1).title='붙이면 안 되는 칭호';assert.throws(()=>validateMercenaryCms(bad,prepared.catalog));
 const incomplete=structuredClone(current);incomplete.mercenaries.pop();assert.throws(()=>expandMercenarySkillCatalog(incomplete,prepared.document,prepared.catalog));
 const collision=structuredClone(prior);collision.catalog.cards.push({...prepared.registration.card,sourceArtSha256:'0'.repeat(64)});
 assert.throws(()=>prepareCryvernCandidate(collision,manifest),/COLLISION/);
 const roster=JSON.parse(fs.readFileSync('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json'));
 const extended=appendCryvernRoster(roster,prepared.registration.card);assert.deepEqual(appendCryvernRoster(extended,prepared.registration.card),extended);
 assert.deepEqual(extended.cards.filter(c=>c.code!==CRYVERN_CODE),roster.cards.filter(c=>c.code!==CRYVERN_CODE));
});
function harness({count=2,mode='PVP',dodge=false,hp=1e8,control,veil=0}={}){
 const actor=buildMercenaryFighter(cryvern,'A',mode,buildFighter);
 if(control)actor[control]=true;
 const targets=Array.from({length:count},(_,i)=>({...buildFighter({id:'T-'+i,power:1e8},i,'B',null,mode),
  hp:i?1e8:hp,maxHp:1e8,shield:i?0:100,maxShield:100,row:'FRONT'})),events=[],rolls=[];
 const runtime=mercenaryCombat({teams:{A:[actor],B:targets},hit:(a,t,ratio,options)=>{
  rolls.push({id:t.id,ratio,...options});return {damage:1000*ratio,dodge:dodge&&rolls.length===1};
 },damage(t,n){const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.shield-=absorbed;t.hp-=hpDamage;return {hpDamage,absorbed};},
 knockout(t){if(t.hp<=0){t.alive=false;events.push({type:'KNOCKOUT',targetId:t.id});}},
 emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 if(veil)runtime.debuffs.set(actor.id,{veil:{percent:veil}});
 return {actor,targets,runtime,events,rolls,turn(){actor.actions++;return runtime.beforeAction(actor);}};
}
test('PVP/PVE use one same-action cast, one cost/cooldown and a bounded two-stage budget',()=>{
 for(const mode of ['PVP','PVE'])for(const count of [1,2]){
  const h=harness({mode,count});assert.equal(h.turn(),true);
  const e=h.events.find(e=>e.type==='MERCENARY_CRYSTAL_CROWN');assert.equal(e.impacts.length,2*count);
  assert.deepEqual([...new Set(e.impacts.map(i=>i.at))],[1.3,2.62]);
  assert.ok(Math.abs(h.rolls.reduce((n,r)=>n+r.ratio,0)-CRYVERN_BALANCE.damageRatio)<1e-10);
  assert.ok(Math.abs(h.rolls.reduce((n,r)=>n+r.castShare,0)-1)<1e-10);
  assert.ok(Math.abs(h.rolls.reduce((n,r)=>n+r.capScale,0)-count*CRYVERN_CAP_SCALE)<1e-10);
  assert.equal(h.runtime.state(h.actor).energy,65);assert.equal(h.runtime.state(h.actor).cooldown.get(CRYVERN_SKILL_ID),6);
  assert.equal(h.runtime.state(h.actor).pending,null);assert.equal(h.actor.gauge,0);
  assert.equal(h.turn(),false);assert.equal(h.runtime.basicMultiplier(h.actor),1);assert.equal(h.runtime.state(h.actor).reload,undefined);
 }
});
test('dodge cancels its crown, dead marked target redistributes only its fixed share, KO follows all contacts',()=>{
 const dodge=harness({dodge:true});dodge.turn();assert.equal(dodge.rolls.length,3);
 assert.ok(dodge.rolls.reduce((n,r)=>n+r.castShare,0)<1);
 const dead=harness({hp:1});dead.turn();assert.deepEqual(dead.rolls.map(r=>r.id),[dead.targets[0].id,dead.targets[1].id,dead.targets[1].id,dead.targets[1].id]);
 assert.ok(Math.abs(dead.rolls.reduce((n,r)=>n+r.castShare,0)-1)<1e-10);
 assert.ok(dead.events.findIndex(e=>e.type==='KNOCKOUT')>dead.events.findIndex(e=>e.type==='MERCENARY_CRYSTAL_CROWN'));
 for(const control of ['stunned','silenced']){
  const h=harness({control});h.turn();assert.equal(h.rolls.length,0);assert.equal(h.runtime.state(h.actor).energy,100);
 }
 const gone=harness();gone.targets.forEach(t=>t.hp=0);assert.equal(gone.turn(),false);assert.equal(gone.runtime.state(gone.actor).energy,100);
});
test('PVP suppression reduces every contact cap and raw damage; boss control immunity is not bypassed',()=>{
 for(const mode of ['PVP','PVE']){
  const normal=harness({mode}),veiled=harness({mode,veil:25});
  normal.targets.forEach(t=>{t.isBoss=true;t.controlImmune=true;t.gauge=50;});
  normal.turn();veiled.turn();
  normal.rolls.forEach((r,i)=>{assert.ok(Math.abs(veiled.rolls[i].ratio-r.ratio*.75)<1e-10);assert.ok(Math.abs(veiled.rolls[i].capScale-r.capScale*(mode==='PVP'?.75:1))<1e-10);});
  assert.ok(normal.targets.every(t=>t.controlImmune&&!t.stunned&&t.gauge===50));
 }
});
test('server contact plans suppress unearned effects; visual frames cannot produce extra damage',()=>{
 const full=cryvernPlaybackPlan('ultimate',[{at:1.3},{at:2.62}]);assert.equal(full.damageAuthority,'SERVER_ONLY');assert.equal(full.duration,6.2);
 const cancelled=cryvernPlaybackPlan('ultimate',[{at:1.3,dodge:true}]);
 assert.deepEqual(cancelled.contacts,[]);assert.equal(cancelled.duration,1.5);
 assert.equal(sample(cancelled,2.62).effects.length,0);
});
test('zero configured skill damage and complete suppression never become a full basic attack',()=>{
 for(const suppressed of [false,true]){
  const h=harness({veil:suppressed?100:0});
  if(!suppressed)h.actor.skills[0].balance.damageRatio=0;
  const before=h.targets.map(t=>({hp:t.hp,shield:t.shield}));h.turn();
  assert.equal(h.rolls.length,0);assert.deepEqual(h.targets.map(t=>({hp:t.hp,shield:t.shield})),before);
  assert.equal(h.actor.damageDealt,0);
 }
});
test('held card cannot be deployed through the account API',{skip:CRYVERN_RELEASE_ENABLED},async t=>{
 const f=await mercenaryFixture(t,{postgres:true});
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:CRYVERN_CODE,revision:0}),e=>e.code==='MERCENARY_CODE');
});
test('canonical PVE and both PVP sides retain exactly five ordinary cards plus one mercenary across real power scales',()=>{
 for(const power of [1e6,2e7,1e8,2e9]){
  const cards=tierCards(power),battles=[createPveBattleV2({cards,mercenary:cryvern,monster:{id:1,name:'검수 보스',battle_power:power*20},seed:7919})];
  for(const side of ['A','B'])battles.push(createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:side==='A'?cryvern:ragniel,defenderMercenary:side==='B'?cryvern:ragniel,seed:7919,singleHealerBonus:fixture.singleHealerBonus}));
  for(const battle of battles){assert.equal(battle.teams.A.cards.length,5);assert.equal(battle.teams.A.mercenaries.length,1);
   const events=battle.result.timeline.filter(e=>e.type==='MERCENARY_CRYSTAL_CROWN');assert.ok(events.length);
   for(const e of events)for(const i of e.impacts)assert.ok(Number.isFinite(i.damage)&&i.damage>=0&&Number.isFinite(i.targetHpAfter)&&i.targetHpAfter>=0);
  }
 }
});
test('two disjoint seed sets give Cryvern a small measured advantage over Ragniel, never a winner override',()=>{
 const report=measure();assert.equal(report.total,8192);
 for(const group of report.groups)assert.ok(group.rate>=.52&&group.rate<=.58,JSON.stringify(group));
});

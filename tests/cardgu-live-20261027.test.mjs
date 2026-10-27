import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import growthInput from '../docs/qa/razak-balance-20261026/live-input.json' with {type:'json'};
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {eunseolLevelFixture} from './helpers/eunseol-level-fixture-20261026.mjs';
import {CARDGU_CODE,CARDGU_COMBAT,CARDGU_ART,CARDGU_AREA_SKILLS,CARDGU_AREA_EVENT,cardguIncomingDamage} from '../shared/mercenary-cardgu-v1.mjs';
import {GENERAL_JOK_CODE,GENERAL_JOK_COMBAT} from '../shared/mercenary-general-jok-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryLevelXpMultiplier} from '../shared/mercenary-level-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack,mercenaryPvpTierGuard} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {resolveCardguArea} from '../functions/_mercenary_cardgu.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code,side='A',mode='PVE',power=0)=>buildMercenaryFighter({...snapshot(code),equipment:{schemaVersion:1,mode,power}},side,mode,buildFighter);

test('Cardgu snapshots current General Jok stats, links, mitigation and basic budget independently',()=>{
 assert.notEqual(CARDGU_COMBAT,GENERAL_JOK_COMBAT);
 const {version:a,...policy}=CARDGU_COMBAT,{version:b,...reference}=GENERAL_JOK_COMBAT;assert.deepEqual(policy,reference);
 for(const mode of ['PVE','PVP'])for(const gear of [0,1e8]){
  const c=fighter(CARDGU_CODE,'A',mode,gear),g=fighter(GENERAL_JOK_CODE,'B',mode,gear);
  for(const k of ['basePower','attack','maxHp','defense','speed','counterImmune','controlImmune','poisonImmune'])assert.equal(c[k],g[k],k);
  applyMercenaryCombatLink(['A','B'].map((side,i)=>[...tierCards(2e7).map((card,n)=>buildFighter(card,n,side,null,mode)),[c,g][i]]));
  for(const k of ['maxHp','shield','speed'])assert.equal(c[k],g[k],k);assert.equal(mercenaryEffectiveAttack(c),mercenaryEffectiveAttack(g));
  assert.equal(cardguIncomingDamage(c,1000),200);assert.equal(c.attackStyle,'CAST');assert.equal(c.skills.length,mode==='PVE'?2:0);
 }
 assert.equal(mercenaryPvpTierGuard(fighter('V-975','A','PVP'),[[fighter('V-975','A','PVP')],[fighter(CARDGU_CODE,'B','PVP')]]),1,'General-Jok-only matchup policy must not spread');
});
test('each area has one 3024% server budget over unique enemies and blocks invalid/dead/control input',()=>{
 for(const skill of CARDGU_AREA_SKILLS)for(const n of [1,5,13]){
  const actor=fighter(CARDGU_CODE),targets=Array.from({length:n},(_,i)=>({id:'t'+i,side:'B',hp:10000,maxHp:10000,alive:true})),ratios=[],events=[];
  const args={actor,skill,targets:[...targets,targets[0],actor,{id:'friend',side:'A',hp:10},{id:'dead',side:'B',hp:0},{id:'suit',side:'B',hp:10,isBattleSuit:true}],hit:(a,t,r)=>{ratios.push(r);return {damage:100};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit:(type,row)=>events.push({type,...row})};
  assert.equal(resolveCardguArea(args).length,n);assert(Math.abs(ratios.reduce((a,b)=>a+b)-30.24)<1e-9);assert.equal(events.length,1);assert.equal(events[0].type,CARDGU_AREA_EVENT);assert(targets.every(t=>t.hp===9900));
  for(const change of [{battleMode:'PVP'},{hp:0},{stunned:true},{silenced:true},{code:GENERAL_JOK_CODE}])assert.deepEqual(resolveCardguArea({...args,actor:{...actor,...change}}),[]);
  assert.deepEqual(resolveCardguArea({...args,skill:{...skill,id:'MS-000'}}),[]);
 }
});
test('two area forms alternate every three actions without duplicate cost; PVP has no area cast',()=>{
 const run=mode=>{const actor=fighter(CARDGU_CODE,'A',mode),enemy={...buildFighter(tierCards(2e7)[0],0,'B',null,mode),hp:1e15,maxHp:1e15},events=[];
  const combat=mercenaryCombat({teams:{A:[actor],B:[enemy]},clock:()=>actor.actions,hit:()=>({hit:true,damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit:(type,row)=>{if(type===CARDGU_AREA_EVENT)events.push({action:actor.actions,...row});}});
  for(actor.actions=1;actor.actions<=30;actor.actions++){if(!combat.beforeAction(actor))combat.afterBasic(actor,enemy,true);assert(combat.state(actor).energy>=0);}return events;};
 const events=run('PVE');assert.deepEqual(events.map(e=>e.action),[1,4,7,10,13,16,19,22,25,28]);events.forEach((e,i)=>assert.equal(e.skillId,CARDGU_AREA_SKILLS[i%2].id));assert.deepEqual(run('PVP'),[]);
});
test('actual server PVE yields matching damage and outcomes against General Jok baseline',()=>{
 for(const power of [2e6,2e7,2e8])for(const seed of [17,77,813])for(const level of [1,11,21]){
  const args={cards:tierCards(power),monster:{id:1,battle_power:power*800},seed};
  const grown=code=>({...snapshot(code),mercenaryLevel:{version:2,level,policyRevision:growthInput.policyRevision,breakthroughMask:[5,10,15,20].reduce((mask,t,i)=>mask|(t<level?1<<i:0),0),growth:growthInput.growth}});
  const c=createPveBattleV2({...args,mercenary:grown(CARDGU_CODE)}).result,g=createPveBattleV2({...args,mercenary:grown(GENERAL_JOK_CODE)}).result;
  assert.equal(c.winner,g.winner);const budget=r=>r.timeline.filter(e=>[CARDGU_AREA_EVENT,'MERCENARY_GENERAL_JOK_AREA'].includes(e.type)).map(e=>[e.damage,e.absorbed]);assert.deepEqual(budget(c),budget(g));
 }
});
test('PVP uses normal server attacks and preserves the four-skill codex without client damage',()=>{
 const cards=tierCards(2e7),r=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(CARDGU_CODE),defenderMercenary:snapshot(GENERAL_JOK_CODE),seed:77}).result;
 assert(!r.timeline.some(e=>e.type===CARDGU_AREA_EVENT));assert(r.timeline.some(e=>e.type==='TURN'&&e.actorId?.includes(CARDGU_CODE)));
 const data=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})),card=data.cards.find(c=>c.code===CARDGU_CODE);
 assert.equal(card.basePower,2700000);assert.equal(card.skills.length,4);assert.equal(card.rank,'SSS');assert.equal(card.edition,'LIMITED');assert.equal(card.deploymentEnabled,true);assert.equal(card.acquisitionEnabled,false);
 assert.equal(mercenaryAcquisitionEnabled(CARDGU_CODE,{cardWeights:{[CARDGU_CODE]:1e6}}),false);assert.equal(mercenaryLevelXpMultiplier(card),5);
});
test('ownership gates both PVE/PVP and an isolated grant uses the same server snapshot',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});
 for(const mode of ['PVE','PVP'])await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:CARDGU_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,CARDGU_CODE,'2026-10-27','2026-10-27').run();
 for(const mode of ['PVE','PVP']){await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:CARDGU_CODE,revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).basePower,2700000);}
 assert((await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===CARDGU_CODE).canDeploy);
});
test('Cardgu appears in real growth catalog and trains once with LIMITED XP and original preserved',async t=>{
 const f=await eunseolLevelFixture(t,true);await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',7,CARDGU_CODE,'2026-10-27','2026-10-27').run();
 const listed=await f.call('state');assert(listed.body.cards.some(c=>c.code===CARDGU_CODE));
 const request={requestId:crypto.randomUUID(),mercenaryCode:CARDGU_CODE,revision:0,materials:[{code:'V-049',quantity:15}]},preview=await f.call('preview',request);assert.equal(preview.status,200,JSON.stringify(preview.body));assert.equal(preview.body.requiredXpMultiplier,5);
 const first=await f.call('train',request);assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.result.after.level,2);assert.equal((await f.call('train',request)).body.replayed,true);
 assert.equal(Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code=?',CARDGU_CODE).first()).total_copies),1);
});
test('approved body/art and all packed texture bytes are preserved in live resources',()=>{
 const list=JSON.parse(fs.readFileSync('docs/qa/cardgu-live-20261027/approved-assets.json')).files;assert.equal(list.length,13);
 for(const row of list)assert.equal(createHash('sha256').update(fs.readFileSync(row.file)).digest('hex'),row.sha256,row.file);
 const m=JSON.parse(fs.readFileSync('preview/project-v-v3/source/battle/cardgu/manifest.json'));assert.equal(m.battleVisualApproved,true);assert.equal(m.counts.body,29);assert.equal(m.counts.effects,60);assert.equal(m.aura.orbitCards,24);
 assert.equal(createHash('sha256').update(fs.readFileSync(CARDGU_ART.sourceArt)).digest('hex'),CARDGU_ART.sourceArtSha256);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {LEONEL_CODE,LEONEL_ART,LEONEL_COMBAT,LEONEL_AREA_SKILL,LEONEL_AREA_EVENT,leonelIncomingDamage} from '../shared/mercenary-leonel-v1.mjs';
import {JOKRO_CODE,JOKRO_COMBAT} from '../shared/mercenary-jokro-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {ALL_LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {resolveLeonelArea} from '../functions/_mercenary_leonel.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';

const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code=LEONEL_CODE,side='A',mode='PVE',power=0)=>buildMercenaryFighter({...snapshot(code),equipment:{schemaVersion:1,mode,power}},side,mode,buildFighter);
const ratio=LEONEL_COMBAT.basePower/JOKRO_COMBAT.basePower;
const scaled=(a,b)=>assert(Math.abs(a-b*ratio)<=Math.max(2,a*1e-6),`${a} vs ${b} at ${ratio}`);

test('latest 2.3m power applies to actual PVE/PVP stats and linked floors, including gear; timing stays unchanged',()=>{
 assert.equal(LEONEL_COMBAT.basePower,2300000);
 for(const mode of ['PVE','PVP'])for(const gear of [0,1e8]){
  const l=fighter(LEONEL_CODE,'A',mode,gear),j=fighter(JOKRO_CODE,'B',mode,gear);
  for(const field of ['attack','maxHp','defense'])scaled(l[field],j[field]);
  for(const field of ['speed','counterImmune','controlImmune','poisonImmune'])assert.equal(l[field],j[field]);
  applyMercenaryCombatLink(['A','B'].map((side,i)=>[...tierCards(2e7).map((c,n)=>buildFighter(c,n,side,null,mode)),[l,j][i]]));
  scaled(mercenaryEffectiveAttack(l),mercenaryEffectiveAttack(j));scaled(l.maxHp,j.maxHp);scaled(l.shield,j.shield);
  assert.deepEqual(l.skills.map(s=>s.id),mode==='PVE'?['MS-978']:[]);
 }
 const l=fighter(),a={id:'card',side:'A',hp:1},enemy={id:'enemy',side:'B',hp:1},cadence=mercenaryTurnCadence({A:[a,l],B:[enemy]});let count=0;
 for(let i=0;i<25;i++){cadence.acted(a);while(cadence.pending()){assert.equal(cadence.pending(),l);cadence.acted(l);count++;assert(count<100);}}
 assert.equal(count,78);assert.equal(leonelIncomingDamage(l,1000),200);
 assert.equal(LEONEL_COMBAT.motionPlaybackRate,2);assert.equal(LEONEL_COMBAT.effectPlaybackRate,1);
});

test('acquisition remains closed regardless of CMS weights and absent from normal/limited/Halloween pools',()=>{
 const rules={cardWeights:{[LEONEL_CODE]:1000000}},cards=[{code:LEONEL_CODE,name:'레오넬',rank:'SSS'},{code:'V-001',name:'일반',rank:'SSS'}];
 assert.equal(mercenaryAcquisitionEnabled(LEONEL_CODE,rules),false);
 assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);
 assert.equal(mercenaryCardChances(1000000,[LEONEL_CODE],rules)[0].percent,0);
 assert.deepEqual(limitedNormalCards(cards,cards,rules).map(c=>c.code),['V-001']);
 for(const pool of [ALL_LIMITED_MERCENARIES,HALLOWEEN_PACK_CARDS,MERCENARY_CMS_SEED.catalog.cards])assert(!pool.some(c=>c.code===LEONEL_CODE));
});

test('one sword-apex receipt applies the 1512% budget once across all 12 living targets',()=>{
 const actor=fighter(),targets=Array.from({length:12},(_,i)=>({id:'t'+i,hp:10000,maxHp:10000,alive:true})),ratios=[],events=[];
 const args={actor,skill:LEONEL_AREA_SKILL,targets:[...targets,targets[0],{id:'dead',hp:0},{id:'suit',hp:10,isBattleSuit:true},{id:'hidden',hp:10,untargetable:true}],hit:(a,t,r)=>{ratios.push(r);return {damage:100};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit:(type,row)=>events.push({type,...row})};
 assert.equal(resolveLeonelArea(args).length,12);assert(Math.abs(ratios.reduce((a,b)=>a+b)-15.12)<1e-9);assert.equal(events.length,1);assert.equal(events[0].type,LEONEL_AREA_EVENT);assert(targets.every(t=>t.hp===9900));
 for(const change of [{battleMode:'PVP'},{hp:0},{stunned:true},{silenced:true}])assert.deepEqual(resolveLeonelArea({...args,actor:{...actor,...change}}),[]);
 const cards=tierCards(2e7),timeline=createPveBattleV2({cards,mercenary:snapshot(LEONEL_CODE),monster:{id:1,battle_power:1.6e10},seed:77}).result.timeline;
 const casts=timeline.filter(e=>e.type===LEONEL_AREA_EVENT);assert(casts.length);
 for(const type of ['MERCENARY_WINDUP','MERCENARY_END'])assert.equal(timeline.filter(e=>e.type===type&&e.skillId==='MS-978').length,casts.length);
 assert(!createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(LEONEL_CODE),defenderMercenary:snapshot(JOKRO_CODE),seed:77}).result.timeline.some(e=>e.type===LEONEL_AREA_EVENT));
});

test('read-only public codex shows approved art, latest power and locked acquisition; ownership is still required',async t=>{
 const codex=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})),art=codex.cards.find(c=>c.code===LEONEL_CODE);
 assert.equal(art.basePower,2300000);assert.equal(art.acquisitionEnabled,false);assert.equal(art.packAcquisitionEnabled,false);assert.equal(art.deploymentEnabled,true);assert.equal(art.skills[0].ready,true);
 const f=await mercenaryFixture(t,{postgres:true});
 for(const mode of ['PVE','PVP'])await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:LEONEL_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 assert(!(await mercenaryAccountState(f.env,f.user)).cards.some(c=>c.code===LEONEL_CODE));
 // Local fixture only, representing future ownership. No production grant tool exists.
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,LEONEL_CODE,'2026-10-18','2026-10-18').run();
 for(const mode of ['PVE','PVP']){
  const input={requestId:crypto.randomUUID(),mode,mercenaryCode:LEONEL_CODE,revision:0};await saveMercenaryLoadout(f.env,f.user,input);
  assert.equal((await saveMercenaryLoadout(f.env,f.user,input)).replayed,true);
  const one=await loadMercenaryBattleSnapshot(f.env,f.user,mode),batch=await releasedMercenarySnapshots(f.env,[f.user.id],mode);
  assert.equal(one.basePower,2300000);assert.deepEqual(batch.get(f.user.id),one);assert.deepEqual(one.skills,[LEONEL_AREA_SKILL]);
 }
 const state=await mercenaryAccountState(f.env,f.user);assert(state.cards.find(c=>c.code===LEONEL_CODE).canDeploy);
});

test('approved originals, per-frame ground anchors and every live atlas ship with actual V3 consumers',()=>{
 for(const [file,hash]of [[LEONEL_ART.sourceArt,LEONEL_ART.sourceArtSha256],[LEONEL_ART.battleSprite,LEONEL_ART.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),hash);
 const root='preview/mercenary-leonel-sss-limited-20261018-v2/',m=JSON.parse(fs.readFileSync(root+'manifest.json'));
 for(const p of [LEONEL_ART.sourceArt,LEONEL_ART.battleSprite,LEONEL_ART.frame,root+'manifest.json',root+'assets/ui/dialogue-frame.png','assets/ui/project-v/mercenaries/codex-v1/v-978-art-320.webp']){assert(isProductionFile(p));assert(fs.statSync(p).size>0);}
 for(const spec of [...Object.values(m.motion),...Object.values(m.effects),...Object.values(m.cinematics)])for(const page of spec.pages||[{url:spec.url||spec.atlas}]){assert(isProductionFile(root+page.url));assert(fs.statSync(root+page.url).size>0);}
 for(const key of ['aura','pressure'])for(const f of m.effects[key].frames)assert(Number.isFinite(f.groundAnchor.y)&&Number.isFinite(f.groundAnchor.x));
 assert.equal(m.motion.idle.referenceHeight,610);assert.equal(m.displaySizing.physicalBodyHeight,333);
 for(const spec of Object.values(m.motion))for(const f of spec.frames){assert(isProductionFile(root+f.file));assert(fs.existsSync(root+f.file));}
 for(const file of ['assets/body-frames/idle-01.png','qa/ambient-ground-lock-runtime.json']){assert(!isProductionFile(root+file));assert(fs.existsSync(root+file));}
 const report=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json'));assert(report.sources.some(s=>s.file.endsWith('/LeonelCombatPlayback.js')));
 for(const file of ['preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js','pve-v3/battle.bundle.js','preview/coop-defense-v1/defense.bundle.js']){const s=fs.readFileSync(file,'utf8');assert(s.includes(LEONEL_AREA_EVENT),file);assert(s.includes('LEONEL_MOTION_ASSETS'),file);}
 for(const file of ['index.html','js/app.js','js/battle-v3-live.js','service-worker.js','preview/project-v-v3/source/project-v-pixi-battle.src.js'])assert(fs.readFileSync(file,'utf8').includes('leonel-live'),file);
});

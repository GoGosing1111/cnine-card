import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {ZERO_CODE,ZERO_ART,ZERO_COMBAT,ZERO_AREA_SKILLS,ZERO_AREA_EVENT,zeroIncomingDamage} from '../shared/mercenary-zero-v1.mjs';
import {LEONEL_CODE,LEONEL_COMBAT} from '../shared/mercenary-leonel-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryAcquisitionEnabled,assertMercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {ALL_LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {resolveZeroArea} from '../functions/_mercenary_zero.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
const root='preview/mercenary-cyan-knight-battle-20261020-v1/';
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code,side='A',mode='PVE',power=0)=>buildMercenaryFighter({...snapshot(code),equipment:{schemaVersion:1,mode,power}},side,mode,buildFighter);

test('Zero uses 3 million power in PVE/PVP stats, gear and links while Leonel and action cadence stay unchanged',()=>{
 assert.equal(ZERO_COMBAT.basePower,3000000);assert.equal(LEONEL_COMBAT.basePower,2300000);
 const scaled=(actual,previous,label)=>assert(Math.abs(actual-previous*30/23)<=2,label);
 for(const mode of ['PVE','PVP'])for(const gear of [0,1e8]){
  const z=fighter(ZERO_CODE,'A',mode,gear),l=fighter(LEONEL_CODE,'B',mode,gear);
  assert.equal(z.basePower,3000000+gear);assert.equal(l.basePower,2300000+gear);
  for(const key of ['attack','maxHp','defense'])scaled(z[key],l[key],key);
  for(const key of ['speed','counterImmune','controlImmune','poisonImmune'])assert.equal(z[key],l[key],key);
  applyMercenaryCombatLink(['A','B'].map((side,i)=>[...tierCards(2e7).map((c,n)=>buildFighter(c,n,side,null,mode)),[z,l][i]]));
  scaled(mercenaryEffectiveAttack(z),mercenaryEffectiveAttack(l),'linked attack');scaled(z.maxHp,l.maxHp,'linked HP');scaled(z.shield,l.shield,'opening shield');
  assert.deepEqual(z.skills.map(s=>s.id),mode==='PVE'?ZERO_AREA_SKILLS.map(s=>s.id):[]);
 }
 const z=fighter(ZERO_CODE),card={id:'card',side:'A',hp:1},enemy={id:'enemy',side:'B',hp:1},cadence=mercenaryTurnCadence({A:[card,z],B:[enemy]});let actions=0;
 for(let i=0;i<25;i++){cadence.acted(card);while(cadence.pending()){cadence.acted(z);actions++;assert(actions<100);}}
 assert.equal(actions,78);assert.equal(zeroIncomingDamage(z,1000),200);assert.equal(ZERO_COMBAT.actionCredit,LEONEL_COMBAT.actionCredit);
});
test('normal/limited/Halloween/fusion selection cannot award Zero even with positive CMS weight',()=>{
 const rules={cardWeights:{[ZERO_CODE]:1000000}},cards=[{code:ZERO_CODE,name:'제로',rank:'SSS'},{code:'V-001',name:'일반',rank:'SSS'}];
 assert.equal(mercenaryAcquisitionEnabled(ZERO_CODE,rules),false);assert.throws(()=>assertMercenaryAcquisitionEnabled(ZERO_CODE,rules),{code:'MERCENARY_ACQUISITION_DISABLED'});
 assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);assert.equal(mercenaryCardChances(1000000,[ZERO_CODE],rules)[0].percent,0);
 assert.deepEqual(limitedNormalCards(cards,cards,rules).map(c=>c.code),['V-001']);
 for(const pool of [ALL_LIMITED_MERCENARIES,HALLOWEEN_PACK_CARDS,MERCENARY_CMS_SEED.catalog.cards])assert(!pool.some(c=>c.code===ZERO_CODE));
});
test('both area skills split one 3024% budget across unique living targets and alternate on a shared five-action cooldown',()=>{
 for(const skill of ZERO_AREA_SKILLS){
  const actor=fighter(ZERO_CODE),targets=Array.from({length:12},(_,i)=>({id:'t'+i,hp:10000,maxHp:10000,alive:true})),ratios=[],events=[];
  const args={actor,skill,targets:[...targets,targets[0],{id:'dead',hp:0},{id:'suit',hp:10,isBattleSuit:true}],hit:(a,t,r)=>{ratios.push(r);return {damage:100};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit:(type,row)=>events.push({type,...row})};
  assert.equal(resolveZeroArea(args).length,12);assert(Math.abs(ratios.reduce((a,b)=>a+b)-30.24)<1e-9);assert.equal(events.length,1);assert.equal(events[0].type,ZERO_AREA_EVENT);assert(targets.every(t=>t.hp===9900));
  for(const change of [{battleMode:'PVP'},{hp:0},{stunned:true},{silenced:true}])assert.deepEqual(resolveZeroArea({...args,actor:{...actor,...change}}),[]);
 }
 const cards=tierCards(2e7),options={cards,monster:{id:1,battle_power:1.6e10},seed:77};
 const zero=createPveBattleV2({...options,mercenary:snapshot(ZERO_CODE)}).result,leonel=createPveBattleV2({...options,mercenary:snapshot(LEONEL_CODE)}).result;
 const casts=zero.timeline.filter(e=>e.type===ZERO_AREA_EVENT),reference=leonel.timeline.filter(e=>e.type==='MERCENARY_LEONEL_AREA');
 assert(casts.length>=2);assert(casts[0].damage+casts[0].absorbed>reference[0].damage+reference[0].absorbed);
 casts.forEach((e,i)=>assert.equal(e.skillId,ZERO_AREA_SKILLS[i%2].id));
 for(const type of ['MERCENARY_WINDUP','MERCENARY_END'])assert.equal(zero.timeline.filter(e=>e.type===type&&ZERO_AREA_SKILLS.some(s=>s.id===e.skillId)).length,casts.length);
 assert.equal(zero.winner,leonel.winner);
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(ZERO_CODE),defenderMercenary:snapshot(LEONEL_CODE),seed:77});assert(!pvp.result.timeline.some(e=>e.type===ZERO_AREA_EVENT));
});
test('public codex exposes five skills and acquisition lock while deployment requires ownership',async t=>{
 const data=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})),card=data.cards.find(c=>c.code===ZERO_CODE);
 assert.equal(card.basePower,3000000);assert.equal(card.title,'백금 검익');assert.equal(card.acquisitionEnabled,false);assert.equal(card.packAcquisitionEnabled,false);assert.equal(card.skills.length,5);assert(card.skills.every(s=>s.ready));
 const f=await mercenaryFixture(t,{postgres:true});
 for(const mode of ['PVE','PVP'])await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:ZERO_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 assert(!(await mercenaryAccountState(f.env,f.user)).cards.some(c=>c.code===ZERO_CODE));
 // Local fixture only: future authorized ownership must use the same server policy.
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,ZERO_CODE,'2026-10-20','2026-10-20').run();
 for(const mode of ['PVE','PVP']){await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:ZERO_CODE,revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).basePower,3000000);}
 assert((await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===ZERO_CODE).canDeploy);
});
test('approved body and sword remain unchanged; platinum wings and actual V3 assets ship',()=>{
 for(const [file,hash]of [[ZERO_ART.sourceArt,ZERO_ART.sourceArtSha256],[ZERO_ART.battleSprite,ZERO_ART.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),hash);
 for(const f of JSON.parse(fs.readFileSync(root+'appearance-approval-20261020.json')).files)assert.equal(createHash('sha256').update(fs.readFileSync(root+f.file)).digest('hex'),f.sha256);
 const m=JSON.parse(fs.readFileSync(root+'manifest.json'));assert.equal(m.backdrop.id,'ZERO_BLADE_WINGS_V1');assert.equal(m.backdrop.visualApproval,true);
 for(const p of [ZERO_ART.sourceArt,ZERO_ART.battleSprite,ZERO_ART.frame,root+m.backdrop.url,root+m.appearance.url,...Object.values(m.motion).map(s=>root+s.url),...Object.values(m.effects).map(s=>root+s.url)]){assert(isProductionFile(p),p);assert(fs.statSync(p).size>0,p);}
 for(const file of ['preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js','pve-v3/battle.bundle.js','preview/coop-defense-v1/defense.bundle.js']){const s=fs.readFileSync(file,'utf8');assert(s.includes(ZERO_AREA_EVENT),file);assert(s.includes('ZERO_MOTION_ASSETS'),file);}
});

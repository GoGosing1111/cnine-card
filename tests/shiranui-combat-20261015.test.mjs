import {validateCatalog} from '../mercenary-codex/model.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {SHIRANUI_CODE,SHIRANUI_ART,SHIRANUI_COMBAT,SHIRANUI_AREA_SKILL,SHIRANUI_AREA_EVENT,shiranuiIncomingDamage} from '../shared/mercenary-shiranui-v1.mjs';
import {JOKRO_COMBAT} from '../shared/mercenary-jokro-v1.mjs';
import {__workshopCraftTest} from '../functions/_workshop.js';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {resolveShiranuiArea} from '../functions/_mercenary_shiranui.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code=SHIRANUI_CODE,side='A',mode='PVP',power=0)=>buildMercenaryFighter({...snapshot(code),equipment:{schemaVersion:1,mode,power}},side,mode,buildFighter);
test('Shiranui exactly matches Jokro stats, links, equipment scaling, defenses and cadence',()=>{
 for(const key of ['basePower','statScale','link','speedScale','actionCredit','damageTakenScale','basicCapScale'])assert.deepEqual(SHIRANUI_COMBAT[key],JOKRO_COMBAT[key],key);
 for(const mode of ['PVE','PVP'])for(const gear of [0,1e8])for(const power of [1e5,2e7,1e9]){
  const k=fighter(SHIRANUI_CODE,'A',mode,gear),j=fighter('V-979','B',mode,gear);
  for(const field of ['attack','maxHp','defense','speed','basePower','counterImmune','controlImmune','poisonImmune'])assert.equal(k[field],j[field],field);
  applyMercenaryCombatLink(['A','B'].map((side,i)=>[...tierCards(power).map((c,n)=>buildFighter(c,n,side,null,mode)),[k,j][i]]));
  assert.equal(mercenaryEffectiveAttack(k),mercenaryEffectiveAttack(j));assert.equal(k.maxHp,j.maxHp);assert.equal(k.shield,j.shield);
  assert.deepEqual(k.skills.map(s=>s.id),mode==='PVE'?['MS-987']:[]);assert.equal(k.attackStyle,'RANGED');
 }
 const k=fighter(),a={id:'card',side:'A',hp:1},enemy={id:'enemy',side:'B',hp:1},cadence=mercenaryTurnCadence({A:[a,k],B:[enemy]});let count=0;
 for(let i=0;i<25;i++){cadence.acted(a);while(cadence.pending()){assert.equal(cadence.pending(),k);cadence.acted(k);count++;assert(count<100);}}
 assert.equal(count,78);assert.equal(shiranuiIncomingDamage(k,1000,{isMercenary:true,code:'V-055'}),0);assert.equal(shiranuiIncomingDamage(k,1000,{}),200);
});
test('Shiranui packs remain impossible even with a contaminated catalog and maximum CMS weight',()=>{
 const rules={cardWeights:{[SHIRANUI_CODE]:1000000}},cards=[{code:SHIRANUI_CODE,name:'카이론',rank:'SSS'},{code:'V-001',name:'일반',rank:'SSS'}];
 assert.equal(mercenaryAcquisitionEnabled(SHIRANUI_CODE,rules),false);
 assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);
 assert.equal(mercenaryCardChances(1000000,[SHIRANUI_CODE],rules)[0].percent,0);
 assert.deepEqual(limitedNormalCards(cards,cards,rules).map(c=>c.code),['V-001']);
 assert(!LIMITED_MERCENARIES.some(c=>c.code===SHIRANUI_CODE));
});
test('one artillery cast distributes the Jokro 1512% budget and applies one receipt per living target; PVP only fires basics',()=>{
 const actor=fighter(SHIRANUI_CODE,'A','PVE'),targets=Array.from({length:5},(_,i)=>({id:'t'+i,hp:10000,maxHp:10000,alive:true})),ratios=[],events=[];
 const args={actor,skill:SHIRANUI_AREA_SKILL,targets:[...targets,targets[0],{id:'dead',hp:0}],hit:(a,t,r)=>{ratios.push(r);return {damage:100};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit:(type,row)=>events.push({type,...row})};
 assert.equal(resolveShiranuiArea(args).length,5);assert(Math.abs(ratios.reduce((a,b)=>a+b)-15.12)<1e-9);assert.equal(events[0].type,SHIRANUI_AREA_EVENT);assert(targets.every(t=>t.hp===9900));
 assert.deepEqual(resolveShiranuiArea({...args,actor:{...actor,battleMode:'PVP'}}),[]);
 const cards=tierCards(2e7),k=snapshot(SHIRANUI_CODE);
 assert(createPveBattleV2({cards,mercenary:k,monster:{id:1,battle_power:1.6e10},seed:77}).result.timeline.some(e=>e.type===SHIRANUI_AREA_EVENT));
 assert(!createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:k,defenderMercenary:snapshot('V-988'),seed:77}).result.timeline.some(e=>e.type===SHIRANUI_AREA_EVENT));
});
test('PVP simulation matches Jokro while PVE preserves the Jokro 1512% artillery budget',()=>{
 const cards=tierCards(2e7);
 const trace=result=>result.timeline.map(e=>({type:e.type.replace('SHIRANUI','JOKRO'),actorId:e.actorId?.replace('V-987','V-979'),targetId:e.targetId?.replace('V-987','V-979'),at:e.at,turn:e.turn,damage:e.damage,absorbed:e.absorbed,targetHpAfter:e.targetHpAfter,hits:e.hits?.map(h=>({...h,targetId:h.targetId?.replace('V-987','V-979')}))}));
 const pve=code=>createPveBattleV2({cards,mercenary:snapshot(code),monster:{id:1,battle_power:1.6e10},seed:77}).result;
 const pvp=code=>createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(code),defenderMercenary:snapshot('V-979'),seed:77}).result;
 assert.deepEqual(trace(pvp(SHIRANUI_CODE)),trace(pvp('V-979')));
 const shiranui=pve(SHIRANUI_CODE).timeline.find(e=>e.type===SHIRANUI_AREA_EVENT);
 const jinmu=pve('V-979').timeline.find(e=>e.type==='MERCENARY_JOKRO_AREA');
 assert(shiranui&&jinmu);assert.equal(shiranui.at,jinmu.at);assert.equal(shiranui.turn,jinmu.turn);
 assert.equal(shiranui.damage,jinmu.damage);
});

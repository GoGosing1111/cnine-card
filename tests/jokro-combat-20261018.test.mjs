import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {JOKRO_CODE,JOKRO_COMBAT,JOKRO_AREA_SKILL,JOKRO_AREA_EVENT,jokroIncomingDamage} from '../shared/mercenary-jokro-v1.mjs';
import {JINMU_COMBAT} from '../shared/mercenary-jinmu-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {ALL_LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {resolveJokroArea} from '../functions/_mercenary_jokro.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code=JOKRO_CODE,side='A',mode='PVE',power=0)=>buildMercenaryFighter({...snapshot(code),equipment:{schemaVersion:1,mode,power}},side,mode,buildFighter);
const higher=(a,b)=>assert(Math.abs(a-b*1.2)<=2,`${a} must be 20% above ${b}`);
test('Jokro increases Jinmu stats, equipment and linked floors by 20%, full shield included; actions stay equal',()=>{
 higher(JOKRO_COMBAT.basePower,JINMU_COMBAT.basePower);
 for(const mode of ['PVE','PVP'])for(const gear of [0,1e8])for(const power of [1e5,2e7,1e9]){
  const k=fighter(JOKRO_CODE,'A',mode,gear),j=fighter('V-989','B',mode,gear);
  for(const field of ['attack','maxHp','defense'])higher(k[field],j[field]);
  for(const field of ['speed','counterImmune','controlImmune','poisonImmune'])assert.equal(k[field],j[field]);
  applyMercenaryCombatLink(['A','B'].map((side,i)=>[...tierCards(power).map((c,n)=>buildFighter(c,n,side,null,mode)),[k,j][i]]));
  higher(mercenaryEffectiveAttack(k),mercenaryEffectiveAttack(j));higher(k.maxHp,j.maxHp);higher(k.shield,j.shield);
  assert.deepEqual(k.skills.map(s=>s.id),mode==='PVE'?['MS-979']:[]);assert.equal(k.attackStyle,'MELEE');
 }
 const k=fighter(),a={id:'card',side:'A',hp:1},enemy={id:'enemy',side:'B',hp:1},cadence=mercenaryTurnCadence({A:[a,k],B:[enemy]});let count=0;
 for(let i=0;i<25;i++){cadence.acted(a);while(cadence.pending()){assert.equal(cadence.pending(),k);cadence.acted(k);count++;assert(count<100);}}
 assert.equal(count,78);assert.equal(jokroIncomingDamage(k,1000,{isMercenary:true,code:'V-055'}),0);assert.equal(jokroIncomingDamage(k,1000,{}),200);
});
test('Jokro stays outside all public acquisition candidates despite contaminated catalogs and high CMS weights',()=>{
 const rules={cardWeights:{[JOKRO_CODE]:1000000}},cards=[{code:JOKRO_CODE,name:'족로',rank:'SSS'},{code:'V-001',name:'일반',rank:'SSS'}];
 assert.equal(mercenaryAcquisitionEnabled(JOKRO_CODE,rules),false);
 assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);
 assert.equal(mercenaryCardChances(1000000,[JOKRO_CODE],rules)[0].percent,0);
 assert.deepEqual(limitedNormalCards(cards,cards,rules).map(c=>c.code),['V-001']);
 assert(!ALL_LIMITED_MERCENARIES.some(c=>c.code===JOKRO_CODE));
});
test('청룡단천 distributes 1512% once across every living target; repeated visual contacts cannot add damage',()=>{
 const actor=fighter(),targets=Array.from({length:12},(_,i)=>({id:'t'+i,hp:10000,maxHp:10000,alive:true})),ratios=[],events=[];
 const args={actor,skill:JOKRO_AREA_SKILL,targets:[...targets,targets[0],{id:'dead',hp:0},{id:'suit',hp:10,isBattleSuit:true},{id:'hidden',hp:10,untargetable:true}],hit:(a,t,r)=>{ratios.push(r);return {damage:100};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit:(type,row)=>events.push({type,...row})};
 assert.equal(resolveJokroArea(args).length,12);assert(Math.abs(ratios.reduce((a,b)=>a+b)-15.12)<1e-9);assert.equal(events.length,1);assert.equal(events[0].type,JOKRO_AREA_EVENT);assert(targets.every(t=>t.hp===9900));
 for(const change of [{battleMode:'PVP'},{hp:0},{stunned:true},{silenced:true}])assert.deepEqual(resolveJokroArea({...args,actor:{...actor,...change}}),[]);
 assert.deepEqual(JOKRO_AREA_SKILL.balance,{damageRatio:15.12,cooldownTurns:5,cost:35});
});
test('actual battle simulator emits stronger area receipts and keeps PVP basics only',()=>{
 const cards=tierCards(2e7),pve=code=>createPveBattleV2({cards,mercenary:snapshot(code),monster:{id:1,battle_power:1.6e10},seed:77}).result;
 const timeline=pve(JOKRO_CODE).timeline,jokro=timeline.filter(e=>e.type===JOKRO_AREA_EVENT),jinmu=pve('V-989').timeline.filter(e=>e.type==='MERCENARY_JINMU_AREA');
 assert(jokro.length&&jinmu.length);assert(jokro[0].damage>jinmu[0].damage*2);
 assert.equal(timeline.filter(e=>e.type==='MERCENARY_WINDUP'&&e.skillId==='MS-979').length,jokro.length,'Every cast pays its cost and starts exactly once');
 assert.equal(timeline.filter(e=>e.type==='MERCENARY_END'&&e.skillId==='MS-979').length,jokro.length,'Every cast clears its pending state so cooldown applies');
 for(const event of jokro)assert.equal(new Set(event.hits.map(h=>h.targetId)).size,event.hits.length);
 assert(!createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(JOKRO_CODE),defenderMercenary:snapshot('V-989'),seed:77}).result.timeline.some(e=>e.type===JOKRO_AREA_EVENT));
});

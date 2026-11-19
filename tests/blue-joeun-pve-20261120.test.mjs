import test from 'node:test';import assert from 'node:assert/strict';
import {BLUE_GEAR,BLUE_JOEUN_PVE,blueGearSkills,blueJoeunPveSkillGrowth} from '../shared/mercenary-blue-gear-v1.mjs';
import {BLUE_GEAR_MERCENARIES} from '../shared/mercenary-blue-gear-catalog-v1.mjs';
import {resolveRazakCast} from '../functions/_mercenary_razak.js';
import {createPveBattleV2,buildPvePlayerTeam,simulateBattleV2Preview,buildMonsterFighter} from '../functions/_battle_v2_preview.js';
import {snapshot,cards} from './helpers/helios-king-balance-20261106.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const actor=(code='V-705',level=21,mode='PVE')=>{
 const input=buildPvePlayerTeam({cards:cards(),mercenary:snapshot(code,level,mode,0)}),team=input.simulationTeamA;
 if(mode==='PVP')for(const m of team)m.battleMode='PVP';
 const r=simulateBattleV2Preview({teamA:team,teamB:[buildMonsterFighter({id:1,is_boss:1,battle_power:1e13})],maxActions:1});
 return {...r.openingMercenaries.A[0],hp:100,maxHp:100,alive:true,damageDealt:0};
};
test('only Joeun PVE uses double base skill damage, shared two-action recovery and twenty energy',()=>{
 for(const [code,p] of Object.entries(BLUE_GEAR)){
  assert.deepEqual(p.skills.map(s=>s.balance),[{damageRatio:4.4,cooldownTurns:3,cost:25},{damageRatio:5.6,cooldownTurns:3,cost:25}]);
  const pve=blueGearSkills(p,'PVE');close(pve.reduce((n,s)=>n+s.balance.damageRatio,0),(34/3)*(code==='V-705'?2:1));
  assert(pve.every(s=>s.balance.cost===(code==='V-705'?20:25)&&s.balance.cooldownTurns===(code==='V-705'?2:3)));
 }
 assert.equal(BLUE_JOEUN_PVE.code,'V-705');
});
test('trusted PVE hit calculation applies level 1/11/21 skill growth once, including divided targets',()=>{
 for(const level of [1,11,21])for(const index of [0,1]){
  const a=actor('V-705',level),skill=blueGearSkills(BLUE_GEAR['V-705'],'PVE')[index],ratios=[],events=[],targets=Array.from({length:index?7:1},(_,i)=>({id:'B'+i,row:'FRONT',hp:1e6,maxHp:1e6,alive:true}));
  const bonus=level===1?1:level===11?1.1:1.2;close(blueJoeunPveSkillGrowth(a),bonus);
  const result=resolveRazakCast({actor:a,skill:{...skill,balance:{damageRatio:99999,cooldownTurns:0,cost:0}},targets,
   hit:(_,target,ratio)=>{ratios.push(ratio);return {damage:Math.round(ratio*100)};},damage:(t,n)=>({hpDamage:n,absorbed:0}),knockout:()=>{},emit:(type,data)=>events.push({type,...data})});
  close(ratios.reduce((n,v)=>n+v,0),skill.balance.damageRatio*bonus);assert.equal(result.length,targets.length);assert.equal(events.length,1);
 }
});
test('PvP, other Blue Gear, and unlearned snapshots do not gain Joeun PVE skill growth',()=>{
 for(const code of ['V-701','V-702','V-703','V-704','V-058','V-059'])assert.equal(blueJoeunPveSkillGrowth(actor(code)),1);
 assert.equal(blueJoeunPveSkillGrowth({...actor(),battleMode:'PVP'}),1);
 assert.equal(blueJoeunPveSkillGrowth({...actor(),mercenaryLevelApplied:false}),1);
 const a={...actor(),battleMode:'PVP'},skill=BLUE_GEAR['V-705'].skills[0],ratios=[];
 resolveRazakCast({actor:a,skill,targets:[{id:'B',hp:1e6,maxHp:1e6,alive:true}],hit:(_,t,r)=>{ratios.push(r);return {damage:1};},damage:()=>({hpDamage:1,absorbed:0}),knockout:()=>{},emit:()=>{}});
 assert.deepEqual(ratios,[4.4]);
});
test('real server sequence sustains both strengthened techniques without duplicate impacts',()=>{
 const b=createPveBattleV2({cards:cards(),mercenary:snapshot('V-705',21,'PVE',0),monster:{id:1,is_boss:1,battle_power:1e13},seed:11});
 const m=b.teams.A.mercenaries[0],events=b.result.timeline.filter(e=>e.actorId===m.id),casts=events.filter(e=>e.type==='MERCENARY_BLUE_GEAR_STRIKE');
 assert.deepEqual([...new Set(casts.map(e=>e.skillId))].sort(),['MS-709','MS-710']);assert(casts.length>6);
 for(const e of casts)assert.equal(new Set(e.hits.map(h=>h.targetId)).size,e.hits.length);
 assert.equal(m.mercenaryLevel.level,21);assert.equal(m.position,'MIDDLE');assert(m.skills.every(s=>s.balance.cost===20&&s.balance.cooldownTurns===2));
});
test('public codex reports the PvE exception and retains PvP values and other four descriptions',()=>{
 const doc=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61}),joeun=doc.cards.find(c=>c.code==='V-705');
 assert.equal(validateCatalog(doc,{forDisplay:true}).cards.length,doc.cards.length);
 assert.match(joeun.combatLinkDescription,/PvE.*880%/);assert.match(joeun.combatLinkDescription,/공통 재사용 2행동/);assert.match(joeun.combatLinkDescription,/PvP.*25.*3행동/);
 for(const code of ['V-701','V-702','V-703','V-704'])assert.match(doc.cards.find(c=>c.code===code).combatLinkDescription,/에너지 25.*3행동/);
 const card=BLUE_GEAR_MERCENARIES.find(c=>c.code==='V-705');assert.equal(card.skills[0].balance.damageRatio,4.4);assert.equal(card.skills[0].pveBalance.damageRatio,8.8);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {applyMercenaryBalanceV2097,MERCENARY_SKILL_BALANCE_V2097 as proposals} from '../shared/mercenary-skill-balance-v2097.mjs';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat,isMercenarySupportSkill} from '../functions/_mercenary_combat.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
const document=applyMercenaryBalanceV2097(seed.document,seed.catalog);
const snapshot=skills=>({code:'V-001',rank:'S',name:'검수 용병',role:'VANGUARD',position:'FRONT',level:1,basePower:10000,stats:{hp:10000000,attack:1000,defense:100,speed:1000},skills,combat,sourceArt:'/art.png',battleSprite:'/sprite.png'});
function harness(id,count=1){
 const skill=document.skills.find(s=>s.id===id),a=buildMercenaryFighter(snapshot([skill]),'A','PVP'),ally={...buildMercenaryFighter(snapshot([]),'A','PVP'),id:'A:ALLY',slot:0,isMercenary:false,hp:100};
 const targets=Array.from({length:count},(_,i)=>({...buildMercenaryFighter(snapshot([]),'B','PVP'),id:'B:'+i,slot:i,isMercenary:false}));
 const events=[],runtime=mercenaryCombat({teams:{A:[a,ally],B:targets},hit:(actor,target,ratio)=>({damage:actor.attack*ratio,dodge:false}),damage:(t,n)=>{const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.shield-=absorbed;t.hp-=hpDamage;runtime.onDamage(t,{absorbed,hpDamage});return {absorbed,hpDamage};},knockout:t=>{if(t.hp<=0)t.alive=false;},emit:(type,data)=>events.push({type,...data,action:a.actions}),clock:()=>0});
 const turn=(actor=a)=>{actor.actions++;return runtime.beforeAction(actor);};
 return {a,ally,targets,events,runtime,turn,skill};
}
test('explicit balance operation preserves ranks, assignments, rules and notes; rejects catalog drift',()=>{
 const original=structuredClone(seed.document),result=applyMercenaryBalanceV2097(original,seed.catalog);
 assert.equal(result.skills.length,30);assert.equal(new Set(proposals.map(s=>s.id)).size,26);
 assert.deepEqual(result.mercenaries,original.mercenaries);assert.deepEqual(result.assignments,original.assignments);
 for(const row of result.skills){const before=original.skills.find(s=>s.id===row.id);assert.deepEqual({...row,balance:before.balance,review:before.review},before);assert.equal(row.review,'REVIEWED');}
 assert.deepEqual(original,seed.document);
 const changed=structuredClone(original);changed.skills[0].mechanic='OTHER';assert.throws(()=>applyMercenaryBalanceV2097(changed,seed.catalog));
});
test('all 26 approved balances spend energy once per cast, respect cooldown and resolve real mechanics',()=>{
 for(const proposal of proposals){
  // v2119: 피해가 없는 보조 스킬은 행동을 소모하지 않고 기본 공격을 함께 한다.
  const h=harness(proposal.id);assert.equal(h.turn(),!isMercenarySupportSkill(proposal));assert.equal(h.runtime.state(h.a).energy,100-proposal.balance.cost,proposal.id);
  for(let i=0;i<3;i++)h.turn();
  assert.equal(h.runtime.state(h.a).energy,100-proposal.balance.cost,proposal.id+' stages cannot charge twice');
  assert.ok(h.events.some(e=>e.type==='MERCENARY_END'),proposal.id);
  for(let i=0;i<15;i++)if(!h.turn())h.runtime.afterBasic(h.a,h.targets[0],true);
  const starts=h.events.filter(e=>e.type==='MERCENARY_WINDUP'&&!e.continuation);
  for(let i=1;i<starts.length;i++)assert.ok(starts[i].action-starts[i-1].action>=proposal.balance.cooldownTurns,proposal.id);
  assert.ok(h.runtime.state(h.a).energy>=0&&h.runtime.state(h.a).energy<=100);
 }
});
test('authored multihit and area budgets are totals, including target loss and one boss',()=>{
 for(const [id,count,total] of [['MS-009',3,2400],['MS-021',2,2400],['MS-037',1,1800],['MS-040',3,2100],['MS-040',1,2100],['MS-005',1,2380],['MS-043',1,2000],['MS-027',2,1550]]){
  const h=harness(id,count);for(let i=0;i<4;i++)h.turn();const sum=h.events.filter(e=>e.type==='MERCENARY_HIT').reduce((n,e)=>n+e.damage+e.absorbed,0);assert.ok(Math.abs(sum-total)<.001,`${id}: ${sum}`);
 }
 const h=harness('MS-040',3);h.turn();h.targets[1].hp=0;h.targets[1].alive=false;for(let i=0;i<3;i++)h.turn();assert.equal(h.events.filter(e=>e.type==='MERCENARY_HIT').reduce((n,e)=>n+e.damage,0),1400);
 // v2119: 저격은 시전한 그 행동에서 발사되므로 시전과 타격 사이에 표적을 잃는 구간이 없다.
 const k=harness('MS-004',2);k.turn();const selected=k.events[0].targetId,killed=k.targets.find(t=>t.id===selected);
 assert.ok(killed.hp<10000000);assert.equal(k.targets.find(t=>t.id!==selected).hp,10000000);
 killed.hp=0;killed.alive=false;k.turn();assert.ok(!k.events.some(e=>e.type==='MERCENARY_CANCEL'));
});
test('support balance fields mean healing or finite protection; pure support never deals invented damage',()=>{
 for(const id of ['MS-003','MS-013','MS-016']){const h=harness(id);for(let i=0;i<3;i++)h.turn();assert.equal(h.targets[0].hp,10000000);assert.ok(h.events.some(e=>['MERCENARY_BUFF','MERCENARY_DEBUFF'].includes(e.type)));}
 // 정화는 시전 행동에서, 회복은 그다음 행동에서 온다(둘 다 행동을 소모하지 않는다).
 const heal=harness('MS-018');heal.turn();assert.equal(heal.ally.hp,100);heal.turn();assert.equal(heal.ally.hp,1900);
 const barrier=harness('MS-028');barrier.turn();assert.equal(barrier.a.shield+barrier.ally.shield,1400);
 const guard=harness('MS-011');guard.turn();assert.equal(guard.runtime.beforeBasicDamage(guard.targets[0],guard.ally,10000),9250);assert.equal(guard.runtime.beforeBasicDamage(guard.targets[0],guard.ally,10000),10000);
});
test('configured skills execute in PVE and PVP without entering the five-card array',()=>{
 const cards=Array.from({length:5},(_,i)=>({id:String(i+1),title:'기본 카드',rarity:'FUR',power:10000,power_type:'ATTACK'}));
 const mercenary=snapshot(document.skills.filter(s=>['MS-001','MS-021'].includes(s.id)));
 for(const mode of ['PVE','PVP']){const battle=mode==='PVE'?createPveBattleV2({cards,mercenary,monster:{id:1,name:'검수 적',battle_power:100000},seed:17}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:17});
  assert.equal(battle.teams.A.cards.length,5);assert.equal(battle.teams.A.mercenaries.length,1);assert.ok(battle.result.timeline.some(e=>e.type==='MERCENARY_HIT'),mode);if(mode==='PVE')assert.ok(Number.isFinite(battle.result.damageBreakdown.mercenary));
 }
});

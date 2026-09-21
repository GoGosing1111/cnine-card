import test from 'node:test';
import assert from 'node:assert/strict';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {MERCENARY_SKILL_BALANCE_V2103 as balances} from '../shared/mercenary-skill-balance-v2103.mjs';
import {mercenaryGuardSkillText} from '../shared/mercenary-guard-balance-v1.mjs';

const skill=mechanic=>({...seed.document.skills.find(s=>s.mechanic===mechanic),review:'REVIEWED',balance:{damageRatio:mechanic==='INTERCEPT_ONE_HIT'?0:1,cost:15,cooldownTurns:3}});
function harness({mechanic='LOCKED_THREAT_SHOT',miss=false}={}){
 const make=(code,side,skills,role,rank)=>buildMercenaryFighter({code,name:code,rank,role,position:side==='A'?'FRONT':'REAR',basePower:70000,level:1,stats:{hp:10000,attack:1000,defense:100,speed:100},combat,skills},side,'PVP');
 const guard=make('V-003','A',[skill('INTERCEPT_ONE_HIT')],'GUARDIAN','S'),enemy=make('V-004','B',[skill(mechanic)],'SNIPER','SS');
 const ally={id:'A:ALLY',side:'A',slot:0,row:'BACK',hp:5000,maxHp:10000,shield:0,actions:0,alive:true,attack:100,damageDealt:0},events=[];
 const teams={A:[guard,ally],B:[enemy]};
 const damage=(t,n)=>{const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.shield-=absorbed;t.hp-=hpDamage;runtime.onDamage(t,{absorbed,hpDamage});return {absorbed,hpDamage};};
 const runtime=mercenaryCombat({teams,hit:()=>({damage:1000,dodge:miss}),damage,knockout:t=>{if(t.hp<=0)t.alive=false;},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 return {guard,enemy,ally,events,teams,runtime,damage,turn:(a=guard)=>{a.actions++;return runtime.beforeAction(a);}};
}
const intercepts=h=>h.events.filter(e=>e.type==='MERCENARY_INTERCEPT');

test('guard installs immediately on another ally and shares its action with one 85% basic',()=>{
 const h=harness();h.guard.hp=100;
 assert.equal(h.turn(),false);assert.equal(h.runtime.state(h.guard).pending,null);
 assert.equal(h.events.find(e=>e.type==='MERCENARY_BUFF').targetId,h.ally.id);
 assert.equal(h.runtime.state(h.guard).energy,85);assert.equal(h.runtime.basicMultiplier(h.guard),.85);
 h.runtime.afterBasic(h.guard,h.enemy,true);assert.equal(h.runtime.state(h.guard).energy,85,'installation attack cannot refund its cost');
 assert.equal(h.turn(),false);assert.equal(h.runtime.basicMultiplier(h.guard),1);
 h.runtime.afterBasic(h.guard,h.enemy,true);assert.equal(h.runtime.state(h.guard).energy,95);
 assert.equal(h.guard.attack,1000);assert.equal(h.guard.skills[0].balance.damageRatio,0);
});
test('a living guard link prevents repeated resource spending and uses protected ally actions for expiry',()=>{
 const h=harness();h.turn();for(let i=0;i<9;i++)h.turn();
 assert.equal(h.ally.actions,0);assert.equal(h.events.filter(e=>e.type==='MERCENARY_WINDUP').length,1);assert.equal(h.runtime.state(h.guard).energy,85);
 h.ally.actions=1;assert.equal(h.runtime.beforeBasicDamage(h.enemy,h.ally,1000),300);
 const expired=harness();expired.turn();expired.ally.actions=2;
 assert.equal(expired.runtime.beforeBasicDamage(expired.enemy,expired.ally,1000),1000);assert.equal(intercepts(expired).length,0);
});
test('single skill damage and ordinary attacks each transfer one hit without recursive protection or invented damage',()=>{
 for(const kind of ['basic','skill']){
  const h=harness();h.turn();
  if(kind==='basic')h.damage(h.ally,h.runtime.beforeBasicDamage(h.enemy,h.ally,1000));else h.turn(h.enemy);
  assert.equal(h.ally.hp,4700);assert.equal(h.guard.hp,9300);assert.equal(intercepts(h).length,1);
  assert.equal(h.runtime.beforeBasicDamage(h.enemy,h.ally,1000),1000);
  const event=intercepts(h)[0];assert.equal(event.actorId,h.guard.id);assert.equal(event.sourceAttackerId,h.enemy.id);assert.equal(event.protectedTargetId,h.ally.id);
  assert.equal(h.guard.damageDealt,0);assert.equal(h.enemy.damageDealt,kind==='basic'?700:1000);
 }
});
test('only the damage actually taken by a dying protector is removed from the original hit',()=>{
 const h=harness();h.guard.hp=100;h.guard.shield=50;h.turn();
 const rest=h.runtime.beforeBasicDamage(h.enemy,h.ally,1000);h.damage(h.ally,rest);
 assert.equal(rest,850);assert.equal(h.guard.hp,0);assert.equal(h.guard.shield,0);assert.equal(h.guard.alive,false);
 assert.equal(h.ally.hp,4150);assert.equal(intercepts(h).length,1);assert.equal(h.enemy.damageDealt,150);
});
test('misses and zero damage preserve the ward; area, poison and counter paths bypass it',()=>{
 const miss=harness({miss:true});miss.turn();miss.turn(miss.enemy);assert.equal(intercepts(miss).length,0);
 assert.equal(miss.runtime.beforeBasicDamage(miss.enemy,miss.ally,0),0);assert.ok(miss.runtime.buffs.get(miss.ally.id).intercept);
 for(const mechanic of ['RIFT_MARK_DETONATION','ADVANCE_SUPPRESSION','DISTRIBUTED_CORAL_VOLLEY']){
  const h=harness({mechanic});h.ally.row='FRONT';h.turn();h.turn(h.enemy);h.turn(h.enemy);
  assert.equal(intercepts(h).length,0,mechanic);assert.ok(h.runtime.buffs.get(h.ally.id).intercept,mechanic);
 }
 const h=harness();h.turn();h.runtime.debuffs.set(h.ally.id,{poison:{actor:h.enemy,skill:skill('INFILTRATE_DELAYED_VENOM'),damage:1000,due:1}});h.turn(h.ally);
 assert.equal(h.ally.hp,4000);assert.equal(intercepts(h).length,0);assert.ok(h.runtime.buffs.get(h.ally.id).intercept);
 h.runtime.state(h.enemy).riposte={skill:skill('MELEE_PARRY_RIPOSTE'),target:h.ally};h.runtime.afterBasic(h.guard,h.enemy,true);
 assert.equal(h.ally.hp,3000);assert.equal(intercepts(h).length,0);
});
test('a two-shot sniper spends one protection charge; its second impact hits the original ally',()=>{
 const h=harness({mechanic:'ABYSS_SHIELD_ECHO'});h.turn();h.turn(h.enemy);
 assert.equal(intercepts(h).length,1);assert.equal(h.guard.hp,9300);assert.equal(h.ally.hp,3700);
});
test('death, stun and silence cannot provide active protection and cannot start a new link',()=>{
 for(const control of ['dead','stunned','silenced']){
  const h=harness();h.turn();if(control==='dead'){h.guard.hp=0;h.guard.alive=false;}else h.guard[control]=true;
  assert.equal(h.runtime.beforeBasicDamage(h.enemy,h.ally,1000),1000);assert.equal(intercepts(h).length,0);
  const fresh=harness();if(control==='dead'){fresh.guard.hp=0;fresh.guard.alive=false;}else fresh.guard[control]=true;
  fresh.turn();assert.equal(fresh.events.length,0);assert.equal(fresh.runtime.state(fresh.guard).energy,100);
 }
});
test('no valid ally means a full basic with no cost; a lost target allows the next ready cast to choose a new ally',()=>{
 const h=harness();h.ally.hp=0;h.ally.alive=false;
 assert.equal(h.turn(),false);assert.equal(h.runtime.basicMultiplier(h.guard),1);assert.equal(h.runtime.state(h.guard).energy,100);
 const k=harness();k.turn();k.ally.hp=0;k.ally.alive=false;
 const replacement={...k.ally,id:'A:NEW',hp:3000,alive:true};k.teams.A.push(replacement);
 k.turn();assert.equal(k.events.filter(e=>e.type==='MERCENARY_BUFF').length,1,'cooldown is still required');
 k.turn();k.turn();assert.equal(k.events.filter(e=>e.type==='MERCENARY_BUFF').at(-1).targetId,replacement.id);
 assert.equal(k.runtime.state(k.guard).energy,70);assert.equal(k.runtime.state(k.guard).pending,null);
});
test('guardian cycles do not chain damage transfers or overwrite another source link',()=>{
 const h=harness();h.turn();
 h.runtime.buffs.set(h.guard.id,{intercept:{actor:h.ally,skill:skill('INTERCEPT_ONE_HIT'),percent:40,expires:20}});
 const rest=h.runtime.beforeBasicDamage(h.enemy,h.ally,1000);assert.equal(rest,300);assert.equal(intercepts(h).length,1);assert.equal(h.ally.hp,5000);
 h.turn();assert.equal(h.events.filter(e=>e.type==='MERCENARY_BUFF').length,1);
});
const released=(code,rank,ids)=>({...seed.catalog.cards.find(c=>c.code===code),...seed.document.mercenaries.find(c=>c.code===code),rank,level:1,statMode:'RANK_FIXED',combat,skills:ids.map(id=>({...seed.document.skills.find(s=>s.id===id),review:'REVIEWED',balance:balances.find(s=>s.id===id).balance}))});
test('canonical PvP keeps 5+1, one actor action and a real basic on the immediate guard turn',()=>{
 const cards=['ATTACK','DEFENSE','SPEED','HP','ATTACK'].map((power_type,i)=>({id:String(i+1),power:1000000,power_type}));
 const battle=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:released('V-003','S',['MS-003']),defenderMercenary:released('V-004','SS',['MS-004']),seed:7919});
 const timeline=battle.result.timeline,ward=timeline.find(e=>e.type==='MERCENARY_BUFF'&&e.mechanic==='INTERCEPT_ONE_HIT');
 assert.ok(ward);assert.notEqual(ward.actorId,ward.targetId);
 assert.ok(timeline.some(e=>e.type==='TURN'&&e.actorId===ward.actorId&&e.at===ward.at));
 assert.ok(timeline.some(e=>e.type==='MERCENARY_INTERCEPT'));assert.equal(battle.teams.A.cards.length,5);assert.equal(battle.teams.A.mercenaries.length,1);
});
test('public guard rules describe the actual mechanic without changing CMS ranks, assignments or balances',()=>{
 const doc=structuredClone(seed.document);doc.assignments.find(a=>a.code==='V-003').skillIds=['MS-003'];
 const original=JSON.stringify(doc),view=mercenaryCodexDocument({payload_json:original,revision:55,updated_at:'2026-09-17'}).cards.find(c=>c.code==='V-003');
 assert.match(view.skills[0].trigger,/자신을 제외/);assert.match(view.skills[0].effect,/단일 용병 공격 스킬/);assert.match(view.skills[0].procRule,/85%/);
 assert.deepEqual(view.skills[0].balance,doc.skills.find(s=>s.id==='MS-003').balance);assert.equal(JSON.stringify(doc),original);
 const unrelated=doc.skills.find(s=>s.id==='MS-004');assert.equal(mercenaryGuardSkillText(unrelated),unrelated);
});

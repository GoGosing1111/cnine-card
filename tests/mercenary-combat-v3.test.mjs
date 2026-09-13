import test from 'node:test';import assert from 'node:assert/strict';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
const card=(i)=>({id:`TEST-${i}`,title:`카드 ${i}`,rarity:'FUR',power:10000,power_type:'ATTACK'}),cards=Array.from({length:5},(_,i)=>card(i));
const skill=mechanic=>({...structuredClone(seed.document.skills.find(s=>s.mechanic===mechanic)),balance:{damageRatio:1,cooldownTurns:8,cost:10},review:'REVIEWED'});
const snapshot=(skills=[])=>({code:'V-001',rank:'C',name:'아우렌',role:'VANGUARD',position:'FRONT',level:1,basePower:10000,stats:{hp:10000,attack:1000,defense:100,speed:100},skills,combat,sourceArt:'/art.png',battleSprite:'/sprite.png'});
function harness(mechanic,{missAt=0}={}){let hitIndex=0;const a=buildMercenaryFighter(snapshot([skill(mechanic)]),'A','PVP'),b=buildMercenaryFighter({...snapshot(),code:'V-002'},'B','PVP'),c=buildMercenaryFighter({...snapshot(),code:'V-003'},'A','PVP');c.hp=100;c.isMercenary=false;c.slot=0;b.isMercenary=false;b.slot=0;
 const events=[],teams={A:[a,c],B:[b]},runtime=mercenaryCombat({teams,hit:(_a,_t,m)=>({damage:1000*m,dodge:++hitIndex===missAt}),damage:(t,d)=>{const absorbed=Math.min(t.shield,d),hpDamage=Math.min(t.hp,d-absorbed);t.shield-=absorbed;t.hp-=hpDamage;const result={absorbed,hpDamage};runtime.onDamage(t,result);return result;},knockout:t=>{if(t.hp<=0)t.alive=false;},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 const turn=actor=>{actor.actions++;return runtime.beforeAction(actor);};return {a,b,c,teams,events,runtime,turn};}
test('every catalog mechanic executes a distinct server event path',()=>{
 for(const s of seed.document.skills){const h=harness(s.mechanic);h.b.shield=1000;for(let i=0;i<5;i++)h.turn(h.a);assert.ok(h.events.some(e=>e.type==='MERCENARY_WINDUP'&&e.skillId===s.id),s.id);assert.ok(h.events.some(e=>!['MERCENARY_WINDUP','MERCENARY_END'].includes(e.type)),s.id);}
});
test('locked sniper cannot transfer its shot when the announced target dies',()=>{const h=harness('LOCKED_THREAT_SHOT');const extra={...h.b,id:'B:OTHER',slot:1,row:'FRONT'};h.teams.B.push(extra);h.turn(h.a);h.b.hp=0;h.b.alive=false;h.turn(h.a);assert.equal(extra.hp,10000);assert.ok(h.events.some(e=>e.type==='MERCENARY_CANCEL'));});
test('parry and approach suppression require a classified melee basic; a front-row gun is still ranged',()=>{
 for(const style of ['RANGED','CAST',undefined]){const h=harness('MELEE_PARRY_RIPOSTE');h.turn(h.a);h.turn(h.a);h.b.attackStyle=style;assert.equal(h.runtime.beforeBasicDamage(h.b,h.a,100),100);h.runtime.afterBasic(h.b,h.a,true);assert.ok(!h.events.some(e=>e.type==='MERCENARY_RIPOSTE'));}
 const h=harness('MELEE_PARRY_RIPOSTE');h.turn(h.a);h.turn(h.a);h.b.attackStyle='MELEE';assert.equal(h.runtime.beforeBasicDamage(h.b,h.a,100),60);h.runtime.afterBasic(h.b,h.a,true);assert.ok(h.events.some(e=>e.type==='MERCENARY_RIPOSTE'));
 for(const style of ['RANGED','MELEE']){const s=harness('ADVANCE_SUPPRESSION');s.b.attackStyle=style;s.b.gauge=70;s.turn(s.a);s.turn(s.a);assert.equal(s.b.gauge,style==='MELEE'?50:70);}
});
test('two-stage rift keeps the original total budget, permits cleanse, and delays the next basic',()=>{const h=harness('RIFT_MARK_DETONATION'),extra={...h.b,id:'B:OTHER',slot:1};h.teams.B.push(extra);h.turn(h.a);h.turn(h.a);assert.equal(h.b.hp,9750);assert.equal(extra.hp,9750);h.runtime.cleanse(h.b);h.turn(h.a);assert.equal(h.b.hp,9750);assert.equal(extra.hp,9500);assert.equal(h.runtime.state(h.a).reload,true);});
test('first-shot focus is lost on absorbed shield contact and is not recharged by a kill',()=>{const h=harness('UNDISTURBED_FIRST_SHOT');h.turn(h.a);h.runtime.onDamage(h.a,{hpDamage:0,absorbed:1});h.turn(h.a);assert.equal(h.events.find(e=>e.type==='MERCENARY_FOCUS').focused,false);h.a.actions=100;h.turn(h.a);assert.equal(h.events.filter(e=>e.type==='MERCENARY_WINDUP').length,1);});
test('interception conserves incoming damage and affects only one direct hit',()=>{const h=harness('INTERCEPT_ONE_HIT');h.turn(h.a);h.turn(h.a);const amount=h.runtime.beforeBasicDamage(h.b,h.c,100);assert.equal(amount,60);assert.equal(h.a.hp,9960);assert.equal(h.runtime.beforeBasicDamage(h.b,h.c,100),100);});
test('interception records the protecting actor and original damage owner separately',()=>{const h=harness('INTERCEPT_ONE_HIT');h.turn(h.a);h.turn(h.a);h.runtime.beforeBasicDamage(h.b,h.c,100);const e=h.events.find(e=>e.type==='MERCENARY_INTERCEPT');assert.equal(e.actorId,h.a.id);assert.equal(e.sourceAttackerId,h.b.id);assert.equal(h.b.damageDealt,40);assert.equal(h.a.damageDealt,0);});
test('zero ratio cannot become a default full-strength hit, silence cannot start a new skill',()=>{const h=harness('LOCKED_THREAT_SHOT');h.a.skills[0].balance.damageRatio=0;h.a.silenced=true;assert.equal(h.turn(h.a),false);assert.equal(h.events.length,0);h.a.silenced=false;h.turn(h.a);h.turn(h.a);assert.equal(h.b.hp,h.b.maxHp);});
test('area targets share the same authored stage and repeats cannot recharge or add offender marks',()=>{const h=harness('RIFT_MARK_DETONATION');h.teams.B.push({...h.b,id:'B:extra',slot:1});h.turn(h.a);h.turn(h.a);assert.deepEqual(h.events.filter(e=>e.type==='MERCENARY_HIT').map(e=>e.skillPhaseIndex),[0,0]);h.turn(h.a);assert.deepEqual(h.events.filter(e=>e.type==='MERCENARY_HIT').map(e=>e.skillPhaseIndex),[0,0,1,1]);const r=harness('REPEAT_OFFENDER_RESTRAINT');r.runtime.afterBasic(r.b,r.c,true,{additional:true});assert.equal(r.runtime.debuffs.get(r.b.id)?.offender,undefined);});
test('orders consume on a basic only, barrier budget is shared and does not stack without bound',()=>{const h=harness('NEXT_BASIC_ORDER');h.turn(h.a);h.turn(h.a);assert.equal(h.runtime.basicMultiplier(h.c),1.15);assert.equal(h.runtime.basicMultiplier(h.c),1);const f=harness('FRONT_SHARED_BARRIER');f.turn(f.a);f.turn(f.a);assert.equal(f.a.shield+f.c.shield,1000);f.a.actions=20;f.turn(f.a);f.turn(f.a);assert.equal(f.a.shield+f.c.shield,1000);});
test('cleanse removes poison before the separately timed heal and never revives a lost target',()=>{const h=harness('CLEANSE_THEN_MEND');h.runtime.debuffs.set(h.c.id,{poison:{damage:99}});h.turn(h.a);h.turn(h.a);assert.equal(h.runtime.debuffs.get(h.c.id).poison,undefined);assert.equal(h.c.hp,100);h.c.hp=0;h.c.alive=false;h.turn(h.a);assert.equal(h.c.hp,0);assert.ok(!h.events.some(e=>e.type==='MERCENARY_HEAL'));});
test('PVP mirror and PVE keep exactly five cards, one separate mercenary, one independent suit',()=>{
 const merc=snapshot([skill('TWO_BEAT_FOLLOWUP')]);merc.stats.hp=100000;merc.stats.speed=2000;const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:merc,defenderMercenary:merc,seed:12});assert.equal(pvp.teams.A.cards.length,5);assert.equal(pvp.teams.B.cards.length,5);assert.equal(pvp.result.final.A.length,5);assert.equal(pvp.result.final.B.length,5);assert.equal(pvp.teams.A.mercenaries[0].id,'A:MERCENARY:V-001');assert.equal(pvp.teams.B.mercenaries[0].id,'B:MERCENARY:V-001');assert.ok(pvp.result.timeline.some(e=>e.type==='MERCENARY_WINDUP'));
 const pve=createPveBattleV2({cards,mercenary:merc,battleSuit:{code:'QA_SUIT',name:'검수 지원 슈트',pvePower:10000},monster:{id:1,name:'검수 적',battle_power:100000},seed:17});assert.equal(pve.teams.A.cards.length,5);assert.equal(pve.result.final.A.length,5);assert.equal(pve.result.final.mercenaries.A.length,1);assert.equal(pve.teams.A.supports.length,1);assert.equal(pve.teams.A.supports[0].untargetable,true);assert.notEqual(pve.teams.A.supports[0].id,pve.teams.A.mercenaries[0].id);assert.ok(pve.result.damageBreakdown.mercenary>=0);
 assert.deepEqual(createPvpBattleV2({attackerCards:cards,defenderCards:cards,seed:4}),createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:null,defenderMercenary:null,seed:4}));
});


test('duel oath protects only its caster once and a different basic target consumes it',()=>{
 const h=harness('DUEL_OATH');h.turn(h.a);h.turn(h.a);assert.equal(h.runtime.beforeBasicDamage(h.b,h.a,100),60);assert.equal(h.runtime.beforeBasicDamage(h.b,h.a,100),100);
 const g=harness('DUEL_OATH');g.turn(g.a);g.turn(g.a);assert.equal(g.runtime.beforeBasicDamage(g.b,g.c,100),100);assert.equal(g.runtime.beforeBasicDamage(g.b,g.a,100),100);
});
test('observed shield break cannot transfer its extra budget into HP',()=>{
 const h=harness('OBSERVED_SHIELD_BREAK');h.b.shield=2000;h.runtime.buffs.set(h.b.id,{mercBarrier:1800});h.turn(h.a);h.turn(h.a);assert.equal(h.b.shield,800);assert.equal(h.b.hp,10000);assert.equal(h.runtime.buffs.get(h.b.id).mercBarrier,600);
 const g=harness('OBSERVED_SHIELD_BREAK');g.b.shield=100;g.turn(g.a);g.turn(g.a);assert.equal(g.b.hp,9100);assert.equal(g.b.shield,0);
});
test('moon draw uses a bounded missing-health multiplier and always owes recovery',()=>{
 const h=harness('WOUNDED_MOON_DRAW');h.b.hp=5000;h.turn(h.a);h.turn(h.a);assert.equal(h.b.hp,3750);assert.equal(h.runtime.state(h.a).reload,true);
 const g=harness('WOUNDED_MOON_DRAW');g.b.hp=1;g.turn(g.a);g.turn(g.a);assert.equal(g.b.hp,0);assert.equal(g.runtime.state(g.a).reload,true);
});
test('standfast divides a finite budget without adding HP or shield and expires with its source',()=>{
 const h=harness('FRONT_STAND_FAST');h.turn(h.a);h.turn(h.a);assert.equal(h.a.shield+h.c.shield,0);assert.equal(h.runtime.beforeBasicDamage(h.b,h.a,10000),9500);assert.equal(h.runtime.beforeBasicDamage(h.b,h.a,10000),10000);h.a.actions+=10;assert.equal(h.runtime.beforeBasicDamage(h.b,h.c,100),100);
});
test('thorn seal is cleansable, consumes once and never responds to additional attacks',()=>{
 const h=harness('THORN_RECOIL_SEAL');h.turn(h.a);h.turn(h.a);assert.equal(h.b.hp,9400);h.runtime.afterBasic(h.b,h.c,true,{additional:true});assert.equal(h.b.hp,9400);h.runtime.afterBasic(h.b,h.c,true);assert.equal(h.b.hp,9000);h.runtime.afterBasic(h.b,h.c,true);assert.equal(h.b.hp,9000);
 const g=harness('THORN_RECOIL_SEAL');g.turn(g.a);g.turn(g.a);g.runtime.cleanse(g.b);g.runtime.afterBasic(g.b,g.c,true);assert.equal(g.b.hp,9400);
});
test('abyss echo caps absorbed-shield bonus and first miss or target loss cancels its follow-up',()=>{
 const h=harness('ABYSS_SHIELD_ECHO');h.b.shield=1000;h.turn(h.a);h.turn(h.a);h.turn(h.a);assert.equal(h.b.hp,9600);assert.equal(h.b.shield,0);
 const g=harness('ABYSS_SHIELD_ECHO',{missAt:1});g.turn(g.a);g.turn(g.a);g.turn(g.a);assert.equal(g.b.hp,10000);assert.equal(g.events.filter(e=>e.type==='MERCENARY_HIT').length,1);
 const k=harness('ABYSS_SHIELD_ECHO');k.turn(k.a);k.turn(k.a);k.b.hp=0;k.b.alive=false;k.teams.B.push({...k.b,id:'B:replacement',hp:10000,alive:true});k.turn(k.a);assert.equal(k.teams.B[1].hp,10000);
});
test('dancing volley reannounces different living targets and conserves its three-shot budget',()=>{
 const h=harness('DANCING_TARGET_VOLLEY');h.teams.B.push({...h.b,id:'B:weak',slot:1,hp:3000},{...h.b,id:'B:middle',slot:2,hp:6000});for(let i=0;i<4;i++)h.turn(h.a);const hits=h.events.filter(e=>e.type==='MERCENARY_HIT');assert.deepEqual(hits.map(e=>e.targetId),['B:weak','B:middle','B:weak']);assert.ok(Math.abs(hits.reduce((n,e)=>n+e.damage+e.absorbed,0)-1000)<.001);assert.equal(h.events.filter(e=>e.type==='MERCENARY_WINDUP').length,3);
});
test('platinum suppression requires every hit and does not consume on a basic attack',()=>{
 const h=harness('PLATINUM_FOCUS_LOCK');for(let i=0;i<4;i++)h.turn(h.a);assert.equal(h.runtime.debuffs.get(h.b.id).veil.percent,25);h.runtime.basicMultiplier(h.b);assert.equal(h.runtime.debuffs.get(h.b.id).veil.percent,25);
 const g=harness('PLATINUM_FOCUS_LOCK',{missAt:2});for(let i=0;i<4;i++)g.turn(g.a);assert.equal(g.runtime.debuffs.get(g.b.id)?.veil,undefined);
});
test('coral volley keeps original per-target shares after a loss and shoots one boss once',()=>{
 const h=harness('DISTRIBUTED_CORAL_VOLLEY');h.teams.B.push({...h.b,id:'B:second',slot:1},{...h.b,id:'B:third',slot:2});h.turn(h.a);h.teams.B[1].hp=0;h.teams.B[1].alive=false;for(let i=0;i<3;i++)h.turn(h.a);const hits=h.events.filter(e=>e.type==='MERCENARY_HIT');assert.equal(hits.length,2);assert.ok(hits.every(e=>Math.abs(e.damage-1000/3)<.001));
 const g=harness('DISTRIBUTED_CORAL_VOLLEY');g.b.isBoss=true;for(let i=0;i<4;i++)g.turn(g.a);assert.equal(g.events.filter(e=>e.type==='MERCENARY_HIT').length,1);assert.equal(g.b.hp,9000);
});

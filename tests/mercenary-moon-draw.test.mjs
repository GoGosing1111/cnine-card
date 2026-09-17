import test from 'node:test';
import assert from 'node:assert/strict';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {mercenaryMoonDrawSkillText,MERCENARY_MOON_DRAW_VERSION} from '../shared/mercenary-moon-draw-v1.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState} from '../functions/_mercenary_account.js';

const skill={...seed.document.skills.find(s=>s.id==='MS-010'),balance:{damageRatio:2.8,cooldownTurns:4,cost:25},review:'REVIEWED'};
function harness({miss=false}={}){
 const actor=buildMercenaryFighter({code:'V-010',name:'월령',rank:'SS',role:'ASSASSIN',position:'FRONT',basePower:70000,level:1,stats:{hp:10000,attack:1000,defense:100,speed:100},combat,skills:[skill]},'A','PVP');
 const enemy=(id,hp,slot=0)=>({id,side:'B',slot,row:'FRONT',hp,maxHp:10000,shield:0,alive:true,actions:0});
 const original=enemy('B:ORIGINAL',1000),replacement=enemy('B:REPLACEMENT',6000,1),healthy=enemy('B:HEALTHY',10000,2),events=[],rolls=[];
 const teams={A:[actor],B:[original,replacement,healthy]};
 const runtime=mercenaryCombat({teams,hit:(a,t,m)=>{rolls.push({actorId:a.id,targetId:t.id,multiplier:m});return {damage:1000*m,dodge:miss};},
  damage:(t,n)=>{const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.shield-=absorbed;t.hp-=hpDamage;return {hpDamage,absorbed};},
  knockout:t=>{if(t.hp<=0)t.alive=false;},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 return {actor,original,replacement,healthy,teams,runtime,events,rolls,turn:()=>{actor.actions++;return runtime.beforeAction(actor);},kill:target=>{target.hp=0;target.alive=false;}};
}

test('moon draw retargets in the paid impact action instead of losing the cast and another turn',()=>{
 const h=harness();assert.equal(h.turn(),true);assert.equal(h.rolls.length,0);h.kill(h.original);
 assert.equal(h.turn(),true);assert.equal(h.rolls.length,1);assert.equal(h.rolls[0].targetId,h.replacement.id);
 assert.ok(Math.abs(h.rolls[0].multiplier-3.36)<1e-10);
 const retarget=h.events.find(e=>e.retargeted);assert.equal(retarget.type,'MERCENARY_WINDUP');assert.equal(retarget.continuation,true);assert.deepEqual(retarget.targetIds,[h.replacement.id]);
 assert.equal(h.events.filter(e=>e.type==='MERCENARY_HIT').length,1);assert.equal(h.events.filter(e=>e.type==='MERCENARY_CANCEL').length,0);
 const state=h.runtime.state(h.actor);assert.equal(state.energy,75);assert.equal(state.cooldown.get('MS-010'),5);assert.equal(state.pending,null);assert.equal(state.reload,true);
 h.actor.gauge=60;assert.equal(h.turn(),false);assert.equal(h.actor.gauge,40);assert.equal(h.runtime.basicMultiplier(h.actor),1);
 assert.equal(state.cooldown.get('MS-010'),5);assert.equal(h.healthy.hp,10000);
});

test('a full-health replacement is attacked without waiting for allied damage',()=>{
 const h=harness();h.replacement.hp=10000;h.turn();h.kill(h.original);h.turn();
 assert.equal(h.rolls.length,1);assert.equal(h.rolls[0].multiplier,2.8);assert.equal(h.replacement.hp,7200);
});

test('a monster wave replacement receives the prepared draw without retaining a removed actor or executing the boss',()=>{
 const h=harness();h.actor.battleMode='PVE';h.teams.B=[h.original];h.original.isMonster=true;h.turn();h.kill(h.original);
 const boss={...h.healthy,id:'B:WAVE:2',isMonster:true,isBoss:true,hp:10000000,maxHp:10000000};
 h.teams.B.splice(0,1,boss);h.turn();
 assert.equal(h.rolls.length,1);assert.equal(h.rolls[0].targetId,boss.id);assert.equal(h.rolls[0].multiplier,2.8);
 assert.equal(boss.hp,9997200);assert.equal(h.runtime.state(h.actor).energy,75);
 assert.equal(h.events.filter(e=>e.retargeted).length,1);assert.equal(h.events.some(e=>e.type==='MERCENARY_CANCEL'),false);
});

test('reselection ignores untargetable/dead/support entities and uses current HP ratio and stable slot ordering',()=>{
 const h=harness();h.turn();h.original.untargetable=true;
 h.teams.B.push({...h.healthy,id:'B:SUIT',slot:-3,hp:1,isBattleSuit:true},{...h.healthy,id:'B:DEAD',slot:-2,hp:0,alive:false},{...h.healthy,id:'B:HIDDEN',slot:-1,hp:1,untargetable:true});
 h.replacement.hp=8000;h.healthy.hp=4000;h.healthy.maxHp=10000;h.turn();
 assert.equal(h.rolls[0].targetId,h.healthy.id);assert.equal(h.original.hp,1000);
 const tie=harness();tie.turn();tie.kill(tie.original);tie.replacement.hp=5000;tie.healthy.hp=5000;tie.turn();assert.equal(tie.rolls[0].targetId,tie.replacement.id);
});

test('a living original target remains locked and uses missing health at impact',()=>{
 const h=harness();h.turn();h.original.hp=9000;h.replacement.hp=100;h.turn();
 assert.equal(h.rolls[0].targetId,h.original.id);assert.ok(Math.abs(h.rolls[0].multiplier-2.94)<1e-10);
 assert.equal(h.events.some(e=>e.retargeted),false);assert.equal(h.replacement.hp,100);
});

test('no legal enemy cancels once; death, stun and silence cannot create a replacement attack',()=>{
 const empty=harness();empty.turn();for(const t of empty.teams.B)empty.kill(t);empty.turn();
 assert.equal(empty.rolls.length,0);assert.equal(empty.events.filter(e=>e.type==='MERCENARY_CANCEL').length,1);assert.equal(empty.runtime.state(empty.actor).energy,75);
 for(const reason of ['death','stunned','silenced']){
  const h=harness();h.turn();h.kill(h.original);if(reason==='death')h.kill(h.actor);else h.actor[reason]=true;h.turn();
  assert.equal(h.rolls.length,0,reason);assert.equal(h.runtime.state(h.actor).pending,null,reason);
  assert.equal(h.events.some(e=>e.retargeted),false,reason);assert.equal(h.runtime.state(h.actor).energy,75,reason);
 }
});

test('a replacement can dodge or absorb the strike; it never causes a third target, refund or kill reset',()=>{
 const miss=harness({miss:true});miss.turn();miss.kill(miss.original);miss.turn();assert.equal(miss.replacement.hp,6000);assert.equal(miss.rolls.length,1);assert.equal(miss.runtime.state(miss.actor).energy,75);
 const shield=harness();shield.turn();shield.kill(shield.original);shield.replacement.shield=5000;shield.turn();assert.equal(shield.replacement.hp,6000);assert.ok(shield.replacement.shield>0&&shield.replacement.shield<5000);
 const kill=harness();kill.turn();kill.kill(kill.original);kill.replacement.hp=1;kill.turn();assert.equal(kill.replacement.alive,false);assert.equal(kill.rolls.length,1);assert.equal(kill.healthy.hp,10000);assert.equal(kill.runtime.state(kill.actor).cooldown.get('MS-010'),5);
});

const released=(code,rank,skills)=>({...seed.catalog.cards.find(c=>c.code===code),...seed.document.mercenaries.find(c=>c.code===code),rank,level:1,statMode:'RANK_FIXED',combat,skills});
test('canonical 5+1 PVP reproducer resolves the lost-target draw into a real hit in the same timeline action',()=>{
 const cards=['ATTACK','DEFENSE','SPEED','HP','ATTACK'].map((power_type,i)=>({id:String(i+1),power:100000,power_type}));
 const b=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:released('V-010','SS',[skill]),defenderMercenary:released('V-002','A',[]),seed:15838});
 const timeline=b.result.timeline,id='A:MERCENARY:V-010',retarget=timeline.find(e=>e.actorId===id&&e.retargeted);
 assert.ok(retarget);const impact=timeline.find(e=>e.seq>retarget.seq&&e.actorId===id&&e.type==='MERCENARY_HIT');
 assert.ok(impact);assert.equal(impact.at,retarget.at);assert.equal(impact.targetId,retarget.targetId);
 assert.ok(!timeline.some(e=>e.actorId===id&&e.type==='MERCENARY_CANCEL'&&e.reason==='TARGET_LOST'));
 assert.equal(b.teams.A.cards.length,5);assert.equal(b.teams.A.mercenaries.length,1);
});

test('codex and owned skill descriptions agree while CMS assignments and numeric balance remain unchanged',async t=>{
 const f=await mercenaryFixture(t),doc=structuredClone(f.document);doc.mercenaries.find(c=>c.code==='V-010').rank='SS';
 doc.assignments.find(a=>a.code==='V-010').skillIds=['MS-010'];Object.assign(doc.skills.find(s=>s.id==='MS-010'),skill);
 const raw=JSON.stringify(doc);await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",raw).run();
 await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)','V-010','2026-09-17','2026-09-17').run();
 const codex=mercenaryCodexDocument({payload_json:raw,revision:55,updated_at:'2026-09-17'}),publicSkill=codex.cards.find(c=>c.code==='V-010').skills[0],owned=(await mercenaryAccountState(f.env,f.user)).cards[0].skills[0];
 assert.equal(codex.moonDrawVersion,MERCENARY_MOON_DRAW_VERSION);assert.equal(publicSkill.effect,owned.effect);assert.match(publicSkill.effect,/같은 타격 행동/);assert.match(publicSkill.trigger,/기다리지 않습니다/);
 assert.deepEqual(publicSkill.balance,skill.balance);assert.equal((await f.p("SELECT payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first()).payload_json,raw);
 const other=seed.document.skills.find(s=>s.id==='MS-004');assert.equal(mercenaryMoonDrawSkillText(other),other);
});

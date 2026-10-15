import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattleV2Preview,createPvpBattleV2,createPveBattleV2,resolvePvpOutcome} from '../functions/_battle_v2_preview.js';
import {createIconTechniqueRuntime} from '../functions/_icon_technique_combat.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {MERCENARY_COMBAT_DRAFT} from '../shared/mercenary-combat-policy-v1.mjs';
import {createIconCombatRuntime} from '../functions/_icon_combat.js';
import {ICON_TECHNIQUES,ICON_TECHNIQUE_PREPARATION,ICON_TECHNIQUES_RELEASE_ENABLED} from '../shared/icon-techniques-v1.mjs';
import {iconTechniqueScenario,iconTechniqueScenarioInput,iconTechniqueFixtureTuning,techniqueFighter,existingIcon} from './helpers/icon-technique-preparation-fixture.mjs';
const events=(result,code,phase)=>result.timeline.filter(e=>e.type==='ICON_TECHNIQUE'&&e.techniqueCode===code&&(!phase||e.phase===phase));
function harness(code,{tuning={},allies=[],enemies=[],iconSkills=null}={}){
 const actor=techniqueFighter('caster'),ally=techniqueFighter('ally','A',1,{hp:6000}),enemy=techniqueFighter('enemy','B',0),teams={A:[actor,ally,...allies],B:[enemy,...enemies]},timeline=[];
 let rt;const knockout=t=>{if(t.hp>0||!t.alive)return false;t.alive=false;rt.onKnockout(t);return true;};
 rt=createIconTechniqueRuntime({preparation:{assignments:[{actorId:actor.id,code,tuning:{...iconTechniqueFixtureTuning(code),...tuning}}]},teams,iconSkills,emit:(type,data)=>timeline.push({type,...data}),knockout});
 const damage=(target,n,source=enemy)=>{const hp=target.hp,shield=target.shield,absorbed=Math.min(shield,n);target.shield-=absorbed;target.hp=Math.max(0,target.hp-rt.beforeHpDamage(target,n-absorbed,{actor:source,direct:true}));const result={hpDamage:hp-target.hp,absorbed};rt.onDamage(target,result,{actor:source,direct:true});knockout(target);return result;};
 return {rt,actor,ally,enemy,teams,timeline,damage,knockout,cast(n=1){actor.actions=n;return rt.beforeAction(actor);}};
}

test('release remains false and non-Symbol, card-field and JSON capability forgeries never activate',()=>{
 assert.equal(ICON_TECHNIQUES_RELEASE_ENABLED,false);assert.equal(typeof ICON_TECHNIQUE_PREPARATION,'symbol');
 const input=iconTechniqueScenarioInput('AUTONOMOUS_WEAPON'),plain={...input};delete plain[ICON_TECHNIQUE_PREPARATION];const baseline=simulateBattleV2Preview(plain);
 assert.deepEqual(simulateBattleV2Preview({...plain,ICON_TECHNIQUE_PREPARATION:input[ICON_TECHNIQUE_PREPARATION],techniquePreparation:input[ICON_TECHNIQUE_PREPARATION],teamA:plain.teamA.map(a=>({...a,iconTechnique:'AUTONOMOUS_WEAPON'}))}).timeline,baseline.timeline);
 assert.deepEqual(simulateBattleV2Preview(JSON.parse(JSON.stringify(input))).timeline,baseline.timeline);
 const pvp={attackerCards:[{id:'a',power:10000}],defenderCards:[{id:'b',power:10000}],seed:17};assert.deepEqual(createPvpBattleV2({...pvp,[ICON_TECHNIQUE_PREPARATION]:input[ICON_TECHNIQUE_PREPARATION]}),createPvpBattleV2(pvp));
 const pve={cards:[{id:'a',power:10000}],monster:{id:'b',power:10000},seed:17};assert.deepEqual(createPveBattleV2({...pve,[ICON_TECHNIQUE_PREPARATION]:input[ICON_TECHNIQUE_PREPARATION]}),createPveBattleV2(pve));
});
for(const def of ICON_TECHNIQUES)test(`${def.code}: deterministic real-engine skill changes the authoritative timeline`,()=>{
 const a=iconTechniqueScenario(def.code),b=iconTechniqueScenario(def.code);assert.deepEqual(a,b);
 assert.ok(events(a.result,def.code,'CAST').length);assert.ok(a.result.iconTechniques.some(s=>s.code===def.code&&s.casts>0));
 const expected={CROWN_USURP:'APPLY',FORMATION_EDIT:'SWAP',WOUND_DEFER:'REPAY',SKILL_ADVANCE:'ADVANCE',PURSUIT_BAN:'TRACK',SKILL_CENSOR:'CENSOR',RETURN_OATH:'REVIVE'}[def.code];
 if(expected)assert.ok(events(a.result,def.code,expected).length);else assert.ok(a.result.timeline.some(e=>e.type==='ICON_SUMMON'));
});
test('crown transfers the real support empower without cloning or shortening its remaining duration',()=>{
 const caster=techniqueFighter('crown'),enemy=existingIcon('SUPPORT','B',0),target=techniqueFighter('recipient','B',1,{hp:3000}),teams={A:[caster],B:[enemy,target]},timeline=[];let technique;
 const icon=createIconCombatRuntime({teams,hit:()=>({damage:1}),damage:()=>({hpDamage:1,absorbed:0}),rawDamage:()=>({hpDamage:1,absorbed:0}),knockout:()=>false,emit:(type,data)=>timeline.push({type,...data}),techniques:()=>technique});
 enemy.actions=2;assert.equal(icon.beforeAction(enemy),true);assert.ok(target.iconEmpower);
 const remaining=target.iconEmpower.remaining,percent=target.iconEmpower.percent;
 technique=createIconTechniqueRuntime({preparation:{assignments:[{actorId:caster.id,code:'CROWN_USURP',tuning:iconTechniqueFixtureTuning('CROWN_USURP')}]},teams,iconSkills:icon,emit:(type,data)=>timeline.push({type,...data}),knockout:()=>false});
 caster.actions=1;assert.equal(technique.beforeAction(caster),true);icon.endAction(caster);technique.endAction(caster);
 assert.equal(target.iconEmpower,undefined);assert.equal(caster.iconEmpower.remaining,remaining);assert.equal(caster.iconEmpower.percent,percent);
 const damage=icon.beforeDamage(target,100,{actor:caster,direct:true});assert.equal(damage,Math.round(100*(1+percent/100)));assert.equal(caster.iconEmpower,undefined);
 const h=harness('CROWN_USURP');h.enemy.attack=5000;h.enemy.shield=4000;assert.equal(h.cast(),false);assert.equal(h.rt.snapshot()[0].casts,0);
});
test('formation exchanges real slots/rows, preserves actor IDs and redirects later basic targets',()=>{
 const b=iconTechniqueScenario('FORMATION_EDIT').result,swap=events(b,'FORMATION_EDIT','SWAP')[0];assert.equal(swap.targets.length,2);
 const [first,second]=swap.targets;assert.equal(first.slot,second.previousSlot);assert.equal(second.slot,first.previousSlot);assert.equal(first.row,second.previousRow);
 const later=b.timeline.find(e=>e.seq>swap.seq&&e.type==='TURN'&&e.actorId?.startsWith('A:'));assert.ok(later);assert.equal(later.targetId,second.targetId);
 const h=harness('FORMATION_EDIT',{enemies:[techniqueFighter('boss','B',2,{isBoss:true,row:'BACK'})]});assert.equal(h.cast(),false);assert.equal(h.rt.snapshot()[0].casts,0);
});
test('deferred multi-hit HP damage preserves every debt, bypasses shields on repayment, and never recursively procs',()=>{
 const h=harness('WOUND_DEFER',{tuning:{deferPercent:50}});h.ally.shield=100;assert.equal(h.cast(),true);
 const first=h.damage(h.ally,500),second=h.damage(h.ally,200);assert.equal(first.absorbed,100);assert.equal(first.hpDamage,200);assert.equal(second.hpDamage,100);
 assert.equal(h.ally.hp,5700);h.ally.shield=10000;h.enemy.alive=false;h.enemy.hp=0;
 h.ally.actions=1;h.rt.endAction(h.ally);assert.equal(h.ally.hp,5400);assert.equal(h.ally.shield,10000);assert.equal(h.enemy.damageDealt,300);
 const repayments=h.timeline.filter(e=>e.phase==='REPAY');assert.deepEqual(repayments.map(e=>e.amount),[200,100]);assert.deepEqual(repayments.map(e=>e.debtRemaining),[100,0]);
 assert.equal(h.timeline.filter(e=>e.phase==='DEFER').length,2);h.rt.endAction(h.ally);assert.equal(h.ally.hp,5400);
});
test('a lethal deferred debt performs a real KO and dead actors never receive ghost repayments',()=>{
 const h=harness('WOUND_DEFER',{tuning:{deferPercent:100}});h.ally.hp=100;assert.equal(h.cast(),true);h.damage(h.ally,300);assert.equal(h.ally.hp,100);
 h.ally.actions=1;h.rt.endAction(h.ally);assert.equal(h.ally.alive,false);assert.equal(h.ally.hp,0);assert.equal(h.timeline.filter(e=>e.phase==='REPAY').length,1);
 h.ally.actions=2;h.rt.endAction(h.ally);assert.equal(h.timeline.filter(e=>e.phase==='REPAY').length,1);
 const dead=harness('WOUND_DEFER',{tuning:{deferPercent:50}});dead.cast();dead.damage(dead.ally,200);dead.ally.hp=0;dead.knockout(dead.ally);dead.ally.actions=1;dead.rt.endAction(dead.ally);assert.equal(dead.timeline.filter(e=>e.phase==='REPAY').length,0);
});
test('advance borrows the whole cooldown, adds no action, preserves seals and repays exactly once',()=>{
 const caster=techniqueFighter('advance'),ally=existingIcon('ASSAULT','A',1,{firstAction:4,cooldownActions:4}),enemy=techniqueFighter('enemy','B'),teams={A:[caster,ally],B:[enemy]},timeline=[];let rt;
 const icon=createIconCombatRuntime({teams,hit:()=>({damage:20,dodge:false}),damage:()=>({hpDamage:20,absorbed:0}),rawDamage:()=>({hpDamage:0,absorbed:0}),knockout:()=>false,emit:(type,data)=>timeline.push({type,...data}),techniques:()=>rt});
 rt=createIconTechniqueRuntime({preparation:{assignments:[{actorId:caster.id,code:'SKILL_ADVANCE',tuning:{...iconTechniqueFixtureTuning('SKILL_ADVANCE'),cooldownActions:1,maxCasts:9}}]},teams,iconSkills:icon,emit:(type,data)=>timeline.push({type,...data}),knockout:()=>false});
 caster.actions=1;const gauge=ally.gauge;assert.equal(rt.beforeAction(caster),true);assert.equal(ally.actions,0);assert.equal(ally.gauge,gauge);assert.equal(icon.snapshot()[0].nextAction,1);
 ally.magicSealCharges=1;ally.actions=1;assert.equal(icon.beforeAction(ally),false);assert.equal(icon.snapshot()[0].casts,0);caster.actions=2;assert.equal(rt.beforeAction(caster),false);
 ally.actions=2;assert.equal(icon.beforeAction(ally),true);assert.equal(icon.snapshot()[0].nextAction,9);assert.equal(icon.snapshot()[0].casts,1);
 for(let n=3;n<9;n++){ally.actions=n;assert.equal(icon.beforeAction(ally),false);}ally.actions=9;assert.equal(icon.beforeAction(ally),true);assert.equal(icon.snapshot()[0].nextAction,13,'borrowed three actions are not charged twice');assert.ok(timeline.some(e=>e.techniqueCode==='SKILL_ADVANCE'&&e.phase==='REPAY'));
});
test('pursuit redirects a lone front to a living rear, clears on another target, and permits the last survivor',()=>{
 const h=harness('PURSUIT_BAN');h.ally.row='FRONT';h.actor.row='BACK';h.cast();h.rt.singleTarget(h.enemy,h.ally);
 assert.deepEqual(h.rt.filterTargets(h.enemy,[h.ally],h.teams.A),[h.actor]);h.rt.singleTarget(h.enemy,h.actor);assert.deepEqual(h.rt.filterTargets(h.enemy,[h.ally],h.teams.A),[h.ally]);
 h.rt.singleTarget(h.enemy,h.ally);h.actor.hp=0;h.actor.alive=false;assert.deepEqual(h.rt.filterTargets(h.enemy,[h.ally],h.teams.A),[h.ally]);
});
test('censor keeps the exact offensive hit while suppressing new shield and delay effects',()=>{
 const input=iconTechniqueScenarioInput('SKILL_CENSOR');input.maxActions=7;const censored=simulateBattleV2Preview(input),plain={...input};delete plain[ICON_TECHNIQUE_PREPARATION];const control=simulateBattleV2Preview(plain);
 const a=censored.timeline.find(e=>e.type==='ICON_SKILL'),b=control.timeline.find(e=>e.type==='ICON_SKILL');assert.ok(a&&b);assert.deepEqual(a.hits.map(({damage,absorbed,critical,hit})=>({damage,absorbed,critical,hit})),b.hits.map(({damage,absorbed,critical,hit})=>({damage,absorbed,critical,hit})));
 assert.ok(control.timeline.some(e=>e.type==='ICON_STATUS'&&e.status==='WARD'));assert.equal(censored.timeline.some(e=>e.type==='ICON_STATUS'&&['WARD','DELAY'].includes(e.status)),false);
 assert.equal(events(censored,'SKILL_CENSOR','CENSOR').length,1);
});
test('autonomous weapon has an independent actor, attacks and HP; owner death immediately removes it',()=>{
 const result=iconTechniqueScenario('AUTONOMOUS_WEAPON').result,spawn=result.timeline.find(e=>e.type==='ICON_SUMMON'),weapon=result.final.A.find(a=>a.id===spawn.targetId);
 assert.ok(weapon.isIconSummon);assert.equal(weapon.slot>=10,true);assert.ok(result.timeline.some(e=>e.type==='TURN'&&e.actorId===weapon.id));assert.ok(result.timeline.some(e=>e.type==='TURN'&&e.targetId===weapon.id));assert.equal(result.actions<=30,true);
 const h=harness('AUTONOMOUS_WEAPON');h.cast();const summon=h.teams.A.find(a=>a.isIconSummon);assert.ok(summon);h.actor.actions=6;assert.equal(h.rt.beforeAction(h.actor),false);assert.equal(h.teams.A.filter(a=>a.isIconSummon).length,1);
 h.actor.hp=0;h.knockout(h.actor);assert.equal(summon.alive,false);assert.equal(summon.hp,0);assert.equal(h.timeline.filter(e=>e.type==='ICON_SUMMON_END').length,1);
});
test('return oath revives only after the target is defeated and once per ally',()=>{
 const h=harness('RETURN_OATH');h.ally.hp=0;h.ally.alive=false;assert.equal(h.cast(),true);assert.equal(h.ally.alive,false);
 h.damage(h.enemy,h.enemy.hp,h.actor);assert.equal(h.ally.alive,true);assert.equal(h.ally.hp,h.ally.maxHp*.2);assert.equal(h.ally.gauge,0);
 h.ally.hp=0;h.knockout(h.ally);h.teams.B.push(techniqueFighter('another','B',1));h.actor.actions=10;assert.equal(h.rt.beforeAction(h.actor),false);assert.equal(h.timeline.filter(e=>e.phase==='REVIVE').length,1);
});
test('single-boss rescue counts actual HP damage only, ignores shields, and expires without free revival',()=>{
 const h=harness('RETURN_OATH');h.ally.hp=0;h.ally.alive=false;h.enemy.isBoss=true;h.enemy.shield=1000;assert.equal(h.cast(),true);
 h.damage(h.enemy,1000,h.actor);assert.equal(h.ally.alive,false);assert.equal(h.timeline.filter(e=>e.phase==='PROGRESS').length,0);
 h.damage(h.enemy,1200,h.actor);assert.equal(h.ally.alive,true);
 const expired=harness('RETURN_OATH',{tuning:{windowActions:1}});expired.ally.hp=0;expired.ally.alive=false;expired.cast();expired.actor.actions=2;expired.rt.endAction(expired.actor);expired.damage(expired.enemy,expired.enemy.hp,expired.actor);assert.equal(expired.ally.alive,false);assert.ok(expired.timeline.some(e=>e.phase==='FAIL'));
});
test('duplicate assignments, unknown actors, recursive summon owners and incomplete tuning are rejected',()=>{
 const input=iconTechniqueScenarioInput('AUTONOMOUS_WEAPON'),row=input[ICON_TECHNIQUE_PREPARATION].assignments[0];
 for(const assignments of [[row,row],[{...row,actorId:'missing'}],[{...row,tuning:{}}]])assert.throws(()=>simulateBattleV2Preview({...input,[ICON_TECHNIQUE_PREPARATION]:{assignments}}));
});

test('advanced charged ICON prepares without an action and releases on its next unsealed regular turn',()=>{
 const caster=techniqueFighter('advance'),ally=existingIcon('MAGIC','A',1,{firstAction:4,cooldownActions:4}),enemy=techniqueFighter('enemy','B'),teams={A:[caster,ally],B:[enemy]},timeline=[];let rt;
 const icon=createIconCombatRuntime({teams,hit:()=>({damage:20,dodge:false}),damage:()=>({hpDamage:20,absorbed:0}),rawDamage:()=>({hpDamage:0,absorbed:0}),knockout:()=>false,emit:(type,data)=>timeline.push({type,...data}),techniques:()=>rt});
 rt=createIconTechniqueRuntime({preparation:{assignments:[{actorId:caster.id,code:'SKILL_ADVANCE',tuning:iconTechniqueFixtureTuning('SKILL_ADVANCE')}]},teams,iconSkills:icon,emit:(type,data)=>timeline.push({type,...data}),knockout:()=>false});
 caster.actions=1;assert.equal(rt.beforeAction(caster),true);assert.equal(ally.actions,0);assert.ok(timeline.some(e=>e.status==='CHANNEL'&&e.advanced));
 ally.actions=1;assert.equal(icon.beforeAction(ally),true);assert.equal(timeline.filter(e=>e.type==='ICON_SKILL').length,1);assert.equal(icon.snapshot()[0].nextAction,8);
});
test('deferred ICON multi-hit damage consumes the original per-cast cap including debt',()=>{
 const input=iconTechniqueScenarioInput('WOUND_DEFER'),defender=input.teamA[1],attacker=existingIcon('ATTACK','B',0,{firstAction:1,damageCapPercent:10,damagePercent:220});
 defender.row='FRONT';defender.maxHp=10000;defender.hp=9000;input.teamA[0].row='BACK';input.teamA[0].speed=1000;defender.speed=1;attacker.speed=500;attacker.attack=100000;input.teamB=[attacker];input.maxActions=2;
 input[ICON_TECHNIQUE_PREPARATION].assignments[0].tuning.deferPercent=80;
 const result=simulateBattleV2Preview(input),cast=result.timeline.find(e=>e.type==='ICON_SKILL');assert.ok(cast);const actual=cast.hits.reduce((sum,h)=>sum+h.damage+h.absorbed,0),debt=events(result,'WOUND_DEFER','DEFER').reduce((sum,e)=>sum+e.amount,0);
 assert.ok(debt>0);assert.equal(actual+debt,1000,'10% of defender HP is a whole-cast cap, not a cap for each deferred hit');
});
test('multiple pursuit protections always leave a legal target and do not deadlock the engine',()=>{
 const a=techniqueFighter('one','A',0,{hp:3000}),b=techniqueFighter('two','A',1,{hp:6000}),enemy=techniqueFighter('enemy','B'),teams={A:[a,b],B:[enemy]};
 const rt=createIconTechniqueRuntime({preparation:{assignments:[a,b].map(actor=>({actorId:actor.id,code:'PURSUIT_BAN',tuning:iconTechniqueFixtureTuning('PURSUIT_BAN')}))},teams,emit:()=>{},knockout:()=>false});a.actions=b.actions=1;assert.equal(rt.beforeAction(a),true);assert.equal(rt.beforeAction(b),true);
 rt.singleTarget(enemy,a);rt.singleTarget(enemy,b);assert.ok(rt.filterTargets(enemy,[a],teams.A).length);
});

test('censored curse consumes its old stacks and creates no replacement or spread',()=>{
 const caster=techniqueFighter('censor'),target=existingIcon('CURSE','B',0,{firstAction:1}),ally=techniqueFighter('ally','A',1),teams={A:[caster,ally],B:[target]},timeline=[];let rt;
 caster.iconCurse={sourceId:target.id,stacks:3,remaining:3,damage:10};
 const icon=createIconCombatRuntime({teams,hit:()=>({damage:20,dodge:false}),damage:()=>({hpDamage:20,absorbed:0}),rawDamage:()=>({hpDamage:0,absorbed:0}),knockout:()=>false,emit:(type,data)=>timeline.push({type,...data}),techniques:()=>rt});
 rt=createIconTechniqueRuntime({preparation:{assignments:[{actorId:caster.id,code:'SKILL_CENSOR',tuning:iconTechniqueFixtureTuning('SKILL_CENSOR')}]},teams,iconSkills:icon,emit:(type,data)=>timeline.push({type,...data}),knockout:()=>false});
 caster.actions=1;rt.beforeAction(caster);target.actions=1;assert.equal(icon.beforeAction(target),true);assert.equal(caster.iconCurse,undefined);assert.equal(ally.iconCurse,undefined);assert.equal(timeline.find(e=>e.type==='ICON_SKILL').stacksConsumed,3);
});
test('censor never refreshes an existing link budget or duration while its prior passive remains separate',()=>{
 const caster=techniqueFighter('censor'),target=existingIcon('LINK','B',0,{firstAction:1,cooldownActions:2,durationActions:4}),ally=techniqueFighter('ally','A',1),teams={A:[caster,ally],B:[target]},timeline=[];let rt;
 const icon=createIconCombatRuntime({teams,hit:()=>({damage:20,dodge:false}),damage:()=>({hpDamage:20,absorbed:0}),rawDamage:()=>({hpDamage:0,absorbed:0}),knockout:()=>false,emit:(type,data)=>timeline.push({type,...data}),techniques:()=>rt});
 target.actions=1;icon.beforeAction(target);const original={...caster.iconLink},budget=icon.snapshot()[0].echoRemaining;
 rt=createIconTechniqueRuntime({preparation:{assignments:[{actorId:caster.id,code:'SKILL_CENSOR',tuning:iconTechniqueFixtureTuning('SKILL_CENSOR')}]},teams,iconSkills:icon,emit:(type,data)=>timeline.push({type,...data}),knockout:()=>false});
 caster.actions=1;rt.beforeAction(caster);target.actions=3;icon.beforeAction(target);assert.deepEqual(caster.iconLink,original);assert.equal(icon.snapshot()[0].echoRemaining,budget);
 target.actions=5;icon.endAction(target);assert.equal(caster.iconLink,undefined,'old link still expires at its original action 5');
});
test('summons do not extend last-owner survival or contaminate PVP survivor/HP outcome',()=>{
 const input=iconTechniqueScenarioInput('AUTONOMOUS_WEAPON');input.teamA=[input.teamA[0]];input.teamA[0].hp=100;input.teamA[0].maxHp=1000;input.teamA[0].speed=1000;input.teamB[0].speed=900;input.teamB[0].attack=100000;input.teamB[1].attack=100000;input.maxActions=30;
 const result=simulateBattleV2Preview(input),spawn=result.timeline.find(e=>e.type==='ICON_SUMMON');assert.ok(spawn);assert.equal(result.winner,'B');assert.equal(result.final.A.find(a=>a.id===spawn.targetId).hp,0);assert.ok(result.timeline.some(e=>e.type==='ICON_SUMMON_END'&&e.reason==='OWNER_DEAD'));
 const alive=techniqueFighter('live'),dead={...techniqueFighter('dead','B'),hp:0},weapon={...techniqueFighter('ghost','B',10),isIconSummon:true,maxHp:1e9,hp:1e9};
 const outcome=resolvePvpOutcome({winner:'B',reason:'ACTION_LIMIT',final:{A:[alive],B:[dead,weapon]}},[alive],[dead]);assert.equal(outcome.winner,'A');assert.equal(outcome.survivorCount.B,0);
});
test('return oath does not overwrite an ally already revived by another system, and a dead caster cannot rescue',()=>{
 const h=harness('RETURN_OATH');h.ally.hp=0;h.ally.alive=false;h.cast();h.ally.hp=900;h.ally.alive=true;h.damage(h.enemy,h.enemy.hp,h.actor);assert.equal(h.ally.hp,900);assert.equal(h.timeline.some(e=>e.phase==='REVIVE'),false);
 const lost=harness('RETURN_OATH');lost.ally.hp=0;lost.ally.alive=false;lost.cast();lost.actor.hp=0;lost.knockout(lost.actor);lost.damage(lost.enemy,lost.enemy.hp,techniqueFighter('other'));assert.equal(lost.ally.alive,false);assert.equal(lost.timeline.some(e=>e.phase==='REVIVE'),false);
});

function fixtureMercenary(side='B',dead=false){return buildMercenaryFighter({code:'V-001',rank:'C',name:'단일기 검사 용병',position:'FRONT',role:'VANGUARD',level:1,basePower:10000,startingHpPercent:dead?0:100,stats:{hp:10000,attack:1000,defense:100,speed:100},skills:[{id:'QA-SINGLE',name:'검사 단일기',mechanic:'BREAK_ARMOR_WINDOW',balance:{damageRatio:1,cost:0,cooldownTurns:1}}],combat:MERCENARY_COMBAT_DRAFT},side,'PVP');}
test('new single-target mercenary skills obey pursuit while their existing action schedule remains intact',()=>{
 const merc=fixtureMercenary(),h=harness('PURSUIT_BAN',{enemies:[merc]});h.ally.row='FRONT';h.actor.row='BACK';h.cast();h.rt.singleTarget(merc,h.ally);
 const timeline=[],runtime=mercenaryCombat({teams:h.teams,hit:()=>({damage:20,dodge:false}),damage:()=>({hpDamage:20,absorbed:0}),knockout:()=>false,emit:(type,data)=>timeline.push({type,...data}),clock:()=>0,techniques:()=>h.rt});
 merc.actions=1;assert.equal(runtime.beforeAction(merc),true);const windup=timeline.find(e=>e.type==='MERCENARY_WINDUP');assert.ok(windup);assert.equal(windup.targetId,h.actor.id);assert.equal(merc.actions,1);assert.equal(merc.gauge,0);
});
test('return oath can rescue a real dead mercenary without changing its cooldown or adding an action',()=>{
 const merc=fixtureMercenary('A',true),h=harness('RETURN_OATH',{allies:[merc]});const before={actions:merc.actions,skills:structuredClone(merc.skills)};assert.equal(h.cast(),true);h.damage(h.enemy,h.enemy.hp,h.actor);
 assert.equal(merc.alive,true);assert.equal(merc.hp,merc.maxHp*.2);assert.equal(merc.gauge,0);assert.equal(merc.actions,before.actions);assert.deepEqual(merc.skills,before.skills);
});

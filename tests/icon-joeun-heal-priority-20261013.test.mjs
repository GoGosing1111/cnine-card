import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {createIconCombatRuntime,selectIconSupportTarget} from '../functions/_icon_combat.js';
import {defaultIconRoles,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {MERCENARY_COMBAT_DRAFT} from '../shared/mercenary-combat-policy-v1.mjs';

function fighters(mode='PVP'){
 const roles=defaultIconRoles(),row={id:'CN-1C000004',grade:'ICON',name:'오조은',power:180000};
 const joeun=buildFighter({...row,iconRole:iconRoleSnapshot(row,roles,mode)},0,'A',null,mode);
 const card=buildFighter({id:'injured-card',grade:'FUR',power:180000},1,'A',null,mode);
 const mercenary=buildMercenaryFighter({code:'V-001',rank:'C',name:'아우렌',position:'FRONT',role:'VANGUARD',level:1,basePower:10000,
  stats:{hp:10000,attack:1000,defense:100,speed:100},skills:[],combat:MERCENARY_COMBAT_DRAFT},'A',mode);
 const enemy=buildFighter({id:'enemy',grade:'FUR',power:180000},0,'B',null,mode);
 return {joeun,card,mercenary,enemy};
}

test('cards and mercenaries compete by HP percentage, regardless of absolute HP or front/back row',()=>{
 const {joeun,card,mercenary}=fighters();card.maxHp=1000;card.hp=500;mercenary.maxHp=10000;mercenary.hp=2000;
 assert.equal(selectIconSupportTarget([joeun,card,mercenary]),mercenary,'20% mercenary before a 50% card with fewer absolute HP');
 card.hp=100;assert.equal(selectIconSupportTarget([joeun,mercenary,card]),card,'10% card before 20% mercenary');
 joeun.hp=joeun.maxHp*.05;assert.equal(selectIconSupportTarget([mercenary,card,joeun]),joeun,'caster belongs to the same pool');
});

test('dead, untargetable and suit units are excluded; full-HP cleanse only follows injured allies',()=>{
 const {joeun,card,mercenary}=fighters();card.hp=card.maxHp*.8;mercenary.apocalypseStatus={curse:{remaining:2}};
 const excluded=[{...card,id:'dead',hp:0,alive:false},{...card,id:'hidden',hp:1,untargetable:true},{...card,id:'suit',hp:1,isBattleSuit:true}];
 assert.equal(selectIconSupportTarget([...excluded,mercenary,joeun,card]),card);
 card.hp=card.maxHp;assert.equal(selectIconSupportTarget([...excluded,joeun,card,mercenary]),mercenary);
 delete mercenary.apocalypseStatus;assert.equal(selectIconSupportTarget([...excluded,joeun,card,mercenary]),null);
});

test('equal percentages retain deterministic slot/ID ordering and do not reorder the roster',()=>{
 const {card,mercenary}=fighters();card.maxHp=1000;card.hp=200;mercenary.maxHp=10000;mercenary.hp=2000;
 const roster=[mercenary,card],before=[...roster];assert.equal(selectIconSupportTarget(roster),card);assert.deepEqual(roster,before);
 const peer={...card,id:card.id+'z'};assert.equal(selectIconSupportTarget([peer,card]),card);
});

for(const mode of ['PVE','PVP'])test(`${mode}: actual casts heal the lowest percentage anew and preserve cooldown, budget and event targets`,()=>{
 const {joeun,card,mercenary,enemy}=fighters(mode);card.maxHp=1000;card.hp=300;mercenary.maxHp=10000;mercenary.hp=1000;
 const events=[],runtime=createIconCombatRuntime({teams:{A:[joeun,card,mercenary],B:[enemy]},hit:()=>{throw Error('Support must not strike');},damage:()=>{},rawDamage:()=>{},knockout:()=>false,emit:(type,row)=>events.push({type,...row})});
 joeun.actions=2;assert.equal(runtime.beforeAction(joeun),true);const first=events.find(e=>e.type==='ICON_SKILL');
 assert.equal(first.targetId,mercenary.id);assert.equal(first.targets[0].targetId,mercenary.id);assert.equal(first.healPriority,'LOWEST_HP_PERCENT');
 assert.equal(first.targetHpBefore,1000);assert.equal(first.targetMaxHpBefore,10000);assert(first.targets[0].amount>0);assert.equal(card.hp,300);
 card.hp=100;joeun.actions=3;assert.equal(runtime.beforeAction(joeun),false,'cooldown is preserved');
 joeun.actions=6;assert.equal(runtime.beforeAction(joeun),true);const second=events.filter(e=>e.type==='ICON_SKILL')[1];
 assert.equal(second.targetId,card.id);assert.equal(second.targetHpBefore,100);assert.equal(second.targetMaxHpBefore,1000);
 assert.equal(second.targets[0].amount,Math.round(1000*.2*(mode==='PVE'?1:.9)));assert.equal(runtime.snapshot()[0].casts,2);
 assert.equal(runtime.snapshot()[0].healRemaining,joeun.maxHp*.8-first.targets[0].amount-second.targets[0].amount);
 joeun.actions=10;assert.equal(runtime.beforeAction(joeun,{healingAllowed:false}),false,'overtime remains blocked');
});

for(const mode of ['PVE','PVP'])test(`${mode}: shared battle engine emits healing for a real mercenary before the higher-percentage card`,()=>{
 const {joeun,card,mercenary,enemy}=fighters(mode);joeun.speed=10000;card.speed=mercenary.speed=enemy.speed=1;
 card.maxHp=1000;card.hp=500;mercenary.maxHp=10000;mercenary.hp=1000;enemy.maxHp=enemy.hp=1e10;enemy.attack=1;
 const args={teamA:[joeun,card,mercenary],teamB:[enemy],seed:29,maxActions:2},battle=simulateBattleV2Preview(args);
 const heal=battle.timeline.find(e=>e.type==='ICON_SKILL'&&e.actorId===joeun.id);assert(heal);
 assert.equal(heal.targetId,mercenary.id);assert.equal(heal.targets[0].targetId,mercenary.id);assert(heal.targets[0].amount>0);
 assert.equal(heal.targetHpBefore/ heal.targetMaxHpBefore,.1);
 assert.equal(battle.final.A.find(a=>a.id===card.id).hp,500);assert(battle.final.A.find(a=>a.id===mercenary.id).hp>1000);
 assert.deepEqual(simulateBattleV2Preview(args),battle,'replay remains deterministic');
});

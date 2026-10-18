import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFighter,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {HALLOWEEN_COMBAT,halloweenBarrierScale} from '../shared/mercenary-halloween-combat-v1.mjs';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {MERCENARY_GROWTH_LAUNCH_PROFILE as growth} from '../shared/mercenary-growth-launch-20261016.mjs';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';

function harness(mode='PVP',code='V-984'){
 const snapshot=code==='V-984'?limitedDeploymentSnapshot(code):{code,rank:'SS',role:'GUARD',position:'FRONT',statMode:'RANK_FIXED',skills:[structuredClone(HALLOWEEN_COMBAT['V-984'].skill)]};
 const actor=buildMercenaryFighter({...snapshot,combat},'A',mode,buildFighter);
 Object.assign(actor,{attack:1000,hp:8000,maxHp:10000,shield:500,maxShield:500});
 const ally={id:'A:ally',side:'A',slot:0,row:'FRONT',alive:true,hp:10000,maxHp:10000,shield:700,maxShield:700,actions:0};
 const enemy={...ally,id:'B:enemy',side:'B'},events=[];
 const damage=(target,amount)=>{const absorbed=Math.min(target.shield,amount),hpDamage=Math.min(target.hp,amount-absorbed);target.shield-=absorbed;target.hp-=hpDamage;runtime.onDamage(target,{absorbed,hpDamage});return {absorbed,hpDamage};};
 const runtime=mercenaryCombat({teams:{A:[actor,ally],B:[enemy]},hit:()=>({damage:1,dodge:false}),damage,knockout:t=>{if(t.hp<=0)t.alive=false;},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 const turn=()=>{actor.actions++;return runtime.beforeAction(actor);};
 return {actor,ally,events,runtime,turn,damage};
}

test('only Halloween Diim PvP barriers lose 40%; other shield skills and PvE keep the full budget',()=>{
 for(const [mode,code,amount]of [['PVP','V-984',2016],['PVE','V-984',3360],['PVP','V-015',3360]]){
  const h=harness(mode,code),before={hp:h.actor.hp,maxHp:h.actor.maxHp,attack:h.actor.attack,defense:h.actor.defense,speed:h.actor.speed};
  assert.equal(h.turn(),false,'shield cast still shares its original basic attack');
  const buffs=h.events.filter(e=>e.type==='MERCENARY_BUFF');assert.equal(buffs.length,2);
  assert.ok(buffs.every(e=>e.amount===amount));assert.equal(h.actor.shield,500+amount);assert.equal(h.ally.shield,700+amount);
  assert.deepEqual({hp:h.actor.hp,maxHp:h.actor.maxHp,attack:h.actor.attack,defense:h.actor.defense,speed:h.actor.speed},before);
  assert.equal(h.runtime.basicMultiplier(h.actor),.85);assert.equal(h.runtime.state(h.actor).energy,80);
  assert.deepEqual(h.actor.skills[0].balance,{damageRatio:6.72,cooldownTurns:2,cost:20});
  h.turn();assert.equal(h.runtime.basicMultiplier(h.actor),1);assert.equal(h.events.filter(e=>e.type==='MERCENARY_BUFF').length,2);
  h.turn();assert.equal(h.events.filter(e=>e.type==='MERCENARY_BUFF').length,4);assert.equal(h.actor.shield,500+amount,'refresh replaces its remaining shield');
 }
 for(const actor of [{code:'V-984',battleMode:'PVP'},{code:'V-984',isMercenary:true,battleMode:'PVE'},{code:'V-994',isMercenary:true,battleMode:'PVP'}])assert.equal(halloweenBarrierScale(actor),1);
});

test('absorbed shield is spent and a recast never heals HP or accumulates the previous barrier',()=>{
 const h=harness();h.turn();
 assert.deepEqual(h.damage(h.actor,1000),{absorbed:1000,hpDamage:0});assert.equal(h.actor.hp,8000);
 h.turn();h.turn();assert.equal(h.actor.shield,2516);assert.equal(h.actor.hp,8000);
 assert.deepEqual(h.damage(h.actor,2716),{absorbed:2516,hpDamage:200});assert.equal(h.actor.hp,7800);
 h.turn();h.turn();assert.equal(h.actor.shield,2016);assert.equal(h.actor.hp,7800);
});

test('the last surviving Diim keeps a finite reduced shield and cannot buff dead allies',()=>{
 const h=harness();h.ally.alive=false;h.ally.hp=0;h.turn();
 const buffs=h.events.filter(e=>e.type==='MERCENARY_BUFF');assert.equal(buffs.length,1);assert.equal(buffs[0].targetId,h.actor.id);assert.equal(buffs[0].amount,4032);
 const result=h.damage(h.actor,h.actor.shield+100);assert.equal(result.hpDamage,100);assert.equal(h.actor.hp,7900);
});

test('canonical PvP can break the reduced shield in the reported Ayoon 5 versus Diim 2 matchup',()=>{
 const merc=(code,level)=>({...limitedDeploymentSnapshot(code),combat,mercenaryLevel:{version:2,level,policyRevision:1,breakthroughMask:0,growth}});
 const battle=createPvpBattleV2({attackerCards:tierCards(250000),defenderCards:tierCards(250000),attackerMercenary:merc('V-985',5),defenderMercenary:merc('V-984',2),seed:36103});
 const target=battle.teams.B.mercenaries[0],events=battle.result.timeline.filter(e=>e.targetId===target.id);
 assert.equal(target.hp,target.maxHp);assert.ok(target.shield>0,'opening shield is preserved');
 assert.ok(events.some(e=>e.type==='MERCENARY_BUFF'&&e.amount>0));
 assert.ok(events.some(e=>e.damage>0&&e.targetHpAfter<target.maxHp),'actual damage reaches HP through the reduced barrier');
});

test('the public codex explains the PvP-only amount without changing other seasonal skills',()=>{
 const cards=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1}).cards;
 const diim=cards.find(c=>c.code==='V-984');
 assert.match(diim.combatLinkDescription,/PVP에서 부여량이 40% 감소/);assert.match(diim.combatLinkDescription,/403\.2%/);assert.match(diim.combatLinkDescription,/시작 방벽과 PVE의 672% 방벽은 유지/);
 for(const code of Object.keys(HALLOWEEN_COMBAT).filter(c=>c!=='V-984'))assert.doesNotMatch(cards.find(c=>c.code===code).combatLinkDescription,/부여량이 40% 감소/);
});

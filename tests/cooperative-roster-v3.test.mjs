import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {COOP_SPECIES,rollCoopRoster,validateCoopRoster,coopSpecies,coopEnemyTraits} from '../shared/cooperative-roster-v3.mjs';
import {rebalanceCoopCombat} from '../shared/cooperative-balance-20261012.mjs';
import {defaultCoopCombat,validateCoopCombat} from '../shared/cooperative-settings-v1.mjs';
import {createCoopRoom,coopCommand,coopView,advanceCoopRoom} from '../functions/_cooperative_room.js';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {createCoopTraitRuntime} from '../functions/_cooperative_traits.js';
import {createIconCombatRuntime} from '../functions/_icon_combat.js';
import {currentSquads} from './helpers/cooperative-current.mjs';
const combat=rebalanceCoopCombat(defaultCoopCombat());
test('server roster is deterministic, covers every species and never repeats a mob or the two bosses',()=>{
 const seen=new Set(),counts={};for(let seed=0;seed<4000;seed++){
  const r=rollCoopRoster(seed);assert.deepEqual(r,rollCoopRoster(seed));assert.deepEqual(r,validateCoopRoster(r));
  [...r.mobs,r.elite,r.boss].forEach(id=>seen.add(id));counts[r.boss]=(counts[r.boss]||0)+1;
 }
 assert.equal(seen.size,9);for(const count of Object.values(counts))assert.ok(count>800&&count<1200);
 assert.throws(()=>validateCoopRoster({...rollCoopRoster(1),mobs:['STALKER','STALKER','WATCHER']}));
 assert.throws(()=>validateCoopRoster({...rollCoopRoster(1),boss:'FABRICATED'}));
});
test('new room publishes selected art/traits before ready; replays and withdrawals retain the same roster without QTE',()=>{
 const client=id=>'roster-qa-client-'+id,users=[1,2,3].map(id=>({id,nickname:'검수 '+id}));
 const room=createCoopRoom({id:'ABCD123456',user:users[0],clientId:client(1),difficulty:'EXTREME',seed:27,now:0,combat});
 const roster=structuredClone(room.encounter),publicRoster=coopView(room,users[0],0).state.encounter;
 assert.equal(room.encounterVersion,3);assert.equal(publicRoster.boss.name,coopSpecies(roster.boss).name);assert.ok(publicRoster.boss.art);
 for(const user of users.slice(1))coopCommand(room,user,'join',{clientId:client(user.id)},0);
 const squads=currentSquads();for(const user of users)coopCommand(room,user,'ready',{clientId:client(user.id),loadout:squads[user.id-1]},1);
 for(const user of users)coopCommand(room,user,'loaded',{clientId:client(user.id)},2);
 const before=structuredClone(room.payload.cooperativeEncounter.instances);
 for(let now=5000;now<=50000;now+=5000)for(const user of users)coopCommand(room,user,'ping',{clientId:client(user.id)},now);
 advanceCoopRoom(room,50000);assert.equal(room.pattern,null);assert.deepEqual(room.effects,[]);
 coopCommand(room,users[2],'leave',{clientId:client(3)},50001);
 assert.deepEqual(room.encounter,roster);assert.deepEqual(room.payload.cooperativeEncounter.instances,before);
 assert.equal(room.members[2].result,'DEFEAT');assert.equal(room.payload.sceneAssetKey,'COOP_ARKE_FORGE');
});
test('ordinary effects counter shields and regen; poison can be cleansed without changing mercenary stats',()=>{
 const actor={id:'boss',alive:true,hp:500,maxHp:1000,shield:100,maxShield:100,defense:100,coopBaseDefense:100,attack:200,actions:3,slot:0,coopTraits:coopEnemyTraits(coopSpecies('BASTION'),3,'EXTREME')};
 const ally={id:'ally',ownerId:1,alive:true,hp:100,maxHp:100,shield:0};const events=[];
 const runtime=createCoopTraitRuntime({allies:[ally],emit:(type,e)=>events.push({type,...e})});
 assert.equal(runtime.beforeDamage(actor,100),80);actor.defense=99;assert.equal(runtime.beforeDamage(actor,100),100);actor.defense=100;actor.shield=0;assert.equal(runtime.beforeDamage(actor,100),100);
 runtime.beforeAction(actor);assert.ok(actor.shield>0);actor.coopTraits=coopEnemyTraits(coopSpecies('VESPERA'),3,'EXTREME');
 actor.iconCurse={healReductionPercent:60};runtime.beforeAction(actor);assert.equal(actor.hp,506);
 runtime.afterHit(actor,ally);assert.ok(ally.iconCurse);assert.equal(ally.iconCurse.healReductionPercent,20);
 const icon=createIconCombatRuntime({teams:{A:[ally],B:[actor]},emit:()=>{},damage:()=>({hpDamage:0,absorbed:0}),rawDamage:()=>({hpDamage:0,absorbed:0}),knockout:()=>{}});
 assert.equal(icon.cleanse(ally),true);assert.equal(ally.iconCurse,undefined);
 const immune={...ally,id:'immune',poisonImmune:true};runtime.afterHit(actor,immune);assert.equal(immune.iconCurse,undefined);
 delete actor.iconCurse;for(let i=0;i<100;i++){actor.hp=1;runtime.beforeAction(actor);}assert.ok(events.filter(e=>e.type==='REGEN').reduce((n,e)=>n+e.amount,0)<=300);
});
test('new settings validate; source originals and optimized transparent battle assets exist',()=>{
 assert.deepEqual(validateCoopCombat(combat),combat);
 const manifest=JSON.parse(fs.readFileSync(new URL('../assets/ui/cooperative-roster-v3/manifest.json',import.meta.url)));
 assert.equal(manifest.assets.length,6);for(const a of manifest.assets){assert.equal(a.transparent,true);assert.ok(fs.statSync(new URL('../'+a.source,import.meta.url)).size>100000);assert.ok(fs.statSync(new URL('../'+a.battle,import.meta.url)).size>10000);}
 for(const species of COOP_SPECIES)assert.ok(fs.existsSync(new URL('..'+species.art,import.meta.url)));
});
test('latest released SSS limited compositions have measurable counterplay without an owner-only mercenary requirement',()=>{
 let balanced=0,offense=0;const times=[];for(let seed=1;seed<=24;seed++)for(const deck of ['BALANCED','OFFENSE']){
  const b=createCooperativeBattle({squads:currentSquads({codes:['V-999','V-999','V-996'],deck}),difficulty:'EXTREME',seed,combat,encounter:rollCoopRoster(seed)}),r=b.payload.battleV2.result;
  if(deck==='BALANCED'){balanced+=r.winner==='A';if(r.winner==='A')times.push(r.timeline.at(-1).combatAtMs);}else offense+=r.winner==='A';
  assert.ok(r.timeline.at(-1).combatAtMs<=180000);assert.equal(r.timeline.some(e=>e.type==='COOP_MECHANIC'),false);
 }
 assert.ok(balanced>=18);assert.ok(balanced>offense+8);assert.ok(Math.min(...times)>90000);
});

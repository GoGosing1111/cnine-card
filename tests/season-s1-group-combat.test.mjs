import test from 'node:test';import assert from 'node:assert/strict';
import {createRoom,joinRoom,startRoom} from '../preview/coop-defense-v1/source/defense-model.mjs';
import {DEFENSE_PROFILES} from '../shared/monster-defense-loadout-v1.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
test('defense start snapshots each human owner’s rune attack on their two mercenaries and card; role HP and other players stay fixed',()=>{
 const roster=['STRIKER','HEALER','CAPTAIN'].map((role,i)=>({role,code:'R'+i,name:role,kind:i<2?'MERCENARY':'CARD'}));
 const room=createRoom({id:'A00000000001',capacity:2,accountRoster:true,now:1000}),loadout={mercenaries:['R0','R1'],card:'R2'};
 for(const id of ['1','2']){const p=joinRoom(room,{id,name:'player '+id,loadout,roster:roster.map(e=>({...e,seasonAttackBp:id==='1'?5000:0}))});p.ready=true;p.connected=true;}
 startRoom(room,'1');assert.equal(room.units.length,6);for(const u of room.units){const base=DEFENSE_PROFILES[u.role];assert.equal(u.attack,Math.floor(base.attack*(u.ownerId==='1'?1.5:1)));assert.equal(u.maxHp,base.hp);}
});
test('cooperative squads apply the owner rune to their own fighters only',()=>{
 const squads=coopSquads(),battle=()=>createCooperativeBattle({squads,seed:21}).payload.battleV2.teams.A;
 const before=battle();squads[0].seasonAttackBp=5000;const after=battle();
 for(let i=0;i<before.cards.length;i++){const c=before.cards[i];assert.equal(after.cards[i].attack,Math.floor(c.attack*(c.ownerId===squads[0].ownerId?1.5:1)));assert.equal(after.cards[i].maxHp,c.maxHp);}
 const mine=before.mercenaries.findIndex(x=>x.ownerId===squads[0].ownerId);assert(mine>=0);assert(after.mercenaries[mine].attack>before.mercenaries[mine].attack);for(let i=0;i<before.mercenaries.length;i++)if(i!==mine)assert.equal(after.mercenaries[i].attack,before.mercenaries[i].attack);
});

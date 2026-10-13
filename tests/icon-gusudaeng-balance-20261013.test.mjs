import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ICON_ROLES,defaultIconRoles,validateIconRoles,validatedIconSnapshot,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../docs/qa/icon-gusudaeng-balance-20261013/'+name,import.meta.url)));
const live=read('live-input.json'),baseline=read('baseline.json'),code='ICON-GUSUDAENG',def=ICON_ROLES.find(c=>c.code===code);
const before=live.roles.document,after=structuredClone(before);
after.cards.find(c=>c.code===code).tuning={...defaultIconRoles().cards.find(c=>c.code===code).tuning};
function party(document,mode,selected=def){return [...structuredClone(baseline.commons[mode]),{id:selected.cardId,title:selected.name,grade:'ICON',power:180000,iconRole:{...iconRoleSnapshot({id:selected.cardId,grade:'ICON'},document,mode,live.roles.revision),supremacy:baseline.references[mode]}}];}

test('legacy settings pick up the PVE adjustment without overwriting explicit CMS values or receipt snapshots',()=>{
 const changes=[];for(const c of before.cards){const next=after.cards.find(n=>n.code===c.code);for(const k of Object.keys(c.tuning))if(c.tuning[k]!==next.tuning[k])changes.push([c.code,k,c.tuning[k],next.tuning[k]]);}
 assert.deepEqual(changes,[[code,'pveScale',100,105]]);
 for(const n of [7,8]){
  const legacy={...structuredClone(before),cards:structuredClone(before.cards.slice(0,n))},normalized=validateIconRoles(legacy,{allowLegacy:true});
  assert.deepEqual(normalized.cards.slice(0,n),legacy.cards);assert.equal(normalized.cards.find(c=>c.code===code).tuning.pveScale,105);
 }
 assert.deepEqual(validateIconRoles(before,{allowLegacy:true}),before);
 const old=party(before,'PVE').at(-1);assert.equal(validatedIconSnapshot(old).tuning.pveScale,100);
});

test('PVP outcomes and complete authoritative timelines are identical against each other ICON on either side',()=>{
 for(const opponent of ICON_ROLES.filter(c=>c.code!==code))for(const reverse of [false,true]){
  const run=document=>{const self=party(document,'PVP'),enemy=party(before,'PVP',opponent);return createPvpBattleV2({attackerCards:reverse?enemy:self,defenderCards:reverse?self:enemy,attackerEquipmentBonus:5000000,defenderEquipmentBonus:5000000,seed:131021}).result;};
  const old=run(before),next=run(after);assert.deepEqual(next.timeline,old.timeline);assert.equal(next.winner,old.winner);
  for(const side of ['A','B'])assert.deepEqual(next.final[side].map(c=>[c.id,c.hp,c.shield]),old.final[side].map(c=>[c.id,c.hp,c.shield]));
 }
});

test('live-stat single bosses retain server-authoritative clears with fewer or equal actions',()=>{
 let improved=0;
 for(const equipment of [0,5000000])for(const multiplier of [4,25,100]){
  const run=document=>createPveBattleV2({cards:party(document,'PVE'),characterBonus:equipment,monster:{id:'QA-BOSS',is_boss:1,battle_power:Math.round((baseline.references.PVE.power+equipment/5)*multiplier)},seed:132001}).result;
  const old=run(before),next=run(after);assert.equal(next.winner,'A');assert.equal(next.final.B[0].hp,0);assert.ok(next.actions<=old.actions);improved+=next.actions<old.actions;
  const skills=next.timeline.filter(e=>e.type==='ICON_SKILL'&&e.iconCode===code),echoes=next.timeline.filter(e=>e.type==='ICON_ECHO');
  assert.ok(skills.length<=6);assert.ok(echoes.length>0);assert.ok(echoes.every(e=>e.damage+e.absorbed<=Math.floor(e.targetMaxHp*.06)));
 }
 assert.ok(improved>=4,'The adjustment should measurably help more than one power scenario');
});

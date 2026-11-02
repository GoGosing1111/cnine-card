import test from 'node:test';
import assert from 'node:assert/strict';
import {actorKey,finalHudState,rosterGroups,selectHudBoss} from '../js/battle-v3-hud.mjs';
import {fitCompactViewport} from '../preview/project-v-v3/source/battle/ViewportLayout.mjs';

test('mirrored cards and mercenaries retain separate authoritative final HP and shield',()=>{
 const state=finalHudState({A:[{id:'same-card',cardId:'CARD',hp:50,maxHp:200}],B:[{id:'same-card',cardId:'CARD',hp:0,maxHp:200}],mercenaries:{A:[{id:'same-merc',hp:750,maxHp:1000,shield:80,maxShield:200}],B:[{id:'same-merc',hp:0,maxHp:1000}]}});
 assert.equal(state.get(actorKey('A','same-card')).hp,25);assert.equal(state.get(actorKey('B','same-card')).hp,0);
 assert.equal(state.get(actorKey('A','same-merc')).hp,75);assert.equal(state.get(actorKey('A','same-merc')).shield,.4);assert.equal(state.get(actorKey('B','same-merc')).hp,0);
});
test('cooperative member count and per-owner companions are read from each receipt',()=>{
 for(const count of [2,3]){
  const members=Array.from({length:count},(_,i)=>({ownerId:i+1,ownerName:'분대'+i}));
  const entries=kind=>members.flatMap((m,squadIndex)=>[0,1].map(slot=>({id:`${m.ownerId}:${kind}:${slot}`,cardId:kind+slot,squadIndex,ownerId:m.ownerId})));
  const groups=rosterGroups({battleV2:{rules:{formation:'COOP_THREE_SQUADS'},teams:{A:{members,cards:entries('card'),mercenaries:entries('merc')}}}},'RAID');
  assert.equal(groups.length,count);assert(groups.every((g,i)=>g.member.ownerId===i+1&&g.cards.length===2&&g.mercs.length===2));
 }
});
test('portrait reservation changes only presentation bounds and keeps the full canvas scene',()=>{
 const fit=fitCompactViewport({width:390,height:844,left:60,right:60,top:110,bottom:110});
 assert.equal(fit.available.left,60);assert.equal(fit.available.width,270);
 assert.equal(fit.scene.width*fit.scale,390);assert.equal(fit.scene.height*fit.scale,844);
 assert(fit.offsetX*fit.scale>=60);assert(fit.offsetY*fit.scale>=110);
 const old=fitCompactViewport({width:390,height:844});assert.equal(old.available.left,12);assert.equal(old.available.width,366);
});
test('continuous replacement picks the living slot-one boss without reviving a defeated ordinary boss',()=>{
 const actors=[{id:'old',side:'B',hp:0},{id:'boss-new',side:'B',hp:65,isBoss:true},{id:'minion',side:'B',hp:80}];
 assert.equal(selectHudBoss(actors,{continuousEncounter:{},battleV2:{teams:{B:{cards:[{id:'retired'}]}}}}).id,'boss-new');
 assert.equal(selectHudBoss(actors,{battleV2:{teams:{B:{cards:[{id:'old'}]}}}}).hp,0);
});
